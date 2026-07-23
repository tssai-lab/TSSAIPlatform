/** 模型任务类型（与后端 model upload/list 一致：CV / NLP / POINT_CLOUD / ROBOT） */
export const MODEL_TYPE_OPTIONS = [
  { value: 'CV', label: 'CV' },
  { value: 'NLP', label: 'NLP' },
  { value: 'POINT_CLOUD', label: '点云' },
  { value: 'ROBOT', label: 'ROBOT（预留）' },
] as const;

export type ModelTaskType = (typeof MODEL_TYPE_OPTIONS)[number]['value'];

export const MODEL_TYPE_VALUE_ENUM: Record<string, { text: string }> = {
  CV: { text: 'CV' },
  NLP: { text: 'NLP' },
  POINT_CLOUD: { text: '点云' },
  ROBOT: { text: 'ROBOT' },
};

export const MODEL_TYPE_COLORS: Record<string, string> = {
  CV: 'blue',
  NLP: 'green',
  POINT_CLOUD: 'purple',
  ROBOT: 'default',
};
