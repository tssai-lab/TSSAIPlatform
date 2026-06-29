import { PageContainer } from '@ant-design/pro-components';
import { history, useSearchParams } from '@umijs/max';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  message,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import {
  CONSISTENCY_TRAINING_PROFILE,
  checkCodeVersionForTraining,
  createExperimentVersion,
  createTask,
  fetchApprovedCodeVersions,
  fetchDatasetList,
  fetchTaskDetail,
} from '@/services/platform';

const FUSION_HYPER_PARAMS_DEFAULT = {
  model: 'logreg',
  threshold: 0.5,
  outputDir: 'outputs/fusion_baseline_logreg',
};

const PROFILE_DISPLAY_NAME = '图文一致性基线训练';

type CheckState = {
  loading: boolean;
  passed?: boolean;
  reasons?: string[];
  approvalStatus?: string;
};

const TaskCreate: React.FC = () => {
  const [searchParams] = useSearchParams();
  const experimentId = searchParams.get('experimentId')?.trim() || '';
  const isExperimentContinue = !!experimentId;

  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);

  const [codeOptions, setCodeOptions] = useState<any[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<any[]>([]);
  const [codeLoading, setCodeLoading] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);

  const [selectedCodeVersionId, setSelectedCodeVersionId] = useState<string>();
  const [selectedCodeApprovalStatus, setSelectedCodeApprovalStatus] =
    useState<string>();
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] =
    useState<string>();

  const [codeCheck, setCodeCheck] = useState<CheckState>({ loading: false });

  const filteredDatasetOptions = useMemo(
    () =>
      datasetOptions.filter(
        (d: API.DatasetItem) => d.type === 'NLP' && d.versionId,
      ),
    [datasetOptions],
  );

  const reloadCodeOptions = () => {
    setCodeLoading(true);
    return fetchApprovedCodeVersions({ skipErrorHandler: true })
      .then((res: any) => {
        if (!res?.success) {
          message.error(res?.errorMessage || '代码模型版本列表加载失败');
          setCodeOptions([]);
          return;
        }
        setCodeOptions(res.data ?? []);
      })
      .catch((error: any) => {
        setCodeOptions([]);
        message.error(error?.message || '代码模型版本列表加载失败');
      })
      .finally(() => setCodeLoading(false));
  };

  useEffect(() => {
    reloadCodeOptions();
    setDatasetLoading(true);
    fetchDatasetList({ pageSize: 100 } as any)
      .then((res: any) => {
        const list = (res?.data?.data ?? res?.data ?? []).filter(
          (item: API.DatasetItem) =>
            item.type !== 'MULTIMODAL' && item.versionId,
        );
        setDatasetOptions(list ?? []);
      })
      .catch((error: any) => {
        setDatasetOptions([]);
        message.error(error?.message || '数据集版本列表加载失败');
      })
      .finally(() => setDatasetLoading(false));
  }, []);

  useEffect(() => {
    if (!isExperimentContinue) return;
    fetchTaskDetail(experimentId, { skipErrorHandler: true })
      .then((res: any) => {
        const data = res?.data;
        if (!data) return;
        if (data.codeVersionId) {
          setSelectedCodeVersionId(data.codeVersionId);
          setSelectedCodeApprovalStatus('APPROVED');
          form.setFieldValue('codeVersionId', data.codeVersionId);
        }
        if (data.datasetVersionId) {
          setSelectedDatasetVersionId(data.datasetVersionId);
          form.setFieldValue('datasetVersionId', data.datasetVersionId);
        }
        if (data.name) {
          form.setFieldValue('name', `${data.name}-continue`);
        }
        if (data.hyperParams && typeof data.hyperParams === 'object') {
          form.setFieldValue(
            'hyperParams',
            JSON.stringify(data.hyperParams, null, 2),
          );
        }
      })
      .catch(() => {
        // ignore prefill failure
      });
  }, [experimentId, form, isExperimentContinue]);

  // Run training-check whenever selected code version changes.
  useEffect(() => {
    if (!selectedCodeVersionId) {
      setCodeCheck({ loading: false });
      return;
    }
    setCodeCheck({ loading: true });
    checkCodeVersionForTraining(
      selectedCodeVersionId,
      CONSISTENCY_TRAINING_PROFILE,
      { skipErrorHandler: true },
    )
      .then((res: any) => {
        if (!res?.success) {
          setCodeCheck({
            loading: false,
            passed: false,
            reasons: [res?.errorMessage || '准入校验失败'],
          });
          return;
        }
        const d = res.data;
        setCodeCheck({
          loading: false,
          passed: d.passed,
          reasons: d.reasons || [],
          approvalStatus: d.approvalStatus,
        });
        if (d.approvalStatus) {
          setSelectedCodeApprovalStatus(d.approvalStatus);
        }
      })
      .catch((error: any) => {
        setCodeCheck({
          loading: false,
          passed: false,
          reasons: [error?.message || '准入校验请求失败'],
        });
      });
  }, [selectedCodeVersionId]);

  const handleCodeVersionChange = (value: string) => {
    setSelectedCodeVersionId(value);
    setSelectedCodeApprovalStatus('APPROVED');
    form.setFieldValue('codeVersionId', value);
  };

  const selectedCode = useMemo(
    () =>
      codeOptions.find((item) => item.codeVersionId === selectedCodeVersionId),
    [codeOptions, selectedCodeVersionId],
  );

  const validateStep = async (step: number) => {
    if (step === 0) {
      if (!selectedCodeVersionId) {
        message.error('请选择代码模型版本');
        throw new Error('missing code');
      }
      if (codeCheck.loading) {
        message.warning('正在执行准入校验，请稍候');
        throw new Error('check loading');
      }
      if (!codeCheck.passed) {
        Modal.error({
          title: '代码模型包校验未通过',
          content: (
            <div>
              <p>不能进入下一步，原因：</p>
              <ul style={{ paddingLeft: 20 }}>
                {(codeCheck.reasons || []).map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            </div>
          ),
        });
        throw new Error('check failed');
      }
      return;
    }
    if (step === 1) {
      if (!selectedDatasetVersionId) {
        message.error('请选择数据集版本');
        throw new Error('missing dataset');
      }
      return;
    }
    if (step === 2) {
      await form.validateFields(['trainingProfile', 'hyperParams']);
    }
  };

  const handleNext = async () => {
    try {
      await validateStep(currentStep);
      setCurrentStep((s) => s + 1);
    } catch {
      // validated inside
    }
  };

  const handlePrev = () => setCurrentStep((s) => Math.max(0, s - 1));

  const handleSubmit = async () => {
    if (!codeCheck.passed) {
      Modal.error({
        title: '代码模型包校验未通过',
        content: (codeCheck.reasons || ['未知原因']).join('；'),
      });
      setCurrentStep(0);
      return;
    }
    if (!selectedCodeVersionId || !selectedDatasetVersionId) {
      message.error('请完成代码模型包与数据包选择');
      return;
    }
    const values = form.getFieldsValue(true);
    let hyperParams: Record<string, unknown> = {};
    try {
      hyperParams = JSON.parse(values.hyperParams || '{}');
    } catch {
      message.error('hyperParams JSON 格式不正确');
      setCurrentStep(2);
      return;
    }

    try {
      let data: API.TrainingExperimentVersion | undefined;
      if (isExperimentContinue) {
        const res: any = await createExperimentVersion(
          experimentId,
          {
            name: values.name,
            codeVersionId: selectedCodeVersionId,
            datasetVersionId: selectedDatasetVersionId,
            hyperParams,
            remark: values.remark,
          },
          { skipErrorHandler: true },
        );
        if (res?.success === false) {
          throw new Error(res?.errorMessage || '创建实验新版本失败');
        }
        data = res?.data;
        message.success(
          `已在实验 ${experimentId} 下创建 v${data?.versionNo ?? '?'}`,
        );
      } else {
        const res: any = await createTask(
          {
            name: values.name,
            codeVersionId: selectedCodeVersionId,
            datasetVersionId: selectedDatasetVersionId,
            trainingProfile: CONSISTENCY_TRAINING_PROFILE,
            hyperParams,
            remark: values.remark,
          },
          { skipErrorHandler: true },
        );
        if (res?.success === false) {
          throw new Error(res?.errorMessage || '创建训练任务失败');
        }
        data = res?.data;
        message.success('K8s 训练任务已创建');
      }
      history.push(`/task/detail/${data?.id}`);
    } catch (error: any) {
      message.error(
        error?.errorMessage || error?.message || '创建失败，请重试',
      );
    }
  };

  const stepItems = [
    { title: '选择代码模型包' },
    { title: '选择数据包' },
    { title: '训练配置' },
    { title: '提交 K8s 训练' },
  ];

  const renderCheckAlert = () => {
    if (!selectedCodeVersionId) return null;
    if (codeCheck.loading) {
      return (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message="正在执行准入校验…"
        />
      );
    }
    if (codeCheck.passed) {
      return (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 12 }}
          message="代码模型包校验通过"
          description={`approvalStatus=${codeCheck.approvalStatus || 'APPROVED'}。准入校验只代表结构与固定入口检查通过，不代表代码安全审计。`}
        />
      );
    }
    return (
      <Alert
        type="error"
        showIcon
        style={{ marginTop: 12 }}
        message="代码模型包校验未通过"
        description={
          <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
            {(codeCheck.reasons || []).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        }
      />
    );
  };

  return (
    <PageContainer
      title={isExperimentContinue ? '基于此版本继续训练' : '发起训练'}
      subTitle="选择已有代码模型包与数据包，通过 Kubernetes 提交固定训练方案训练"
      onBack={() =>
        history.push(
          isExperimentContinue
            ? `/task/detail/${encodeURIComponent(experimentId)}`
            : '/task/list',
        )
      }
    >
      {isExperimentContinue && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="基于此版本继续训练"
          description="已尝试预填上一版本的代码模型版本、数据集与训练方案。提交后将在同一 experimentId 下创建下一版。"
        />
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="代码模型包（过渡概念）"
        description="本页仅从已有资产中选择代码模型包与数据包；如需上传新包，请前往代码模型包管理页或数据集管理页。元数据仍使用 codeVersionId 追踪；当前训练方案不会自动加载 weights/ 下的权重文件。"
      />

      <Form
        form={form}
        preserve
        layout="vertical"
        initialValues={{
          trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          hyperParams: JSON.stringify(FUSION_HYPER_PARAMS_DEFAULT, null, 2),
        }}
      >
        <Steps
          current={currentStep}
          items={stepItems}
          style={{ marginBottom: 24 }}
        />

        <div style={{ minHeight: 240, marginBottom: 24 }}>
          {currentStep === 0 && (
            <>
              <Form.Item
                name="codeVersionId"
                label="代码模型版本"
                extra="仅展示已通过准入校验（APPROVED）且 READY 的代码模型版本"
              >
                <Select
                  placeholder="请选择代码模型版本"
                  showSearch
                  loading={codeLoading}
                  optionFilterProp="label"
                  value={selectedCodeVersionId}
                  onChange={handleCodeVersionChange}
                  options={codeOptions.map((item: any) => ({
                    value: item.codeVersionId,
                    label: `${item.codeAssetName} / ${item.version} / ${item.codeVersionId}`,
                  }))}
                />
              </Form.Item>
              {selectedCode && (
                <Descriptions
                  size="small"
                  column={1}
                  bordered
                  style={{ marginTop: 8 }}
                >
                  <Descriptions.Item label="codeVersionId">
                    <Typography.Text copyable code>
                      {selectedCode.codeVersionId}
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="名称">
                    {selectedCode.codeAssetName}
                  </Descriptions.Item>
                  <Descriptions.Item label="版本">
                    {selectedCode.version}
                  </Descriptions.Item>
                  <Descriptions.Item label="训练方案">
                    {PROFILE_DISPLAY_NAME}
                    <Typography.Text
                      type="secondary"
                      style={{ marginLeft: 8, fontSize: 12 }}
                    >
                      （{selectedCode.trainingProfile}）
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Space>
                      <Tag
                        color={
                          selectedCode.status === 'READY'
                            ? 'success'
                            : 'default'
                        }
                      >
                        {selectedCode.status}
                      </Tag>
                      <Tag
                        color={
                          selectedCodeApprovalStatus === 'APPROVED'
                            ? 'success'
                            : 'warning'
                        }
                      >
                        {selectedCodeApprovalStatus || '-'}
                      </Tag>
                    </Space>
                  </Descriptions.Item>
                </Descriptions>
              )}
              {renderCheckAlert()}
            </>
          )}

          {currentStep === 1 && (
            <Form.Item
              name="datasetVersionId"
              label="数据集版本"
              extra="当前训练方案需要 NLP 类型数据集（如 consistency_test_fusion_data_min.zip）"
            >
              <Select
                placeholder="请选择数据集版本"
                showSearch
                loading={datasetLoading}
                optionFilterProp="label"
                value={selectedDatasetVersionId}
                onChange={(value: string) => {
                  setSelectedDatasetVersionId(value);
                  form.setFieldValue('datasetVersionId', value);
                }}
                options={filteredDatasetOptions.flatMap(
                  (d: API.DatasetItem) => {
                    const versionId = d.versionId;
                    if (!versionId) return [];
                    const desc = d.versionRemark?.trim();
                    const descPart = desc
                      ? ` · ${desc.length > 40 ? `${desc.slice(0, 40)}…` : desc}`
                      : '';
                    return [
                      {
                        value: versionId,
                        label: `${d.name} / ${d.version || 'v?'} / ${d.type}${descPart} / ${versionId}`,
                      },
                    ];
                  },
                )}
              />
            </Form.Item>
          )}

          {currentStep === 2 && (
            <>
              <Form.Item name="name" label="任务名称（可选）">
                <Input placeholder="例如：fusion-k8s-train" />
              </Form.Item>
              <Form.Item
                name="trainingProfile"
                label="训练方案"
                rules={[{ required: true, message: '训练方案不能为空' }]}
                extra={
                  <span>
                    当前唯一方案：{PROFILE_DISPLAY_NAME}
                    <Typography.Text
                      type="secondary"
                      style={{ marginLeft: 8, fontSize: 12 }}
                    >
                      （内部 ID：{CONSISTENCY_TRAINING_PROFILE}）
                    </Typography.Text>
                  </span>
                }
              >
                <Select
                  disabled
                  options={[
                    {
                      value: CONSISTENCY_TRAINING_PROFILE,
                      label: PROFILE_DISPLAY_NAME,
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="hyperParams"
                label="hyperParams（JSON）"
                extra="仅记录/预留，不能覆盖 Worker 固定训练命令；代码模型包内 weights/ 不会被当前训练方案自动加载"
                rules={[
                  { required: true, message: '请输入 hyperParams JSON' },
                  {
                    validator: async (_: any, value: string) => {
                      try {
                        JSON.parse(value || '{}');
                        return Promise.resolve();
                      } catch {
                        return Promise.reject(new Error('JSON 格式不正确'));
                      }
                    },
                  },
                ]}
              >
                <Input.TextArea rows={8} />
              </Form.Item>
              <Form.Item name="remark" label="备注（可选）">
                <Input placeholder="例如：create-page k8s test" />
              </Form.Item>
            </>
          )}

          {currentStep === 3 && (
            <>
              {!codeCheck.passed && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="代码模型包校验未通过，不能用于训练"
                  description={(codeCheck.reasons || []).join('；')}
                />
              )}
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="执行方式">
                  Kubernetes Job
                </Descriptions.Item>
                <Descriptions.Item label="训练方案">
                  {PROFILE_DISPLAY_NAME}
                  <Typography.Text
                    type="secondary"
                    style={{ marginLeft: 8, fontSize: 12 }}
                  >
                    （{CONSISTENCY_TRAINING_PROFILE}）
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="codeVersionId">
                  <Typography.Text copyable code>
                    {selectedCodeVersionId || '-'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="datasetVersionId">
                  <Typography.Text copyable code>
                    {selectedDatasetVersionId || '-'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="hyperParams">
                  <code>{form.getFieldValue('hyperParams') || '{}'}</code>
                </Descriptions.Item>
                <Descriptions.Item label="Worker 固定命令">
                  <Typography.Paragraph copyable style={{ marginBottom: 0 }}>
                    python scripts/training/train_fusion_baseline.py --data-dir
                    data --model logreg --out-dir outputs/fusion_baseline_logreg
                  </Typography.Paragraph>
                </Descriptions.Item>
              </Descriptions>
            </>
          )}
        </div>

        <Space>
          {currentStep > 0 && (
            <Button htmlType="button" onClick={handlePrev}>
              上一步
            </Button>
          )}
          {currentStep < 3 ? (
            <Button type="primary" htmlType="button" onClick={handleNext}>
              下一步
            </Button>
          ) : (
            <Button
              type="primary"
              htmlType="button"
              disabled={!codeCheck.passed}
              onClick={handleSubmit}
            >
              {isExperimentContinue ? '提交并创建新版本' : '提交 K8s 训练'}
            </Button>
          )}
        </Space>
      </Form>
    </PageContainer>
  );
};

export default TaskCreate;
