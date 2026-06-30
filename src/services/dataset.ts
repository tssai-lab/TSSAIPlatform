import { request } from '@umijs/max';
import {
  getV2DatasetList,
  mapV2DatasetToListItem,
  type V2DatasetListPage,
} from './datasetV2';

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

/** 从版本记录解析数据集版本 ID（预览/训练必须用版本 ID，不能用资产 ID） */
export function resolveDatasetVersionId(
  version?: Partial<DatasetVersion> | null,
  assetId?: string,
): string | undefined {
  if (!version) {
    return undefined;
  }
  const extra = version as DatasetVersion & {
    datasetVersionId?: string;
    versionId?: string;
  };
  const candidates = [
    version.id,
    extra.datasetVersionId,
    extra.versionId,
  ].filter((v): v is string => typeof v === 'string' && v.length > 0);

  for (const candidate of candidates) {
    if (assetId && candidate === assetId) {
      continue;
    }
    return candidate;
  }
  return undefined;
}

function normalizeDatasetVersionList(raw: unknown): DatasetVersion[] {
  if (Array.isArray(raw)) {
    return raw as DatasetVersion[];
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as { data?: unknown; list?: unknown; records?: unknown };
    if (Array.isArray(obj.data)) {
      return obj.data as DatasetVersion[];
    }
    if (Array.isArray(obj.list)) {
      return obj.list as DatasetVersion[];
    }
    if (Array.isArray(obj.records)) {
      return obj.records as DatasetVersion[];
    }
  }
  return [];
}

function mapDatasetVersion(
  version: DatasetVersion,
  assetId?: string,
): API.DatasetVersionDetail {
  const versionId = resolveDatasetVersionId(version, assetId) ?? version.id;
  return {
    ...version,
    id: versionId,
    size: formatBytes(version.sizeBytes),
    status: version.status,
  };
}

/**
 * 数据集服务接口。
 *
 * 对接模块二后端 `/api/dataset/**` 与 `/api/dataset-*`。数据集支持 CV/NLP 强类型校验、
 * 资产/版本管理、分片断点续传，以及 CV 图片文件夹直传打包。
 */

/** 训练创建使用的任务类型（不含 MULTIMODAL） */
export type TaskType = 'CV' | 'NLP' | 'POINT_CLOUD';

/** 数据集模块类型（含多模态、机器人预留） */
export type DatasetType = TaskType | 'MULTIMODAL' | 'ROBOT';

/** CV 子任务（module2-api-doc 1.3） */
export type CvTaskType =
  | 'IMAGE_CLASSIFICATION'
  | 'OBJECT_DETECTION'
  | 'SEMANTIC_SEGMENTATION'
  | 'INSTANCE_SEGMENTATION'
  | 'UNLABELED'
  | 'OTHER';

/** CV 标注格式（module2-api-doc 1.3） */
export type AnnotationFormat =
  | 'NONE'
  | 'FOLDER_CLASSIFICATION'
  | 'CSV'
  | 'YOLO'
  | 'COCO'
  | 'VOC'
  | 'MASK'
  | 'LABELME'
  | 'OTHER';

/** 数据集资产：表示一个数据集主体，不等同于某个具体文件版本。 */
export type DatasetAsset = {
  id: string;
  name: string;
  type?: DatasetType;
  remark?: string;
  createdAt?: string;
  updatedAt?: string;
};

/** 数据集版本：表示某个数据集资产下的一个具体文件版本。 */
export type DatasetVersion = {
  id: string;
  assetId: string;
  version: string;
  fileName?: string;
  storagePath?: string;
  sizeBytes?: number;
  remark?: string;
  status?: 'DRAFT' | 'READY' | 'DEPRECATED' | 'ARCHIVED' | string;
  parentVersionId?: string | null;
  createdAt?: string;
};

