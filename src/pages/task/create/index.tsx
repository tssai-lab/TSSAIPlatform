import { InboxOutlined, UploadOutlined } from '@ant-design/icons';
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
  Progress,
  Radio,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import React, { useEffect, useMemo, useState } from 'react';
import { UPLOAD_CONFIG } from '@/constants/platform';
import {
  CONSISTENCY_TRAINING_PROFILE,
  checkCodeVersionForTraining,
  createExperimentVersion,
  createTask,
  fetchApprovedCodeVersions,
  fetchDatasetList,
  fetchModelList,
  fetchTaskDetail,
  modelUploadChunk,
  modelUploadComplete,
  modelUploadInit,
  uploadCodeZip,
  uploadDataset,
} from '@/services/platform';
import { buildModelFileFingerprint } from '@/utils/uploadResume';

const CHUNK_FALLBACK = 5 * 1024 * 1024;

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

const resolveDatasetVersionId = (data: any): string | undefined =>
  data?.datasetVersionId || data?.id || data?.versionId;

const TaskCreate: React.FC = () => {
  const [searchParams] = useSearchParams();
  const experimentId = searchParams.get('experimentId')?.trim() || '';
  const isExperimentContinue = !!experimentId;

  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);

  const [modelOptions, setModelOptions] = useState<API.ModelItem[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<API.DatasetItem[]>([]);
  const [codeOptions, setCodeOptions] = useState<any[]>([]);

  const [modelLoading, setModelLoading] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);

  const [modelInputMode, setModelInputMode] = useState<'select' | 'upload'>(
    'select',
  );
  const [datasetInputMode, setDatasetInputMode] = useState<'select' | 'upload'>(
    'select',
  );
  const [codeInputMode, setCodeInputMode] = useState<'select' | 'upload'>(
    'select',
  );

  const [selectedBaseModelVersionId, setSelectedBaseModelVersionId] =
    useState<string>();
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] =
    useState<string>();
  const [selectedCodeVersionId, setSelectedCodeVersionId] = useState<string>();
  const [selectedCodeApprovalStatus, setSelectedCodeApprovalStatus] =
    useState<string>();

  const [modelUploading, setModelUploading] = useState(false);
  const [modelUploadPercent, setModelUploadPercent] = useState(0);
  const [datasetUploading, setDatasetUploading] = useState(false);
  const [datasetUploadPercent, setDatasetUploadPercent] = useState(0);
  const [codeUploading, setCodeUploading] = useState(false);

  const [codeCheck, setCodeCheck] = useState<CheckState>({ loading: false });

  const filteredDatasetOptions = useMemo(
    () =>
      datasetOptions.filter(
        (d: API.DatasetItem) => d.type === 'NLP' && d.versionId,
      ),
    [datasetOptions],
  );

  const reloadModelOptions = () => {
    setModelLoading(true);
    return fetchModelList({ pageSize: 100 }, { skipErrorHandler: true })
      .then((res: any) => {
        const list = (res?.data ?? []).filter((item: API.ModelItem) => item.id);
        setModelOptions(list);
      })
      .catch((error: any) => {
        setModelOptions([]);
        message.error(error?.message || '基础模型权重列表加载失败');
      })
      .finally(() => setModelLoading(false));
  };

  const reloadCodeOptions = () => {
    setCodeLoading(true);
    return fetchApprovedCodeVersions({ skipErrorHandler: true })
      .then((res: any) => {
        if (!res?.success) {
          message.error(res?.errorMessage || '训练代码版本列表加载失败');
          setCodeOptions([]);
          return;
        }
        setCodeOptions(res.data ?? []);
      })
      .catch((error: any) => {
        setCodeOptions([]);
        message.error(error?.message || '训练代码版本列表加载失败');
      })
      .finally(() => setCodeLoading(false));
  };

  useEffect(() => {
    reloadModelOptions();
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
        const baseId = data.baseModelVersionId || data.modelVersionId;
        if (baseId) {
          setSelectedBaseModelVersionId(baseId);
          form.setFieldValue('baseModelVersionId', baseId);
        }
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

  const selectedModel = useMemo(
    () => modelOptions.find((item) => item.id === selectedBaseModelVersionId),
    [modelOptions, selectedBaseModelVersionId],
  );

  const selectedCode = useMemo(
    () =>
      codeOptions.find((item) => item.codeVersionId === selectedCodeVersionId),
    [codeOptions, selectedCodeVersionId],
  );

  const uploadModelWeightZip = async (values: {
    modelName: string;
    version: string;
    type: string;
    file: UploadFile[];
  }) => {
    const file = values.file?.[0]?.originFileObj as File | undefined;
    if (!file) {
      throw new Error('请选择模型权重 zip 文件');
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      throw new Error('基础模型权重仅支持 zip 格式');
    }
    if (file.size > UPLOAD_CONFIG.MODEL.MAX_SIZE) {
      throw new Error('模型权重文件过大');
    }

    setModelUploading(true);
    setModelUploadPercent(0);
    const requestOpts = { skipErrorHandler: true } as const;
    try {
      const fileFingerprint = buildModelFileFingerprint(
        file,
        values.modelName,
        values.version,
        values.type,
      );
      const initRes = await modelUploadInit(
        { fileName: file.name, fileSize: file.size, fileFingerprint },
        requestOpts,
      );
      const initData = initRes?.data;
      const uploadId = initData?.uploadId;
      if (!uploadId) {
        throw new Error('初始化模型权重上传失败');
      }
      const chunkSize =
        initData?.chunkSize && initData.chunkSize > 0
          ? initData.chunkSize
          : CHUNK_FALLBACK;
      const totalChunks =
        initData?.totalChunks && initData.totalChunks > 0
          ? initData.totalChunks
          : Math.max(1, Math.ceil(file.size / chunkSize));
      const uploaded = new Set(initData?.uploadedPartIndexes ?? []);
      let finishedParts = uploaded.size;
      for (let partIndex = 0; partIndex < totalChunks; partIndex += 1) {
        if (uploaded.has(partIndex)) continue;
        const start = partIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        await modelUploadChunk(
          uploadId,
          partIndex,
          file.slice(start, end),
          requestOpts,
        );
        finishedParts += 1;
        setModelUploadPercent(
          Math.min(100, Math.round((finishedParts / totalChunks) * 100)),
        );
      }
      const completeRes = await modelUploadComplete(
        {
          uploadId,
          modelName: values.modelName,
          version: values.version.trim(),
          type: values.type as API.ModelItem['type'],
          remark: 'task/create 页面上传',
        },
        requestOpts,
      );
      const versionId = completeRes?.data?.id;
      if (!versionId) {
        throw new Error('模型权重上传成功但未返回 versionId');
      }
      setSelectedBaseModelVersionId(versionId);
      form.setFieldValue('baseModelVersionId', versionId);
      await reloadModelOptions();
      message.success(`基础模型权重上传成功：${versionId}`);
      setModelInputMode('select');
    } finally {
      setModelUploading(false);
      setModelUploadPercent(0);
    }
  };

  const uploadDatasetZip = async (values: {
    datasetName: string;
    version: string;
    file: UploadFile[];
  }) => {
    const file = values.file?.[0]?.originFileObj as File | undefined;
    if (!file) {
      throw new Error('请选择数据集 zip 文件');
    }
    setDatasetUploading(true);
    setDatasetUploadPercent(0);
    try {
      const res = await uploadDataset(
        {
          name: values.datasetName,
          version: values.version || 'v1',
          type: 'NLP',
          files: [file],
          onProgress: setDatasetUploadPercent,
        },
        { skipErrorHandler: true },
      );
      const versionId = resolveDatasetVersionId(res?.data);
      if (!versionId) {
        throw new Error('数据集上传成功但未返回 datasetVersionId');
      }
      setSelectedDatasetVersionId(versionId);
      form.setFieldValue('datasetVersionId', versionId);
      const listRes = await fetchDatasetList({ pageSize: 100 } as any);
      const list = (listRes?.data?.data ?? listRes?.data ?? []).filter(
        (item: API.DatasetItem) => item.type !== 'MULTIMODAL' && item.versionId,
      );
      setDatasetOptions(list ?? []);
      message.success(`数据集上传成功：${versionId}`);
      setDatasetInputMode('select');
    } finally {
      setDatasetUploading(false);
      setDatasetUploadPercent(0);
    }
  };

  const uploadTrainingCodeZip = async (values: {
    codeName: string;
    version: string;
    file: UploadFile[];
  }) => {
    const file = values.file?.[0]?.originFileObj as File | undefined;
    if (!file) {
      throw new Error('请选择训练代码 zip 文件');
    }
    setCodeUploading(true);
    try {
      const res = await uploadCodeZip(
        {
          file,
          codeName: values.codeName,
          version: values.version || 'v1',
          trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          remark: 'task/create 页面上传',
        },
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        throw new Error(res?.errorMessage || '训练代码上传失败');
      }
      const codeVersionId = res?.data?.codeVersionId;
      if (!codeVersionId) {
        throw new Error('训练代码上传成功但未返回 codeVersionId');
      }
      setSelectedCodeVersionId(codeVersionId);
      form.setFieldValue('codeVersionId', codeVersionId);
      await reloadCodeOptions();
      message.success(`训练代码已上传，正在执行准入校验：${codeVersionId}`);
      setCodeInputMode('select');
    } finally {
      setCodeUploading(false);
    }
  };

  const renderCodeCheckAlert = () => {
    if (!selectedCodeVersionId) return null;
    if (codeCheck.loading) {
      return (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message="正在执行训练代码准入校验…"
        />
      );
    }
    if (codeCheck.passed) {
      return (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 12 }}
          message="训练代码校验通过"
          description={`approvalStatus=${codeCheck.approvalStatus || 'APPROVED'}。准入校验只代表结构与固定入口检查通过，不代表代码安全审计。`}
        />
      );
    }
    return (
      <Alert
        type="error"
        showIcon
        style={{ marginTop: 12 }}
        message="训练代码校验未通过"
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

  const validateStep = async (step: number) => {
    if (step === 0) {
      if (!selectedBaseModelVersionId) {
        message.error('请选择或上传基础模型权重');
        throw new Error('missing model');
      }
      return;
    }
    if (step === 1) {
      if (!selectedDatasetVersionId) {
        message.error('请选择或上传训练数据集');
        throw new Error('missing dataset');
      }
      return;
    }
    if (step === 2) {
      if (!selectedCodeVersionId) {
        message.error('请选择或上传训练代码');
        throw new Error('missing code');
      }
      if (codeCheck.loading) {
        message.warning('正在执行准入校验，请稍候');
        throw new Error('check loading');
      }
      if (!codeCheck.passed) {
        Modal.error({
          title: '训练代码校验未通过',
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
        title: '训练代码校验未通过',
        content: (codeCheck.reasons || ['未知原因']).join('；'),
      });
      setCurrentStep(2);
      return;
    }
    if (
      !selectedBaseModelVersionId ||
      !selectedCodeVersionId ||
      !selectedDatasetVersionId
    ) {
      message.error('请完成基础模型权重、数据集与训练代码选择');
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
      const payload = {
        name: values.name,
        baseModelVersionId: selectedBaseModelVersionId,
        codeVersionId: selectedCodeVersionId,
        datasetVersionId: selectedDatasetVersionId,
        hyperParams,
        remark: values.remark,
      };
      if (isExperimentContinue) {
        const res: any = await createExperimentVersion(experimentId, payload, {
          skipErrorHandler: true,
        });
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
            ...payload,
            trainingProfile: CONSISTENCY_TRAINING_PROFILE,
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
    { title: '基础模型权重' },
    { title: '训练数据集' },
    { title: '训练配置与代码' },
    { title: '确认并提交' },
  ];

  return (
    <PageContainer
      title={isExperimentContinue ? '基于此版本继续训练' : '发起训练'}
      subTitle="选择或上传基础模型权重、训练数据集与训练代码，通过 Kubernetes 提交固定训练方案"
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
          description="已尝试预填上一版本的基础模型权重、训练代码与数据集。提交后将在同一 experimentId 下创建下一版。"
        />
      )}
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="三类资产拆分（推荐流程）"
        description={
          <span>
            「代码模型包」为过渡方案，新流程拆分为：
            <strong>基础模型权重</strong>
            （model_asset/model_version）、<strong>训练数据集</strong>、
            <strong>训练代码</strong>（codeVersionId + training-check）。
            当前训练方案 image_text_consistency_fusion_logreg 不自动加载权重，但
            Worker 仍会下载并解压到 /workspace/job/model。
          </span>
        }
      />

      <Form
        form={form}
        preserve
        layout="vertical"
        initialValues={{
          trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          hyperParams: JSON.stringify(FUSION_HYPER_PARAMS_DEFAULT, null, 2),
          modelType: 'NLP',
          modelVersion: 'v1',
          datasetVersion: 'v1',
          codeVersion: 'v1',
        }}
      >
        <Steps
          current={currentStep}
          items={stepItems}
          style={{ marginBottom: 24 }}
        />

        <div style={{ minHeight: 280, marginBottom: 24 }}>
          {currentStep === 0 && (
            <>
              <Radio.Group
                value={modelInputMode}
                onChange={(e) => setModelInputMode(e.target.value)}
                style={{ marginBottom: 16 }}
              >
                <Radio.Button value="select">选择已有</Radio.Button>
                <Radio.Button value="upload">上传新包</Radio.Button>
              </Radio.Group>
              {modelInputMode === 'select' ? (
                <Form.Item
                  name="baseModelVersionId"
                  label="基础模型权重版本"
                  extra="允许 .pt/.pth/.onnx/.pkl/.joblib/.yaml/.yml/.json/.txt/.md；禁止脚本与可执行文件"
                >
                  <Select
                    placeholder="请选择基础模型权重版本"
                    showSearch
                    loading={modelLoading}
                    optionFilterProp="label"
                    value={selectedBaseModelVersionId}
                    onChange={(value: string) => {
                      setSelectedBaseModelVersionId(value);
                      form.setFieldValue('baseModelVersionId', value);
                    }}
                    options={modelOptions.map((item) => ({
                      value: item.id,
                      label: `${item.name} / ${item.version || 'v?'} / ${item.type} / ${item.id}`,
                    }))}
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    name="modelName"
                    label="模型名称"
                    rules={[{ required: true, message: '请输入模型名称' }]}
                  >
                    <Input placeholder="例如：fusion-base-weights" />
                  </Form.Item>
                  <Form.Item
                    name="modelVersion"
                    label="版本号"
                    rules={[{ required: true, message: '请输入版本号' }]}
                  >
                    <Input placeholder="v1" />
                  </Form.Item>
                  <Form.Item name="modelType" label="类型" initialValue="NLP">
                    <Select
                      options={[
                        { value: 'NLP', label: 'NLP' },
                        { value: 'CV', label: 'CV' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name="modelFile"
                    label="权重 ZIP"
                    valuePropName="fileList"
                    getValueFromEvent={(e) => e?.fileList}
                    rules={[{ required: true, message: '请选择 zip 文件' }]}
                  >
                    <Upload.Dragger
                      maxCount={1}
                      beforeUpload={() => false}
                      accept=".zip"
                    >
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                      </p>
                      <p className="ant-upload-text">
                        点击或拖拽上传模型权重 zip
                      </p>
                    </Upload.Dragger>
                  </Form.Item>
                  {modelUploading && (
                    <Progress
                      percent={modelUploadPercent}
                      style={{ marginBottom: 16 }}
                    />
                  )}
                  <Button
                    type="primary"
                    loading={modelUploading}
                    onClick={async () => {
                      try {
                        const values = await form.validateFields([
                          'modelName',
                          'modelVersion',
                          'modelType',
                          'modelFile',
                        ]);
                        await uploadModelWeightZip({
                          modelName: values.modelName,
                          version: values.modelVersion,
                          type: values.modelType,
                          file: values.modelFile,
                        });
                      } catch (error: any) {
                        if (error?.message) message.error(error.message);
                      }
                    }}
                  >
                    上传并选用
                  </Button>
                </>
              )}
              {selectedModel && (
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="baseModelVersionId">
                    <Typography.Text copyable code>
                      {selectedModel.id}
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="名称">
                    {selectedModel.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="版本">
                    {selectedModel.version}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </>
          )}

          {currentStep === 1 && (
            <>
              <Radio.Group
                value={datasetInputMode}
                onChange={(e) => setDatasetInputMode(e.target.value)}
                style={{ marginBottom: 16 }}
              >
                <Radio.Button value="select">选择已有</Radio.Button>
                <Radio.Button value="upload">上传新包</Radio.Button>
              </Radio.Group>
              {datasetInputMode === 'select' ? (
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
                        return [
                          {
                            value: versionId,
                            label: `${d.name} / ${d.version || 'v?'} / ${d.type} / ${versionId}`,
                          },
                        ];
                      },
                    )}
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    name="datasetName"
                    label="数据集名称"
                    rules={[{ required: true, message: '请输入数据集名称' }]}
                  >
                    <Input placeholder="例如：consistency-fusion-data" />
                  </Form.Item>
                  <Form.Item name="datasetVersion" label="版本号">
                    <Input placeholder="v1" />
                  </Form.Item>
                  <Form.Item
                    name="datasetFile"
                    label="数据 ZIP"
                    valuePropName="fileList"
                    getValueFromEvent={(e) => e?.fileList}
                    rules={[{ required: true, message: '请选择 zip 文件' }]}
                  >
                    <Upload.Dragger
                      maxCount={1}
                      beforeUpload={() => false}
                      accept=".zip"
                    >
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                      </p>
                      <p className="ant-upload-text">
                        点击或拖拽上传数据集 zip
                      </p>
                    </Upload.Dragger>
                  </Form.Item>
                  {datasetUploading && (
                    <Progress
                      percent={datasetUploadPercent}
                      style={{ marginBottom: 16 }}
                    />
                  )}
                  <Button
                    type="primary"
                    loading={datasetUploading}
                    onClick={async () => {
                      try {
                        const values = await form.validateFields([
                          'datasetName',
                          'datasetVersion',
                          'datasetFile',
                        ]);
                        await uploadDatasetZip({
                          datasetName: values.datasetName,
                          version: values.datasetVersion,
                          file: values.datasetFile,
                        });
                      } catch (error: any) {
                        if (error?.message) message.error(error.message);
                      }
                    }}
                  >
                    上传并选用
                  </Button>
                </>
              )}
            </>
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
                extra="仅记录/预留，不能覆盖 Worker 固定训练命令"
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
                <Input.TextArea rows={6} />
              </Form.Item>
              <Form.Item name="remark" label="备注（可选）">
                <Input placeholder="例如：create-page k8s test" />
              </Form.Item>

              <Typography.Title level={5} style={{ marginTop: 8 }}>
                训练代码
              </Typography.Title>
              <Radio.Group
                value={codeInputMode}
                onChange={(e) => setCodeInputMode(e.target.value)}
                style={{ marginBottom: 16 }}
              >
                <Radio.Button value="select">选择已有</Radio.Button>
                <Radio.Button value="upload">上传新包</Radio.Button>
              </Radio.Group>
              {codeInputMode === 'select' ? (
                <Form.Item
                  name="codeVersionId"
                  label="训练代码版本"
                  extra="仅展示已通过准入校验（APPROVED）且 READY 的训练代码版本"
                >
                  <Select
                    placeholder="请选择训练代码版本"
                    showSearch
                    loading={codeLoading}
                    optionFilterProp="label"
                    value={selectedCodeVersionId}
                    onChange={(value: string) => {
                      setSelectedCodeVersionId(value);
                      setSelectedCodeApprovalStatus('APPROVED');
                      form.setFieldValue('codeVersionId', value);
                    }}
                    options={codeOptions.map((item: any) => ({
                      value: item.codeVersionId,
                      label: `${item.codeAssetName} / ${item.version} / ${item.codeVersionId}`,
                    }))}
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    name="codeName"
                    label="代码资产名称"
                    rules={[{ required: true, message: '请输入代码名称' }]}
                  >
                    <Input placeholder="例如：consistency-train-code" />
                  </Form.Item>
                  <Form.Item name="codeVersion" label="版本号">
                    <Input placeholder="v1" />
                  </Form.Item>
                  <Form.Item
                    name="codeFile"
                    label="训练代码 ZIP"
                    valuePropName="fileList"
                    getValueFromEvent={(e) => e?.fileList}
                    rules={[{ required: true, message: '请选择 zip 文件' }]}
                  >
                    <Upload
                      beforeUpload={() => false}
                      maxCount={1}
                      accept=".zip"
                    >
                      <Button icon={<UploadOutlined />}>
                        选择训练代码 zip
                      </Button>
                    </Upload>
                  </Form.Item>
                  <Button
                    type="primary"
                    loading={codeUploading}
                    style={{ marginBottom: 12 }}
                    onClick={async () => {
                      try {
                        const values = await form.validateFields([
                          'codeName',
                          'codeVersion',
                          'codeFile',
                        ]);
                        await uploadTrainingCodeZip({
                          codeName: values.codeName,
                          version: values.codeVersion,
                          file: values.codeFile,
                        });
                      } catch (error: any) {
                        if (error?.message) message.error(error.message);
                      }
                    }}
                  >
                    上传并执行准入校验
                  </Button>
                </>
              )}
              {selectedCode && (
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="codeVersionId">
                    <Typography.Text copyable code>
                      {selectedCode.codeVersionId}
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
              {renderCodeCheckAlert()}
            </>
          )}

          {currentStep === 3 && (
            <>
              {!codeCheck.passed && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="训练代码校验未通过，不能用于训练"
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
                <Descriptions.Item label="baseModelVersionId">
                  <Typography.Text copyable code>
                    {selectedBaseModelVersionId || '-'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="datasetVersionId">
                  <Typography.Text copyable code>
                    {selectedDatasetVersionId || '-'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="codeVersionId">
                  <Typography.Text copyable code>
                    {selectedCodeVersionId || '-'}
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
                <Descriptions.Item label="模型权重目录">
                  /workspace/job/model（下载解压，当前方案不自动加载）
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
