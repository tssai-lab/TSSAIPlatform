import { request } from '@umijs/max';
import type { DatasetListItem, DatasetListQuery, DatasetType } from './dataset';

export type V2DatasetDisplayStatus =
  | 'EMPTY'
  | 'READY'
  | 'EDITING'
  | 'IMPORTING'
  | 'IMPORT_FAILED';

export type V2DatasetCurrentVersion = {
  versionId: string;
  versionLabel?: string;
  versionNo?: number;
  status?: string;
};

export type V2DatasetListItem = {
  datasetId: string;
  name: string;
  type: DatasetType;
  currentVersion?: V2DatasetCurrentVersion | null;
  currentVersionFileCount?: number | null;
  displayStatus: V2DatasetDisplayStatus;
  hasDraft?: boolean;
  editSessionId?: string | null;
  importProgress?: number | null;
  canPublish?: boolean;
  availableActions?: string[];
  userError?: {
    errorCode?: string;
    errorMessage?: string;
    details?: Record<string, unknown>;
  } | null;
  remark?: string;
  uploadTime?: string;
  sizeBytes?: number;
  fileName?: string;
};

export type V2DatasetListPage = {
  data: V2DatasetListItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages?: number;
};

export type V2EditSession = {
  editSessionId: string;
  datasetId: string;
  status?: string;
  parentVersionId?: string;
  sampleCount?: number;
  importProgress?: number;
  canPublish?: boolean;
  latestImportJobId?: string | null;
  latestImportStatus?: string | null;
};

export type V2PublishResult = {
  datasetId: string;
  currentVersion?: string;
  status?: string;
  publishedAt?: string;
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

/** GET /api/v2/datasets */
export async function getV2DatasetList(
  params?: DatasetListQuery,
  options?: { [key: string]: unknown },
) {
  return request<V2DatasetListPage>('/v2/datasets', {
    method: 'GET',
    params,
    ...(options || {}),
  });
}

/** 将 V2 列表项映射为 v1 兼容的 DatasetListItem */
export function mapV2DatasetToListItem(row: V2DatasetListItem): DatasetListItem {
  const current = row.currentVersion;
  return {
    id: row.datasetId,
    assetId: row.datasetId,
    name: row.name,
    type: row.type,
    remark: row.remark,
    versionId: current?.versionId,
    version: current?.versionLabel,
    versionStatus: current?.status,
    fileCount: row.currentVersionFileCount ?? 0,
    uploadTime: row.uploadTime,
    sizeBytes: row.sizeBytes,
    size: formatBytes(row.sizeBytes),
    fileName: row.fileName,
    displayStatus: row.displayStatus,
    editSessionId: row.editSessionId,
    importProgress: row.importProgress,
    importErrorMessage: row.userError?.errorMessage ?? null,
    latestDraftVersionId:
      row.hasDraft && row.editSessionId ? row.editSessionId : null,
  };
}

/** POST /api/v2/datasets/{datasetId}/edit-sessions */
export async function getOrCreateV2EditSession(
  datasetId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2EditSession>(
    `/v2/datasets/${encodeURIComponent(datasetId)}/edit-sessions`,
    {
      method: 'POST',
      ...(options || {}),
    },
  );
}

/** GET /api/v2/dataset-edit-sessions/{editSessionId} */
export async function getV2EditSession(
  editSessionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2EditSession>(
    `/v2/dataset-edit-sessions/${encodeURIComponent(editSessionId)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** POST /api/v2/dataset-edit-sessions/{editSessionId}/publish */
export async function publishV2EditSession(
  editSessionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2PublishResult>(
    `/v2/dataset-edit-sessions/${encodeURIComponent(editSessionId)}/publish`,
    {
      method: 'POST',
      ...(options || {}),
    },
  );
}

export const V2_DISPLAY_STATUS_LABEL: Record<V2DatasetDisplayStatus, string> = {
  EMPTY: '空',
  READY: '就绪',
  EDITING: '编辑中',
  IMPORTING: '导入中',
  IMPORT_FAILED: '导入失败',
};
