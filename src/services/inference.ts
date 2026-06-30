import { request } from '@umijs/max';

export type InferenceInputMode = 'SINGLE_OBJECT' | 'DATASET_VERSION';
export type InferenceTaskStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'success'
  | 'failed'
  | 'stopped';

export type InferenceScriptVersion = {
  id: string;
  assetId: string;
  scriptName: string;
  version: string;
  fileName?: string;
  storagePath?: string;
  sizeBytes?: number;
  runtime: 'PYTHON3' | string;
  entryFile: string;
  paramsSchema?: Record<string, unknown>;
  status?: string;
  ownerUserId?: number;
  createdAt?: string;
};

export type InferenceScriptUploadResult = {
  scriptAssetId: string;
  scriptVersionId: string;
  scriptName: string;
  version: string;
  fileName?: string;
  storagePath?: string;
  sizeBytes?: number;
  runtime: string;
  entryFile: string;
  paramsSchema?: Record<string, unknown>;
  status?: string;
};

export type InferenceTask = {
  id: string;
  name: string;
  modelVersionId: string;
  scriptVersionId: string;
  inputMode: InferenceInputMode | string;
  datasetVersionId?: string | null;
  inputObjectName?: string | null;
  params?: Record<string, unknown>;
  status: InferenceTaskStatus | string;
  progress?: number;
  result?: Record<string, unknown>;
  logPath?: string | null;
  outputPath?: string | null;
  errorMessage?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  remark?: string | null;
  ownerUserId?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type InferenceTaskResult = Pick<
  InferenceTask,
  'id' | 'status' | 'progress' | 'result' | 'logPath' | 'outputPath' | 'errorMessage'
>;

export type CreateInferenceTaskBody = {
  name: string;
  modelVersionId: string;
  scriptVersionId: string;
  inputMode: InferenceInputMode;
  datasetVersionId?: string;
  inputObjectName?: string;
  params?: Record<string, unknown>;
  remark?: string;
};

export type InferenceTaskPage = {
  data: InferenceTask[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export function formatBytes(sizeBytes?: number) {
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

export function objectNameFromMinioPath(path?: string | null) {
  if (!path) return '';
  const clean = path.trim();
  if (!clean) return '';
  if (!clean.startsWith('minio://')) return clean.replace(/^\/+/, '');
  const withoutScheme = clean.slice('minio://'.length).replace(/^\/+/, '');
  if (withoutScheme.startsWith('users/')) return withoutScheme;
  const parts = withoutScheme.split('/');
  if (parts.length > 1 && !parts[0].includes('.')) {
    const maybeBucket = parts[0];
    if (['models', 'tss-platform', 'default'].includes(maybeBucket)) {
      return parts.slice(1).join('/');
    }
  }
  return withoutScheme;
}

export async function uploadInferenceScript(
  body: {
    file: File;
    scriptName: string;
    version: string;
    runtime?: string;
    entryFile: string;
    paramsSchemaJson?: string;
    remark?: string;
  },
  options?: { [key: string]: unknown },
) {
  const formData = new FormData();
  formData.append('file', body.file);
  formData.append('scriptName', body.scriptName);
  formData.append('version', body.version || 'v1');
  formData.append('runtime', body.runtime || 'PYTHON3');
  formData.append('entryFile', body.entryFile);
  if (body.paramsSchemaJson?.trim()) {
    formData.append('paramsSchemaJson', body.paramsSchemaJson.trim());
  }
  if (body.remark?.trim()) {
    formData.append('remark', body.remark.trim());
  }
  return request<{ data: InferenceScriptUploadResult }>('/inference/scripts/upload', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

export async function listInferenceScripts(options?: { [key: string]: unknown }) {
  return request<{ data: InferenceScriptVersion[] }>('/inference/scripts', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getInferenceScript(versionId: string, options?: { [key: string]: unknown }) {
  return request<{ data: InferenceScriptVersion }>(
    `/inference/scripts/${encodeURIComponent(versionId)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

export async function createInferenceTask(
  body: CreateInferenceTaskBody,
  options?: { [key: string]: unknown },
) {
  return request<{ data: InferenceTask }>('/inference/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function listInferenceTasks(
  params?: { page?: number; pageSize?: number; status?: string },
  options?: { [key: string]: unknown },
) {
  return request<{ data: InferenceTaskPage }>('/inference/tasks', {
    method: 'GET',
    params,
    ...(options || {}),
  });
}

export async function getInferenceTask(id: string, options?: { [key: string]: unknown }) {
  return request<{ data: InferenceTask }>(`/inference/tasks/${encodeURIComponent(id)}`, {
    method: 'GET',
    ...(options || {}),
  });
}

export async function stopInferenceTask(id: string, options?: { [key: string]: unknown }) {
  return request<{ data: InferenceTask }>(
    `/inference/tasks/${encodeURIComponent(id)}/stop`,
    {
      method: 'POST',
      ...(options || {}),
    },
  );
}

export async function getInferenceTaskResult(
  id: string,
  options?: { [key: string]: unknown },
) {
  return request<{ data: InferenceTaskResult }>(
    `/inference/tasks/${encodeURIComponent(id)}/result`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}
