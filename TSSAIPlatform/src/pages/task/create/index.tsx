import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, message, Select, Steps } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { history } from '@umijs/max';
import { getModelList } from '@/services/ant-design-pro/model';
import { listDatasetAssets, listDatasetVersions } from '@/services/ant-design-pro/dataset';
import { createTrainingTask } from '@/services/ant-design-pro/task';

type TaskType = 'CV' | 'NLP';

type ModelOption = {
  id: string;
  name: string;
  version?: string;
  type: TaskType;
};

type DatasetVersionOption = {
  id: string;
  assetId: string;
  assetName: string;
  version: string;
  type: TaskType;
};

const isTaskType = (value?: string): value is TaskType => value === 'CV' || value === 'NLP';

const isValidModelItem = (item: API.ModelItem): item is API.ModelItem & { id: string; type: TaskType } =>
  Boolean(item.id) && isTaskType(item.type);

/**
 * 发起训练页
 */
const TaskCreate: React.FC = () => {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [modelOptions, setModelOptions] = useState<ModelOption[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<DatasetVersionOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const selectedModelVersionId = Form.useWatch('modelVersionId', form);

  const selectedModel = useMemo(
    () => modelOptions.find((item) => item.id === selectedModelVersionId),
    [modelOptions, selectedModelVersionId],
  );

  const matchedDatasetOptions = useMemo(() => {
    if (!selectedModel) return [];
    return datasetOptions.filter((item) => item.type === selectedModel.type);
  }, [datasetOptions, selectedModel]);

  useEffect(() => {
    const loadOptions = async () => {
      setLoadingOptions(true);
      try {
        const modelRes = await getModelList({ skipErrorHandler: true });
        const models = (modelRes?.data?.data ?? [])
          .filter(isValidModelItem)
          .map((item) => ({
            id: item.id,
            name: item.name || item.id,
            version: item.version,
            type: item.type,
          }));
        setModelOptions(models);

        const assetRes = await listDatasetAssets({ skipErrorHandler: true });
        const assets = (assetRes?.data ?? []).filter((item) => item.id && isTaskType(item.type));
        const versionGroups = await Promise.all(
          assets.map(async (asset) => {
            const versionRes = await listDatasetVersions(asset.id, { skipErrorHandler: true });
            return (versionRes?.data ?? []).map((version) => ({
              id: version.id,
              assetId: asset.id,
              assetName: asset.name,
              version: version.version,
              type: asset.type as TaskType,
            }));
          }),
        );
        setDatasetOptions(versionGroups.flat().filter((item) => item.id));
      } catch (error: any) {
        message.error(error?.info?.errorMessage ?? error?.message ?? '加载模型或数据集失败');
      } finally {
        setLoadingOptions(false);
      }
    };

    loadOptions();
  }, []);

  useEffect(() => {
    const datasetVersionId = form.getFieldValue('datasetVersionId');
    if (!selectedModel || !datasetVersionId) return;
    const selectedDataset = datasetOptions.find((item) => item.id === datasetVersionId);
    if (selectedDataset && selectedDataset.type !== selectedModel.type) {
      form.setFieldValue('datasetVersionId', undefined);
      message.warning('已清空不匹配的数据集，请选择同类型数据集');
    }
  }, [datasetOptions, form, selectedModel]);

  const handleNext = () => {
    const stepFields = [
      ['modelVersionId'],
      ['datasetVersionId'],
      ['codeVersionId', 'params'],
    ];
    form.validateFields(stepFields[currentStep]).then(() => {
      setCurrentStep(currentStep + 1);
    });
  };

  const handlePrev = () => {
    setCurrentStep(currentStep - 1);
  };

  const handleSubmit = async (values: any) => {
    try {
      const model = modelOptions.find((item) => item.id === values.modelVersionId);
      const dataset = datasetOptions.find((item) => item.id === values.datasetVersionId);
      if (!model || !dataset) {
        message.error('请选择有效的模型版本和数据集版本');
        return;
      }
      if (model.type !== dataset.type) {
        message.error(`类型不匹配：模型为 ${model.type}，数据集为 ${dataset.type}`);
        return;
      }
      let hyperParams: Record<string, any>;
      try {
        hyperParams = JSON.parse(values.params);
      } catch {
        message.error('训练参数必须是合法 JSON');
        return;
      }
      await createTrainingTask(
        {
          name: values.name || `${model.name}-${dataset.assetName}`,
          modelVersionId: values.modelVersionId,
          datasetVersionId: values.datasetVersionId,
          codeVersionId: values.codeVersionId,
          hyperParams,
        },
        { skipErrorHandler: true },
      );
      message.success('任务创建成功！');
      history.push('/task/list');
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '创建失败，请重试！');
    }
  };

  const steps = [
    {
      title: '选择模型',
      content: (
        <Form.Item
          name="modelVersionId"
          label="模型版本"
          rules={[{ required: true, message: '请选择模型' }]}
        >
          <Select
            loading={loadingOptions}
            placeholder="请选择模型版本"
            options={modelOptions.map((item) => ({
              value: item.id,
              label: `${item.name}${item.version ? ` / ${item.version}` : ''} / ${item.type}`,
            }))}
          />
        </Form.Item>
      ),
    },
    {
      title: '选择数据集',
      content: (
        <Form.Item
          name="datasetVersionId"
          label="数据集版本"
          rules={[{ required: true, message: '请选择数据集' }]}
        >
          <Select
            disabled={!selectedModel}
            loading={loadingOptions}
            placeholder={selectedModel ? `请选择 ${selectedModel.type} 数据集版本` : '请先选择模型版本'}
            options={matchedDatasetOptions.map((item) => ({
              value: item.id,
              label: `${item.assetName} / ${item.version} / ${item.type}`,
            }))}
          />
        </Form.Item>
      ),
    },
    {
      title: '配置参数',
      content: (
        <>
          <Form.Item name="name" label="任务名称">
            <Input placeholder="可选，默认使用模型名-数据集名" />
          </Form.Item>
          <Form.Item
            name="codeVersionId"
            label="代码版本标识"
            rules={[{ required: true, message: '请输入代码版本标识' }]}
          >
            <Input placeholder="例如 Git Commit、镜像 Tag 或代码包版本" />
          </Form.Item>
          <Form.Item
            name="params"
            label="训练参数（JSON格式）"
            initialValue='{"epochs": 10, "batch_size": 32}'
            rules={[{ required: true, message: '请输入训练参数' }]}
          >
            <Input.TextArea
              rows={8}
              placeholder='{"epochs": 10, "batch_size": 32}'
            />
          </Form.Item>
        </>
      ),
    },
  ];

  return (
    <PageContainer
      title="发起训练"
      onBack={() => history.push('/task/list')}
    >
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Steps current={currentStep} items={steps} style={{ marginBottom: 24 }} />
        <div style={{ minHeight: 200, marginBottom: 24 }}>
          {steps[currentStep].content}
        </div>
        <div>
          {currentStep > 0 && (
            <Button onClick={handlePrev} style={{ marginRight: 8 }}>
              上一步
            </Button>
          )}
          {currentStep < steps.length - 1 ? (
            <Button type="primary" onClick={handleNext}>
              下一步
            </Button>
          ) : (
            <Button type="primary" htmlType="submit">
              提交训练
            </Button>
          )}
        </div>
      </Form>
    </PageContainer>
  );
};

export default TaskCreate;




