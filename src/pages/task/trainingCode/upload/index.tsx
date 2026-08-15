import { UploadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import type { UploadFile } from 'antd';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  message,
  Select,
  Space,
  Tag,
  Typography,
  Upload,
} from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  isTrainingCodeAdminReviewEnabled,
  syncTrainingCodeReviewConfigFromServer,
} from '@/constants/trainingCode';
import {
  approveCodeVersion,
  autoApproveCodeVersionIfEnabled,
  CONSISTENCY_TRAINING_PROFILE,
  checkCodeVersionForTraining,
  getCodeVersionDetail,
  uploadCodeZip,
} from '@/services/platform';
import {
  fetchTrainingPlans,
  type TrainingPlan,
} from '@/services/trainingPlans';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  markPendingCodeApproved,
  markPendingCodeStatus,
  upsertPendingCodeVersion,
} from '@/utils/pendingCodeVersions';

type UploadResultState = {
  codeVersionId: string;
  approvalStatus?: string;
  /** 就绪状态 READY 等 */
  status?: string;
  validationStatus?: string;
  validationPolicyVersion?: string;
  artifactSha256?: string;
  fileName?: string;
  trainingProfile?: string;
};

const TrainingCodeUpload: React.FC = () => {
  const access = useAccess();
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [statusRefreshing, setStatusRefreshing] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);
  const [trainingPlans, setTrainingPlans] = useState<TrainingPlan[]>([]);
  const [uploadResult, setUploadResult] = useState<UploadResultState | null>(
    null,
  );
  const [adminReviewEnabled, setAdminReviewEnabled] = useState(() =>
    isTrainingCodeAdminReviewEnabled(),
  );
  const announcedApprovedRef = useRef<string | null>(null);
  const announcedRejectedRef = useRef<string | null>(null);
  const selectedPlanId = Form.useWatch('trainingProfile', form);
  const selectedPlan = useMemo(
    () => trainingPlans.find((plan) => plan.id === selectedPlanId),
    [selectedPlanId, trainingPlans],
  );

  const approvalStatus = String(
    uploadResult?.approvalStatus || 'PENDING',
  ).toUpperCase();
  const isApproved = approvalStatus === 'APPROVED';
  const isRejected = approvalStatus === 'REJECTED';
  const isRevoked = approvalStatus === 'REVOKED';
  const isSettled = isApproved || isRejected || isRevoked;

  const applyDetailToUploadResult = useCallback(
    (codeVersionId: string, detail: Record<string, any>) => {
      const approvalStatus = String(detail.approvalStatus || '').toUpperCase();
      setUploadResult((prev) => {
        if (!prev || prev.codeVersionId !== codeVersionId) return prev;
        return {
          ...prev,
          approvalStatus: approvalStatus || prev.approvalStatus,
          status: detail.status || prev.status,
          validationStatus: detail.validationStatus || prev.validationStatus,
          validationPolicyVersion:
            detail.validationPolicyVersion || prev.validationPolicyVersion,
          artifactSha256: detail.artifactSha256 || prev.artifactSha256,
          fileName: detail.fileName || prev.fileName,
          trainingProfile: detail.trainingProfile || prev.trainingProfile,
        };
      });
      if (approvalStatus === 'APPROVED') {
        markPendingCodeApproved(codeVersionId);
        if (announcedApprovedRef.current !== codeVersionId) {
          announcedApprovedRef.current = codeVersionId;
          message.success('训练代码已审核通过，可发起训练');
        }
      }
      if (approvalStatus === 'REJECTED') {
        markPendingCodeStatus(codeVersionId, 'REJECTED');
        if (announcedRejectedRef.current !== codeVersionId) {
          announcedRejectedRef.current = codeVersionId;
          message.error('管理员已拒绝该训练代码版本，不能用于发起训练');
        }
      }
      if (approvalStatus === 'REVOKED') {
        markPendingCodeStatus(codeVersionId, 'REVOKED');
      }
      return approvalStatus;
    },
    [],
  );

  const refreshUploadStatus = useCallback(
    async (codeVersionId: string, opts?: { silent?: boolean }) => {
      const id = codeVersionId?.trim();
      if (!id) return undefined;
      if (!opts?.silent) setStatusRefreshing(true);
      try {
        const res = await getCodeVersionDetail(id, {
          skipErrorHandler: true,
        });
        if (res?.success === false || !res?.data) {
          if (!opts?.silent) {
            message.warning(
              res?.errorMessage || '暂未能刷新审核状态，请稍后重试',
            );
          }
          return undefined;
        }
        return applyDetailToUploadResult(id, res.data);
      } catch (error: any) {
        if (!opts?.silent) {
          message.error(getApiErrorMessage(error, '刷新审核状态失败'));
        }
        return undefined;
      } finally {
        if (!opts?.silent) setStatusRefreshing(false);
      }
    },
    [applyDetailToUploadResult],
  );

  // 未终态时轮询审批状态（通过 / 拒绝 / 撤销后停止）
  useEffect(() => {
    const id = uploadResult?.codeVersionId?.trim();
    if (!id || isSettled) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const maxAttempts = 12;

    const tick = async () => {
      if (cancelled) return;
      attempts += 1;
      await refreshUploadStatus(id, { silent: true });
      if (cancelled) return;
      if (attempts < maxAttempts) {
        timer = setTimeout(tick, attempts <= 3 ? 1500 : 3000);
      }
    };

    timer = setTimeout(tick, 600);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [uploadResult?.codeVersionId, isSettled, refreshUploadStatus]);

  useEffect(() => {
    let active = true;
    void syncTrainingCodeReviewConfigFromServer()
      .then((cfg) => {
        if (!active) return;
        setAdminReviewEnabled(!!cfg.enableTrainingCodeAdminReview);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    setPlansLoading(true);
    fetchTrainingPlans({ skipErrorHandler: true })
      .then((res) => {
        if (!active) return;
        const plans = (res?.data ?? []).filter((plan) => plan.enabled);
        setTrainingPlans(plans);
        const current = form.getFieldValue('trainingProfile');
        const fallback =
          plans.find((plan) => plan.id === CONSISTENCY_TRAINING_PROFILE) ??
          plans[0];
        if (!plans.some((plan) => plan.id === current) && fallback) {
          form.setFieldValue('trainingProfile', fallback.id);
        }
        if (!fallback) {
          message.error('没有可用训练方案，请检查后端 training-plans 配置');
        }
      })
      .catch((error) => {
        if (active) {
          message.error(getApiErrorMessage(error, '加载训练方案失败'));
        }
      })
      .finally(() => {
        if (active) setPlansLoading(false);
      });
    return () => {
      active = false;
    };
  }, [form]);

  const handleUpload = async () => {
    const values = await form.validateFields();
    const file = (values.file as UploadFile[])?.[0]?.originFileObj as
      | File
      | undefined;
    if (!file) {
      message.warning('请选择训练代码 zip 文件');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      message.error('仅支持 .zip 格式');
      return;
    }

    setUploading(true);
    announcedApprovedRef.current = null;
    announcedRejectedRef.current = null;
    try {
      const trainingProfile =
        values.trainingProfile || CONSISTENCY_TRAINING_PROFILE;
      const res = await uploadCodeZip(
        {
          file,
          codeName: values.codeName.trim(),
          trainingProfile,
          remark: values.remark?.trim(),
        },
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        message.error(res?.errorMessage || '训练代码上传失败');
        return;
      }
      const data = res?.data;
      if (!data?.codeVersionId) {
        message.error('上传成功但未返回 codeVersionId');
        return;
      }
      setUploadResult({
        codeVersionId: data.codeVersionId,
        approvalStatus: data.approvalStatus,
        status: data.status,
        validationStatus: (data as { validationStatus?: string })
          .validationStatus,
        fileName: data.fileName,
        trainingProfile: data.trainingProfile || trainingProfile,
      });

      // 上传接口已返回 APPROVED（后端侧自动通过）时，直接成功，勿再调审批接口
      if (data.approvalStatus === 'APPROVED') {
        markPendingCodeApproved(data.codeVersionId);
        announcedApprovedRef.current = data.codeVersionId;
        message.success(
          adminReviewEnabled
            ? `训练代码已上传，低风险已由策略自动通过：${data.codeVersionId}`
            : `训练代码已上传并审核通过：${data.codeVersionId}`,
        );
        return;
      }

      // 普通用户没有审批权限，不要调 approve（否则会弹出「代码版本审批失败」）
      if (!adminReviewEnabled && access.isAdmin) {
        try {
          const approved = await autoApproveCodeVersionIfEnabled(
            data.codeVersionId,
            {
              trainingProfile: data.trainingProfile || trainingProfile,
              skipErrorHandler: true,
            },
          );
          setUploadResult((prev) =>
            prev
              ? {
                  ...prev,
                  approvalStatus: approved?.approvalStatus || 'APPROVED',
                }
              : prev,
          );
          markPendingCodeApproved(data.codeVersionId);
          announcedApprovedRef.current = data.codeVersionId;
          message.success(
            `训练代码已上传并自动审核通过：${data.codeVersionId}`,
          );
          return;
        } catch {
          // 不向用户展示审批接口错误，改为对账真实状态
          const latest = await refreshUploadStatus(data.codeVersionId, {
            silent: true,
          });
          if (latest === 'APPROVED') {
            return;
          }
        }
      }

      if (data.approvalStatus !== 'APPROVED') {
        upsertPendingCodeVersion({
          codeVersionId: data.codeVersionId,
          codeAssetName: values.codeName.trim(),
          fileName: data.fileName,
          trainingProfile: data.trainingProfile || trainingProfile,
          approvalStatus: data.approvalStatus || 'PENDING',
          sizeBytes: data.sizeBytes,
          source: 'upload',
        });
      }
      message.success(`训练代码已上传：${data.codeVersionId}，等待审核结果`);
      // 人工审核模式下也立即对账一次（后端可能已默认通过）
      void refreshUploadStatus(data.codeVersionId, { silent: true });
    } catch (error: any) {
      const details =
        error?.info?.data?.details || error?.response?.data?.details;
      const detailText =
        details && typeof details === 'object'
          ? Object.entries(details)
              .map(([k, v]) => `${k}=${String(v)}`)
              .join('；')
          : '';
      const base = getApiErrorMessage(error, '训练代码上传失败');
      message.error(detailText ? `${base}（${detailText}）` : base);
    } finally {
      setUploading(false);
    }
  };

  const handleApprove = async () => {
    if (!uploadResult?.codeVersionId) return;
    setApproving(true);
    try {
      let checkResult:
        | Awaited<ReturnType<typeof checkCodeVersionForTraining>>
        | undefined;
      try {
        checkResult = await checkCodeVersionForTraining(
          uploadResult.codeVersionId,
          uploadResult.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
          { skipErrorHandler: true },
        );
      } catch {
        // 由后续 approve 返回明确错误
      }
      if (checkResult?.success && checkResult.data) {
        setUploadResult((prev) =>
          prev
            ? {
                ...prev,
                approvalStatus:
                  checkResult?.data?.approvalStatus || prev.approvalStatus,
                validationStatus:
                  checkResult?.data?.validationStatus || prev.validationStatus,
                validationPolicyVersion:
                  checkResult?.data?.validationPolicyVersion ||
                  prev.validationPolicyVersion,
                artifactSha256:
                  checkResult?.data?.artifactSha256 || prev.artifactSha256,
              }
            : prev,
        );
      }
      const res = await approveCodeVersion(uploadResult.codeVersionId, {
        skipErrorHandler: true,
      });
      if (res?.success === false) {
        // 审批接口失败时仍对账：可能实际已通过
        const latest = await refreshUploadStatus(uploadResult.codeVersionId, {
          silent: true,
        });
        if (latest === 'APPROVED') return;
        message.error(res?.errorMessage || '审核失败');
        return;
      }
      setUploadResult((prev) =>
        prev
          ? {
              ...prev,
              approvalStatus: res?.data?.approvalStatus || 'APPROVED',
            }
          : prev,
      );
      markPendingCodeApproved(uploadResult.codeVersionId);
      announcedApprovedRef.current = uploadResult.codeVersionId;
      message.success(
        `审核通过${res?.data?.decisionSource ? `（${res.data.decisionSource}）` : ''}，可在训练代码列表中查看`,
      );
    } catch (error: any) {
      const latest = await refreshUploadStatus(uploadResult.codeVersionId, {
        silent: true,
      });
      if (latest === 'APPROVED') return;
      message.error(getApiErrorMessage(error, '审核失败'));
    } finally {
      setApproving(false);
    }
  };
  return (
    <PageContainer
      title="上传训练代码"
      subTitle="上传 zip 训练代码包，创建 code_asset 与 code_version 记录"
      onBack={() => history.push('/task/code/list')}
      breadcrumb={{
        items: [
          {
            title: (
              <a onClick={() => history.push('/task/code/list')}>训练代码</a>
            ),
          },
          { title: '上传训练代码' },
        ],
      }}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="上传说明"
        description={
          adminReviewEnabled ? (
            <span>
              zip 须包含入口脚本{' '}
              <Typography.Text code>
                {selectedPlan?.execution?.entrypoint || '请先选择训练方案'}
              </Typography.Text>
              。当前已开启<strong>管理员审核</strong>
              （STANDARD_REVIEW），风险模式为{' '}
              <Typography.Text code>ENFORCE</Typography.Text>
              ，按扫描结论分流：
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                <li>
                  <Typography.Text code>LOW</Typography.Text>：策略自动批准（
                  <Typography.Text code>AUTO_POLICY</Typography.Text>
                  ），不进入「待审核」
                </li>
                <li>
                  <Typography.Text code>MEDIUM</Typography.Text> /{' '}
                  <Typography.Text code>HIGH</Typography.Text>
                  ：进入「待审核」，须管理员通过后才能用于训练
                </li>
                <li>
                  <Typography.Text code>BLOCK</Typography.Text>：自动拒绝
                </li>
                <li>扫描异常：不自动放行</li>
              </ul>
            </span>
          ) : (
            <span>
              zip 须包含入口脚本{' '}
              <Typography.Text code>
                {selectedPlan?.execution?.entrypoint || '请先选择训练方案'}
              </Typography.Text>
              。当前「训练代码管理员审核」为关闭（
              <Typography.Text code>DIRECT_PASS</Typography.Text>
              ）：不跑风险扫描、不等待审；结构校验通过后由系统直接批准，可直接在训练代码列表中使用。
            </span>
          )
        }
      />

      {uploadResult ? (
        <>
          {isRejected && (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message="管理员已拒绝该训练代码版本"
              description="审核状态为 REJECTED，不能用于发起训练。可到训练代码列表查看该记录。"
            />
          )}
          {isRevoked && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="该版本的批准已被撤销"
              description="审核状态为 REVOKED，不能用于发起训练。"
            />
          )}
          {!isSettled && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message="当前为 PENDING，等待审核结果"
              description="可先返回训练代码列表继续其他操作；列表中已有本条记录，可随时查看审核状态。管理员通过后变为 APPROVED，拒绝后变为 REJECTED。"
            />
          )}
          {isApproved && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message="已审核通过，可直接发起训练"
              description="点击下方「用于发起训练」将跳转到训练创建页，并自动选中本次上传的代码版本。"
            />
          )}
          <Descriptions
            bordered
            size="small"
            column={1}
            style={{ marginBottom: 16 }}
          >
            <Descriptions.Item label="codeVersionId">
              <Typography.Text copyable code>
                {uploadResult.codeVersionId}
              </Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="审核状态">
              <Tag
                color={
                  isApproved
                    ? 'success'
                    : isRejected
                      ? 'error'
                      : isRevoked
                        ? 'default'
                        : 'warning'
                }
              >
                {uploadResult.approvalStatus || 'PENDING'}
              </Tag>
              {statusRefreshing ? (
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  刷新中…
                </Typography.Text>
              ) : null}
            </Descriptions.Item>
            {uploadResult.status && (
              <Descriptions.Item label="就绪状态">
                <Tag
                  color={
                    String(uploadResult.status).toUpperCase() === 'READY'
                      ? 'success'
                      : 'default'
                  }
                >
                  {uploadResult.status}
                </Tag>
              </Descriptions.Item>
            )}
            {uploadResult.validationStatus && (
              <Descriptions.Item label="校验状态">
                <Tag
                  color={
                    uploadResult.validationStatus === 'PASSED'
                      ? 'success'
                      : 'default'
                  }
                >
                  {uploadResult.validationStatus}
                </Tag>
              </Descriptions.Item>
            )}
            {uploadResult.fileName && (
              <Descriptions.Item label="文件名">
                {uploadResult.fileName}
              </Descriptions.Item>
            )}
            {uploadResult.validationPolicyVersion && (
              <Descriptions.Item label="校验策略版本">
                <Typography.Text code>
                  {uploadResult.validationPolicyVersion}
                </Typography.Text>
              </Descriptions.Item>
            )}
            {uploadResult.artifactSha256 && (
              <Descriptions.Item label="artifactSha256">
                <Typography.Text code style={{ fontSize: 12 }}>
                  {uploadResult.artifactSha256}
                </Typography.Text>
              </Descriptions.Item>
            )}
          </Descriptions>
          <Space wrap>
            {access.isAdmin && approvalStatus === 'PENDING' && (
              <Button
                type="primary"
                loading={approving}
                onClick={handleApprove}
              >
                审核通过
              </Button>
            )}
            {access.isAdmin && (
              <Button onClick={() => history.push('/task/code/pending')}>
                打开待审核页
              </Button>
            )}
            <Button
              loading={statusRefreshing}
              onClick={() =>
                void refreshUploadStatus(uploadResult.codeVersionId)
              }
            >
              刷新状态
            </Button>
            <Button
              onClick={() =>
                history.push(
                  `/task/code/detail/${encodeURIComponent(uploadResult.codeVersionId)}`,
                  { from: 'upload' },
                )
              }
            >
              查看详情
            </Button>
            <Button onClick={() => history.push('/task/code/list')}>
              返回列表
            </Button>
            <Button
              type="primary"
              disabled={!isApproved}
              onClick={() =>
                history.push(
                  `/task/create?codeVersionId=${encodeURIComponent(uploadResult.codeVersionId)}`,
                )
              }
            >
              用于发起训练
            </Button>
            <Button
              onClick={() => {
                setUploadResult(null);
                announcedApprovedRef.current = null;
                announcedRejectedRef.current = null;
                form.resetFields();
              }}
            >
              继续上传
            </Button>
          </Space>
        </>
      ) : (
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          }}
          style={{ maxWidth: 640 }}
        >
          <Form.Item
            name="codeName"
            label="代码资产名称"
            rules={[{ required: true, message: '请输入代码资产名称' }]}
          >
            <Input placeholder="例如：consistency-train-code" />
          </Form.Item>
          <Form.Item
            name="trainingProfile"
            label="训练方案"
            extra={
              <span>
                {selectedPlan?.description || '训练方案由后端统一配置'}
                <Typography.Text type="secondary" style={{ marginLeft: 8 }}>
                  {selectedPlan
                    ? `入口：${selectedPlan.execution.entrypoint}`
                    : ''}
                </Typography.Text>
              </span>
            }
            rules={[{ required: true, message: '请选择训练方案' }]}
          >
            <Select
              loading={plansLoading}
              disabled={plansLoading || !trainingPlans.length}
              options={trainingPlans.map((plan) => ({
                value: plan.id,
                label: `${plan.displayName} (${plan.id})`,
              }))}
            />
          </Form.Item>
          <Form.Item name="remark" label="备注（可选）">
            <Input.TextArea
              rows={3}
              placeholder="说明训练代码用途"
              maxLength={200}
              showCount
            />
          </Form.Item>
          <Form.Item
            name="file"
            label="训练代码 ZIP"
            valuePropName="fileList"
            getValueFromEvent={(e) => e?.fileList ?? []}
            rules={[
              {
                required: true,
                validator: (_, value) => {
                  const list = Array.isArray(value) ? value : [];
                  if (
                    !list.length ||
                    !list.some((item: UploadFile) => item.originFileObj)
                  ) {
                    return Promise.reject(new Error('请选择 zip 文件'));
                  }
                  return Promise.resolve();
                },
              },
            ]}
            extra={`仅支持 .zip；允许 .py/.json/.jsonl/.yaml/.yml/.txt/.md，禁止脚本执行器与二进制可执行文件；须包含 ${
              selectedPlan?.execution?.entrypoint || '所选方案入口脚本'
            }`}
          >
            <Upload accept=".zip" maxCount={1} beforeUpload={() => false}>
              <Button icon={<UploadOutlined />}>选择训练代码 zip</Button>
            </Upload>
          </Form.Item>
          <Space>
            <Button onClick={() => history.push('/task/code/list')}>
              取消
            </Button>
            <Button type="primary" loading={uploading} onClick={handleUpload}>
              上传
            </Button>
          </Space>
        </Form>
      )}
    </PageContainer>
  );
};

export default TrainingCodeUpload;
