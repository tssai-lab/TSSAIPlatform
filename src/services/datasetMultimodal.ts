import { request } from '@umijs/max';
import {
  datasetUploadChunk,
  type DatasetUploadProgress,
  type MultimodalSampleGrouping,
} from '@/services/dataset';

const DEFAULT_CHUNK = 5 * 1024 * 1024;

export type { MultimodalSampleGrouping };

/** 多模态导入任务状态 */
export type MultimodalImportStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCESS'
  | 'FAILED';

export type MultimodalImportJob = {
  importJobId: string;
  datasetVersionId: string;
  status: MultimodalImportStatus;
  progress: number;
  totalSamples?: number | null;
  importedSamples: number;
  errorMessage?: string | null;
  createdAt?: string;
  startedAt?: string | null;
  finishedAt?: string | null;
};

export type MultimodalSampleSummary = {
  sampleId: string;
  datasetVersionId: string;
  externalId?: string;
  sampleIndex: number;
  tags?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  deleted?: boolean;
  createdAt?: string;
};

export type MultimodalSampleDataType =
  | 'IMAGE'
  | 'TEXT'
  | 'VIDEO'
  | 'AUDIO'
  | 'POINT_CLOUD'
  | 'OTHER';

export type MultimodalSampleDataItem = {
  sampleDataId: string;
  dataType: MultimodalSampleDataType;
  sensor?: string;
  channel?: string;
  seq?: number;
  format?: string;
  fileName?: string;
  sizeBytes?: number;
  checksum?: string | null;
  contentType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  /** consumer-manifest 提供的固定预览/下载链接 */
  previewUrl?: string;
  downloadUrl?: string;
};

export type MultimodalSampleAnnotation = {
  annotationId: string;
  sampleDataId?: string;
  annotationType?: string;
  format?: string;
  fileName?: string;
  sizeBytes?: number;
  checksum?: string | null;
  contentType?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  downloadUrl?: string;
};

export type MultimodalSampleDetail = MultimodalSampleSummary & {
  data: MultimodalSampleDataItem[];
  annotations: MultimodalSampleAnnotation[];
};

export type MultimodalSamplesPage = {
  data: MultimodalSampleSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

/** POST /api/dataset-samples/import/{importJobId}/retry?mode=FULL */
export async function retryMultimodalImport(
  importJobId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ success?: boolean; data?: MultimodalImportJob }>(
    `/dataset-samples/import/${encodeURIComponent(importJobId)}/retry`,
    {
      method: 'POST',
      params: { mode: 'FULL' },
      ...(options || {}),
    },
  );
}

export type ConsumerManifestSample = MultimodalSampleSummary & {
  data: MultimodalSampleDataItem[];
  annotations: MultimodalSampleAnnotation[];
};

export type ConsumerManifestPage = {
  datasetVersionId: string;
  datasetId?: string;
  type?: string;
  versionLabel?: string;
  status?: string;
  page: number;
  pageSize: number;
  totalSamples: number;
  samples: ConsumerManifestSample[];
};

/** GET /api/v2/dataset-versions/{versionId}/consumer-manifest */
export async function fetchConsumerManifest(
  versionId: string,
  params?: { page?: number; pageSize?: number },
  options?: { [key: string]: unknown },
) {
  return request<ConsumerManifestPage>(
    `/v2/dataset-versions/${encodeURIComponent(versionId)}/consumer-manifest`,
    {
      method: 'GET',
      params,
      ...(options || {}),
    },
  );
}

