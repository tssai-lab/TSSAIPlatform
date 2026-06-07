import { getDatasetAsset, getDatasetVersion } from '@/services/dataset';
import { getModelDetail } from '@/services/model';

export type VersionDisplayInfo = {
  name: string;
  version?: string;
};

const modelDisplayCache = new Map<string, VersionDisplayInfo>();
const datasetDisplayCache = new Map<string, VersionDisplayInfo>();

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

/** 预加载指定版本 ID 的展示名称（详情页单条使用） */
export async function preloadTaskVersionDisplayNames(
  modelVersionId?: string,
  datasetVersionId?: string,
  options?: { [key: string]: unknown },
) {
  await Promise.all([
    modelVersionId
      ? resolveModelVersionDisplay(modelVersionId, options)
      : Promise.resolve(undefined),
    datasetVersionId
      ? resolveDatasetVersionDisplay(datasetVersionId, options)
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
