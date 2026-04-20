import { request } from '@umijs/max';

export async function modelUploadInit(params: API.ModelUploadInitParams, options?: { [key: string]: any }) {
  return request<{ data: API.ModelUploadInitResult }>('/api/model/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: params,
    ...(options || {}),
  });
}

export async function modelUploadChunk(
  uploadId: string,
  partIndex: number,
  chunk: Blob,
  options?: { [key: string]: any },
) {
  const formData = new FormData();
  formData.append('uploadId', uploadId);
  formData.append('partIndex', String(partIndex));
  formData.append('file', chunk);
  return request<{ data: API.ModelUploadInitResult }>('/api/model/upload/chunk', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

export async function modelUploadProgress(uploadId: string, options?: { [key: string]: any }) {
  return request<{ data: API.ModelUploadInitResult }>('/api/model/upload/progress', {
    method: 'GET',
    params: { uploadId },
    ...(options || {}),
  });
}

export async function modelUploadComplete(
  params: API.ModelUploadCompleteParams,
  options?: { [key: string]: any },
) {
  return request<{ data: API.ModelItem }>('/api/model/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: params,
    ...(options || {}),
  });
}

export async function getModelList(options?: { [key: string]: any }) {
  return request<{ data: { data: API.ModelItem[]; total: number } }>('/api/model/list', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getModelDetail(id: string, options?: { [key: string]: any }) {
  return request<{ data: API.ModelDetail }>('/api/model/detail', {
    method: 'GET',
    params: { id },
    ...(options || {}),
  });
}

export async function listModelCodeFiles(id: string, options?: { [key: string]: any }) {
  return request<{ data: API.ModelCodeFile[] }>('/api/model/code-files', {
    method: 'GET',
    params: { id },
    ...(options || {}),
  });
}

export async function previewModelCode(
  id: string,
  path: string,
  options?: { [key: string]: any },
) {
  return request<{ data: API.ModelCodePreview }>('/api/model/previewCode', {
    method: 'GET',
    params: { id, path },
    ...(options || {}),
  });
}

export async function deleteModel(id: string, options?: { [key: string]: any }) {
  return request<Record<string, any>>('/api/model/delete', {
    method: 'DELETE',
    params: { id },
    ...(options || {}),
  });
}
