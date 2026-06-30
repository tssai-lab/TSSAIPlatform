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
import type { AnnotationFormat, DatasetType } from '@/services/dataset';
import {
  CONSISTENCY_TRAINING_PROFILE,
  checkCodeVersionForTraining,
  createExperimentVersion,
  createTask,
  fetchApprovedCodeVersions,
  fetchDatasetList,
  fetchModelList,
  fetchTaskDetail,
  uploadCodeZip,
  uploadDataset,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  DATASET_VERSION_DESC_PLACEHOLDER,
  DATASET_VERSION_FORMAT_HINT,
  datasetVersionDescFormRules,
  datasetVersionFormRules,
} from '@/utils/datasetVersion';
import {
  MODEL_VERSION_FORMAT_HINT,
  validateModelVersionFormat,
} from '@/utils/modelVersion';
import { uploadModelZipPackage } from '@/utils/modelZipUpload';
import {
  buildDatasetFileFingerprint,
  LS_DATASET_UPLOAD_FP,
  LS_DATASET_UPLOAD_ID,
  LS_MODEL_UPLOAD_FP,
  LS_MODEL_UPLOAD_ID,
} from '@/utils/uploadResume';

const POINT_CLOUD_ACCEPT = '.ply,.pcd,.zip';

function isPointCloudFileName(fileName: string) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ext === 'ply' || ext === 'pcd' || ext === 'zip';
}

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
  const presetCodeVersionId = searchParams.get('codeVersionId')?.trim() || '';
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
  /** 训练配置与代码二选一：超参数 JSON 或训练代码 */
  const [trainingConfigMode, setTrainingConfigMode] = useState<
    'hyperParams' | 'code'
  >('hyperParams');

  const selectedModel = useMemo(
    () => modelOptions.find((item) => item.id === selectedBaseModelVersionId),
    [modelOptions, selectedBaseModelVersionId],
  );

  /** 数据集类型须与已选基础模型权重一致（后端创建任务会校验） */
  const requiredDatasetType = selectedModel?.type as DatasetType | undefined;

  const filteredDatasetOptions = useMemo(
    () =>
      datasetOptions.filter((d: API.DatasetItem) => {
        if (!d.versionId) return false;
        if (!requiredDatasetType) return d.type !== 'MULTIMODAL';
        return d.type === requiredDatasetType;
      }),
    [datasetOptions, requiredDatasetType],
  );

  useEffect(() => {
    if (!requiredDatasetType || !selectedDatasetVersionId) return;
    const dataset = datasetOptions.find(
      (item) => item.versionId === selectedDatasetVersionId,
    );
    if (dataset && dataset.type !== requiredDatasetType) {
      setSelectedDatasetVersionId(undefined);
      form.setFieldValue('datasetVersionId', undefined);
    }
  }, [datasetOptions, form, requiredDatasetType, selectedDatasetVersionId]);

  const reloadModelOptions = () => {
    setModelLoading(true);
    return fetchModelList({ pageSize: 100 })
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
    fetchDatasetList({ pageSize: 100 })
      .then((res) => {
        const list = (res?.data ?? []).filter(
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
          setTrainingConfigMode('code');
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
          if (!data.codeVersionId) {
            setTrainingConfigMode('hyperParams');
          }
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
    if (!presetCodeVersionId) return;
    setTrainingConfigMode('code');
    setCodeInputMode('select');
    setSelectedCodeVersionId(presetCodeVersionId);
    setSelectedCodeApprovalStatus('APPROVED');
    form.setFieldValue('codeVersionId', presetCodeVersionId);
  }, [form, presetCodeVersionId]);

  useEffect(() => {
    if (trainingConfigMode !== 'code' || !selectedCodeVersionId) {
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
  }, [selectedCodeVersionId, trainingConfigMode]);

  const switchTrainingConfigMode = (mode: 'hyperParams' | 'code') => {
    setTrainingConfigMode(mode);
    if (mode === 'hyperParams') {
      setSelectedCodeVersionId(undefined);
      setSelectedCodeApprovalStatus(undefined);
      form.setFieldValue('codeVersionId', undefined);
      setCodeCheck({ loading: false });
    }
  };

  const selectedCode = useMemo(
    () =>
      codeOptions.find((item) => item.codeVersionId === selectedCodeVersionId),
    [codeOptions, selectedCodeVersionId],
  );

  const uploadModelWeightZip = async (values: {
    modelName: string;
    version: string;
    type: string;
    remark: string;
    file: UploadFile[];
  }) => {
    const file = values.file?.[0]?.originFileObj as File | undefined;
    if (!file) {
      throw new Error('请选择模型权重 zip 文件');
    }

    setModelUploading(true);
    setModelUploadPercent(0);
    const requestOpts = { skipErrorHandler: true } as const;
    try {
      const result = await uploadModelZipPackage({
        file,
        modelName: values.modelName,
        version: values.version,
        type: values.type,
        remark: values.remark,
        onProgress: setModelUploadPercent,
        onUploadSession: ({ uploadId, fileFingerprint }) => {
          localStorage.setItem(LS_MODEL_UPLOAD_ID, uploadId);
          localStorage.setItem(LS_MODEL_UPLOAD_FP, fileFingerprint);
        },
        requestOpts,
      });
      localStorage.removeItem(LS_MODEL_UPLOAD_ID);
      localStorage.removeItem(LS_MODEL_UPLOAD_FP);
      setSelectedBaseModelVersionId(result.modelVersionId);
      form.setFieldValue('baseModelVersionId', result.modelVersionId);
      await reloadModelOptions();
      message.success(`基础模型权重上传成功：${result.modelVersionId}`);
      setModelInputMode('select');
    } finally {
      setModelUploading(false);
      setModelUploadPercent(0);
    }
  };

  const uploadDatasetZip = async (values: {
    datasetName: string;
    version: string;
    remark: string;
    file: UploadFile[];
    annotationFormat?: AnnotationFormat;
  }) => {
    const datasetType = requiredDatasetType;
    if (!datasetType) {
      throw new Error('请先在第一步选择或上传基础模型权重，以确定数据集类型');
    }
    const fileList = values.file ?? [];
    const files = fileList
      .map((item) => item.originFileObj)
      .filter(Boolean) as File[];
    if (!files.length) {
      throw new Error('请选择要上传的文件');
    }

    const maxBytes = UPLOAD_CONFIG.DATASET.MAX_SIZE;
    for (const file of files) {
      if (file.size > maxBytes) {
        throw new Error(`单个文件不能超过 ${maxBytes / 1024 / 1024 / 1024}GB`);
      }
    }

    if (datasetType === 'POINT_CLOUD') {
      if (files.length !== 1) {
        throw new Error('点云数据集仅支持上传单个 .ply、.pcd 或 .zip 文件');
      }
      if (!isPointCloudFileName(files[0].name)) {
        throw new Error('点云数据集仅支持 .ply、.pcd 或 .zip 格式');
      }
    } else if (datasetType === 'NLP') {
      if (files.length !== 1) {
        throw new Error('NLP 数据集请将多个文件打包为 zip 后作为单个文件上传');
      }
      if (!files[0].name.toLowerCase().endsWith('.zip')) {
        throw new Error('NLP 数据集请将多个文件打包为 zip 后作为单个文件上传');
      }
    }

    setDatasetUploading(true);
    setDatasetUploadPercent(0);
    const requestOpts = { skipErrorHandler: true } as const;
    const name = values.datasetName.trim();
    const version = (values.version || 'v1.0.0').trim();
    const remark = values.remark.trim();
    const annotationFormat = values.annotationFormat;

    try {
      let res: Awaited<ReturnType<typeof uploadDataset>> | undefined;
      if (files.length === 1) {
        const file = files[0];
        const fileFingerprint = buildDatasetFileFingerprint(
          file,
          name,
          version,
          datasetType,
        );
        res = await uploadDataset(
          {
            name,
            version,
            type: datasetType,
            remark,
            files: [file],
            annotationFormat:
              datasetType === 'CV' ? annotationFormat : undefined,
            fileFingerprint,
            onProgress: setDatasetUploadPercent,
            onUploadSession: ({ uploadId, fileFingerprint: fp }) => {
              localStorage.setItem(LS_DATASET_UPLOAD_ID, uploadId);
              localStorage.setItem(LS_DATASET_UPLOAD_FP, fp);
            },
          },
          requestOpts,
        );
      } else {
        if (datasetType !== 'CV') {
          throw new Error('当前类型仅支持单个文件上传');
        }
        res = await uploadDataset(
          {
            name,
            files,
            type: 'CV',
            version,
            annotationFormat,
            remark,
          },
          requestOpts,
        );
        setDatasetUploadPercent(100);
      }

      localStorage.removeItem(LS_DATASET_UPLOAD_ID);
      localStorage.removeItem(LS_DATASET_UPLOAD_FP);
      const versionId = resolveDatasetVersionId(res?.data);
      if (!versionId) {
        throw new Error('数据集上传成功但未返回 datasetVersionId');
      }
      setSelectedDatasetVersionId(versionId);
      form.setFieldValue('datasetVersionId', versionId);
      const listRes = await fetchDatasetList({ pageSize: 100 });
      const list = (listRes?.data ?? []).filter(
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
    remark?: string;
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
          trainingProfile: CONSISTENCY_TRAINING_PROFILE,
          remark: values.remark?.trim() || 'task/create 页面上传',
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

  const validateConfigSection = async () => {
    await form.validateFields(['trainingProfile', 'hyperParams']);
  };

  const validateCodeSection = async () => {
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
  };

  const validateStep2 = async () => {
    await form.validateFields(['trainingProfile']);
    if (trainingConfigMode === 'hyperParams') {
      await validateConfigSection();
      return;
    }
    await validateCodeSection();
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
      if (!requiredDatasetType) {
        message.error('请先在第一步选择或上传基础模型权重');
        throw new Error('missing model type');
      }
      if (!selectedDatasetVersionId) {
        message.error('请选择或上传训练数据集');
        throw new Error('missing dataset');
      }
      const dataset = datasetOptions.find(
        (item) => item.versionId === selectedDatasetVersionId,
      );
      if (dataset && dataset.type !== requiredDatasetType) {
        message.error(
          `数据集类型（${dataset.type}）须与基础模型类型（${requiredDatasetType}）一致`,
        );
        throw new Error('type mismatch');
      }
      return;
    }
    if (step === 2) {
      await validateStep2();
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

  const handlePrev = () => {
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  const handleSubmit = async () => {
    if (trainingConfigMode === 'code' && !codeCheck.passed) {
      Modal.error({
        title: '训练代码校验未通过',
        content: (codeCheck.reasons || ['未知原因']).join('；'),
      });
      setCurrentStep(2);
      return;
    }
    if (!selectedBaseModelVersionId || !selectedDatasetVersionId) {
      message.error('请完成基础模型权重与数据集选择');
      return;
    }
    if (trainingConfigMode === 'code' && !selectedCodeVersionId) {
      message.error('请选择或上传训练代码');
      setCurrentStep(2);
      return;
    }
    const values = form.getFieldsValue(true);
    let hyperParams: Record<string, unknown> = {};
    if (trainingConfigMode === 'hyperParams') {
      try {
        hyperParams = JSON.parse(values.hyperParams || '{}');
      } catch {
        message.error('hyperParams JSON 格式不正确');
        setCurrentStep(2);
        return;
      }
    }

    try {
      let data: API.TrainingExperimentVersion | undefined;
      const payload = {
        name: values.name,
        baseModelVersionId: selectedBaseModelVersionId,
        datasetVersionId: selectedDatasetVersionId,
        remark: values.remark,
        ...(trainingConfigMode === 'code'
          ? {
              codeVersionId: selectedCodeVersionId,
              hyperParams: {} as Record<string, unknown>,
            }
          : { hyperParams }),
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
        const taskPayload =
          trainingConfigMode === 'code' && selectedCodeVersionId
            ? {
                name: values.name,
                baseModelVersionId: selectedBaseModelVersionId,
                datasetVersionId: selectedDatasetVersionId,
                codeVersionId: selectedCodeVersionId,
                hyperParams: {} as Record<string, unknown>,
                remark: values.remark,
                trainingProfile: CONSISTENCY_TRAINING_PROFILE,
              }
            : {
                name: values.name,
                baseModelVersionId: selectedBaseModelVersionId,
                datasetVersionId: selectedDatasetVersionId,
                hyperParams,
                remark: values.remark,
                trainingProfile: CONSISTENCY_TRAINING_PROFILE,
              };
        const res: any = await createTask(taskPayload, {
          skipErrorHandler: true,
        });
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
          modelVersion: 'v1.0.0',
          datasetVersion: 'v1.0.0',
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
                    extra={MODEL_VERSION_FORMAT_HINT}
                    rules={[
                      { required: true, message: '请输入版本号' },
                      {
                        validator: (_: unknown, value: string) => {
                          const err = validateModelVersionFormat(value);
                          return err
                            ? Promise.reject(new Error(err))
                            : Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <Input placeholder="例如：v1.0.0 或 v1" />
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
                    name="modelRemark"
                    label="备注"
                    rules={[
                      { required: true, message: '请输入备注' },
                      { max: 200, message: '备注不能超过 200 个字符' },
                    ]}
                  >
                    <Input.TextArea
                      rows={3}
                      placeholder="例如：fusion 基线权重"
                      maxLength={200}
                      showCount
                    />
                  </Form.Item>
                  <Form.Item
                    name="modelFile"
                    label="权重 ZIP"
                    valuePropName="fileList"
                    getValueFromEvent={(e) => e?.fileList}
                    rules={[{ required: true, message: '请选择 zip 文件' }]}
                    extra={`与「上传模型」相同：仅支持 .zip，最大 ${UPLOAD_CONFIG.MODEL.MAX_SIZE / 1024 / 1024 / 1024}GB`}
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
                          'modelRemark',
                          'modelFile',
                        ]);
                        await uploadModelWeightZip({
                          modelName: values.modelName,
                          version: values.modelVersion,
                          type: values.modelType,
                          remark: values.modelRemark,
                          file: values.modelFile,
                        });
                      } catch (error: any) {
                        message.error(getApiErrorMessage(error));
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
              {!requiredDatasetType ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="请先选择基础模型权重"
                  description="训练数据集类型须与基础模型权重一致（如 CV 模型对应 CV 数据集）。请返回上一步完成选择后再继续。"
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={`当前须选择 ${requiredDatasetType} 类型数据集`}
                  description={`已选模型：${selectedModel?.name ?? '-'}（${requiredDatasetType}）。后端创建训练任务时要求模型与数据集类型一致。`}
                />
              )}
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
                  extra={
                    requiredDatasetType
                      ? `仅展示 ${requiredDatasetType} 类型数据集，须与已选基础模型权重类型一致`
                      : '请先在第一步选择基础模型权重'
                  }
                >
                  <Select
                    placeholder={
                      requiredDatasetType
                        ? `请选择 ${requiredDatasetType} 数据集版本`
                        : '请先选择基础模型权重'
                    }
                    showSearch
                    loading={datasetLoading}
                    optionFilterProp="label"
                    disabled={!requiredDatasetType}
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
                  <Form.Item
                    name="datasetVersion"
                    label="版本号"
                    rules={datasetVersionFormRules([])}
                    extra={DATASET_VERSION_FORMAT_HINT}
                  >
                    <Input placeholder="例如 v1.0.0" />
                  </Form.Item>
                  <Form.Item
                    name="datasetRemark"
                    label="版本描述"
                    rules={datasetVersionDescFormRules()}
                    extra="记录本版本的更新原因与内容，便于长期维护与训练选型"
                  >
                    <Input.TextArea
                      rows={4}
                      placeholder={DATASET_VERSION_DESC_PLACEHOLDER}
                      showCount
                      maxLength={2000}
                    />
                  </Form.Item>
                  {requiredDatasetType === 'CV' && (
                    <Form.Item
                      name="datasetAnnotationFormat"
                      label="标注格式"
                      extra="YOLO/COCO 等带标注 zip 请选择对应格式；仅图片可选 NONE"
                    >
                      <Select allowClear placeholder="请选择标注格式">
                        <Select.Option value="NONE">
                          NONE（仅图片）
                        </Select.Option>
                        <Select.Option value="FOLDER_CLASSIFICATION">
                          FOLDER_CLASSIFICATION
                        </Select.Option>
                        <Select.Option value="YOLO">YOLO</Select.Option>
                        <Select.Option value="COCO">COCO</Select.Option>
                        <Select.Option value="VOC">VOC</Select.Option>
                        <Select.Option value="CSV">CSV</Select.Option>
                        <Select.Option value="MASK">MASK</Select.Option>
                        <Select.Option value="LABELME">LABELME</Select.Option>
                        <Select.Option value="OTHER">OTHER</Select.Option>
                      </Select>
                    </Form.Item>
                  )}
                  <Form.Item
                    name="datasetFile"
                    label="文件"
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
                            return Promise.reject(new Error('请上传文件'));
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                  >
                    <Upload
                      multiple={requiredDatasetType === 'CV'}
                      accept={
                        requiredDatasetType === 'POINT_CLOUD'
                          ? POINT_CLOUD_ACCEPT
                          : undefined
                      }
                      beforeUpload={() => false}
                      disabled={!requiredDatasetType || datasetUploading}
                      onChange={(e) => {
                        let fileList = e.fileList ?? [];
                        if (
                          (requiredDatasetType === 'POINT_CLOUD' ||
                            requiredDatasetType === 'NLP') &&
                          fileList.length > 1
                        ) {
                          fileList = fileList.slice(-1);
                          message.info(
                            '当前类型仅支持单个文件，已保留最新选择',
                          );
                        }
                        form.setFieldValue('datasetFile', fileList);
                      }}
                    >
                      <Button
                        icon={<UploadOutlined />}
                        disabled={!requiredDatasetType || datasetUploading}
                      >
                        {requiredDatasetType === 'POINT_CLOUD'
                          ? '选择点云文件（.ply / .pcd / .zip）'
                          : requiredDatasetType === 'NLP'
                            ? '选择 NLP zip（单文件分片上传）'
                            : '选择文件（单文件 zip 支持断点续传；CV 可多选图片目录）'}
                      </Button>
                    </Upload>
                    <div style={{ marginTop: 8, color: '#999' }}>
                      单文件最大{' '}
                      {UPLOAD_CONFIG.DATASET.MAX_SIZE / 1024 / 1024 / 1024}
                      GB。
                      {requiredDatasetType === 'POINT_CLOUD'
                        ? ' 点云仅支持单个 .ply、.pcd 或 .zip；zip 内需至少包含一个 .ply 或 .pcd。'
                        : requiredDatasetType === 'NLP'
                          ? ' NLP 请将多个文件打包为 zip 后作为单个文件上传。'
                          : requiredDatasetType === 'CV'
                            ? ' CV 带 YOLO/COCO 等标注的 zip 请选择对应标注格式；多文件将走文件夹打包；大 zip 请单文件分片上传。'
                            : ' 请先在第一步选择基础模型权重。'}
                    </div>
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
                    disabled={!requiredDatasetType}
                    onClick={async () => {
                      try {
                        const fieldNames = [
                          'datasetName',
                          'datasetVersion',
                          'datasetRemark',
                          'datasetFile',
                        ];
                        if (requiredDatasetType === 'CV') {
                          fieldNames.push('datasetAnnotationFormat');
                        }
                        const values = await form.validateFields(fieldNames);
                        await uploadDatasetZip({
                          datasetName: values.datasetName,
                          version: values.datasetVersion,
                          remark: values.datasetRemark,
                          file: values.datasetFile,
                          annotationFormat: values.datasetAnnotationFormat,
                        });
                      } catch (error: any) {
                        message.error(getApiErrorMessage(error));
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
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="训练配置与代码（二选一）"
                description="请填写 hyperParams（JSON）或选择/上传训练代码，二者不可同时提交。"
              />
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
              <Form.Item name="remark" label="备注（可选）">
                <Input placeholder="例如：create-page k8s test" />
              </Form.Item>

              <Radio.Group
                value={trainingConfigMode}
                onChange={(e) => switchTrainingConfigMode(e.target.value)}
                style={{ marginBottom: 16 }}
              >
                <Radio.Button value="hyperParams">超参数配置</Radio.Button>
                <Radio.Button value="code">训练代码</Radio.Button>
              </Radio.Group>

              {trainingConfigMode === 'hyperParams' ? (
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
                  <Input.TextArea rows={8} />
                </Form.Item>
              ) : (
                <>
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                    message="训练代码文件"
                    description="选择已通过准入校验（APPROVED）的训练代码版本，或上传新的训练代码 zip。上传后将自动执行准入校验。"
                  />
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
                          label: `${item.codeAssetName} / ${item.codeVersionId}`,
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
                      <Form.Item name="codeRemark" label="备注（可选）">
                        <Input.TextArea
                          rows={2}
                          placeholder="例如：fusion 基线训练代码"
                          maxLength={200}
                          showCount
                        />
                      </Form.Item>
                      <Form.Item
                        name="codeFile"
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
                                !list.some(
                                  (item: UploadFile) => item.originFileObj,
                                )
                              ) {
                                return Promise.reject(
                                  new Error('请选择训练代码 zip 文件'),
                                );
                              }
                              return Promise.resolve();
                            },
                          },
                        ]}
                        extra="仅支持 .zip，须包含固定训练入口脚本"
                      >
                        <Upload
                          beforeUpload={() => false}
                          maxCount={1}
                          accept=".zip"
                          disabled={codeUploading}
                        >
                          <Button
                            icon={<UploadOutlined />}
                            disabled={codeUploading}
                          >
                            选择训练代码 zip
                          </Button>
                        </Upload>
                      </Form.Item>
                      <Button
                        type="primary"
                        loading={codeUploading}
                        onClick={async () => {
                          try {
                            const values = await form.validateFields([
                              'codeName',
                              'codeFile',
                            ]);
                            await uploadTrainingCodeZip({
                              codeName: values.codeName,
                              remark: values.codeRemark,
                              file: values.codeFile,
                            });
                          } catch (error: any) {
                            message.error(getApiErrorMessage(error));
                          }
                        }}
                      >
                        上传并选用
                      </Button>
                    </>
                  )}
                  {selectedCode && (
                    <Descriptions
                      size="small"
                      column={1}
                      bordered
                      style={{ marginTop: 16 }}
                    >
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
            </>
          )}

          {currentStep === 3 && (
            <>
              {trainingConfigMode === 'code' && !codeCheck.passed && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="训练代码校验未通过，不能用于训练"
                  description={(codeCheck.reasons || []).join('；')}
                />
              )}
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="配置方式">
                  {trainingConfigMode === 'hyperParams'
                    ? '超参数配置'
                    : '训练代码'}
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
                {trainingConfigMode === 'code' ? (
                  <Descriptions.Item label="codeVersionId">
                    <Typography.Text copyable code>
                      {selectedCodeVersionId || '-'}
                    </Typography.Text>
                  </Descriptions.Item>
                ) : (
                  <Descriptions.Item label="hyperParams">
                    <code>{form.getFieldValue('hyperParams') || '{}'}</code>
                  </Descriptions.Item>
                )}
                <Descriptions.Item label="执行方式">
                  Kubernetes Job
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
              disabled={trainingConfigMode === 'code' && !codeCheck.passed}
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
