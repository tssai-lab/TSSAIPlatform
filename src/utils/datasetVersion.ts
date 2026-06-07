/** 语义化版本号：v{major}.{minor}.{patch} */
export const DATASET_VERSION_PATTERN = /^v\d+\.\d+\.\d+$/;

export const DATASET_VERSION_FORMAT_HINT =
  '格式：vX.Y.Z（如 v1.0.0）；major 不兼容变更，minor 新增数据，patch 修正标注/去重';

export const DATASET_VERSION_DESC_PLACEHOLDER =
  '【更新原因】说明为何发布此版本\n【更新内容】样本增减、标注修正、格式变更等';

export const DATASET_VERSION_DESC_MIN_LENGTH = 10;

const SEMVER_PATTERN = /^v(\d+)\.(\d+)\.(\d+)$/i;
const LEGACY_PATTERN = /^v(\d+)$/i;

export function parseAssetVersion(version: string): [number, number, number] | null {
  const trimmed = version.trim();
  const semver = trimmed.match(SEMVER_PATTERN);
  if (semver) {
    return [Number(semver[1]), Number(semver[2]), Number(semver[3])];
  }
  const legacy = trimmed.match(LEGACY_PATTERN);
  if (legacy) {
    return [Number(legacy[1]), 0, 0];
  }
  return null;
}

export function compareAssetVersion(
  a: [number, number, number],
  b: [number, number, number],
) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

export function getLatestAssetVersion(
  existing: string[],
): [number, number, number] | null {
  let max: [number, number, number] | null = null;
  for (const item of existing) {
    const parsed = parseAssetVersion(item);
    if (!parsed) continue;
    if (!max || compareAssetVersion(parsed, max) > 0) {
      max = parsed;
    }
  }
  return max;
}

export function formatAssetVersionLabel(version: [number, number, number]): string {
  if (version[1] === 0 && version[2] === 0) {
    return `v${version[0]}`;
  }
  return `v${version[0]}.${version[1]}.${version[2]}`;
}

/** 新版本号必须严格大于已有版本中的最大值 */
export function validateVersionGreaterThanLatest(
  version: string,
  existing: string[],
): string | null {
  const parsed = parseAssetVersion(version.trim());
  if (!parsed) return null;
  const max = getLatestAssetVersion(existing);
  if (!max) return null;
  if (compareAssetVersion(parsed, max) <= 0) {
    return `版本号必须大于当前最新版本（${formatAssetVersionLabel(max)}）`;
  }
  return null;
}

/** 根据已有版本号建议下一 patch 版本（如 v1.2.0 → v1.2.1） */
export function suggestNextDatasetVersion(existing: string[]): string {
  const max = getLatestAssetVersion(existing) ?? [0, 0, 0];
  if (max[0] === 0 && max[1] === 0 && max[2] === 0) {
    return 'v1.0.0';
  }
  return `v${max[0]}.${max[1]}.${max[2] + 1}`;
}

export function validateDatasetVersionFormat(version: string): string | null {
  const trimmed = version?.trim();
  if (!trimmed) return '请输入版本号';
  if (!DATASET_VERSION_PATTERN.test(trimmed)) {
    return DATASET_VERSION_FORMAT_HINT;
  }
  return null;
}

export function validateDatasetVersionUnique(
  version: string,
  existing: string[],
  excludeVersion?: string,
): string | null {
  const trimmed = version.trim().toLowerCase();
  const exclude = excludeVersion?.trim().toLowerCase();
  const duplicated = existing.some(
    (item) =>
      item.trim().toLowerCase() === trimmed &&
      item.trim().toLowerCase() !== exclude,
  );
  if (duplicated) return '该版本号已存在，请使用其他版本号';
  return null;
}

export function validateDatasetVersionDescription(desc?: string): string | null {
  const trimmed = desc?.trim();
  if (!trimmed) return '请填写版本描述';
  if (trimmed.length < DATASET_VERSION_DESC_MIN_LENGTH) {
    return `版本描述至少 ${DATASET_VERSION_DESC_MIN_LENGTH} 个字符，请说明更新原因与内容`;
  }
  return null;
}

/** Ant Design Form 版本号校验规则 */
export function datasetVersionFormRules(existingVersions: string[] = [], excludeVersion?: string) {
  return [
    { required: true, message: '请输入版本号' },
    {
      validator: (_: unknown, value: string) => {
        const formatError = validateDatasetVersionFormat(value);
        if (formatError) return Promise.reject(new Error(formatError));
        const uniqueError = validateDatasetVersionUnique(value, existingVersions, excludeVersion);
        if (uniqueError) return Promise.reject(new Error(uniqueError));
        return Promise.resolve();
      },
    },
  ];
}

/** Ant Design Form 版本描述校验规则 */
export function datasetVersionDescFormRules() {
  return [
    { required: true, message: '请填写版本描述' },
    {
      validator: (_: unknown, value: string) => {
        const error = validateDatasetVersionDescription(value);
        if (error) return Promise.reject(new Error(error));
        return Promise.resolve();
      },
    },
  ];
}
