import { request } from '@umijs/max';

export type DatasetAsset = {
  id: string;
  name: string;
  type?: string;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DatasetVersion = {
  id: string;
  assetId: string;
  version: string;
  fileName?: string;
  storagePath?: string;
  sizeBytes?: number;
  createdAt?: string;
};

export async function createDatasetAsset(body: Partial<DatasetAsset>, options?: { [key: string]: any }) {
  return request<{ data: DatasetAsset }>('/api/dataset-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function listDatasetAssets(options?: { [key: string]: any }) {
  return request<{ data: DatasetAsset[] }>('/api/dataset-assets', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function deleteDatasetAsset(id: string, options?: { [key: string]: any }) {
  return request('/api/dataset-assets/' + encodeURIComponent(id), {
    method: 'DELETE',
    ...(options || {}),
  });
}

export async function createDatasetVersion(body: Partial<DatasetVersion>, options?: { [key: string]: any }) {
  return request<{ data: DatasetVersion }>('/api/dataset-versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function listDatasetVersions(assetId?: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetVersion[] }>('/api/dataset-versions', {
    method: 'GET',
    params: assetId ? { assetId } : undefined,
    ...(options || {}),
  });
}

