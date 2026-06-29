/** 推理模块常量（对齐 docs/模型推理设计.md） */

export const INFERENCE_POLL_INTERVAL_MS = 5000;

export const INFERENCE_TASK_STATUS = {
  pending: { label: '待执行', color: 'default' },
  queued: { label: '排队中', color: 'warning' },
  running: { label: '运行中', color: 'processing' },
  success: { label: '已完成', color: 'success' },
  failed: { label: '失败', color: 'error' },
  stopped: { label: '已停止', color: 'default' },
} as const;

export const INFERENCE_ACTIVE_STATUSES: API.InferenceTaskStatus[] = [
  'pending',
  'queued',
  'running',
];

export const INFERENCE_TASK_TYPE = {
  CV: { label: 'CV', color: '#13c2c2' },
  NLP: { label: 'NLP', color: '#1890ff' },
  MULTIMODAL: { label: '多模态', color: '#722ed1' },
} as const;

export const INFERENCE_INPUT_MODE = {
  single: { label: '单文件' },
  batch: { label: '批量' },
} as const;

export const INFERENCE_TERMINAL_STATUSES: API.InferenceTaskStatus[] = [
  'success',
  'failed',
  'stopped',
];

export function isActiveInferenceStatus(
  status: API.InferenceTaskStatus,
): boolean {
  return INFERENCE_ACTIVE_STATUSES.includes(status);
}
