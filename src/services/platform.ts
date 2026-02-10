/**
 * 平台业务接口（模型、数据集、训练任务）
 * 与 TSSAIPlatform-frontend-prototype 设计对齐
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';

/** 获取模型列表（用于发起训练选择） */
export async function fetchModelList(options?: { current?: number; pageSize?: number; name?: string; type?: string }) {
  return request<{ data: API.ModelItem[]; success: boolean; total: number }>(API_CONFIG.ENDPOINTS.MODEL_LIST, {
    method: 'GET',
    params: options,
  });
}

/** 获取数据集列表（用于发起训练选择） */
export async function fetchDatasetList(options?: {
  current?: number;
  pageSize?: number;
  name?: string;
  type?: string;
}) {
  return request<{ data: API.DatasetItem[]; success: boolean; total: number }>(API_CONFIG.ENDPOINTS.DATASET_LIST, {
    method: 'GET',
    params: options,
  });
}

/** 创建训练任务（表单参数） */
export async function createTaskWithParams(params: {
  modelId: string;
  datasetId: string;
  params: Record<string, unknown>;
}) {
  return request<{ success: boolean; data?: { taskId: string } }>(API_CONFIG.ENDPOINTS.TASK_CREATE, {
    method: 'POST',
    data: { ...params, paramsMode: 'form' },
  });
}

/** 创建训练任务（上传训练代码） */
export async function createTaskWithTrainingCode(params: {
  modelId: string;
  datasetId: string;
  trainingCodeFile: File;
}) {
  const formData = new FormData();
  formData.append('modelId', params.modelId);
  formData.append('datasetId', params.datasetId);
  formData.append('paramsMode', 'upload');
  formData.append('trainingCode', params.trainingCodeFile);
  return request<{ success: boolean; data?: { taskId: string } }>(API_CONFIG.ENDPOINTS.TASK_CREATE, {
    method: 'POST',
    data: formData,
    requestType: 'form',
  });
}
