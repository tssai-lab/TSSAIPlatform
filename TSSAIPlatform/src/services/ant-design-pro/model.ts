// 模型相关 API：上传到后端，由后端写入 MinIO
import { request } from '@umijs/max';

/** 分片上传初始化：后端分配 uploadId（用于 MinIO 多部分上传） POST /api/model/upload/init */
export async function modelUploadInit(params: API.ModelUploadInitParams, options?: { [key: string]: any }) {
  return request<{ data: API.ModelUploadInitResult }>('/api/model/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: params,
    ...(options || {}),
  });
}

/** 上传单个分片 POST /api/model/upload/chunk */
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
  return request<{ data?: { etag?: string } }>('/api/model/upload/chunk', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

/** 分片上传完成：后端合并分片并写入 MinIO、落库模型记录 POST /api/model/upload/complete */
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

/** 模型列表 GET /api/model/list */
export async function getModelList(options?: { [key: string]: any }) {
  return request<{ data: { data: API.ModelItem[]; total: number } }>('/api/model/list', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 模型详情 GET /api/model/detail?id= */
export async function getModelDetail(id: string, options?: { [key: string]: any }) {
  return request<{ data: API.ModelDetail }>('/api/model/detail', {
    method: 'GET',
    params: { id },
    ...(options || {}),
  });
}

/** 删除模型 DELETE /api/model/delete */
export async function deleteModel(id: string, options?: { [key: string]: any }) {
  return request<Record<string, any>>('/api/model/delete', {
    method: 'DELETE',
    params: { id },
    ...(options || {}),
  });
}
