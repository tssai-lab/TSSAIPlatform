import { fetchCodeVersionList, getCodeVersionDetail } from '@/services/code';
import { getDatasetAsset, getDatasetVersion } from '@/services/dataset';
import { getModelDetail } from '@/services/model';

export type VersionDisplayInfo = {
  name: string;
  version?: string;
};

export type CodeVersionDisplayInfo = {
  fileName: string;
};

const modelDisplayCache = new Map<string, VersionDisplayInfo>();
const datasetDisplayCache = new Map<string, VersionDisplayInfo>();
const codeDisplayCache = new Map<string, CodeVersionDisplayInfo>();
const codeDisplayResolved = new Set<string>();

function isVersionId(value?: string) {
  return !!value && /^(model-ver-|dataset-ver-)/i.test(value);
}

/** 展示用标签：资产名称 · 版本号；解析失败时回退为短 ID */
export function formatVersionDisplayLabel(
  info?: VersionDisplayInfo,
  versionId?: string,
  shortKeep = 16,
): string {
  if (info?.name) {
    return info.version ? `${info.name} · ${info.version}` : info.name;
  }
  if (versionId) {
    if (versionId.length <= shortKeep) return versionId;
    return `${versionId.slice(0, shortKeep)}…`;
  }
  return '-';
}

async function resolveModelVersionDisplay(
  modelVersionId: string,
  options?: { [key: string]: unknown },
): Promise<VersionDisplayInfo | undefined> {
  const cached = modelDisplayCache.get(modelVersionId);
  if (cached) return cached;

  try {
    const res = await getModelDetail(modelVersionId, {
      skipErrorHandler: true,
      ...options,
    });
    const item = res?.data;
    if (item?.name && !isVersionId(item.name)) {
      const info: VersionDisplayInfo = {
        name: item.name,
        version: item.version,
      };
      modelDisplayCache.set(modelVersionId, info);
      return info;
    }
  } catch {
    // 忽略单条解析失败
  }
  return undefined;
}

async function resolveDatasetVersionDisplay(
  datasetVersionId: string,
  options?: { [key: string]: unknown },
): Promise<VersionDisplayInfo | undefined> {
  const cached = datasetDisplayCache.get(datasetVersionId);
  if (cached) return cached;

  try {
    const versionRes = await getDatasetVersion(datasetVersionId, {
      skipErrorHandler: true,
      ...options,
    });
    const version = versionRes?.data;
    if (!version?.assetId) return undefined;

    const assetRes = await getDatasetAsset(version.assetId, {
      skipErrorHandler: true,
      ...options,
    });
    const name = assetRes?.data?.name;
    if (name && !isVersionId(name)) {
      const info: VersionDisplayInfo = {
        name,
        version: version.version,
      };
      datasetDisplayCache.set(datasetVersionId, info);
      return info;
    }
  } catch {
    // 忽略单条解析失败
  }
  return undefined;
}

function pickCodeZipFileName(data?: {
  fileName?: string;
  codeAssetName?: string;
}): string | undefined {
  const fileName = data?.fileName?.trim();
  if (!fileName) return undefined;
  const assetName = data?.codeAssetName?.trim();
  // 仅当 fileName 与资产名称相同且不像 zip 文件名时，视为无效回退
  if (
    assetName &&
    fileName === assetName &&
    !/\.(zip|tar|gz|tgz)$/i.test(fileName)
  ) {
    return undefined;
  }
  return fileName;
}

async function resolveCodeVersionDisplay(
  codeVersionId: string,
  options?: { [key: string]: unknown },
): Promise<CodeVersionDisplayInfo | undefined> {
  const cached = codeDisplayCache.get(codeVersionId);
  if (cached) return cached;

  try {
    const res = await getCodeVersionDetail(codeVersionId, {
      skipErrorHandler: true,
      ...options,
    });
    const fileName = pickCodeZipFileName(res?.data);
    if (fileName) {
      const info: CodeVersionDisplayInfo = { fileName };
      codeDisplayCache.set(codeVersionId, info);
      codeDisplayResolved.add(codeVersionId);
      return info;
    }
  } catch {
    // 尝试列表接口
  }

  try {
    const listRes = await fetchCodeVersionList(
      { pageSize: 500 },
      { skipErrorHandler: true, ...options },
    );
    const item = listRes?.data?.find(
      (row) => row.codeVersionId === codeVersionId,
    );
    const fileName = pickCodeZipFileName(item);
    if (fileName) {
      const info: CodeVersionDisplayInfo = { fileName };
      codeDisplayCache.set(codeVersionId, info);
      codeDisplayResolved.add(codeVersionId);
      return info;
    }
  } catch {
    // 忽略单条解析失败
  }
  codeDisplayResolved.add(codeVersionId);
  return undefined;
}

