/**
 * 发起训练页（集成自 TSSAIPlatform-frontend-prototype）
 * 步骤：1 选择/上传模型 → 2 选择/上传数据集 → 3 配置参数（表单 或 上传训练代码）
 */
import { PageContainer } from '@ant-design/pro-components';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  InputNumber,
  message,
  Select,
  Space,
  Steps,
  Tabs,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd';
import React, { useEffect, useState } from 'react';
import { history, useSearchParams } from '@umijs/max';
import JsonEditor from '@/components/JsonEditor';
import { MOCK_DATASETS, MOCK_MODELS } from '@/constants/mockData';
import { API_CONFIG, MODEL_TYPES, UPLOAD_CONFIG } from '@/constants/platform';
import { fetchDatasetList, fetchModelList } from '@/services/platform';
import { request } from '@umijs/max';

const { Step } = Steps;
const { TextArea } = Input;

type ParamsMode = 'form' | 'upload';

const TaskCreate: React.FC = () => {
  const [searchParams] = useSearchParams();
  const modelIdFromQuery = searchParams.get('modelId');

  const [currentStep, setCurrentStep] = useState(0);
  const [modelList, setModelList] = useState<API.ModelItem[]>([]);
  const [datasetList, setDatasetList] = useState<API.DatasetItem[]>([]);
  const [selectedModel, setSelectedModel] = useState<{ id: string; name: string; type?: 'CV' | 'NLP' } | null>(null);
  const [selectedDataset, setSelectedDataset] = useState<{ id: string; name: string } | null>(null);
  const [paramsMode, setParamsMode] = useState<ParamsMode>('form');
  const [trainingCodeFile, setTrainingCodeFile] = useState<UploadFile | null>(null);
  const [advancedParams, setAdvancedParams] = useState(
    '{\n  "weight_decay": 0.0005,\n  "momentum": 0.937,\n  "warmup_epochs": 3\n}',
  );
  const [advancedParamsValid, setAdvancedParamsValid] = useState(true);
  const [taskName, setTaskName] = useState('');

  const [form] = Form.useForm();
  const [uploadModelForm] = Form.useForm();
  const [uploadDatasetForm] = Form.useForm();

  const steps = [
    { title: '选择/上传模型' },
    { title: '选择/上传数据集' },
    { title: '配置参数' },
  ];

  useEffect(() => {
    fetchModelList({ pageSize: 100 })
      .then((res) => {
        if (res?.data?.length) setModelList(res.data);
        else setModelList(MOCK_MODELS);
      })
      .catch(() => setModelList(MOCK_MODELS));
  }, []);

  useEffect(() => {
    if (!modelIdFromQuery || !modelList.length) return;
    const model = modelList.find((m) => m.id === modelIdFromQuery);
    if (model) {
      setSelectedModel({
        id: model.id,
        name: `${model.name} (${model.version})`,
        type: model.type,
      });
    }
  }, [modelIdFromQuery, modelList]);

  useEffect(() => {
    fetchDatasetList({ pageSize: 100 })
      .then((res) => {
        if (res?.data?.length) setDatasetList(res.data);
        else setDatasetList(MOCK_DATASETS);
      })
      .catch(() => setDatasetList(MOCK_DATASETS));
  }, []);

  const handleUploadModel = async () => {
    try {
      const values = await uploadModelForm.validateFields();
      const file = values.file?.[0]?.originFileObj;
      if (!file) {
        message.warning('请选择模型文件');
        return;
      }
      const formData = new FormData();
      formData.append('file', file);
      formData.append('name', values.modelName);
      formData.append('version', values.version);
      formData.append('type', values.type);
      formData.append('remark', values.remark);

      await request(API_CONFIG.ENDPOINTS.MODEL_UPLOAD, {
        method: 'POST',
        data: formData,
        requestType: 'form',
      });
      message.success('模型上传成功');
      setSelectedModel({ id: 'new', name: `${values.modelName} (${values.version})`, type: values.type });
      fetchModelList({ pageSize: 100 }).then((res) => res?.data && setModelList(res.data));
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '上传失败');
    }
  };

  const handleUploadDataset = async () => {
    try {
      const values = await uploadDatasetForm.validateFields();
      const fileList = values.files?.map((f: any) => f.originFileObj).filter(Boolean) || [];
      if (!fileList.length) {
        message.warning('请选择数据集文件');
        return;
      }
      const formData = new FormData();
      fileList.forEach((f: File) => formData.append('files', f));
      formData.append('name', values.datasetName);

      await request(API_CONFIG.ENDPOINTS.DATASET_UPLOAD, {
        method: 'POST',
        data: formData,
        requestType: 'form',
      });
      message.success('数据集上传成功');
      setSelectedDataset({ id: 'new', name: values.datasetName });
      fetchDatasetList({ pageSize: 100 }).then((res) => res?.data && setDatasetList(res.data));
    } catch (e: any) {
      if (e?.errorFields) return;
      message.error(e?.message || '上传失败');
    }
  };

  const modelType = selectedModel?.type ?? 'CV';

  const canGoNext = () => {
    if (currentStep === 0) return !!selectedModel;
    if (currentStep === 1) return !!selectedDataset;
    if (currentStep === 2) {
      if (!taskName?.trim()) return false;
      if (paramsMode === 'form') {
        if (modelType === 'CV') {
          const epochs = form.getFieldValue('epochs');
          const batch = form.getFieldValue('batch');
          const imgsz = form.getFieldValue('imgsz');
          const lr0 = form.getFieldValue('lr0');
          const optimizer = form.getFieldValue('optimizer');
          if (epochs == null || batch == null || imgsz == null || lr0 == null || !optimizer) return false;
        } else {
          const num_epochs = form.getFieldValue('num_epochs');
          const batch_size = form.getFieldValue('batch_size');
          const learning_rate = form.getFieldValue('learning_rate');
          const max_seq_length = form.getFieldValue('max_seq_length');
          const lora_r = form.getFieldValue('lora_r');
          const lora_dropout = form.getFieldValue('lora_dropout');
          if (num_epochs == null || batch_size == null || learning_rate == null || max_seq_length == null || lora_r == null || lora_dropout == null) return false;
        }
        if (advancedParams.trim() && !advancedParamsValid) return false;
        return true;
      }
      return !!trainingCodeFile?.originFileObj;
    }
    return false;
  };

  const handleNext = () => {
    if (currentStep === 2) {
      handleSubmit();
      return;
    }
    if (!canGoNext()) {
      if (currentStep === 0) message.warning('请选择或上传模型');
      else if (currentStep === 1) message.warning('请选择或上传数据集');
      else if (!taskName?.trim()) message.warning('请填写任务名称');
      else if (paramsMode === 'form') message.warning('请填写完整训练参数');
      else message.warning('请上传训练代码文件');
      return;
    }
    setCurrentStep(currentStep + 1);
  };

  const handleSubmit = async () => {
    if (!selectedModel || !selectedDataset) {
      message.warning('请完成步骤 1 和 2');
      return;
    }
    try {
      if (paramsMode === 'form') {
        const values = await form.validateFields();
        let params: Record<string, unknown>;
        if (modelType === 'CV') {
          params = {
            epochs: values.epochs,
            batch: values.batch,
            imgsz: values.imgsz,
            lr0: values.lr0,
            optimizer: values.optimizer,
          };
        } else {
          params = {
            num_epochs: values.num_epochs,
            batch_size: values.batch_size,
            learning_rate: values.learning_rate,
            max_seq_length: values.max_seq_length,
            lora_r: values.lora_r,
            lora_dropout: values.lora_dropout,
          };
        }
        if (advancedParams.trim()) {
          try {
            Object.assign(params, JSON.parse(advancedParams));
          } catch {
            message.error('高级参数 JSON 格式错误');
            return;
          }
        }
        await request(API_CONFIG.ENDPOINTS.TASK_CREATE, {
          method: 'POST',
          data: { name: taskName.trim(), modelId: selectedModel.id, datasetId: selectedDataset.id, params },
        });
        message.success('训练任务创建成功，参数将在训练过程中应用');
      } else {
        const file = trainingCodeFile?.originFileObj;
        if (!file) {
          message.warning('请上传训练代码文件');
          return;
        }
        const formData = new FormData();
        formData.append('name', taskName.trim());
        formData.append('modelId', selectedModel.id);
        formData.append('datasetId', selectedDataset.id);
        formData.append('paramsMode', 'upload');
        formData.append('trainingCode', file);
        await request(API_CONFIG.ENDPOINTS.TASK_CREATE, {
          method: 'POST',
          data: formData,
          requestType: 'form',
        });
        message.success('训练任务创建成功，将使用您上传的训练代码进行训练');
      }
      history.push('/task/list');
    } catch (e: any) {
      message.error(e?.message || '创建失败，请重试');
    }
  };

  const step1Content = (
    <Card>
      <Tabs
        items={[
          {
            key: 'select',
            label: '选择已有模型',
            children: (
              <div>
                <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 6 }}>
                  {modelList.map((m) => (
                    <div
                      key={m.id}
                      onClick={() => setSelectedModel({ id: m.id, name: `${m.name} (${m.version})`, type: m.type })}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        background: selectedModel?.id === m.id ? '#e6f7ff' : undefined,
                        borderLeft: selectedModel?.id === m.id ? '3px solid #1890ff' : '3px solid transparent',
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                        版本: {m.version} | 类型: {m.type} | 大小: {m.size}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedModel && (
                  <Alert
                    type="success"
                    message={`已选模型：${selectedModel.name}`}
                    style={{ marginTop: 16 }}
                    showIcon
                  />
                )}
              </div>
            ),
          },
          {
            key: 'upload',
            label: '上传新模型',
            children: (
              <div>
                <Form form={uploadModelForm} layout="vertical">
                  <Form.Item name="modelName" label="模型名称" rules={[{ required: true }]}>
                    <Input placeholder="模型名称" />
                  </Form.Item>
                  <Form.Item name="version" label="版本号" rules={[{ required: true }]}>
                    <Input placeholder="例如：1.0.0" />
                  </Form.Item>
                  <Form.Item name="type" label="模型类型" rules={[{ required: true }]}>
                    <Select placeholder="选择类型" options={Object.values(MODEL_TYPES).map((t) => ({ label: t.label, value: t.value }))} />
                  </Form.Item>
                  <Form.Item name="remark" label="备注（必填）" rules={[{ required: true }]}>
                    <TextArea rows={3} placeholder="备注信息" />
                  </Form.Item>
                  <Form.Item name="file" label="模型文件" rules={[{ required: true, message: '请选择文件' }]}>
                    <Upload maxCount={1} accept={UPLOAD_CONFIG.MODEL.ACCEPT_TYPES.join(',')} beforeUpload={() => false}>
                      <Button>选择文件（.pt / .pth / .onnx 等；千问等大模型请上传 .zip，最大 2GB）</Button>
                    </Upload>
                  </Form.Item>
                  <Button type="primary" onClick={handleUploadModel}>
                    快速上传
                  </Button>
                </Form>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );

  const step2Content = (
    <Card>
      <Tabs
        items={[
          {
            key: 'select',
            label: '选择已有数据集',
            children: (
              <div>
                {selectedModel?.type && (
                  <div style={{ marginBottom: 12, color: '#8c8c8c', fontSize: 12 }}>
                    已根据所选模型类型（{selectedModel.type}）筛选，仅显示 {selectedModel.type} 类型数据集
                  </div>
                )}
                <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid #d9d9d9', borderRadius: 6 }}>
                  {(selectedModel?.type ? datasetList.filter((d) => d.type === selectedModel.type) : datasetList).map((d) => (
                    <div
                      key={d.id}
                      onClick={() => setSelectedDataset({ id: d.id, name: d.name })}
                      style={{
                        padding: '12px 16px',
                        borderBottom: '1px solid #f0f0f0',
                        cursor: 'pointer',
                        background: selectedDataset?.id === d.id ? '#e6f7ff' : undefined,
                        borderLeft: selectedDataset?.id === d.id ? '3px solid #1890ff' : '3px solid transparent',
                      }}
                    >
                      <div style={{ fontWeight: 500 }}>{d.name}</div>
                      <div style={{ fontSize: 12, color: '#8c8c8c' }}>
                        类型: {d.type} | 大小: {d.size} | 文件数: {d.fileCount}
                      </div>
                    </div>
                  ))}
                </div>
                {selectedDataset && (
                  <Alert
                    type="success"
                    message={`已选数据集：${selectedDataset.name}`}
                    style={{ marginTop: 16 }}
                    showIcon
                  />
                )}
              </div>
            ),
          },
          {
            key: 'upload',
            label: '上传新数据集',
            children: (
              <div>
                <Form form={uploadDatasetForm} layout="vertical">
                  <Form.Item name="datasetName" label="数据集名称" rules={[{ required: true }]}>
                    <Input placeholder="数据集名称" />
                  </Form.Item>
                  <Form.Item name="files" label="文件" rules={[{ required: true, message: '请选择文件' }]}>
                    <Upload multiple beforeUpload={() => false}>
                      <Button>选择文件或文件夹（最大 50GB）</Button>
                    </Upload>
                  </Form.Item>
                  <Button type="primary" onClick={handleUploadDataset}>
                    快速上传
                  </Button>
                </Form>
              </div>
            ),
          },
        ]}
      />
    </Card>
  );

  const cvFormInitialValues = {
    epochs: 100,
    batch: 16,
    imgsz: 640,
    lr0: 0.01,
    optimizer: 'SGD',
  };
  const nlpFormInitialValues = {
    num_epochs: 3,
    batch_size: 8,
    learning_rate: 2e-4,
    max_seq_length: 512,
    lora_r: 16,
    lora_dropout: 0.1,
  };

  const step3Content = (
    <Card>
      {selectedModel?.type && (
        <Alert
          type="info"
          message={`当前模型类型：${selectedModel.type}，将显示${selectedModel.type}对应的训练参数`}
          style={{ marginBottom: 16 }}
          showIcon
        />
      )}
      <Tabs
        activeKey={paramsMode}
        onChange={(k) => setParamsMode(k as ParamsMode)}
        items={[
          {
            key: 'form',
            label: '表单填写',
            children: (
              <div>
                <Form
                  key={`params-form-${modelType}`}
                  form={form}
                  layout="vertical"
                  initialValues={modelType === 'NLP' ? nlpFormInitialValues : cvFormInitialValues}
                >
                  <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                    {modelType === 'CV' ? (
                      <>
                        <Form.Item
                          name="epochs"
                          label="训练轮数 (epochs)"
                          rules={[{ required: true }, { type: 'number', min: 100, max: 300, message: '建议 100-300 轮' }]}
                        >
                          <InputNumber min={100} max={300} style={{ width: '100%' }} placeholder="100-300" />
                        </Form.Item>
                        <Form.Item name="batch" label="批次大小 (batch)" rules={[{ required: true }]}>
                          <InputNumber min={1} style={{ width: '100%' }} placeholder="根据显存调整，如 16" />
                        </Form.Item>
                        <Form.Item name="imgsz" label="图像尺寸 (imgsz)" rules={[{ required: true }]}>
                          <InputNumber min={64} style={{ width: '100%' }} placeholder="常用 640" />
                        </Form.Item>
                        <Form.Item name="lr0" label="初始学习率 (lr0)" rules={[{ required: true }]}>
                          <InputNumber min={0} step={0.001} style={{ width: '100%' }} placeholder="如 0.01" />
                        </Form.Item>
                        <Form.Item name="optimizer" label="优化器 (optimizer)" rules={[{ required: true }]}>
                          <Select
                            options={[
                              { value: 'SGD', label: 'SGD' },
                              { value: 'Adam', label: 'Adam' },
                              { value: 'AdamW', label: 'AdamW' },
                              { value: 'RMSprop', label: 'RMSprop' },
                            ]}
                          />
                        </Form.Item>
                      </>
                    ) : (
                      <>
                        <div style={{ fontWeight: 500, marginBottom: 8 }}>训练基础配置（必须）</div>
                        <Form.Item
                          name="num_epochs"
                          label="训练轮数 (num_epochs)"
                          rules={[{ required: true }, { type: 'number', min: 1, max: 20, message: '范围 1-20' }]}
                        >
                          <InputNumber min={1} max={20} style={{ width: '100%' }} placeholder="默认 3" />
                        </Form.Item>
                        <Form.Item name="batch_size" label="批次大小 (batch_size)" rules={[{ required: true }]}>
                          <Select
                            options={[
                              { value: 1, label: '1' },
                              { value: 2, label: '2' },
                              { value: 4, label: '4' },
                              { value: 8, label: '8（根据 GPU 显存推荐）' },
                            ]}
                          />
                        </Form.Item>
                        <Form.Item
                          name="learning_rate"
                          label="学习率 (learning_rate)"
                          rules={[
                            { required: true },
                            { type: 'number', min: 1e-5, max: 5e-4, message: '范围 1e-5 ～ 5e-4' },
                          ]}
                        >
                          <InputNumber
                            min={0.00001}
                            max={0.0005}
                            step={1e-5}
                            style={{ width: '100%' }}
                            placeholder="默认 2e-4"
                          />
                        </Form.Item>
                        <Form.Item
                          name="max_seq_length"
                          label="序列最大长度 (max_seq_length)"
                          rules={[{ required: true }]}
                        >
                          <Select
                            options={[
                              { value: 512, label: '512' },
                              { value: 1024, label: '1024' },
                              { value: 2048, label: '2048' },
                              { value: 4096, label: '4096' },
                            ]}
                          />
                        </Form.Item>
                        <div style={{ fontWeight: 500, marginBottom: 8 }}>LoRA 配置（必须）</div>
                        <Form.Item
                          name="lora_r"
                          label="LoRA 秩 (lora_r)"
                          rules={[{ required: true }, { type: 'number', min: 4, max: 128, message: '范围 4-128' }]}
                        >
                          <InputNumber min={4} max={128} style={{ width: '100%' }} placeholder="默认 16" />
                        </Form.Item>
                        <Form.Item
                          name="lora_dropout"
                          label="LoRA Dropout (lora_dropout)"
                          rules={[{ required: true }, { type: 'number', min: 0, max: 0.3, message: '范围 0-0.3' }]}
                        >
                          <InputNumber min={0} max={0.3} step={0.01} style={{ width: '100%' }} placeholder="默认 0.1" />
                        </Form.Item>
                      </>
                    )}
                  </Space>
                </Form>
                <div style={{ marginTop: 16 }}>
                  <div style={{ marginBottom: 8 }}>高级参数（JSON，可选）</div>
                  <JsonEditor
                    key={`advanced-${paramsMode}-${modelType}`}
                    defaultValue={(() => {
                      try {
                        return advancedParams.trim() ? JSON.parse(advancedParams) : {};
                      } catch {
                        return {};
                      }
                    })()}
                    onChange={(v) => setAdvancedParams(v || '')}
                    onValidate={(valid) => setAdvancedParamsValid(valid)}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'upload',
            label: '上传训练代码',
            children: (
              <div>
                <Upload
                  maxCount={1}
                  accept={UPLOAD_CONFIG.TRAINING_CODE.ACCEPT_TYPES.join(',')}
                  beforeUpload={() => false}
                  fileList={trainingCodeFile ? [trainingCodeFile] : []}
                  onChange={({ fileList }) => setTrainingCodeFile(fileList[0] || null)}
                >
                  <Button>选择训练代码文件（.py / .pyx / .ipynb / .txt，最大 50MB）</Button>
                </Upload>
                {trainingCodeFile && (
                  <Alert
                    type="success"
                    message={`已选择：${trainingCodeFile.name}`}
                    style={{ marginTop: 16 }}
                    showIcon
                  />
                )}
                <Alert
                  message="说明"
                  description="上传训练代码后，系统将使用您提供的训练脚本进行训练。训练代码应包含完整的训练流程。"
                  type="info"
                  showIcon
                  style={{ marginTop: 16 }}
                />
              </div>
            ),
          },
        ]}
      />
    </Card>
  );

  const content = [step1Content, step2Content, step3Content];

  return (
    <PageContainer
      title="发起训练"
      subTitle="选择已有资源或快速上传新资源，一站式完成训练任务创建"
      onBack={() => history.push('/task/list')}
    >
      <div style={{ marginBottom: 24 }}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
          <span style={{ color: '#ff4d4f', marginRight: 4 }}>*</span>
          任务名称
        </label>
        <Input
          placeholder="请输入任务名称，便于后续识别和管理"
          value={taskName}
          onChange={(e) => setTaskName(e.target.value)}
          maxLength={100}
          showCount
          style={{ maxWidth: 480 }}
        />
      </div>

      <Steps current={currentStep} style={{ marginBottom: 24 }}>
        {steps.map((s, i) => (
          <Step key={i} title={s.title} />
        ))}
      </Steps>

      <div style={{ minHeight: 360, marginBottom: 24 }}>{content[currentStep]}</div>

      <Space>
        {currentStep > 0 && (
          <Button onClick={() => setCurrentStep(currentStep - 1)}>上一步</Button>
        )}
        <Button type="primary" onClick={handleNext}>
          {currentStep < 2 ? '下一步' : '提交训练'}
        </Button>
      </Space>
    </PageContainer>
  );
};

export default TaskCreate;
