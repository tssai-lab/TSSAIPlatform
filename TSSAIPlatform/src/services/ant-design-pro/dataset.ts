import { request } from '@umijs/max';

export type TaskType = 'CV' | 'NLP';

export type DatasetAsset = {
  id: string;
  name: string;
  type?: TaskType;
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
  remark?: string;
  createdAt?: string;
};

export type DatasetListItem = {
  id: string;
  assetId: string;
  name: string;
  type: TaskType;
  remark?: string;
  versionId?: string;
  version?: string;
  fileName?: string;
  storagePath?: string;
  size?: string;
  sizeBytes?: number;
  versionRemark?: string;
  fileCount: number;
  uploadTime?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DatasetUploadInitParams = {
  fileName: string;
  fileSize: number;
  fileFingerprint?: string;
  datasetName: string;
  version?: string;
  type: TaskType;
  remark?: string;
};

export type DatasetUploadProgress = {
  uploadId: string;
  status: 'UPLOADING' | 'COMPLETED' | string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  uploadedChunks: number;
  uploadedBytes: number;
  uploadedPartIndexes: number[];
  storagePath?: string;
  assetId?: string;
  versionId?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DatasetUploadCompleteResult = {
  uploadId: string;
  id: string;
  assetId: string;
  name: string;
  version: string;
  type: TaskType;
  remark?: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  status: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DatasetFolderUploadParams = {
  datasetName: string;
  version?: string;
  type: 'CV';
  remark?: string;
  files: File[];
  paths: string[];
};

export type DatasetDeleteResult = {
  id: string;
  deletedVersions: number;
  deletedObjects: number;
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

export async function getDatasetAsset(id: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetAsset }>('/api/dataset-assets/' + encodeURIComponent(id), {
    method: 'GET',
    ...(options || {}),
  });
}

export async function deleteDatasetAsset(id: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetDeleteResult }>('/api/dataset-assets/' + encodeURIComponent(id), {
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

export async function getDatasetList(params?: { type?: TaskType }, options?: { [key: string]: any }) {
  return request<{ data: { data: DatasetListItem[]; total: number } }>('/api/dataset/list', {
    method: 'GET',
    params,
    ...(options || {}),
  });
}

export async function datasetUploadInit(
  body: DatasetUploadInitParams,
  options?: { [key: string]: any },
) {
  return request<{ data: DatasetUploadProgress }>('/api/dataset/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function datasetUploadChunk(
  uploadId: string,
  partIndex: number,
  chunk: Blob,
  options?: { [key: string]: any },
) {
  const formData = new FormData();
  formData.append('uploadId', uploadId);
  formData.append('partIndex', String(partIndex));
  formData.append('file', chunk);
  return request<{ data: DatasetUploadProgress }>('/api/dataset/upload/chunk', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

export async function datasetUploadProgress(uploadId: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetUploadProgress }>('/api/dataset/upload/progress', {
    method: 'GET',
    params: { uploadId },
    ...(options || {}),
  });
}

export async function datasetUploadComplete(uploadId: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetUploadCompleteResult }>('/api/dataset/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { uploadId },
    ...(options || {}),
  });
}

export async function datasetUploadFolder(
  body: DatasetFolderUploadParams,
  options?: { [key: string]: any },
) {
  const formData = new FormData();
  formData.append('datasetName', body.datasetName);
  formData.append('version', body.version || 'v1');
  formData.append('type', body.type);
  if (body.remark) {
    formData.append('remark', body.remark);
  }
  body.files.forEach((file, index) => {
    const relativePath = body.paths[index] || file.name;
    formData.append('files', file, file.name);
    formData.append('paths', relativePath);
  });
  return request<{ data: DatasetUploadCompleteResult }>('/api/dataset/upload/folder', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}
