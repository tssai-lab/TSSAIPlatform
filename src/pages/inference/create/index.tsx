import { PageContainer } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Alert, Button, Card, Form, Input, message, Radio, Select } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import {
  INFERENCE_INPUT_MODE,
  INFERENCE_TASK_TYPE,
} from '@/constants/inference/constants';
import { getDefaultInferenceParams } from '@/constants/inference/inferenceParamSchema';
import {
  createInferenceTask,
  fetchDatasetList,
  fetchInferenceModels,
} from '@/services/platform';
import CvCreateForm from './CvCreateForm';
import InferenceAdvancedForm from './InferenceAdvancedForm';
import InferenceParamsForm from './InferenceParamsForm';
import MultimodalCreateForm from './MultimodalCreateForm';
import NlpCreateForm from './NlpCreateForm';

const InferenceCreate: React.FC = () => {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [modelOptions, setModelOptions] = useState<API.InferenceModelOption[]>(
    [],
  );
  const [modelLoading, setModelLoading] = useState(false);
  const [datasetOptions, setDatasetOptions] = useState<
    { label: string; value: string }[]
  >([]);
  const [datasetLoading, setDatasetLoading] = useState(false);

  const selectedModelId = Form.useWatch('inferenceModelId', form);
  const inputMode = Form.useWatch('inputMode', form);

  const selectedModel = useMemo(
    () => modelOptions.find((m) => m.inferenceModelId === selectedModelId),
    [modelOptions, selectedModelId],
  );

  useEffect(() => {
    setModelLoading(true);
    fetchInferenceModels({ pageSize: 100 }, { skipErrorHandler: true })
      .then((res) => setModelOptions(res?.data?.data ?? []))
      .finally(() => setModelLoading(false));
  }, []);

  useEffect(() => {
    setDatasetLoading(true);
    fetchDatasetList({ pageSize: 100 })
      .then((res) => {
        const list = (res as { data?: API.DatasetItem[] })?.data ?? [];
        setDatasetOptions(
          list.map((d) => ({
            label: `${d.name}${d.version ? ` · ${d.version}` : ''}`,
            value: d.versionId || d.id,
          })),
        );
      })
      .catch(() => setDatasetOptions([]))
      .finally(() => setDatasetLoading(false));
  }, []);

  useEffect(() => {
    form.setFieldsValue({
      datasetVersionId: undefined,
      inferenceInputId: undefined,
      text: undefined,
      prompt: undefined,
    });
  }, [inputMode, selectedModelId, form]);

  useEffect(() => {
    if (!selectedModel) return;
    form.setFieldsValue({
      inferenceParams: getDefaultInferenceParams(
        selectedModel.taskType,
        selectedModel.defaultInferenceParams,
      ),
      useCustomScript: false,
      customScriptId: undefined,
      scriptFileName: undefined,
      scriptEntryPoint: 'inference_handler',
    });
  }, [selectedModel, form]);

  const validateExtra = (values: Record<string, unknown>): string | null => {
    const mode = values.inputMode as API.InferenceInputMode;
    const taskType = selectedModel?.taskType;
    if (mode === 'batch' && !values.datasetVersionId)
      return '批量模式请选择数据集';
    if (mode === 'single' && taskType === 'CV' && !values.inferenceInputId)
      return '请上传图片';
    if (
      mode === 'single' &&
      taskType === 'NLP' &&
      !values.text &&
      !values.inferenceInputId
    ) {
      return '请粘贴文本或上传文件';
    }
    if (mode === 'single' && taskType === 'MULTIMODAL') {
      if (!values.inferenceInputId) return '请上传图片';
      if (!values.prompt) return '请输入 Prompt';
    }
    if (values.useCustomScript && !values.customScriptId) {
      return '已启用自定义脚本，请上传 .py 推理脚本';
    }
    return null;
  };

  const handleSubmit = async () => {
    try {
      const values = await form.validateFields();
      const err = validateExtra(values);
      if (err) {
        message.warning(err);
        return;
      }
      if (!selectedModel) {
        message.warning('请选择可推理模型');
        return;
      }
      setSubmitting(true);
      const body: API.CreateInferenceTaskRequest = {
        name: values.name,
        inferenceModelId: values.inferenceModelId,
        inputMode: values.inputMode,
        remark: values.remark,
        datasetVersionId: values.datasetVersionId,
        inferenceInputId: values.inferenceInputId,
        text: values.text,
        prompt: values.prompt,
        inferenceParams: values.inferenceParams,
        useCustomScript: Boolean(values.useCustomScript),
        customScriptId: values.useCustomScript
          ? values.customScriptId
          : undefined,
        scriptEntryPoint: values.useCustomScript
          ? values.scriptEntryPoint || 'inference_handler'
          : undefined,
      };
      const res = await createInferenceTask(body, { skipErrorHandler: true });
      message.success('推理任务已创建');
      const newId = res?.data?.id;
      history.push(
        newId
          ? `/inference/detail/${encodeURIComponent(newId)}`
          : '/inference/list',
      );
    } catch (error: unknown) {
      const err = error as { message?: string };
      if (err?.message && !String(err.message).includes('validateFields')) {
        message.error(err.message || '创建失败');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const renderTypeForm = () => {
    if (!selectedModel) {
      return (
        <Alert
          type="info"
          showIcon
          message="请先选择可推理模型，系统将展示对应类型的输入表单"
        />
      );
    }
    const props = { form, datasetOptions, datasetLoading };
    switch (selectedModel.taskType) {
      case 'CV':
        return <CvCreateForm {...props} />;
      case 'NLP':
        return <NlpCreateForm {...props} />;
      case 'MULTIMODAL':
        return <MultimodalCreateForm {...props} />;
      default:
        return null;
    }
  };

  return (
    <PageContainer
      title="创建推理任务"
      subTitle="仅从可推理模型池选模型；批量走数据集管理，单文件走推理专用上传"
      onBack={() => history.push('/inference/list')}
    >
      <Card>
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            inputMode: 'single',
            useCustomScript: false,
            scriptEntryPoint: 'inference_handler',
          }}
          style={{ maxWidth: 720 }}
        >
          <Form.Item
            name="name"
            label="任务名称"
            rules={[{ required: true, message: '请输入任务名称' }]}
          >
            <Input placeholder="便于识别的推理任务名称" maxLength={128} />
          </Form.Item>

          <Form.Item
            name="inferenceModelId"
            label="可推理模型"
            rules={[{ required: true, message: '请选择模型' }]}
            extra="不调用模型管理列表；数据来自 GET /inference/models"
          >
            <Select
              placeholder="选择可推理模型"
              loading={modelLoading}
              showSearch
              optionFilterProp="label"
              options={modelOptions.map((m) => ({
                value: m.inferenceModelId,
                label: `${m.displayName} (${INFERENCE_TASK_TYPE[m.taskType]?.label ?? m.taskType})`,
              }))}
            />
          </Form.Item>

          {selectedModel && (
            <Form.Item label="任务类型">
              {INFERENCE_TASK_TYPE[selectedModel.taskType]?.label ??
                selectedModel.taskType}
            </Form.Item>
          )}

          <Form.Item
            name="inputMode"
            label="输入方式"
            rules={[{ required: true }]}
          >
            <Radio.Group>
              <Radio.Button value="single">
                {INFERENCE_INPUT_MODE.single.label}
              </Radio.Button>
              <Radio.Button value="batch">
                {INFERENCE_INPUT_MODE.batch.label}
              </Radio.Button>
            </Radio.Group>
          </Form.Item>

          {renderTypeForm()}

          {selectedModel && (
            <InferenceParamsForm taskType={selectedModel.taskType} />
          )}

          {selectedModel && (
            <InferenceAdvancedForm
              form={form}
              taskType={selectedModel.taskType}
            />
          )}

          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={2} placeholder="可选" maxLength={500} />
          </Form.Item>

          <Form.Item>
            <Button type="primary" loading={submitting} onClick={handleSubmit}>
              提交推理任务
            </Button>
            <Button
              style={{ marginLeft: 8 }}
              onClick={() => history.push('/inference/list')}
            >
              取消
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </PageContainer>
  );
};

export default InferenceCreate;
