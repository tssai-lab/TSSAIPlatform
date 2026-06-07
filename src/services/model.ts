import { request } from '@umijs/max';

export type ModelTaskType = 'CV' | 'NLP' | 'POINT_CLOUD' | 'ROBOT';

type BackendModelItem = {
  id: string;
  assetId?: string;
  name: string;
  version: string;
  type: ModelTaskType;
  remark?: string;
  storagePath?: string;
  fileName?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
};

/** §4 模型资产 */
export type ModelAsset = {
  id: string;
  name: string;
  type?: ModelTaskType;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** §5 模型版本 */
export type ModelVersion = {
  id: string;
  assetId: string;
  version: string;
  fileName?: string;
  storagePath?: string;
  sizeBytes?: number;
  createdAt?: string;
  updatedAt?: string;
};

export type ModelDeleteResult = {
  id: string;
  assetId?: string;
  deleted?: boolean;
  deletedVersions?: number;
  deletedObjects?: number;
  minioDeleteQueued?: boolean;
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

function mapModelVersion(
  version: ModelVersion,
  asset?: ModelAsset,
): API.ModelVersionDetail {
  return {
    ...version,
    name: asset?.name,
    type: asset?.type,
    size: formatBytes(version.sizeBytes),
  };
}

/** 从版本记录解析模型版本 ID */
export function resolveModelVersionId(
  version?: Partial<ModelVersion> | null,
  assetId?: string,
): string | undefined {
  if (!version) return undefined;
  const extra = version as ModelVersion & { modelVersionId?: string; versionId?: string };
  const candidates = [version.id, extra.modelVersionId, extra.versionId].filter(
    (v): v is string => typeof v === 'string' && v.length > 0,
  );
  for (const candidate of candidates) {
    if (assetId && candidate === assetId) continue;
    return candidate;
  }
  return undefined;
}

function normalizeModelVersionList(raw: unknown): ModelVersion[] {
  if (Array.isArray(raw)) return raw as ModelVersion[];
  if (raw && typeof raw === 'object') {
    const obj = raw as { data?: unknown; list?: unknown; records?: unknown };
    if (Array.isArray(obj.data)) return obj.data as ModelVersion[];
    if (Array.isArray(obj.list)) return obj.list as ModelVersion[];
    if (Array.isArray(obj.records)) return obj.records as ModelVersion[];
  }
  return [];
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

/** GET /api/model/list 查询参数（module2-api-doc 3.1） */
export type ModelListQuery = {
  type?: 'CV' | 'NLP' | 'POINT_CLOUD' | 'ROBOT';
  keyword?: string;
  current?: number;
  pageSize?: number;
  page?: number;
};

export async function getModelList(params?: ModelListQuery, options?: { [key: string]: any }) {
  return request<{ data: { data: BackendModelItem[]; total: number } }>('/model/list', {
    method: 'GET',
    params,
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
  return deleteModelVersion(id, options);
}

// ——— §4 模型资产 CRUD ———

export async function createModelAsset(
  body: Pick<ModelAsset, 'name' | 'type'> & { remark?: string },
  options?: { [key: string]: unknown },
) {
  return request<{ data: ModelAsset }>('/model-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function getModelAsset(id: string, options?: { [key: string]: unknown }) {
  return request<{ data: ModelAsset }>(`/model-assets/${encodeURIComponent(id)}`, {
    method: 'GET',
    ...(options || {}),
  });
}

export async function listModelAssets(options?: { [key: string]: unknown }) {
  return request<{ data: ModelAsset[] }>('/model-assets', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function updateModelAsset(
  id: string,
  body: Pick<ModelAsset, 'name' | 'type'> & { remark?: string },
  options?: { [key: string]: unknown },
) {
  return request<{ data: ModelAsset }>(`/model-assets/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function deleteModelAsset(id: string, options?: { [key: string]: unknown }) {
  return request<{ data: ModelDeleteResult }>(`/model-assets/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    ...(options || {}),
  });
}

// ——— §5 模型版本 CRUD ———

export async function createModelVersion(
  body: Pick<ModelVersion, 'assetId' | 'version'>,
  options?: { [key: string]: unknown },
) {
  return request<{ data: ModelVersion }>('/model-versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function getModelVersion(id: string, options?: { [key: string]: unknown }) {
  return request<{ data: ModelVersion }>(`/model-versions/${encodeURIComponent(id)}`, {
    method: 'GET',
    ...(options || {}),
  });
}

export async function listModelVersions(assetId?: string, options?: { [key: string]: unknown }) {
  return request<{ data: ModelVersion[] }>('/model-versions', {
    method: 'GET',
    params: assetId ? { assetId } : undefined,
    ...(options || {}),
  });
}

export async function updateModelVersion(
  id: string,
  body: Partial<Pick<ModelVersion, 'assetId' | 'version' | 'fileName' | 'storagePath' | 'sizeBytes'>>,
  options?: { [key: string]: unknown },
) {
  return request<{ data: ModelVersion }>(`/model-versions/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function deleteModelVersion(id: string, options?: { [key: string]: unknown }) {
  return request<{ data: ModelDeleteResult }>(`/model-versions/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    ...(options || {}),
  });
}

export async function fetchModelList(options?: {
  current?: number;
  pageSize?: number;
  name?: string;
  version?: string;
  type?: string;
}) {
  const params: ModelListQuery = {};

  if (options?.type) {
    params.type = options.type as ModelListQuery['type'];
  }

  const name = options?.name?.trim();
  const version = options?.version?.trim();
  const keywordParts = [name, version].filter(Boolean);
  if (keywordParts.length) {
    params.keyword = keywordParts.join(' ');
  }

  if (options?.current) {
    params.current = options.current;
  }
  if (options?.pageSize) {
    params.pageSize = options.pageSize;
  }

  const res = await getModelList(params);
  const inner = res?.data;
  const list = (inner?.data ?? [])
    .map((item) => mapModelItem(item))
    .filter((item): item is API.ModelItem => Boolean(item));
  const total = inner?.total ?? list.length;
  return { data: list, total };
}

/** §4+§5 模型资产详情（资产 + 版本列表） */
export async function fetchModelAssetDetail(
  assetId: string,
  options?: { [key: string]: unknown },
) {
  const [assetRes, versionRes] = await Promise.all([
    getModelAsset(assetId, options),
    listModelVersions(assetId, options),
  ]);
  const asset = assetRes?.data;
  if (!asset) {
    return { data: undefined };
  }

  let listLatestVersionId: string | undefined;
  try {
    const listRes = await getModelList(
      { pageSize: 200, type: asset.type },
      options,
    );
    const row = (listRes?.data?.data ?? []).find(
      (item) => (item.assetId || item.id) === asset.id,
    );
    listLatestVersionId = row?.id;
  } catch {
    // ignore
  }

  const versions = normalizeModelVersionList(versionRes?.data)
    .map((v) => mapModelVersion(v, asset))
    .filter((v) => !!v.id)
    .sort((a, b) =>
      a.createdAt && b.createdAt ? b.createdAt.localeCompare(a.createdAt) : 0,
    );

  const defaultVersionId =
    versions.map((v) => resolveModelVersionId(v, asset.id)).find(Boolean) ??
    (listLatestVersionId && listLatestVersionId !== asset.id
      ? listLatestVersionId
      : undefined);

  const latestVersion =
    versions.find((v) => v.id === defaultVersionId) ?? versions[0];

  return {
    data: {
      id: asset.id,
      name: asset.name,
      type: asset.type ?? 'CV',
      remark: asset.remark,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      uploadTime: latestVersion?.createdAt ?? asset.createdAt,
      latestVersion,
      versions,
      defaultVersionId,
    } as API.ModelAssetDetail,
  };
}

/** 加载指定版本的代码预览（§3.3 / §3.4） */
export async function fetchModelVersionCodePreview(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  const versionRes = await getModelVersion(versionId, options).catch(() =>
    getModelDetail(versionId, options),
  );
  const raw = versionRes?.data as ModelVersion | BackendModelItem | undefined;
  const version: API.ModelVersionDetail | undefined = raw
    ? {
        id: raw.id,
        assetId: 'assetId' in raw ? raw.assetId : '',
        version: 'version' in raw ? raw.version : '',
        fileName: 'fileName' in raw ? raw.fileName : undefined,
        storagePath: raw.storagePath,
        sizeBytes: raw.sizeBytes,
        size: formatBytes(raw.sizeBytes),
        createdAt: raw.createdAt,
      }
    : undefined;

  if (!version) {
    return { data: undefined };
  }

  let codeContent: string | undefined;
  let codeFileName: string | undefined;
  let codeFilePath: string | undefined;
  let codeFiles: API.ModelCodeFile[] = [];

  try {
    const codeFilesRes = await listModelCodeFiles(versionId, options);
    codeFiles = codeFilesRes?.data ?? [];
    if (codeFiles.length > 0 && codeFiles[0].path) {
      const previewRes = await previewModelCode(versionId, codeFiles[0].path, options);
      if (previewRes?.data?.content) {
        codeContent = previewRes.data.content;
        codeFileName =
          previewRes.data.fileName || codeFiles[0].fileName || codeFiles[0].path;
        codeFilePath = previewRes.data.path || codeFiles[0].path;
      }
    }
  } catch {
    codeFiles = [];
  }

  return {
    data: {
      ...version,
      codeContent,
      codeFileName,
      codeFilePath,
      codeFiles,
    } as API.ModelVersionDetail,
  };
}

/** 兼容：按模型版本 ID 查详情（§3.2） */
export async function fetchModelDetail(id: string, options?: { [key: string]: any }) {
  const codeRes = await fetchModelVersionCodePreview(id, options);
  if (!codeRes?.data) {
    return { data: undefined };
  }

  const version = codeRes.data;
  const updateTime = version.createdAt;
  const detail: API.ModelDetail = {
    id: version.id,
    assetId: version.assetId,
    name: version.name ?? '',
    version: version.version,
    type: (version.type as API.ModelItem['type']) ?? 'CV',
    storagePath: version.storagePath,
    size: version.size,
    sizeBytes: version.sizeBytes,
    uploadTime: version.createdAt,
    updateTime,
    timestamp: toUnixTimestamp(updateTime),
    codeContent: version.codeContent,
    codeFileName: version.codeFileName,
    codeFilePath: version.codeFilePath,
    codeFiles: version.codeFiles,
    versionHistory: [
      {
        version: version.version,
        updateTime: updateTime ?? '',
        timestamp: toUnixTimestamp(updateTime) ?? '',
      },
    ],
  };

  return { data: detail };
}