/** 数据集列表页使用的聚合视图，包含资产信息和当前最新版本信息。 */
export type DatasetListItem = {
  id: string;
  assetId: string;
  name: string;
  type: DatasetType;
  remark?: string;
  versionId?: string;
  version?: string;
  versionStatus?: string;
  fileName?: string;
  storagePath?: string;
  size?: string;
  sizeBytes?: number;
  versionRemark?: string;
  fileCount: number;
  uploadTime?: string;
  createdAt?: string;
  updatedAt?: string;
  latestDraftVersionId?: string | null;
  importJobId?: string | null;
  importStatus?: 'PENDING' | 'RUNNING' | 'FAILED' | string | null;
  importProgress?: number | null;
  importErrorMessage?: string | null;
  /** V2 聚合展示状态 */
  displayStatus?: string;
  editSessionId?: string | null;
};

/** GET /api/dataset/list 查询参数（module2-api-doc 7.1） */
export type DatasetListQuery = {
  type?: DatasetType | 'ROBOT';
  keyword?: string;
  current?: number;
  pageSize?: number;
  page?: number;
};

/** 多模态 zip 样本分组方式（module2-api-doc §6.1） */
export type MultimodalSampleGrouping = 'MANIFEST' | 'AUTO_DIRECTORY';

/** 初始化数据集分片上传时需要提交的元信息。 */
export type DatasetUploadInitParams = {
  fileName: string;
  fileSize: number;
  fileFingerprint?: string;
  assetId?: string;
  datasetName: string;
  version?: string;
  versionLabel?: string;
  type: DatasetType;
  cvTaskType?: CvTaskType;
  annotationFormat?: AnnotationFormat;
  remark?: string;
  description?: string;
  sampleGrouping?: MultimodalSampleGrouping;
  manifestPath?: string;
};

/**
 * 数据集上传进度。
 *
 * uploadedPartIndexes 是断点续传依据；前端应按该数组跳过已完成分片。
 */
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

/** 数据集上传完成后，后端返回的数据集资产和版本落库结果。 */
export type DatasetUploadCompleteResult = {
  uploadId: string;
  id: string;
  datasetVersionId?: string;
  assetId: string;
  name: string;
  version: string;
  type: DatasetType;
  remark?: string;
  fileName: string;
  storagePath?: string;
  sizeBytes?: number;
  status: string;
  uploadStatus?: string;
  versionStatus?: 'DRAFT' | 'READY' | string;
  importJobId?: string | null;
  importStatus?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

/** CV 图片文件夹上传参数；后端会校验 paths 并打包为 zip 后入库。 */
export type DatasetFolderUploadParams = {
  datasetName: string;
  version?: string;
  type: 'CV';
  cvTaskType?: CvTaskType;
  annotationFormat?: AnnotationFormat;
  remark?: string;
  files: File[];
  paths: string[];
};

/** 删除数据集资产时，后端会同时返回删除的版本数和对象数。 */
export type DatasetDeleteResult = {
  id: string;
  deletedVersions: number;
  deletedObjects: number;
};

/** 创建数据集资产记录。通常上传完成接口会自动创建，手动维护时才需要直接调用。 */
export async function createDatasetAsset(body: Partial<DatasetAsset>, options?: { [key: string]: any }) {
  return request<{ data: DatasetAsset }>('/dataset-assets', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

/** 查询全部数据集资产记录。 */
export async function listDatasetAssets(options?: { [key: string]: any }) {
  return request<{ data: DatasetAsset[] }>('/dataset-assets', {
    method: 'GET',
    ...(options || {}),
  });
}

/** 查询单个数据集资产详情。 */
export async function getDatasetAsset(id: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetAsset }>('/dataset-assets/' + encodeURIComponent(id), {
    method: 'GET',
    ...(options || {}),
  });
}

/**
 * 删除数据集资产。
 *
 * 后端会先删除该资产下所有版本对应的 MinIO 对象，再删除数据库记录。
 */
export async function deleteDatasetAsset(id: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetDeleteResult }>('/dataset-assets/' + encodeURIComponent(id), {
    method: 'DELETE',
    ...(options || {}),
  });
}

/** 创建数据集版本记录。通常上传完成接口会自动创建，手动维护时才需要直接调用。 */
export async function createDatasetVersion(body: Partial<DatasetVersion>, options?: { [key: string]: any }) {
  return request<{ data: DatasetVersion }>('/dataset-versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

/** 查询数据集版本列表；传 assetId 时只返回指定资产下的版本。 */
export async function listDatasetVersions(assetId?: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetVersion[] }>('/dataset-versions', {
    method: 'GET',
    params: assetId ? { assetId } : undefined,
    ...(options || {}),
  });
}

/** 查询单个数据集版本详情。 */
export async function getDatasetVersion(id: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetVersion }>(
    '/dataset-versions/' + encodeURIComponent(id),
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** 更新数据集版本元数据（versionLabel/remark/description 等）。 */
export async function updateDatasetVersion(
  id: string,
  body: Partial<
    Pick<DatasetVersion, 'version' | 'remark' | 'assetId'> & {
      versionLabel?: string;
      description?: string;
      changeLog?: string;
    }
  >,
  options?: { [key: string]: any },
) {
  const payload = { ...body };
  if (payload.version && !payload.versionLabel) {
    payload.versionLabel = payload.version;
  }
  return request<{ data: DatasetVersion }>(
    '/dataset-versions/' + encodeURIComponent(id),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: payload,
      ...(options || {}),
    },
  );
}

export type DatasetVersionLifecycleStatus = 'READY' | 'DEPRECATED' | 'ARCHIVED';

/** PUT /api/dataset-assets/{assetId}/current-version */
export async function switchDatasetCurrentVersion(
  assetId: string,
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<{ success?: boolean; data?: unknown }>(
    `/dataset-assets/${encodeURIComponent(assetId)}/current-version`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: { versionId },
      ...(options || {}),
    },
  );
}

/** PATCH /api/dataset-versions/{id}/status */
export async function updateDatasetVersionStatus(
  versionId: string,
  status: DatasetVersionLifecycleStatus,
  options?: { [key: string]: unknown },
) {
  return request<{ success?: boolean; data?: DatasetVersion }>(
    `/dataset-versions/${encodeURIComponent(versionId)}/status`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      data: { status },
      ...(options || {}),
    },
  );
}

