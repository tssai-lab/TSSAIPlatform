/**
 * 模型推理 - Services 层
 * 优先请求真实接口，失败时 fallback Mock
 * @see docs/模型推理设计.md §7
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';
import {
  mockCreateInferenceTask,
  mockDeleteInferenceTask,
  mockFetchInferenceModels,
  mockFetchInferenceTaskDetail,
  mockFetchInferenceTaskList,
  mockFetchInferenceTaskStats,
  mockStopInferenceTask,
  mockUploadInferenceInput,
  mockUploadInferenceScript,
} from '@/constants/inference/mockData';
import { mockInferenceParamSchema } from '@/constants/inference/inferenceParamSchema';

const { ENDPOINTS } = API_CONFIG;

export async function fetchInferenceTaskStats(options?: { skipErrorHandler?: boolean }) {
  try {
    return await request<{ success: boolean; data: API.InferenceTaskStats }>(
      ENDPOINTS.INFERENCE_TASK_STATS,
      { method: 'GET', ...(options || {}) },
    );
  } catch {
    return mockFetchInferenceTaskStats();
  }
}

export async function fetchInferenceTaskList(
  params?: {
    current?: number;
    pageSize?: number;
    status?: string;
    keyword?: string;
  },
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<{
      success: boolean;
      data: { data: API.InferenceTaskListItem[]; total: number };
    }>(ENDPOINTS.INFERENCE_TASK_LIST, {
      method: 'GET',
      params,
      ...(options || {}),
    });
  } catch {
    return mockFetchInferenceTaskList(params);
  }
}

export async function fetchInferenceTaskDetail(
  id: string,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<{ success: boolean; data: API.InferenceTaskDetail }>(
      ENDPOINTS.INFERENCE_TASK_DETAIL(id),
      { method: 'GET', ...(options || {}) },
    );
  } catch {
    const mock = mockFetchInferenceTaskDetail(id);
    if (!mock) throw new Error('推理任务不存在');
    return mock;
  }
}

export async function createInferenceTask(
  body: API.CreateInferenceTaskRequest,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<{ success: boolean; data: API.InferenceTaskDetail }>(
      ENDPOINTS.INFERENCE_TASK_CREATE,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: body,
        ...(options || {}),
      },
    );
  } catch {
    return mockCreateInferenceTask(body);
  }
}

export async function deleteInferenceTask(
  id: string,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<{ success: boolean; data: API.InferenceTaskDeleteResult }>(
      ENDPOINTS.INFERENCE_TASK_DELETE(id),
      { method: 'DELETE', ...(options || {}) },
    );
  } catch {
    return mockDeleteInferenceTask(id);
  }
}

export async function stopInferenceTask(
  id: string,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<{ success: boolean; data: API.InferenceTaskDetail }>(
      ENDPOINTS.INFERENCE_TASK_STOP(id),
      { method: 'POST', ...(options || {}) },
    );
  } catch {
    return mockStopInferenceTask(id);
  }
}

/** 可推理模型 — 创建页唯一模型数据源 */
export async function fetchInferenceModels(
  params?: {
    current?: number;
    pageSize?: number;
    taskType?: string;
    keyword?: string;
  },
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<{
      success: boolean;
      data: { data: API.InferenceModelOption[]; total: number };
    }>(ENDPOINTS.INFERENCE_MODEL_LIST, {
      method: 'GET',
      params,
      ...(options || {}),
    });
  } catch {
    return mockFetchInferenceModels(params);
  }
}

/** 推理专用上传 — 禁止 /files/upload */
export async function uploadInferenceInput(
  file: File,
  taskType: API.InferenceTaskType,
  options?: { skipErrorHandler?: boolean },
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('taskType', taskType);
  try {
    return await request<{ success: boolean; data: API.InferenceInputUploadResult }>(
      ENDPOINTS.INFERENCE_INPUT_UPLOAD,
      {
        method: 'POST',
        data: formData,
        requestType: 'form',
        ...(options || {}),
      },
    );
  } catch {
    return mockUploadInferenceInput(file);
  }
}

export async function fetchInferenceParamSchema(
  taskType: API.InferenceTaskType,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<{ success: boolean; data: API.InferenceParamSchema }>(
      ENDPOINTS.INFERENCE_PARAM_SCHEMA,
      { method: 'GET', params: { taskType }, ...(options || {}) },
    );
  } catch {
    return mockInferenceParamSchema(taskType);
  }
}

/** 自定义推理脚本上传 — 禁止 /files/upload */
export async function uploadInferenceScript(
  file: File,
  taskType: API.InferenceTaskType,
  options?: { skipErrorHandler?: boolean },
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('taskType', taskType);
  try {
    return await request<{ success: boolean; data: API.InferenceScriptUploadResult }>(
      ENDPOINTS.INFERENCE_SCRIPT_UPLOAD,
      {
        method: 'POST',
        data: formData,
        requestType: 'form',
        ...(options || {}),
      },
    );
  } catch {
    return mockUploadInferenceScript(file);
  }
}
