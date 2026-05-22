import { request } from '@umijs/max';

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

function mapDatasetVersion(version: DatasetVersion): API.DatasetVersionDetail {
  return {
    ...version,
    size: formatBytes(version.sizeBytes),
  };
}

/**
 * 数据集服务接口。
 *
 * 对接模块二后端 `/api/dataset/**` 与 `/api/dataset-*`。数据集支持 CV/NLP 强类型校验、
 * 资产/版本管理、分片断点续传，以及 CV 图片文件夹直传打包。
 */

/** 后端当前只允许两类任务类型，上传和训练创建都会做强校验。 */
export type TaskType = 'CV' | 'NLP';

/** 数据集资产：表示一个数据集主体，不等同于某个具体文件版本。 */
export type DatasetAsset = {
  id: string;
  name: string;
  type?: TaskType;
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
  createdAt?: string;
};

/** 数据集列表页使用的聚合视图，包含资产信息和当前最新版本信息。 */
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

/** 初始化数据集分片上传时需要提交的元信息。 */
export type DatasetUploadInitParams = {
  fileName: string;
  fileSize: number;
  fileFingerprint?: string;
  datasetName: string;
  version?: string;
  type: TaskType;
  remark?: string;
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

/** CV 图片文件夹上传参数；后端会校验 paths 并打包为 zip 后入库。 */
export type DatasetFolderUploadParams = {
  datasetName: string;
  version?: string;
  type: 'CV';
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

/** 获取数据集列表页聚合数据，可按 CV/NLP 类型筛选。 */
export async function getDatasetList(params?: { type?: TaskType }, options?: { [key: string]: any }) {
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
  return request<{ data: DatasetUploadCompleteResult }>('/dataset/upload/folder', {
    method: 'POST',
    data: formData,
    ...(options || {}),
  });
}

// ——— 兼容旧 platform / 页面 ———

const DEFAULT_CHUNK = 5 * 1024 * 1024;

/** 获取数据集列表（兼容：返回 `{ data, total }`） */
export async function fetchDatasetList(options?: {
  current?: number;
  pageSize?: number;
  name?: string;
  type?: string;
}) {
  const params: { type?: TaskType } = {};
  if (options?.type === 'CV' || options?.type === 'NLP') {
    params.type = options.type;
  }
  const res = await getDatasetList(params);
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
  const versions = (versionRes?.data ?? [])
    .map((version) => mapDatasetVersion(version))
    .sort((left, right) => (left.createdAt && right.createdAt ? right.createdAt.localeCompare(left.createdAt) : 0));
  return {
    data: {
      id: asset.id,
      name: asset.name,
      type: asset.type as 'CV' | 'NLP',
      remark: asset.remark,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      uploadTime: versions[0]?.createdAt ?? asset.createdAt,
      latestVersion: versions[0],
      versions,
    } as API.DatasetDetail,
  };
}

export type UploadDatasetCompatParams = {
  name: string;
  files: File[];
  type?: TaskType;
  version?: string;
  remark?: string;
  /** 与 backend-api 一致；不传则按「文件名|大小|数据集名|版本|类型」自动生成稳定指纹 */
  fileFingerprint?: string;
  /** 单文件分片上传时进度 0–100 */
  onProgress?: (percent: number) => void;
  /** init 成功后回调，便于页面写入 localStorage 做刷新续传提示 */
  onUploadSession?: (payload: { uploadId: string; fileFingerprint: string }) => void;
};

/**
 * 兼容旧「多文件直传」：单文件走分片上传；多文件且 CV 走文件夹打包接口；
 * NLP 多文件请让用户打包为 zip 后单文件上传。
 */
export async function uploadDataset(params: UploadDatasetCompatParams, options?: { [key: string]: any }) {
  const { name, files, type = 'CV', version = 'v1', remark, fileFingerprint, onProgress, onUploadSession } =
    params;
  if (!files?.length) {
    throw new Error('请选择要上传的文件');
  }
  if (files.length === 1) {
    const file = files[0];
    const fp =
      fileFingerprint ||
      [file.name, String(file.size), name, version || 'v1', type].join('|');
    const initRes = await datasetUploadInit(
      {
        fileName: file.name,
        fileSize: file.size,
        fileFingerprint: fp,
        datasetName: name,
        version,
        type,
        remark,
      },
      options,
    );
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
    return datasetUploadComplete(uploadId, options);
  }
  if (type === 'CV') {
    return datasetUploadFolder(
      {
        datasetName: name,
        version,
        type: 'CV',
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
