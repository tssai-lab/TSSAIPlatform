/** 推理参数字段定义 — §6.3.5 / §7.2.10 */

export type InferenceParamSchemaField = {
  key: string;
  label: string;
  type: 'number' | 'select' | 'string';
  default: string | number;
  min?: number;
  max?: number;
  step?: number;
  options?: { label: string; value: string | number }[];
  tooltip?: string;
};

const DEVICE_OPTIONS = [
  { label: 'CPU', value: 'cpu' },
  { label: 'CUDA', value: 'cuda' },
  { label: 'CUDA:0', value: 'cuda:0' },
];

export const INFERENCE_COMMON_PARAM_FIELDS: InferenceParamSchemaField[] = [
  {
    key: 'device',
    label: '运行设备',
    type: 'select',
    default: 'cpu',
    options: DEVICE_OPTIONS,
    tooltip: '推理 Job 使用的计算设备',
  },
  {
    key: 'batch_size',
    label: '批大小',
    type: 'number',
    default: 8,
    min: 1,
    max: 128,
    step: 1,
    tooltip: '批量推理时每个 micro-batch 的样本数',
  },
];

export const INFERENCE_CV_PARAM_FIELDS: InferenceParamSchemaField[] = [
  {
    key: 'confidence',
    label: '置信度阈值',
    type: 'number',
    default: 0.25,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'iou_threshold',
    label: 'NMS IoU 阈值',
    type: 'number',
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: 'img_size',
    label: '输入边长',
    type: 'number',
    default: 640,
    min: 32,
    max: 2048,
    step: 32,
  },
  {
    key: 'max_detections',
    label: '最大检测数',
    type: 'number',
    default: 100,
    min: 1,
    max: 1000,
    step: 1,
  },
];

export const INFERENCE_GENERATION_PARAM_FIELDS: InferenceParamSchemaField[] = [
  {
    key: 'max_tokens',
    label: '最大 Token',
    type: 'number',
    default: 512,
    min: 1,
    max: 8192,
    step: 1,
  },
  {
    key: 'temperature',
    label: 'Temperature',
    type: 'number',
    default: 0.7,
    min: 0,
    max: 2,
    step: 0.1,
  },
  {
    key: 'top_p',
    label: 'Top P',
    type: 'number',
    default: 0.9,
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: 'top_k',
    label: 'Top K',
    type: 'number',
    default: 50,
    min: 1,
    max: 200,
    step: 1,
  },
];

export function getInferenceParamFields(
  taskType: API.InferenceTaskType,
): InferenceParamSchemaField[] {
  const common = INFERENCE_COMMON_PARAM_FIELDS;
  switch (taskType) {
    case 'CV':
      return [...common, ...INFERENCE_CV_PARAM_FIELDS];
    case 'NLP':
    case 'MULTIMODAL':
      return [...common, ...INFERENCE_GENERATION_PARAM_FIELDS];
    default:
      return common;
  }
}

export function getDefaultInferenceParams(
  taskType: API.InferenceTaskType,
  modelDefaults?: Record<string, string | number>,
): Record<string, string | number> {
  const fields = getInferenceParamFields(taskType);
  const base: Record<string, string | number> = {};
  fields.forEach((f) => {
    base[f.key] = f.default;
  });
  if (modelDefaults) {
    Object.entries(modelDefaults).forEach(([k, v]) => {
      if (k in base) base[k] = v;
    });
  }
  return base;
}

export function formatInferenceParamsForDisplay(
  params: Record<string, string | number> | undefined,
  taskType: API.InferenceTaskType,
): { key: string; label: string; value: string }[] {
  if (!params) return [];
  const fieldMap = new Map(
    getInferenceParamFields(taskType).map((f) => [f.key, f]),
  );
  return Object.entries(params).map(([key, value]) => ({
    key,
    label: fieldMap.get(key)?.label ?? key,
    value: String(value),
  }));
}

export function mockInferenceParamSchema(taskType: API.InferenceTaskType) {
  const common = INFERENCE_COMMON_PARAM_FIELDS;
  let specific: InferenceParamSchemaField[] = [];
  if (taskType === 'CV') specific = INFERENCE_CV_PARAM_FIELDS;
  if (taskType === 'NLP' || taskType === 'MULTIMODAL') {
    specific = INFERENCE_GENERATION_PARAM_FIELDS;
  }
  return { success: true, data: { taskType, common, specific } };
}
