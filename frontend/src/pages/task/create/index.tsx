import { PageContainer } from '@ant-design/pro-components';
import { Button, Form, Input, message, Select, Steps } from 'antd';
import React, { useEffect, useState } from 'react';
import { history } from '@umijs/max';
import { createTask, fetchDatasetList, fetchModelList } from '@/services/platform';
import { MOCK_DATASETS, MOCK_MODELS } from '@/constants/mockData';

const DEFAULT_HYPER_PARAMS = {
  epochs: 5,
  lr0: 0.05,
  batch_size: 1,
  imgsz: 640,
  device: 'cpu',
};

/**
 * 发起训练页（按 backend-api.md 的实验/版本机制）
 * - POST /api/task/create：自动生成 experimentId，并创建 versionNo=1
 */
const TaskCreate: React.FC = () => {
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [modelOptions, setModelOptions] = useState<any[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<any[]>([]);
  const [selectedModelVersionId, setSelectedModelVersionId] = useState<string>();
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] = useState<string>();

  useEffect(() => {
    fetchModelList({ pageSize: 100 } as any)
      .then((res: any) => {
        const list = res?.data?.data ?? res?.data ?? [];
        const validList = (list ?? []).filter((item: any) => item?.id && item?.name && item?.type);
        setModelOptions(validList?.length ? validList : (MOCK_MODELS as any));
      })
      .catch(() => setModelOptions(MOCK_MODELS as any));

    fetchDatasetList({ pageSize: 100 } as any)
      .then((res: any) => {
        const list = res?.data?.data ?? res?.data ?? [];
        const validList = (list ?? []).filter((item: any) => (item?.versionId || item?.id) && item?.name && item?.type);
        setDatasetOptions(validList?.length ? validList : (MOCK_DATASETS as any));
      })
      .catch(() => setDatasetOptions(MOCK_DATASETS as any));
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem('taskCreatePrefill');
    if (!raw) return;
    try {
      const prefill = JSON.parse(raw);
      form.setFieldsValue(prefill);
      if (prefill.modelVersionId) {
        setSelectedModelVersionId(prefill.modelVersionId);
      }
      if (prefill.datasetVersionId) {
        setSelectedDatasetVersionId(prefill.datasetVersionId);
      }
    } catch {
      // ignore
    } finally {
      localStorage.removeItem('taskCreatePrefill');
    }
  }, [form]);

  const handleNext = () => {
    form.validateFields().then(() => setCurrentStep((s) => s + 1));
  };

  const handlePrev = () => setCurrentStep((s) => Math.max(0, s - 1));

  const handleSubmit = async (values: any) => {
    try {
      const allValues = form.getFieldsValue(true);
      const modelVersionId = values.modelVersionId || allValues.modelVersionId || selectedModelVersionId;
      const datasetVersionId = values.datasetVersionId || allValues.datasetVersionId || selectedDatasetVersionId;
      if (!modelVersionId) {
        message.error('请选择模型版本');
        setCurrentStep(0);
        return;
      }
      if (!datasetVersionId) {
        message.error('请选择数据集版本');
        setCurrentStep(1);
        return;
      }
      const hyperParams = {
        ...DEFAULT_HYPER_PARAMS,
        ...(values.hyperParams?.trim() ? JSON.parse(values.hyperParams) : {}),
      };
      const res: any = await createTask(
        {
          name: values.name,
          modelVersionId,
          codeVersionId: values.codeVersionId,
          datasetVersionId,
          hyperParams,
          remark: values.remark,
        },
        { skipErrorHandler: true },
      );
      const data = res?.data;
      message.success(`创建成功，experimentId=${data?.experimentId || '-'}`);
      history.push(`/task/detail/${data?.id}`);
    } catch (error: any) {
      message.error(error?.errorMessage || error?.message || '创建失败，请重试！');
    }
  };

  const steps = [
    {
      title: '选择模型版本',
      content: (
        <Form.Item
          name="modelVersionId"
          label="模型版本"
          rules={[{ required: true, message: '请选择模型版本' }]}
        >
          <Select
            placeholder="请选择模型版本"
            showSearch
            optionFilterProp="label"
            options={modelOptions.map((m: any) => ({
              value: m.id || m.versionId,
              label: `${m.name} / ${m.version} / ${m.type}`,
            }))}
            value={selectedModelVersionId}
            onChange={(value) => {
              setSelectedModelVersionId(value);
              form.setFieldValue('modelVersionId', value);
            }}
          />
        </Form.Item>
      ),
    },
    {
      title: '选择数据集版本',
      content: (
        <Form.Item
          name="datasetVersionId"
          label="数据集版本"
          rules={[{ required: true, message: '请选择数据集版本' }]}
        >
          <Select
            placeholder="请选择数据集版本"
            showSearch
            optionFilterProp="label"
            options={datasetOptions.map((d: any) => ({
              value: d.versionId || d.id,
              label: `${d.name} / ${d.version || 'v?'} / ${d.type}`,
            }))}
            value={selectedDatasetVersionId}
            onChange={(value) => {
              setSelectedDatasetVersionId(value);
              form.setFieldValue('datasetVersionId', value);
            }}
          />
        </Form.Item>
      ),
    },
    {
      title: '配置超参数与代码版本',
      content: (
        <>
          <Form.Item name="name" label="实验名称（可选）">
            <Input placeholder="例如：resnet50-cifar10-train" />
          </Form.Item>
          <Form.Item
            name="codeVersionId"
            label="代码 Commit"
            extra="必须填写本次训练代码对应的文本标识，用于追踪训练代码版本。"
            rules={[{ required: true, whitespace: true, message: '请输入代码版本文本' }]}
          >
            <Input placeholder="例如：baseline-v1 / git-commit-a1b2c3d / 本地实验代码版本" />
          </Form.Item>
          <Form.Item name="remark" label="备注（可选）">
            <Input placeholder="例如：baseline" />
          </Form.Item>
          <Form.Item
            name="hyperParams"
            label="超参数（JSON）"
            extra="已预填 CPU 轻量训练默认参数；不熟悉时可以直接提交。"
            rules={[
              {
                validator: async (_, value) => {
                  if (!value || !value.trim()) {
                    return;
                  }
                  try {
                    JSON.parse(value);
                  } catch {
                    throw new Error('请输入合法的 JSON，例如 {"epochs": 5, "lr0": 0.05}');
                  }
                },
              },
            ]}
          >
            <Input.TextArea rows={10} placeholder='{"epochs": 5, "lr0": 0.05, "batch_size": 1, "imgsz": 640, "device": "cpu"}' />
          </Form.Item>
        </>
      ),
    },
  ];

  return (
    <PageContainer title="发起训练" onBack={() => history.push('/task/list')}>
      <Form
        form={form}
        onFinish={handleSubmit}
        layout="vertical"
        initialValues={{
          hyperParams: JSON.stringify(DEFAULT_HYPER_PARAMS, null, 2),
        }}
      >
        <Steps current={currentStep} items={steps} style={{ marginBottom: 24 }} />
        <div style={{ minHeight: 200, marginBottom: 24 }}>{steps[currentStep].content}</div>
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

