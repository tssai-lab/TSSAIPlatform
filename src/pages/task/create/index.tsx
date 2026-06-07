import { PageContainer } from '@ant-design/pro-components';
import { history, useSearchParams } from '@umijs/max';
import { Alert, Button, Form, Input, message, Select, Steps } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import {
  createExperimentVersion,
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
/** 各步骤需校验的字段（分步切换时只校验当前步） */
const STEP_FIELD_NAMES = [
  ['modelVersionId'],
  ['datasetVersionId'],
  ['codeVersionId', 'hyperParams'],
] as const;

const STEP_COUNT = STEP_FIELD_NAMES.length;

const TaskCreate: React.FC = () => {
  const [searchParams] = useSearchParams();
  const experimentId = searchParams.get('experimentId')?.trim() || '';
  const isExperimentContinue = !!experimentId;
  const [form] = Form.useForm();
  const [currentStep, setCurrentStep] = useState(0);
  const [modelOptions, setModelOptions] = useState<any[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<any[]>([]);
  const [modelLoading, setModelLoading] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);
  /** 与 Form 同步备份，避免分步卸载表单项后 id 丢失 */
  const [selectedModelVersionId, setSelectedModelVersionId] =
    useState<string>();
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] =
    useState<string>();

  useEffect(() => {
    setModelLoading(true);
    fetchModelList({ pageSize: 100 } as any)
      .then((res: any) => {
        const list = res?.data?.data ?? res?.data ?? [];
        setModelOptions(list ?? []);
      })
      .catch((error: any) => {
        setModelOptions([]);
        message.error(
          error?.message || '模型版本列表加载失败，请重新登录或检查后端服务',
        );
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
        message.error(
          error?.message || '数据集版本列表加载失败，请重新登录或检查后端服务',
        );
      })
      .finally(() => setDatasetLoading(false));
  }, []);

  useEffect(() => {
    const raw = localStorage.getItem('taskCreatePrefill');
    const queryModelVersionId = searchParams.get('modelVersionId');
    if (queryModelVersionId) {
      form.setFieldValue('modelVersionId', queryModelVersionId);
      setSelectedModelVersionId(queryModelVersionId);
    }
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
  }, [form, searchParams]);

  const pageTitle = useMemo(
    () => (isExperimentContinue ? '基于此版本继续训练' : '发起训练'),
    [isExperimentContinue],
  );

  const handleNext = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    try {
      await form.validateFields([...STEP_FIELD_NAMES[currentStep]]);
      // 延迟切步，避免「下一步」与「提交训练」同位置时同一次点击误触提交
      setTimeout(() => setCurrentStep((s) => s + 1), 0);
    } catch {
      // 校验失败时表单项会展示错误提示
    }
  };

  const handlePrev = () => setCurrentStep((s) => Math.max(0, s - 1));

  const handleSubmit = async (values: any) => {
    try {
      const allValues = form.getFieldsValue(true);
      const modelVersionId =
        values.modelVersionId ??
        allValues.modelVersionId ??
        selectedModelVersionId;
      const datasetVersionId =
        values.datasetVersionId ??
        allValues.datasetVersionId ??
        selectedDatasetVersionId;
      const codeVersionId = values.codeVersionId ?? allValues.codeVersionId;
      const hyperParamsRaw = values.hyperParams ?? allValues.hyperParams;

      if (!modelVersionId) {
        message.error('请选择模型版本后再提交训练');
        setCurrentStep(0);
        return;
      }
      if (!datasetVersionId) {
        message.error('请选择数据集版本后再提交训练');
        setCurrentStep(1);
        return;
      }
      if (!codeVersionId) {
        message.error('请填写代码版本标识');
        return;
      }

      const hyperParams = JSON.parse(hyperParamsRaw);
      let data: API.TrainingExperimentVersion | undefined;

      if (isExperimentContinue) {
        const res: any = await createExperimentVersion(
          experimentId,
          {
            name: values.name ?? allValues.name,
            modelVersionId,
            codeVersionId,
            datasetVersionId,
            hyperParams,
            remark: values.remark ?? allValues.remark,
          },
          { skipErrorHandler: true },
        );
        if (res?.success === false) {
          throw new Error(res?.errorMessage || '创建实验新版本失败');
        }
        data = res?.data;
        message.success(
          `已在实验 ${experimentId} 下创建 v${data?.versionNo ?? '?'}，experimentId 不变`,
        );
      } else {
        const res: any = await createTask(
          {
            name: values.name ?? allValues.name,
            modelVersionId,
            codeVersionId,
            datasetVersionId,
            hyperParams,
            remark: values.remark ?? allValues.remark,
          },
          { skipErrorHandler: true },
        );
        if (res?.success === false) {
          throw new Error(res?.errorMessage || '创建训练任务失败');
        }
        data = res?.data;
        message.success(`创建成功，experimentId=${data?.experimentId || '-'}`);
      }

      history.push(`/task/detail/${data?.id}`);
    } catch (error: any) {
      message.error(
        error?.errorMessage || error?.message || '创建失败，请重试！',
      );
    }
  };

  /** 仅用户点击「提交训练」时调用，不用 Form 原生 onFinish，避免 Enter/同位置点击误提交 */
  const handleSubmitClick = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (currentStep !== STEP_COUNT - 1) {
      return;
    }
    try {
      await form.validateFields([
        'modelVersionId',
        'datasetVersionId',
        'codeVersionId',
        'hyperParams',
      ]);
      const values = form.getFieldsValue(true);
      await handleSubmit(values);
    } catch {
      // 校验失败时表单项会展示错误提示
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
            onChange={(value: string) => {
              setSelectedModelVersionId(value);
              form.setFieldValue('modelVersionId', value);
            }}
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
            onChange={(value: string) => {
              setSelectedDatasetVersionId(value);
              form.setFieldValue('datasetVersionId', value);
            }}
            options={datasetOptions
              .map((d: any) => {
                const versionId = d.versionId;
                if (!versionId) return null;
                const desc = d.versionRemark?.trim();
                const descPart = desc
                  ? ` · ${desc.length > 40 ? `${desc.slice(0, 40)}…` : desc}`
                  : '';
                return {
                  value: versionId,
                  label: `${d.name} / ${d.version || 'v?'} / ${d.type}${descPart} / ${versionId}`,
                };
              })
              .filter(Boolean)}
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
    <PageContainer
      title={pageTitle}
      subTitle={
        isExperimentContinue
          ? `在同一 experimentId（${experimentId}）下创建新版本，versionNo 自动递增`
          : '将自动生成唯一 experimentId，并创建 versionNo=1'
      }
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
          description="已预填所选历史版本的模型、数据集、代码与超参数。提交后将在同一 experimentId 下创建下一版（versionNo 自动递增）；历史版本的超参数记录不会被修改。"
        />
      )}
      <Form
        form={form}
        preserve
        layout="vertical"
        initialValues={{
          codeVersionId: 'frontend-training-demo',
          hyperParams: JSON.stringify(DEFAULT_HYPER_PARAMS, null, 2),
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && currentStep < STEP_COUNT - 1) {
            e.preventDefault();
          }
        }}
      >
        <Steps
          current={currentStep}
          items={steps.map(({ title }) => ({ title }))}
          style={{ marginBottom: 24 }}
        />
        <div style={{ minHeight: 200, marginBottom: 24 }}>
          {steps.map((step, index) => (
            <div
              key={step.title}
              style={{ display: index === currentStep ? 'block' : 'none' }}
            >
              {step.content}
            </div>
          ))}
        </div>
        <div>
          {currentStep > 0 && (
            <Button
              htmlType="button"
              onClick={handlePrev}
              style={{ marginRight: 8 }}
            >
              上一步
            </Button>
          )}
          {currentStep < STEP_COUNT - 1 ? (
            <Button type="primary" htmlType="button" onClick={handleNext}>
              下一步
            </Button>
          ) : (
            <Button
              type="primary"
              htmlType="button"
              onClick={handleSubmitClick}
            >
              {isExperimentContinue ? '提交并创建新版本' : '提交训练'}
            </Button>
          )}
        </div>
      </Form>
    </PageContainer>
  );
};

export default TaskCreate;
