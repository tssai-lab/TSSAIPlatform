/** 模型目录类型。POINT_CLOUD/ROBOT 为历史兼容展示，新上传入口只开放 CV/NLP/OTHER。 */
export const MODEL_TYPE_OPTIONS = [
  { value: 'CV', label: 'CV' },
  { value: 'NLP', label: 'NLP' },
  { value: 'POINT_CLOUD', label: '点云' },
  { value: 'ROBOT', label: 'ROBOT（预留）' },
  { value: 'OTHER', label: '其他（暂未归类）' },
] as const;

export type ModelTaskType = (typeof MODEL_TYPE_OPTIONS)[number]['value'];

export const MODEL_TYPE_VALUE_ENUM: Record<string, { text: string }> = {
  CV: { text: 'CV' },
  NLP: { text: 'NLP' },
  POINT_CLOUD: { text: '点云' },
  ROBOT: { text: 'ROBOT' },
  OTHER: { text: '其他' },
};

export const MODEL_TYPE_COLORS: Record<string, string> = {
  CV: 'blue',
  NLP: 'green',
  POINT_CLOUD: 'purple',
  ROBOT: 'default',
  OTHER: 'default',
};