/** 根据版本 ID 批量解析用户填写的模型/数据集名称 */
export async function enrichTaskItemsWithDisplayNames<T extends API.TaskItem>(
  items: T[],
  options?: { [key: string]: unknown },
): Promise<T[]> {
  if (!items.length) return items;

  const modelIds = [
    ...new Set(
      items
        .map((item) => item.modelVersionId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];
  const datasetIds = [
    ...new Set(
      items
        .map((item) => item.datasetVersionId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ];

  await Promise.all([
    ...modelIds.map((id) => resolveModelVersionDisplay(id, options)),
    ...datasetIds.map((id) => resolveDatasetVersionDisplay(id, options)),
  ]);

  return items.map((item) => {
    const modelInfo = item.modelVersionId
      ? modelDisplayCache.get(item.modelVersionId)
      : undefined;
    const datasetInfo = item.datasetVersionId
      ? datasetDisplayCache.get(item.datasetVersionId)
      : undefined;

    const modelName =
      item.modelName && !isVersionId(item.modelName)
        ? item.modelName
        : modelInfo?.name;
    const datasetName =
      item.datasetName && !isVersionId(item.datasetName)
        ? item.datasetName
        : datasetInfo?.name;

    return {
      ...item,
      ...(modelName ? { modelName } : {}),
      ...(datasetName ? { datasetName } : {}),
    };
  });
}

export function getModelVersionDisplayLabel(modelVersionId?: string): string {
  if (!modelVersionId) return '-';
  return formatVersionDisplayLabel(
    modelDisplayCache.get(modelVersionId),
    modelVersionId,
  );
}

export function getDatasetVersionDisplayLabel(
  datasetVersionId?: string,
): string {
  if (!datasetVersionId) return '-';
  return formatVersionDisplayLabel(
    datasetDisplayCache.get(datasetVersionId),
    datasetVersionId,
  );
}

/** 展示上传的训练代码 zip 文件名（不用 codeAssetName 作为首选） */
export function getCodeVersionDisplayLabel(codeVersionId?: string): string {
  if (!codeVersionId) return '-';
  const info = codeDisplayCache.get(codeVersionId);
  if (info?.fileName) return info.fileName;
  if (codeDisplayResolved.has(codeVersionId)) return codeVersionId;
  return '加载中…';
}

/** 预加载指定版本 ID 的展示名称（详情页单条使用） */
export async function preloadTaskVersionDisplayNames(
  modelVersionId?: string,
  datasetVersionId?: string,
  codeVersionId?: string,
  options?: { [key: string]: unknown },
) {
  await Promise.all([
    modelVersionId
      ? resolveModelVersionDisplay(modelVersionId, options)
      : Promise.resolve(undefined),
    datasetVersionId
      ? resolveDatasetVersionDisplay(datasetVersionId, options)
      : Promise.resolve(undefined),
    codeVersionId
      ? resolveCodeVersionDisplay(codeVersionId, options)
      : Promise.resolve(undefined),
  ]);
}

/** 批量预加载数据集版本展示名称（版本历史表等） */
export async function preloadDatasetVersionDisplayNames(
  datasetVersionIds: string[],
  options?: { [key: string]: unknown },
) {
  const unique = [
    ...new Set(
      datasetVersionIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ];
  await Promise.all(
    unique.map((id) => resolveDatasetVersionDisplay(id, options)),
  );
}

/** 批量预加载训练代码版本展示名称（版本历史表等） */
export async function preloadCodeVersionDisplayNames(
  codeVersionIds: string[],
  options?: { [key: string]: unknown },
) {
  const unique = [
    ...new Set(
      codeVersionIds.filter(
        (id): id is string => typeof id === 'string' && id.length > 0,
      ),
    ),
  ];
  await Promise.all(unique.map((id) => resolveCodeVersionDisplay(id, options)));
}
