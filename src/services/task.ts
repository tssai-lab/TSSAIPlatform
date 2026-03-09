/**
 * 任务模块 - Services 层
 * 封装训练任务相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';

/** 获取任务列表 */
export async function fetchTaskList(options?: {
  current?: number;
  pageSize?: number;
  status?: string;
}) {
  return request<{ code: number; message: string; data: API.TaskItem[]; total?: number }>(
    API_CONFIG.ENDPOINTS.TASK_LIST,
    {
      method: 'GET',
      params: options,
    },
  );
}

/** 获取任务详情 */
export async function fetchTaskDetail(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.TaskItem }>(
    API_CONFIG.ENDPOINTS.TASK_DETAIL,
    {
      method: 'GET',
      params: { id },
      ...(options || {}),
    },
  );
}

/** 创建训练任务（表单参数） */
export async function createTaskWithParams(params: {
  name?: string;
  modelId: string;
  datasetId: string;
  params: Record<string, unknown>;
}) {
  return request<{ code: number; message: string; data?: { taskId: string } }>(
    API_CONFIG.ENDPOINTS.TASK_CREATE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { ...params, paramsMode: 'form' },
    },
  );
}

/** 创建训练任务（上传训练代码） */
export async function createTaskWithTrainingCode(params: {
  name?: string;
  modelId: string;
  datasetId: string;
  trainingCodeFile: File;
}) {
  const formData = new FormData();
  if (params.name) formData.append('name', params.name);
  formData.append('modelId', params.modelId);
  formData.append('datasetId', params.datasetId);
  formData.append('paramsMode', 'upload');
  formData.append('trainingCode', params.trainingCodeFile);
  return request<{ code: number; message: string; data?: { taskId: string } }>(
    API_CONFIG.ENDPOINTS.TASK_CREATE,
    {
      method: 'POST',
      data: formData,
      requestType: 'form',
    },
  );
}

/** 终止任务 */
export async function stopTask(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data?: any }>(
    API_CONFIG.ENDPOINTS.TASK_STOP,
    {
      method: 'POST',
      params: { id },
      ...(options || {}),
    },
  );
}

/** 删除任务 */
export async function deleteTask(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data?: any }>(
    API_CONFIG.ENDPOINTS.TASK_DELETE,
    {
      method: 'DELETE',
      params: { id },
      ...(options || {}),
    },
  );
}