/** GET /api/dataset-samples/import/{importJobId}/status */
export async function fetchMultimodalImportStatus(
  importJobId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ data: MultimodalImportJob }>(
    `/dataset-samples/import/${encodeURIComponent(importJobId)}/status`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** GET /api/dataset-versions/{versionId}/samples */
export async function fetchMultimodalSamples(
  versionId: string,
  params?: { page?: number; pageSize?: number },
  options?: { [key: string]: unknown },
) {
  return request<{ data: MultimodalSamplesPage }>(
    `/dataset-versions/${encodeURIComponent(versionId)}/samples`,
    {
      method: 'GET',
      params,
      ...(options || {}),
    },
  );
}

/** GET /api/dataset-samples/{sampleId} */
export async function fetchMultimodalSampleDetail(
  sampleId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ data: MultimodalSampleDetail }>(
    `/dataset-samples/${encodeURIComponent(sampleId)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** GET /api/dataset-sample-data/{dataId}/preview */
export async function fetchMultimodalDataPreview(
  dataId: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/dataset-sample-data/${encodeURIComponent(dataId)}/preview`,
    {
      method: 'GET',
      responseType: 'blob',
      ...(options || {}),
    },
  );
}

/** GET /api/dataset-sample-data/{dataId}/download */
export async function fetchMultimodalDataDownload(
  dataId: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/dataset-sample-data/${encodeURIComponent(dataId)}/download`,
    {
      method: 'GET',
      responseType: 'blob',
      ...(options || {}),
    },
  );
}

/** GET /api/dataset-annotations/{annotationId}/download */
export async function fetchMultimodalAnnotationDownload(
  annotationId: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/dataset-annotations/${encodeURIComponent(annotationId)}/download`,
    {
      method: 'GET',
      responseType: 'blob',
      ...(options || {}),
    },
  );
}

export function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName || 'download';
  anchor.click();
  URL.revokeObjectURL(url);
}

export const MULTIMODAL_DATA_TYPE_LABEL: Record<MultimodalSampleDataType, string> =
  {
    IMAGE: '图片',
    TEXT: '文本',
    VIDEO: '视频',
    AUDIO: '音频',
    POINT_CLOUD: '点云',
    OTHER: '其它',
  };

export const MULTIMODAL_IMPORT_STATUS_LABEL: Record<
  MultimodalImportStatus,
  string
> = {
  PENDING: '等待导入',
  RUNNING: '导入中',
  SUCCESS: '导入成功',
  FAILED: '导入失败',
};

export type CreateWorkspaceDraftResult = {
  draftVersionId: string;
  parentVersionId: string;
  datasetAssetId: string;
  versionNo: number;
  status: string;
  currentVersionId: string;
  message?: string;
};

export type PublishDraftResult = {
  datasetVersionId: string;
  datasetAssetId: string;
  versionNo?: number;
  status: string;
  currentVersionId?: string;
  message?: string;
};

export type DraftPackageCompleteResult = {
  packageId?: string;
  packageRole?: string;
  packageOrder?: number;
  importJobId?: string;
  status?: string;
};

/** POST /api/dataset-versions/{readyVersionId}/draft */
export async function createWorkspaceDraft(
  readyVersionId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ success?: boolean; data: CreateWorkspaceDraftResult }>(
    `/dataset-versions/${encodeURIComponent(readyVersionId)}/draft`,
    { method: 'POST', ...(options || {}) },
  );
}

/** POST /api/dataset-versions/{draftVersionId}/publish */
export async function publishDraftVersion(
  draftVersionId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ success?: boolean; data: PublishDraftResult }>(
    `/dataset-versions/${encodeURIComponent(draftVersionId)}/publish`,
    { method: 'POST', ...(options || {}) },
  );
}

/** GET /api/dataset-versions/{draftVersionId}/workspace/samples */
export async function fetchWorkspaceSamples(
  draftVersionId: string,
  params?: { page?: number; pageSize?: number; includeDeleted?: boolean },
  options?: { [key: string]: unknown },
) {
  return request<{ data: MultimodalSamplesPage }>(
    `/dataset-versions/${encodeURIComponent(draftVersionId)}/workspace/samples`,
    {
      method: 'GET',
      params,
      ...(options || {}),
    },
  );
}

