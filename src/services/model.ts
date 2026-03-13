/**
 * 模型模块 - Services 层
 * 封装模型相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';

/** 获取模型列表 */
export async function fetchModelList(options?: {
  current?: number;
  pageSize?: number;
  name?: string;
  type?: string;
}) {
  return request<{ code: number; message: string; data: API.ModelItem[]; total?: number }>(
    API_CONFIG.ENDPOINTS.MODEL_LIST,
    {
      method: 'GET',
      params: options,
    },
  );
}

/** 获取模型详情 */
export async function fetchModelDetail(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.ModelItem }>(
    API_CONFIG.ENDPOINTS.MODEL_DETAIL,
    {
      method: 'GET',
      params: { id },
      ...(options || {}),
    },
  );
}

/** 分片上传初始化 */
export async function modelUploadInit(
  params: { fileName: string; fileSize: number },
  options?: { [key: string]: any },
) {
  return request<{ code: number; message: string; data: { uploadId: string; chunkSize?: number } }>(
    API_CONFIG.ENDPOINTS.MODEL_UPLOAD_INIT,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: params,
      ...(options || {}),
    },
  );
}

/** 上传单个分片 */
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
  return request<{ code: number; message: string; data?: { etag?: string } }>(
    API_CONFIG.ENDPOINTS.MODEL_UPLOAD_CHUNK,
    {
      method: 'POST',
      data: formData,
      ...(options || {}),
    },
  );
}

/** 分片上传完成 */
export async function modelUploadComplete(
  params: { uploadId: string; modelName: string; version: string; type: string; remark: string },
  options?: { [key: string]: any },
) {
  return request<{ code: number; message: string; data: API.ModelItem }>(
    API_CONFIG.ENDPOINTS.MODEL_UPLOAD_COMPLETE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: params,
      ...(options || {}),
    },
  );
}

/** 删除模型 */
export async function deleteModel(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data?: any }>(
    API_CONFIG.ENDPOINTS.MODEL_DELETE,
    {
      method: 'DELETE',
      params: { id },
      ...(options || {}),
    },
  );
}
