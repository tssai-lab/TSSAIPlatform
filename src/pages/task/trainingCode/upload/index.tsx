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
import React, { useEffect, useMemo, useState } from 'react';
import { isTrainingCodeAutoApproveEnabled } from '@/constants/trainingCode';
import {
  approveCodeVersion,
  autoApproveCodeVersionIfEnabled,
  CONSISTENCY_TRAINING_PROFILE,
  checkCodeVersionForTraining,
  uploadCodeZip,
} from '@/services/platform';
import {
  fetchTrainingPlans,
  type TrainingPlan,
} from '@/services/trainingPlans';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  markPendingCodeApproved,
  upsertPendingCodeVersion,
} from '@/utils/pendingCodeVersions';

const TrainingCodeUpload: React.FC = () => {
  const access = useAccess();
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [plansLoading, setPlansLoading] = useState(true);
  const [trainingPlans, setTrainingPlans] = useState<TrainingPlan[]>([]);
  const [uploadResult, setUploadResult] = useState<{
    codeVersionId: string;
    approvalStatus?: string;
    validationStatus?: string;
    validationPolicyVersion?: string;
    artifactSha256?: string;
    fileName?: string;
    trainingProfile?: string;
  } | null>(null);
  const selectedPlanId = Form.useWatch('trainingProfile', form);
  const selectedPlan = useMemo(
    () => trainingPlans.find((plan) => plan.id === selectedPlanId),
    [selectedPlanId, trainingPlans],
  );

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
        validationStatus: data.status,
        fileName: data.fileName,
        trainingProfile: data.trainingProfile || trainingProfile,
      });

      // 上传接口已返回 APPROVED（后端侧自动通过）时，直接成功，勿再调审批接口
      if (data.approvalStatus === 'APPROVED') {
        markPendingCodeApproved(data.codeVersionId);
        message.success(`训练代码已上传并审核通过：${data.codeVersionId}`);
        return;
      }

      if (isTrainingCodeAutoApproveEnabled()) {
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
          message.success(
            `训练代码已上传并自动审核通过：${data.codeVersionId}`,
          );
          return;
        } catch (approveError: any) {
          // 自动审核模式：仅管理员写入待审队列；普通用户看列表是否已通过即可
          if (access.isAdmin) {
            upsertPendingCodeVersion({
              codeVersionId: data.codeVersionId,
              codeAssetName: values.codeName.trim(),
              fileName: data.fileName,
              trainingProfile: data.trainingProfile || trainingProfile,
              approvalStatus: data.approvalStatus || 'PENDING',
              sizeBytes: data.sizeBytes,
              source: 'upload',
            });
            message.warning(
              getApiErrorMessage(
                approveError,
                '上传成功，但自动审核失败，请到待审核页处理',
              ),
            );
          } else {
            message.warning(
              getApiErrorMessage(
                approveError,
                '上传成功，但审核状态未确认。请到训练代码列表查看是否已通过；若仍为 PENDING，请联系管理员。',
              ),
            );
          }
          return;
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
      message.success(`训练代码已上传：${data.codeVersionId}`);
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
      message.success(
        `审核通过${res?.data?.decisionSource ? `（${res.data.decisionSource}）` : ''}，可在训练代码列表中查看`,
      );
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '审核失败'));
    } finally {
      setApproving(false);
    }
  };

  const isApproved = uploadResult?.approvalStatus === 'APPROVED';

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
          isTrainingCodeAutoApproveEnabled() ? (
            <span>
              zip 须包含入口脚本{' '}
              <Typography.Text code>
                {selectedPlan?.execution?.entrypoint || '请先选择训练方案'}
              </Typography.Text>
              。当前为<strong>自动审核</strong>
              ：上传成功后会自动审核通过，可直接在训练代码列表中使用。管理员审核入口仍保留，需要时可改回人工审核。
            </span>
          ) : (
            <span>
              zip 须包含入口脚本{' '}
              <Typography.Text code>
                {selectedPlan?.execution?.entrypoint || '请先选择训练方案'}
              </Typography.Text>
              。上传接口使用 multipart 表单字段{' '}
              <Typography.Text code>
                file / codeName / version / trainingProfile / remark
              </Typography.Text>
              。上传后一般为 <Typography.Text code>PENDING</Typography.Text>
              ，需管理员审核通过后才会出现在训练代码列表。
            </span>
          )
        }
      />

      {uploadResult ? (
        <>
          {!isApproved && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                isTrainingCodeAutoApproveEnabled()
                  ? '仍为 PENDING：自动审核可能失败'
                  : '当前为 PENDING，训练代码列表看不到这条记录是正常的'
              }
              description={
                isTrainingCodeAutoApproveEnabled()
                  ? '请管理员在「待审核」中处理，或在本页点击「审核通过」。'
                  : '请等待管理员在「待审核」中审核通过；管理员也可在本页直接点「审核通过」。'
              }
            />
          )}
          {isApproved && (
            <Alert
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
              message={
                isTrainingCodeAutoApproveEnabled()
                  ? '已自动审核通过，可在训练代码列表中查看并用于发起训练'
                  : '已审核通过，可在训练代码列表中查看并用于发起训练'
              }
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
              <Tag color={isApproved ? 'success' : 'warning'}>
                {uploadResult.approvalStatus || 'PENDING'}
              </Tag>
            </Descriptions.Item>
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
            {access.isAdmin && !isApproved && (
              <Button
                type="primary"
                loading={approving}
                onClick={handleApprove}
              >
                审核通过
              </Button>
            )}
            {access.isAdmin && !isApproved && (
              <Button onClick={() => history.push('/task/code/pending')}>
                打开待审核页
              </Button>
            )}
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
