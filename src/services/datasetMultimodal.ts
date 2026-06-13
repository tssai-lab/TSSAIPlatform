import { request } from '@umijs/max';

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
