import type { CSSProperties } from 'react';

/** 在线推理页常量（默认参数、展示样式） */

/** 输出区等宽字体展示（与全局仅 inline style 的惯例一致） */
export const INFERENCE_OUTPUT_CONTENT_STYLE: CSSProperties = {
  fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, Menlo, monospace',
  fontSize: 13,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
};

export const INFERENCE_DEFAULT_PARAMS: API.InferenceParams = {
  confidence: 0.5,
  topK: 5,
  temperature: 0.7,
  maxTokens: 512,
  topP: 0.9,
};

/** 推理首页训练产出卡片每页条数 */
export const INFERENCE_CANDIDATES_PAGE_SIZE = 12;

/** 拉取成功训练任务时的分页大小（Service 层分批合并） */
export const INFERENCE_TASK_FETCH_PAGE_SIZE = 100;

/** 推理输入主 Tab */
export type InferenceInputMode = 'single' | 'batch' | 'custom';

export const INFERENCE_INPUT_MODE_TABS: {
  key: InferenceInputMode;
  label: string;
}[] = [
  { key: 'single', label: '单文件推理' },
  { key: 'batch', label: '批量文件推理' },
  { key: 'custom', label: '自定义推理脚本' },
];

/** CV 批量输入子 Tab */
export type CvBatchSubMode = 'files' | 'folder' | 'zip';

export const CV_BATCH_SUB_TABS: { key: CvBatchSubMode; label: string }[] = [
  { key: 'files', label: '多个文件' },
  { key: 'folder', label: '文件夹' },
  { key: 'zip', label: 'ZIP 压缩包' },
];

/** NLP 批量输入子 Tab */
export type NlpBatchSubMode = 'paste' | 'files' | 'folder' | 'zip';

export const NLP_BATCH_SUB_TABS: { key: NlpBatchSubMode; label: string }[] = [
  { key: 'paste', label: '批量粘贴文本' },
  { key: 'files', label: '多个文本文件' },
  { key: 'folder', label: '文件夹' },
  { key: 'zip', label: '压缩包' },
];

export const NLP_BATCH_TEXT_FILE_ACCEPT = '.txt,.csv,.jsonl';
export const CV_BATCH_IMAGE_ACCEPT = '.jpg,.jpeg,.png,.webp';
export const INFERENCE_SCRIPT_ACCEPT = '.py,.pyx,.ipynb,.txt,.sh';
