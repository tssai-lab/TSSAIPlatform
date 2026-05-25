import { request } from '@umijs/max';
import type { TaskType } from './dataset';

/**
 * 点云三维预览服务（module2-api-doc 第 14 章）。
 *
 * 对接模块二 `/dataset/point-cloud/**`（全局 baseURL 已配置 `/api`）。
 * 渲染由前端 Three.js、`PCDLoader`、`PLYLoader` 完成；
 * 后端提供鉴权、预览元信息与点云文件流，不依赖 storagePath。
 */

/** 点云接口请求超时（覆盖 app.tsx 全局 10s，大文件拉流需更长时间） */
const POINT_CLOUD_REQUEST_TIMEOUT = 5 * 60 * 1000;

/** 单文件点云格式 */
export enum PointCloudFileFormat {
  PCD = 'PCD',
  PLY = 'PLY',
}

/** 预览元信息中的格式（含 zip 包） */
export enum PointCloudPreviewFormat {
  PCD = 'PCD',
  PLY = 'PLY',
  ZIP = 'ZIP',
}

/** 模块二点云 preview 接口响应（success + data + errorMessage） */
export type PointCloudApiResponse<T> = {
  success?: boolean;
  data?: T;
  errorMessage?: string | null;
};

/** zip 包内点云文件项 */
export type PointCloudZipEntry = {
  path: string;
  fileName: string;
  format: PointCloudFileFormat;
  sizeBytes?: number;
  previewUrl?: string | null;
  previewAllowed?: boolean;
  message?: string | null;
};

/** GET /dataset/point-cloud/preview 响应 data */
export type PointCloudPreviewInfo = {
  datasetVersionId: string;
  fileName: string;
  type: Extract<TaskType, 'POINT_CLOUD'> | 'POINT_CLOUD';
  format: PointCloudPreviewFormat;
  sizeBytes?: number;
  previewSupported?: boolean;
  previewUrl?: string | null;
  pointCloudFiles?: PointCloudZipEntry[] | null;
  message?: string | null;
};

function unwrapPointCloudResponse<T>(res?: PointCloudApiResponse<T>): T {
  if (!res) {
    throw new Error('响应为空');
  }
  if (res.success === false) {
    throw new Error(res.errorMessage || '请求失败');
  }
  if (res.data === undefined || res.data === null) {
    throw new Error(res.errorMessage || '响应数据为空');
  }
  return res.data;
}

/**
 * 14.1 查询点云预览信息。
 *
 * GET /dataset/point-cloud/preview?id={datasetVersionId}
 */
export async function getPointCloudPreview(
  datasetVersionId: string,
  options?: { [key: string]: any },
) {
  return request<PointCloudApiResponse<PointCloudPreviewInfo>>(
    '/dataset/point-cloud/preview',
    {
      method: 'GET',
      params: { id: datasetVersionId },
      timeout: POINT_CLOUD_REQUEST_TIMEOUT,
      ...(options || {}),
    },
  );
}

/**
 * 14.2 单文件点云流（原始文件为 .pcd 或 .ply）。
 *
 * GET /dataset/point-cloud/file?id={datasetVersionId}
 */
export async function getPointCloudFile(
  datasetVersionId: string,
  options?: { [key: string]: any },
) {
  return request<Blob>('/dataset/point-cloud/file', {
    method: 'GET',
    params: { id: datasetVersionId },
    responseType: 'blob',
    timeout: POINT_CLOUD_REQUEST_TIMEOUT,
    ...(options || {}),
  });
}

/**
 * 14.3 zip 内点云文件流。
 *
 * GET /dataset/point-cloud/zip-file?id={datasetVersionId}&path={zipEntryPath}
 */
export async function getPointCloudZipFile(
  datasetVersionId: string,
  zipEntryPath: string,
  options?: { [key: string]: any },
) {
  return request<Blob>('/dataset/point-cloud/zip-file', {
    method: 'GET',
    params: { id: datasetVersionId, path: zipEntryPath },
    responseType: 'blob',
    timeout: POINT_CLOUD_REQUEST_TIMEOUT,
    ...(options || {}),
  });
}

// ——— 兼容页面层：直接返回 data ———

/** 查询点云预览信息并返回 data（页面层便捷方法） */
export async function fetchPointCloudPreviewInfo(
  datasetVersionId: string,
  options?: { [key: string]: any },
): Promise<PointCloudPreviewInfo> {
  const res = await getPointCloudPreview(datasetVersionId, options);
  return unwrapPointCloudResponse(res);
}
