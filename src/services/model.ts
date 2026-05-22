import { request } from '@umijs/max';

type BackendModelItem = {
  id: string;
  assetId?: string;
  name: string;
  version: string;
  type: 'CV' | 'NLP';
  remark?: string;
  storagePath?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
};

function formatBytes(sizeBytes?: number) {
  if (sizeBytes === undefined || sizeBytes === null || Number.isNaN(sizeBytes)) {
    return '-';
  }
  if (sizeBytes < 1024) {
    return `${sizeBytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = sizeBytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(2)} ${units[unitIndex]}`;
}

function toUnixTimestamp(value?: string) {
  if (!value) {
    return undefined;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return String(Math.floor(timestamp / 1000));
}

function mapModelItem(item?: BackendModelItem): API.ModelItem | undefined {
  if (!item) {
    return undefined;
  }
  return {
    id: item.id,
    assetId: item.assetId,
    name: item.name,
    version: item.version,
    type: item.type,
    remark: item.remark,
    storagePath: item.storagePath,
    sizeBytes: item.sizeBytes,
    size: formatBytes(item.sizeBytes),
    uploadTime: item.createdAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

export async function modelUploadInit(params: API.ModelUploadInitParams, options?: { [key: string]: any }) {
  return request<{ data: API.ModelUploadInitResult }>('/model/upload/init', {
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
  return request<{ data: API.ModelUploadInitResult }>('/model/upload/chunk', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

export async function modelUploadProgress(uploadId: string, options?: { [key: string]: any }) {
  return request<{ data: API.ModelUploadInitResult }>('/model/upload/progress', {
    method: 'GET',
    params: { uploadId },
    ...(options || {}),
  });
}

export async function modelUploadComplete(
  params: API.ModelUploadCompleteParams,
  options?: { [key: string]: any },
) {
  return request<{ data: BackendModelItem }>('/model/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: params,
    ...(options || {}),
  });
}

export async function getModelList(options?: { [key: string]: any }) {
  return request<{ data: { data: BackendModelItem[]; total: number } }>('/model/list', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getModelDetail(id: string, options?: { [key: string]: any }) {
  return request<{ data: BackendModelItem }>('/model/detail', {
    method: 'GET',
    params: { id },
    ...(options || {}),
  });
}

export async function listModelCodeFiles(id: string, options?: { [key: string]: any }) {
  return request<{ data: API.ModelCodeFile[] }>('/model/code-files', {
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
  return request<{ data: API.ModelCodePreview }>('/model/previewCode', {
    method: 'GET',
    params: { id, path },
    ...(options || {}),
  });
}

export async function deleteModel(id: string, options?: { [key: string]: any }) {
  return request<Record<string, any>>('/model/delete', {
    method: 'DELETE',
    params: { id },
    ...(options || {}),
  });
}

export async function fetchModelList(options?: {
  current?: number;
  pageSize?: number;
  name?: string;
  type?: string;
}) {
  const res = await getModelList(options);
  const inner = res?.data;
  const list = (inner?.data ?? [])
    .map((item) => mapModelItem(item))
    .filter((item): item is API.ModelItem => Boolean(item));
  const total = inner?.total ?? list.length;
  return { data: list, total };
}

export async function fetchModelDetail(id: string, options?: { [key: string]: any }) {
  const detailRes = await getModelDetail(id, options);
  const base = mapModelItem(detailRes?.data);
  if (!base) {
    return { data: undefined };
  }

  const updateTime = base.updatedAt ?? base.createdAt;
  const detail: API.ModelDetail = {
    ...base,
    updateTime,
    timestamp: toUnixTimestamp(updateTime),
    versionHistory: [
      {
        version: base.version,
        updateTime: updateTime ?? '',
        timestamp: toUnixTimestamp(updateTime) ?? '',
      },
    ],
  };

  try {
    const codeFilesRes = await listModelCodeFiles(id, options);
    const codeFiles = codeFilesRes?.data ?? [];
    detail.codeFiles = codeFiles;
    if (codeFiles.length > 0 && codeFiles[0].path) {
      const previewRes = await previewModelCode(id, codeFiles[0].path, options);
      if (previewRes?.data?.content) {
        detail.codeContent = previewRes.data.content;
        detail.codeFileName = previewRes.data.fileName || codeFiles[0].fileName || codeFiles[0].path;
        detail.codeFilePath = previewRes.data.path || codeFiles[0].path;
      }
    }
  } catch {
    detail.codeFiles = [];
  }

  return { data: detail };
}
