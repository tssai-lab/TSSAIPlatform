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