/** 删除数据集版本。若被训练实验引用会失败。 */
export async function deleteDatasetVersion(id: string, options?: { [key: string]: any }) {
  return request<{ data: unknown }>(
    '/dataset-versions/' + encodeURIComponent(id),
    {
      method: 'DELETE',
      ...(options || {}),
    },
  );
}

/** 获取数据集列表页聚合数据，可按 keyword、类型、分页筛选。 */
export async function getDatasetList(params?: DatasetListQuery, options?: { [key: string]: any }) {
  return request<{ data: { data: DatasetListItem[]; total: number } }>('/dataset/list', {
    method: 'GET',
    params,
    ...(options || {}),
  });
}

/**
 * 初始化或恢复数据集分片上传。
 *
 * CV 支持图片 zip，NLP 支持 txt/json/jsonl 或包含这些文件的 zip。
 */
export async function datasetUploadInit(
  body: DatasetUploadInitParams,
  options?: { [key: string]: any },
) {
  return request<{ data: DatasetUploadProgress }>('/dataset/upload/init', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

/**
 * 上传数据集的单个分片。
 *
 * 非末尾分片大小应等于后端返回的 chunkSize，否则 MinIO 合并可能失败。
 */
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
  return request<{ data: DatasetUploadProgress }>('/dataset/upload/chunk', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

/** 查询数据集上传进度，用于刷新后恢复断点续传。 */
export async function datasetUploadProgress(uploadId: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetUploadProgress }>('/dataset/upload/progress', {
    method: 'GET',
    params: { uploadId },
    ...(options || {}),
  });
}

/**
 * 完成数据集上传。
 *
 * 后端会校验分片齐全、合并 MinIO 临时对象、创建资产和版本记录，并清理临时分片。
 */
export async function datasetUploadComplete(uploadId: string, options?: { [key: string]: any }) {
  return request<{ data: DatasetUploadCompleteResult }>('/dataset/upload/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: { uploadId },
    ...(options || {}),
  });
}

const UPLOAD_PROGRESS_POLL_MS = 2000;
const UPLOAD_PROGRESS_POLL_MAX_MS = 5 * 60 * 1000;

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function calcUploadPercent(progress: DatasetUploadProgress): number {
  const total = progress.totalChunks > 0 ? progress.totalChunks : 1;
  const done =
    progress.uploadedPartIndexes?.length ??
    progress.uploadedChunks ??
    0;
  return Math.min(100, Math.round((done / total) * 100));
}

/** 轮询 progress，直到离开 COMPLETING（或超时） */
export async function waitDatasetUploadSettled(
  uploadId: string,
  options?: { [key: string]: unknown },
  onPoll?: (progress: DatasetUploadProgress) => void,
): Promise<DatasetUploadProgress> {
  const started = Date.now();
  while (Date.now() - started < UPLOAD_PROGRESS_POLL_MAX_MS) {
    const res = await datasetUploadProgress(uploadId, options);
    const data = res?.data;
    if (!data) {
      throw new Error('查询上传进度失败');
    }
    onPoll?.(data);
    if (data.status === 'COMPLETED') {
      return data;
    }
    if (data.status !== 'COMPLETING') {
      return data;
    }
    await sleep(UPLOAD_PROGRESS_POLL_MS);
  }
  throw new Error('服务端合并分片超时，请稍后刷新页面或重新提交');
}

/**
 * 完成上传并在 COMPLETING 时轮询 progress，避免并发重复 complete。
 * complete 对已完成的 uploadId 可幂等重试。
 */
export async function datasetUploadCompleteWithPolling(
  uploadId: string,
  options?: { [key: string]: unknown },
  callbacks?: {
    onPoll?: (progress: DatasetUploadProgress) => void;
  },
) {
  let completeRes: { data: DatasetUploadCompleteResult } | undefined;
  try {
    completeRes = await datasetUploadComplete(uploadId, options);
    const uploadStatus =
      completeRes?.data?.uploadStatus ?? completeRes?.data?.status;
    if (uploadStatus === 'COMPLETED') {
      return completeRes;
    }
  } catch {
    // 可能处于 COMPLETING，继续轮询 progress
  }

  const progressRes = await datasetUploadProgress(uploadId, options);
  const initial = progressRes?.data;
  if (initial?.status === 'COMPLETED' && completeRes) {
    return completeRes;
  }

  if (initial?.status === 'COMPLETING' || !completeRes) {
    await waitDatasetUploadSettled(uploadId, options, callbacks?.onPoll);
    return datasetUploadComplete(uploadId, options);
  }

  return completeRes ?? datasetUploadComplete(uploadId, options);
}

/**
 * 上传 CV 图片文件夹。
 *
 * paths 必须与 files 一一对应，且只能是相对路径；后端会拒绝绝对路径、盘符和 `..`。
 */
export async function datasetUploadFolder(
  body: DatasetFolderUploadParams,
  options?: { [key: string]: any },
) {
  const formData = new FormData();
  formData.append('datasetName', body.datasetName);
  formData.append('version', body.version || 'v1.0.0');
  formData.append('type', body.type);
  if (body.cvTaskType) {
    formData.append('cvTaskType', body.cvTaskType);
  }
  if (body.annotationFormat) {
    formData.append('annotationFormat', body.annotationFormat);
  }
  if (body.remark) {
    formData.append('remark', body.remark);
  }
  body.files.forEach((file, index) => {
    const relativePath = body.paths[index] || file.name;
    formData.append('files', file, file.name);
    formData.append('paths', relativePath);
  });
  return request<{ data: DatasetUploadCompleteResult }>('/dataset/upload/folder', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

// ——— 兼容旧 platform / 页面 ———

const DEFAULT_CHUNK = 5 * 1024 * 1024;

function normalizeV2ListPage(raw: unknown): V2DatasetListPage | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const page = raw as V2DatasetListPage;
  if (Array.isArray(page.data)) {
    return page;
  }
  const wrapped = raw as { data?: V2DatasetListPage };
  const inner = wrapped.data;
  if (inner && Array.isArray(inner.data)) {
    return inner;
  }
  return null;
}

/** 获取数据集列表（兼容：返回 `{ data, total }`；ProTable 的 name 映射为 keyword） */
export async function fetchDatasetList(options?: {
  current?: number;
  pageSize?: number;
  name?: string;
  type?: string;
}) {
  const params: DatasetListQuery = {};

  if (options?.type) {
    params.type = options.type as DatasetListQuery['type'];
  }

  const keyword = options?.name?.trim();
  if (keyword) {
    params.keyword = keyword;
  }

  if (options?.current) {
    params.current = options.current;
  }
  if (options?.pageSize) {
    params.pageSize = options.pageSize;
  }

  try {
    const v2Res = await getV2DatasetList(params, options);
    const v2Page = normalizeV2ListPage(v2Res);
    if (v2Page) {
      return {
        data: v2Page.data.map(mapV2DatasetToListItem),
        total: v2Page.total ?? v2Page.data.length,
      };
    }
  } catch {
    // V2 不可用时回退 v1
  }

  const res = await getDatasetList(params, options);
  const inner = res?.data;
  const list = inner?.data ?? [];
  const total = inner?.total ?? list.length;
  return { data: list, total };
}

/** 数据集资产详情（兼容旧 `fetchDatasetDetail`：无独立 `/detail` 时走资产接口） */
export async function fetchDatasetDetail(id: string, options?: { [key: string]: any }) {
  const [assetRes, versionRes] = await Promise.all([
    getDatasetAsset(id, options),
    listDatasetVersions(id, options),
  ]);
  const asset = assetRes?.data;
  if (!asset) {
    return { data: undefined };
  }
  let listLatestVersionId: string | undefined;
  let currentVersionId: string | undefined;
  let importMeta: Pick<
    DatasetListItem,
    | 'latestDraftVersionId'
    | 'importJobId'
    | 'importStatus'
    | 'importProgress'
    | 'importErrorMessage'
    | 'displayStatus'
    | 'editSessionId'
  > = {};
  try {
    const listRes = await getDatasetList(
      { pageSize: 200, type: asset.type as DatasetType },
      options,
    );
    const row = (listRes?.data?.data ?? []).find(
      (item) => (item.assetId || item.id) === asset.id,
    );
    listLatestVersionId = row?.versionId;
    currentVersionId = row?.versionId;
    if (row) {
      importMeta = {
        latestDraftVersionId: row.latestDraftVersionId,
        importJobId: row.importJobId,
        importStatus: row.importStatus,
        importProgress: row.importProgress,
        importErrorMessage: row.importErrorMessage,
        displayStatus: row.displayStatus,
        editSessionId: row.editSessionId,
      };
    }
  } catch {
    // 列表兜底失败不影响详情主流程
  }

  const versions = normalizeDatasetVersionList(versionRes?.data)
    .map((version) => mapDatasetVersion(version, asset.id))
    .filter((v) => !!v.id)
    .sort((left, right) =>
      left.createdAt && right.createdAt
        ? right.createdAt.localeCompare(left.createdAt)
        : 0,
    );

  const pickDefaultVersionId = (): string | undefined => {
    for (const v of versions) {
      const vid = resolveDatasetVersionId(v, asset.id);
      if (vid) {
        return vid;
      }
    }
    if (listLatestVersionId && listLatestVersionId !== asset.id) {
      return listLatestVersionId;
    }
    return undefined;
  };

  const defaultVersionId = pickDefaultVersionId();
  const latestVersion =
    versions.find((v) => v.id === defaultVersionId) ?? versions[0];

  return {
    data: {
      id: asset.id,
      name: asset.name,
      type: asset.type as DatasetType,
      remark: asset.remark,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      uploadTime: latestVersion?.createdAt ?? asset.createdAt,
      latestVersion,
      versions,
      /** 列表接口返回的当前推荐版本 ID */
      defaultVersionId,
      currentVersionId,
      ...importMeta,
    } as API.DatasetDetail & {
      defaultVersionId?: string;
      currentVersionId?: string;
      latestDraftVersionId?: string | null;
      importJobId?: string | null;
      importStatus?: string | null;
      importProgress?: number | null;
      importErrorMessage?: string | null;
    },
  };
}

export type UploadDatasetCompatParams = {
  name: string;
  files: File[];
  type?: DatasetType;
  version?: string;
  assetId?: string;
  cvTaskType?: CvTaskType;
  annotationFormat?: AnnotationFormat;
  remark?: string;
  sampleGrouping?: MultimodalSampleGrouping;
  manifestPath?: string;
  /** 与 backend-api 一致；不传则按「文件名|大小|数据集名|版本|类型」自动生成稳定指纹 */
  fileFingerprint?: string;
  /** 单文件分片上传时进度 0–100 */
  onProgress?: (percent: number) => void;
  /** 服务端合并分片（COMPLETING）阶段回调 */
  onMergeStatus?: (status: string) => void;
  /** init 成功后回调，便于页面写入 localStorage 做刷新续传提示 */
  onUploadSession?: (payload: { uploadId: string; fileFingerprint: string }) => void;
};

/**
 * 兼容旧「多文件直传」：单文件走分片上传；多文件且 CV 走文件夹打包接口；
 * NLP 多文件请让用户打包为 zip 后单文件上传。
 */
export async function uploadDataset(params: UploadDatasetCompatParams, options?: { [key: string]: any }) {
  const {
    name,
    files,
    type = 'CV',
    version = 'v1',
    assetId,
    cvTaskType,
    annotationFormat,
    remark,
    sampleGrouping,
    manifestPath,
    fileFingerprint,
    onProgress,
    onMergeStatus,
    onUploadSession,
  } = params;
  if (!files?.length) {
    throw new Error('请选择要上传的文件');
  }
  if (files.length === 1) {
    const file = files[0];
    const fp =
      fileFingerprint ||
      [file.name, String(file.size), name, version || 'v1', type].join('|');
    const initBody: DatasetUploadInitParams = {
      fileName: file.name,
      fileSize: file.size,
      fileFingerprint: fp,
      datasetName: name,
      version,
      versionLabel: version,
      type,
      cvTaskType,
      annotationFormat,
      remark,
      description: remark,
    };
    if (assetId) {
      initBody.assetId = assetId;
    }
    if (type === 'MULTIMODAL') {
      initBody.sampleGrouping = sampleGrouping ?? 'AUTO_DIRECTORY';
      if (
        initBody.sampleGrouping === 'MANIFEST' &&
        manifestPath?.trim()
      ) {
        initBody.manifestPath = manifestPath.trim();
      }
    }
    const initRes = await datasetUploadInit(initBody, options);
    const progress = initRes?.data;
    const uploadId = progress?.uploadId;
    if (!uploadId) {
      throw new Error('初始化数据集上传失败');
    }
    onUploadSession?.({ uploadId, fileFingerprint: fp });
    const chunkSize = progress.chunkSize > 0 ? progress.chunkSize : DEFAULT_CHUNK;
    const totalChunks =
      progress.totalChunks > 0 ? progress.totalChunks : Math.max(1, Math.ceil(file.size / chunkSize));
    const done = new Set(progress.uploadedPartIndexes ?? []);
    let uploadedCount = done.size;
    for (let partIndex = 0; partIndex < totalChunks; partIndex++) {
      if (done.has(partIndex)) {
        continue;
      }
      const start = partIndex * chunkSize;
      const end = Math.min(start + chunkSize, file.size);
      await datasetUploadChunk(uploadId, partIndex, file.slice(start, end), options);
      uploadedCount += 1;
      onProgress?.(Math.min(100, Math.round((uploadedCount / totalChunks) * 100)));
    }
    onProgress?.(100);
    onMergeStatus?.('COMPLETING');
    return datasetUploadCompleteWithPolling(uploadId, options, {
      onPoll: (progress) => {
        if (progress.status === 'COMPLETING') {
          onMergeStatus?.('COMPLETING');
          onProgress?.(100);
        } else {
          onProgress?.(calcUploadPercent(progress));
        }
      },
    });
  }
  if (type === 'CV') {
    return datasetUploadFolder(
      {
        datasetName: name,
        version,
        type: 'CV',
        cvTaskType,
        annotationFormat,
        remark,
        files,
        paths: files.map((f) => f.webkitRelativePath || f.name),
      },
      options,
    );
  }
  throw new Error('NLP 数据集请将多个文件打包为 zip 后作为单个文件上传');
}

/** 删除数据集资产（兼容旧 `deleteDataset`） */
export async function deleteDataset(id: string, options?: { [key: string]: any }) {
  return deleteDatasetAsset(id, options);
}