/** GET /api/dataset-samples/{sampleId}/workspace */
export async function fetchWorkspaceSampleDetail(
  sampleId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ data: MultimodalSampleDetail }>(
    `/dataset-samples/${encodeURIComponent(sampleId)}/workspace`,
    { method: 'GET', ...(options || {}) },
  );
}

/** DELETE /api/dataset-samples/{sampleId}/workspace */
export async function deleteWorkspaceSample(
  sampleId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ success?: boolean }>(
    `/dataset-samples/${encodeURIComponent(sampleId)}/workspace`,
    { method: 'DELETE', ...(options || {}) },
  );
}

/** POST /api/dataset-samples/{sampleId}/workspace/restore */
export async function restoreWorkspaceSample(
  sampleId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ success?: boolean }>(
    `/dataset-samples/${encodeURIComponent(sampleId)}/workspace/restore`,
    { method: 'POST', ...(options || {}) },
  );
}

/** POST /api/dataset-versions/{draftVersionId}/packages/init */
export async function draftPackageUploadInit(
  draftVersionId: string,
  body: {
    fileName: string;
    fileSize: number;
    fileFingerprint?: string;
    sampleGrouping?: MultimodalSampleGrouping;
    manifestPath?: string;
  },
  options?: { [key: string]: unknown },
) {
  return request<{ data: DatasetUploadProgress }>(
    `/dataset-versions/${encodeURIComponent(draftVersionId)}/packages/init`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      ...(options || {}),
    },
  );
}

/** POST /api/dataset-versions/{draftVersionId}/packages/complete */
export async function draftPackageUploadComplete(
  draftVersionId: string,
  uploadId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ data: DraftPackageCompleteResult }>(
    `/dataset-versions/${encodeURIComponent(draftVersionId)}/packages/complete`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { uploadId },
      ...(options || {}),
    },
  );
}

/** 追加上传 ZIP 到 DRAFT 工作区（init → chunk → complete） */
export async function uploadDraftAppendPackage(
  draftVersionId: string,
  file: File,
  params?: {
    sampleGrouping?: MultimodalSampleGrouping;
    manifestPath?: string;
    fileFingerprint?: string;
    onProgress?: (percent: number) => void;
  },
  options?: { [key: string]: unknown },
) {
  const fp =
    params?.fileFingerprint ||
    [file.name, String(file.size), draftVersionId, 'append'].join('|');
  const initBody: {
    fileName: string;
    fileSize: number;
    fileFingerprint?: string;
    sampleGrouping?: MultimodalSampleGrouping;
    manifestPath?: string;
  } = {
    fileName: file.name,
    fileSize: file.size,
    fileFingerprint: fp,
  };
  if (params?.sampleGrouping) {
    initBody.sampleGrouping = params.sampleGrouping;
    if (params?.manifestPath) {
      initBody.manifestPath = params.manifestPath;
    }
  }
  const initRes = await draftPackageUploadInit(
    draftVersionId,
    initBody,
    options,
  );
  const progress = initRes?.data;
  const uploadId = progress?.uploadId;
  if (!uploadId) {
    throw new Error('初始化追加包上传失败');
  }
  const chunkSize =
    progress.chunkSize > 0 ? progress.chunkSize : DEFAULT_CHUNK;
  const totalChunks =
    progress.totalChunks > 0
      ? progress.totalChunks
      : Math.max(1, Math.ceil(file.size / chunkSize));
  const done = new Set(progress.uploadedPartIndexes ?? []);
  let uploadedCount = done.size;
  for (let partIndex = 0; partIndex < totalChunks; partIndex += 1) {
    if (done.has(partIndex)) {
      continue;
    }
    const start = partIndex * chunkSize;
    const end = Math.min(start + chunkSize, file.size);
    await datasetUploadChunk(uploadId, partIndex, file.slice(start, end), options);
    uploadedCount += 1;
    params?.onProgress?.(
      Math.min(100, Math.round((uploadedCount / totalChunks) * 100)),
    );
  }
  params?.onProgress?.(100);
  return draftPackageUploadComplete(draftVersionId, uploadId, options);
}
