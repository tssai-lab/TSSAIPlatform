import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess, useSearchParams } from '@umijs/max';
import type { UploadFile } from 'antd';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  message,
  Progress,
  Select,
  Space,
  Steps,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import {
  approveCodeVersion,
  CONSISTENCY_TRAINING_PROFILE,
  createExperimentVersion,
  createTask,
  fetchApprovedCodeVersions,
  fetchDatasetList,
  fetchTaskDetail,
  uploadCodeZip,
  uploadDataset,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';

const DEFAULT_HYPER_PARAMS = '{}';

function approvalTag(status?: string) {
  if (status === 'APPROVED') {
    return <Tag color="success">APPROVED</Tag>;
  }
  if (status === 'PENDING') {
    return <Tag color="warning">PENDING</Tag>;
  }
  return <Tag>{status || '未知'}</Tag>;
}

function resolveDatasetVersionId(data: any): string | undefined {
  return data?.datasetVersionId || data?.id || data?.versionId;
}

const TaskCreate: React.FC = () => {
  const access = useAccess();
  const [searchParams] = useSearchParams();
  const experimentId = searchParams.get('experimentId')?.trim() || '';
  const isExperimentContinue = !!experimentId;

  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);

  const [codeTab, setCodeTab] = useState<'select' | 'upload'>('select');
  const [datasetTab, setDatasetTab] = useState<'select' | 'upload'>('select');

  const [codeOptions, setCodeOptions] = useState<any[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<any[]>([]);
  const [codeLoading, setCodeLoading] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);

  const [selectedCodeVersionId, setSelectedCodeVersionId] = useState<string>();
  const [selectedCodeApprovalStatus, setSelectedCodeApprovalStatus] =
    useState<string>();
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] =
    useState<string>();
  const [selectedTrainingProfile, setSelectedTrainingProfile] =
    useState<string>(CONSISTENCY_TRAINING_PROFILE);

  const [codeFileList, setCodeFileList] = useState<UploadFile[]>([]);
  const [dataFileList, setDataFileList] = useState<UploadFile[]>([]);
  const [codeUploading, setCodeUploading] = useState(false);
  const [dataUploading, setDataUploading] = useState(false);
  const [codeProgress, setCodeProgress] = useState(0);
  const [dataProgress, setDataProgress] = useState(0);
  const [codeUploadResult, setCodeUploadResult] = useState<any>(null);
  const [dataUploadResult, setDataUploadResult] = useState<any>(null);
  const [approveSubmitting, setApproveSubmitting] = useState(false);

  const activeCodeVersionId = useMemo(() => {
    if (codeTab === 'upload') {
      return codeUploadResult?.codeVersionId as string | undefined;
    }
    return selectedCodeVersionId;
  }, [codeTab, codeUploadResult, selectedCodeVersionId]);

  const activeApprovalStatus = useMemo(() => {
    if (codeTab === 'upload') {
      return codeUploadResult?.approvalStatus as string | undefined;
    }
    return selectedCodeApprovalStatus;
  }, [codeTab, codeUploadResult, selectedCodeApprovalStatus]);

  const activeDatasetVersionId = useMemo(() => {
    if (datasetTab === 'upload') {
      return resolveDatasetVersionId(dataUploadResult);
    }
    return selectedDatasetVersionId;
  }, [datasetTab, dataUploadResult, selectedDatasetVersionId]);

  const isCodeApproved = activeApprovalStatus === 'APPROVED';

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
          setCodeTab('select');
          form.setFieldValue('codeVersionId', data.codeVersionId);
        }
        if (data.datasetVersionId) {
          setSelectedDatasetVersionId(data.datasetVersionId);
          setDatasetTab('select');
          form.setFieldValue('datasetVersionId', data.datasetVersionId);
        }
        if (data.trainingProfile) {
          setSelectedTrainingProfile(data.trainingProfile);
          form.setFieldValue('trainingProfile', data.trainingProfile);
        }
        if (data.name) {
          form.setFieldValue('name', `${data.name}-continue`);
        }
        if (data.hyperParams) {
          form.setFieldValue(
            'hyperParams',
            typeof data.hyperParams === 'string'
              ? data.hyperParams
              : JSON.stringify(data.hyperParams, null, 2),
          );
        }
      })
      .catch(() => {
        // ignore prefill failure
      });
  }, [experimentId, form, isExperimentContinue]);

  const handleCodeVersionChange = (value: string) => {
    setSelectedCodeVersionId(value);
    setSelectedCodeApprovalStatus('APPROVED');
    form.setFieldValue('codeVersionId', value);
    const selected = codeOptions.find((item) => item.codeVersionId === value);
    if (selected?.trainingProfile) {
      setSelectedTrainingProfile(selected.trainingProfile);
      form.setFieldValue('trainingProfile', selected.trainingProfile);
    }
  };

  const uploadCode = async () => {
    const file = codeFileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.warning('请选择代码模型包 ZIP 文件');
      return;
    }
    const values = await form.validateFields([
      'uploadCodeName',
      'uploadCodeVersion',
    ]);
    setCodeUploading(true);
    setCodeProgress(10);
    try {
      const res: any = await uploadCodeZip(
        {
          file,
          codeName: values.uploadCodeName,
          version: values.uploadCodeVersion || 'v1',
          trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          remark: 'task create page upload',
        },
        { skipErrorHandler: true },
      );
      if (!res?.success) {
        message.error(res?.errorMessage || '代码模型包上传失败');
        return;
      }
      setCodeUploadResult(res.data);
      setCodeProgress(100);
      message.success(`代码模型包上传成功：${res.data.codeVersionId}`);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '代码模型包上传失败'));
    } finally {
      setCodeUploading(false);
    }
  };

  const approveCode = async () => {
    const codeVersionId = activeCodeVersionId;
    if (!codeVersionId) {
      message.warning('请先上传代码模型包');
      return;
    }
    setApproveSubmitting(true);
    try {
      const res: any = await approveCodeVersion(codeVersionId, {
        skipErrorHandler: true,
      });
      if (!res?.success) {
        message.error(res?.errorMessage || '审核失败');
        return;
      }
      if (codeTab === 'upload') {
        setCodeUploadResult((prev: any) => ({
          ...prev,
          approvalStatus: res.data.approvalStatus,
        }));
      } else {
        setSelectedCodeApprovalStatus(res.data.approvalStatus);
      }
      await reloadCodeOptions();
      message.success('代码模型版本已审核通过');
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '审核失败'));
    } finally {
      setApproveSubmitting(false);
    }
  };

  const uploadData = async () => {
    const file = dataFileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.warning('请选择数据包 ZIP 文件');
      return;
    }
    const values = await form.validateFields([
      'uploadDatasetName',
      'uploadDatasetVersion',
    ]);
    setDataUploading(true);
    setDataProgress(0);
    try {
      const res: any = await uploadDataset(
        {
          name: values.uploadDatasetName,
          version: values.uploadDatasetVersion || 'v1',
          type: 'NLP',
          remark: 'task create page upload',
          files: [file],
          onProgress: (percent) => setDataProgress(percent),
        },
        { skipErrorHandler: true },
      );
      const versionId = resolveDatasetVersionId(res?.data);
      if (!versionId) {
        message.error('数据包上传成功但未返回 datasetVersionId');
        return;
      }
      setDataUploadResult(res.data);
      setDataProgress(100);
      message.success(`数据包上传成功：${versionId}`);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '数据包上传失败'));
    } finally {
      setDataUploading(false);
    }
  };

  const validateStep = async (step: number) => {
    if (step === 0) {
      if (!activeCodeVersionId) {
        message.error(
          codeTab === 'upload'
            ? '请先上传代码模型包 ZIP'
            : '请选择已审核通过的代码模型版本',
        );
        throw new Error('missing code');
      }
      if (!isCodeApproved) {
        message.error('代码模型版本未审核通过，不能用于训练');
        throw new Error('pending code');
      }
      return;
    }
    if (step === 1) {
      if (!activeDatasetVersionId) {
        message.error(
          datasetTab === 'upload' ? '请先上传数据包 ZIP' : '请选择数据集版本',
        );
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
    if (!isCodeApproved) {
      message.error('代码模型版本未审核通过，不能用于训练');
      setCurrentStep(0);
      return;
    }
    if (!activeCodeVersionId || !activeDatasetVersionId) {
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
            codeVersionId: activeCodeVersionId,
            datasetVersionId: activeDatasetVersionId,
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
            codeVersionId: activeCodeVersionId,
            datasetVersionId: activeDatasetVersionId,
            trainingProfile:
              values.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
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

  const codeSummary = activeCodeVersionId ? (
    <Descriptions size="small" column={1} bordered style={{ marginTop: 16 }}>
      <Descriptions.Item label="codeVersionId">
        <Typography.Text copyable code>
          {activeCodeVersionId}
        </Typography.Text>
      </Descriptions.Item>
      <Descriptions.Item label="approvalStatus">
        {approvalTag(activeApprovalStatus)}
      </Descriptions.Item>
      {codeTab === 'upload' && codeUploadResult?.storagePath && (
        <Descriptions.Item label="MinIO">
          {codeUploadResult.storagePath}
        </Descriptions.Item>
      )}
      {access.isAdmin && !isCodeApproved && (
        <Descriptions.Item label="审核">
          <Button
            type="primary"
            size="small"
            loading={approveSubmitting}
            onClick={approveCode}
          >
            审核通过（测试）
          </Button>
        </Descriptions.Item>
      )}
    </Descriptions>
  ) : null;

  const stepItems = [
    { title: '选择或上传代码模型包' },
    { title: '选择或上传数据包' },
    { title: '训练配置' },
    { title: '提交 K8s 训练' },
  ];

  return (
    <PageContainer
      title={isExperimentContinue ? '基于此版本继续训练' : '发起训练'}
      subTitle="选择或上传代码模型包与数据包，通过 Kubernetes 提交固定 profile 训练"
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
          description="已尝试预填上一版本的代码模型版本、数据集与 profile。提交后将在同一 experimentId 下创建下一版。"
        />
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="代码模型包（过渡概念）"
        description="代码模型包 ZIP 可同时包含训练脚本、权重（weights/）与配置（config/）。元数据仍使用 codeVersionId 追踪；当前 profile 不会自动加载 weights/ 下的权重文件。"
      />

      <Form
        form={form}
        preserve
        layout="vertical"
        initialValues={{
          trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          hyperParams: DEFAULT_HYPER_PARAMS,
          uploadCodeName: 'consistency_test_code',
          uploadCodeVersion: 'v1',
          uploadDatasetName: 'consistency_test_data',
          uploadDatasetVersion: 'v1',
        }}
      >
        <Steps
          current={currentStep}
          items={stepItems}
          style={{ marginBottom: 24 }}
        />

        <div style={{ minHeight: 260, marginBottom: 24 }}>
          {currentStep === 0 && (
            <>
              <Tabs
                activeKey={codeTab}
                onChange={(key) => setCodeTab(key as 'select' | 'upload')}
                items={[
                  {
                    key: 'select',
                    label: '选择已有代码模型版本',
                    children: (
                      <>
                        <Form.Item
                          name="codeVersionId"
                          label="代码模型版本"
                          extra="仅展示 APPROVED 且 READY 的代码模型版本"
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
                              label: `${item.codeAssetName} / ${item.version} / ${item.trainingProfile} / ${item.codeVersionId}`,
                            }))}
                          />
                        </Form.Item>
                        {codeSummary}
                      </>
                    ),
                  },
                  {
                    key: 'upload',
                    label: '上传代码模型包 ZIP',
                    children: (
                      <>
                        <Form.Item
                          name="uploadCodeName"
                          label="代码模型包名称"
                          rules={[{ required: true, message: '请输入名称' }]}
                        >
                          <Input placeholder="例如：consistency_test_code" />
                        </Form.Item>
                        <Form.Item
                          name="uploadCodeVersion"
                          label="版本号"
                          rules={[{ required: true, message: '请输入版本号' }]}
                        >
                          <Input placeholder="v1" />
                        </Form.Item>
                        <Form.Item label="代码模型包 ZIP" required>
                          <Upload
                            accept=".zip"
                            maxCount={1}
                            fileList={codeFileList}
                            beforeUpload={() => false}
                            onChange={({ fileList }) =>
                              setCodeFileList(fileList.slice(-1))
                            }
                          >
                            <Button>上传代码模型包 ZIP</Button>
                          </Upload>
                        </Form.Item>
                        {codeUploading && (
                          <Progress
                            percent={codeProgress}
                            style={{ marginBottom: 12 }}
                          />
                        )}
                        <Button
                          type="primary"
                          loading={codeUploading}
                          onClick={uploadCode}
                        >
                          上传
                        </Button>
                        {codeSummary}
                        {!isCodeApproved && activeCodeVersionId && (
                          <Alert
                            type="warning"
                            showIcon
                            style={{ marginTop: 16 }}
                            message="代码模型版本未审核通过"
                            description="上传后默认为 PENDING，需管理员审核通过后才能进入后续步骤并提交训练。"
                          />
                        )}
                      </>
                    ),
                  },
                ]}
              />
            </>
          )}

          {currentStep === 1 && (
            <Tabs
              activeKey={datasetTab}
              onChange={(key) => setDatasetTab(key as 'select' | 'upload')}
              items={[
                {
                  key: 'select',
                  label: '选择已有数据集版本',
                  children: (
                    <Form.Item
                      name="datasetVersionId"
                      label="数据集版本"
                      extra="当前 profile 需要 NLP 类型数据集（如 consistency_test_fusion_data_min.zip）"
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
                  ),
                },
                {
                  key: 'upload',
                  label: '上传数据包 ZIP',
                  children: (
                    <>
                      <Form.Item
                        name="uploadDatasetName"
                        label="数据集名称"
                        rules={[{ required: true, message: '请输入名称' }]}
                      >
                        <Input />
                      </Form.Item>
                      <Form.Item
                        name="uploadDatasetVersion"
                        label="版本号"
                        rules={[{ required: true, message: '请输入版本号' }]}
                      >
                        <Input placeholder="v1" />
                      </Form.Item>
                      <Form.Item label="数据包 ZIP" required>
                        <Upload
                          accept=".zip"
                          maxCount={1}
                          fileList={dataFileList}
                          beforeUpload={() => false}
                          onChange={({ fileList }) =>
                            setDataFileList(fileList.slice(-1))
                          }
                        >
                          <Button>选择数据包 ZIP</Button>
                        </Upload>
                      </Form.Item>
                      {dataUploading && (
                        <Progress
                          percent={dataProgress}
                          style={{ marginBottom: 12 }}
                        />
                      )}
                      <Button
                        type="primary"
                        loading={dataUploading}
                        onClick={uploadData}
                      >
                        上传数据包
                      </Button>
                      {activeDatasetVersionId && (
                        <Descriptions
                          size="small"
                          column={1}
                          bordered
                          style={{ marginTop: 16 }}
                        >
                          <Descriptions.Item label="datasetVersionId">
                            <Typography.Text copyable code>
                              {activeDatasetVersionId}
                            </Typography.Text>
                          </Descriptions.Item>
                        </Descriptions>
                      )}
                    </>
                  ),
                },
              ]}
            />
          )}

          {currentStep === 2 && (
            <>
              <Form.Item name="name" label="任务名称（可选）">
                <Input placeholder="例如：fusion-k8s-train" />
              </Form.Item>
              <Form.Item
                name="trainingProfile"
                label="trainingProfile"
                rules={[
                  { required: true, message: 'trainingProfile 不能为空' },
                ]}
                extra="当前仅支持 image_text_consistency_fusion_logreg"
              >
                <Select
                  disabled
                  options={[
                    {
                      value: CONSISTENCY_TRAINING_PROFILE,
                      label: CONSISTENCY_TRAINING_PROFILE,
                    },
                  ]}
                />
              </Form.Item>
              <Form.Item
                name="hyperParams"
                label="hyperParams（JSON）"
                extra="仅记录/预留，不能覆盖 Worker 固定训练命令；代码模型包内 weights/ 不会被当前 profile 自动加载"
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
                <Input.TextArea rows={6} placeholder="{}" />
              </Form.Item>
              <Form.Item name="remark" label="备注（可选）">
                <Input placeholder="例如：create-page k8s test" />
              </Form.Item>
            </>
          )}

          {currentStep === 3 && (
            <>
              {!isCodeApproved && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="代码模型版本未审核通过，不能用于训练"
                  description={
                    access.isAdmin
                      ? '请返回 Step 1 点击「审核通过（测试）」后再提交。'
                      : '请联系管理员审核代码模型版本后再提交训练。'
                  }
                />
              )}
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="执行方式">
                  Kubernetes Job
                </Descriptions.Item>
                <Descriptions.Item label="trainingProfile">
                  <code>
                    {selectedTrainingProfile || CONSISTENCY_TRAINING_PROFILE}
                  </code>
                </Descriptions.Item>
                <Descriptions.Item label="codeVersionId">
                  <Typography.Text copyable code>
                    {activeCodeVersionId || '-'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="approvalStatus">
                  {approvalTag(activeApprovalStatus)}
                </Descriptions.Item>
                <Descriptions.Item label="datasetVersionId">
                  <Typography.Text copyable code>
                    {activeDatasetVersionId || '-'}
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
              disabled={!isCodeApproved}
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
