import { PageContainer } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Button, Form, Input, message, Select, Steps } from 'antd';
import React, { useEffect, useState } from 'react';
import {
  createTask,
  fetchDatasetList,
  fetchModelList,
} from '@/services/platform';

const DEFAULT_HYPER_PARAMS = {
  epochs: 5,
  lr0: 0.05,
  batch_size: 4,
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
  const [modelLoading, setModelLoading] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);

  useEffect(() => {
    setModelLoading(true);
    fetchModelList({ pageSize: 100 } as any)
      .then((res: any) => {
        const list = res?.data?.data ?? res?.data ?? [];
        setModelOptions(list ?? []);
      })
      .catch((error: any) => {
        setModelOptions([]);
        message.error(error?.message || '模型版本列表加载失败，请重新登录或检查后端服务');
      })
      .finally(() => setModelLoading(false));

    setDatasetLoading(true);
    fetchDatasetList({ pageSize: 100 } as any)
      .then((res: any) => {
        const list = res?.data?.data ?? res?.data ?? [];
        setDatasetOptions(list ?? []);
      })
      .catch((error: any) => {
        setDatasetOptions([]);
        message.error(error?.message || '数据集版本列表加载失败，请重新登录或检查后端服务');
      })
      .finally(() => setDatasetLoading(false));
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem('taskCreatePrefill');
    if (!raw) return;
    try {
      const prefill = JSON.parse(raw);
      form.setFieldsValue(prefill);
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
      const hyperParams = JSON.parse(values.hyperParams);
      const res: any = await createTask(
        {
          name: values.name,
          modelVersionId: values.modelVersionId,
          codeVersionId: values.codeVersionId,
          datasetVersionId: values.datasetVersionId,
          hyperParams,
          remark: values.remark,
        },
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        throw new Error(res?.errorMessage || '创建训练任务失败');
      }
      const data = res?.data;
      message.success(`创建成功，experimentId=${data?.experimentId || '-'}`);
      history.push(`/task/detail/${data?.id}`);
    } catch (error: any) {
      message.error(
        error?.errorMessage || error?.message || '创建失败，请重试！',
      );
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
            loading={modelLoading}
            optionFilterProp="label"
            options={modelOptions.map((m: any) => ({
              value: m.id,
              label: `${m.name} / ${m.version} / ${m.type} / ${m.id}`,
            }))}
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
            loading={datasetLoading}
            optionFilterProp="label"
            options={datasetOptions.map((d: any) => ({
              value: d.versionId || d.id,
              label: `${d.name} / ${d.version || 'v?'} / ${d.type} / ${d.versionId || d.id}`,
            }))}
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
            label="代码版本标识"
            rules={[
              {
                required: true,
                message: '请输入代码版本标识（如 git commit / 镜像 tag）',
              },
            ]}
          >
            <Input placeholder="例如：git-commit-a1b2c3d" />
          </Form.Item>
          <Form.Item name="remark" label="备注（可选）">
            <Input placeholder="例如：baseline" />
          </Form.Item>
          <Form.Item
            name="hyperParams"
            label="超参数（JSON）"
            rules={[
              { required: true, message: '请输入超参数 JSON' },
              {
                validator: async (_: any, value: string) => {
                  try {
                    JSON.parse(value || '');
                    return Promise.resolve();
                  } catch {
                    return Promise.reject(new Error('JSON 格式不正确'));
                  }
                },
              },
            ]}
          >
            <Input.TextArea
              rows={10}
              placeholder='{"epochs": 5, "lr0": 0.05, "batch_size": 4, "imgsz": 640, "device": "cpu"}'
            />
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
          codeVersionId: 'frontend-training-demo',
          hyperParams: JSON.stringify(DEFAULT_HYPER_PARAMS, null, 2),
        }}
      >
        <Steps
          current={currentStep}
          items={steps}
          style={{ marginBottom: 24 }}
        />
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
