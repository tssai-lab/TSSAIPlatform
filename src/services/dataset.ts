/**
 * 数据集模块 - Services 层
 * 封装数据集相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';

/** 获取数据集列表 */
export async function fetchDatasetList(options?: {
  current?: number;
  pageSize?: number;
  name?: string;
  type?: string;
}) {
  return request<{ code: number; message: string; data: API.DatasetItem[]; total?: number }>(
    API_CONFIG.ENDPOINTS.DATASET_LIST,
    {
      method: 'GET',
      params: options,
    },
  );
}

/** 获取数据集详情 */
export async function fetchDatasetDetail(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: API.DatasetItem }>(
    API_CONFIG.ENDPOINTS.DATASET_DETAIL,
    {
      method: 'GET',
      params: { id },
      ...(options || {}),
    },
  );
}

/** 上传数据集 */
export async function uploadDataset(params: { name: string; files: File[] }, options?: { [key: string]: any }) {
  const formData = new FormData();
  params.files.forEach((f) => formData.append('files', f));
  formData.append('name', params.name);
  return request<{ code: number; message: string; data?: any }>(
    API_CONFIG.ENDPOINTS.DATASET_UPLOAD,
    {
      method: 'POST',
      data: formData,
      requestType: 'form',
      ...(options || {}),
    },
  );
}

/** 删除数据集 */
export async function deleteDataset(id: string, options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data?: any }>(
    API_CONFIG.ENDPOINTS.DATASET_DELETE,
    {
      method: 'DELETE',
      params: { id },
      ...(options || {}),
    },
  );
}
