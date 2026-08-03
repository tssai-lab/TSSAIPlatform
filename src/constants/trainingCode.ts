/**
 * 训练代码审核相关配置读取。
 *
 * 系统管理 → 系统配置中的「训练代码管理员审核」开关：
 * - 关闭（默认）：自动审核通过，无需管理员人工审核
 * - 开启：走待审 / 人工通过拒绝流程
 *
 * 配置优先读系统配置接口；前端同时缓存到 localStorage，供上传/发布等非 React 路径读取。
 */
import { STORAGE_KEYS, storage } from '@/utils/storage';

const DEFAULT_ADMIN_REVIEW = false;

/** @deprecated 请改用 isTrainingCodeAutoApproveEnabled()；保留仅为兼容旧引用 */
export const TRAINING_CODE_AUTO_APPROVE = !DEFAULT_ADMIN_REVIEW;

export type TrainingCodeReviewLocalConfig = {
  /** true = 启用管理员人工审核；false/缺省 = 自动通过 */
  enableTrainingCodeAdminReview: boolean;
};

export function getTrainingCodeReviewLocalConfig(): TrainingCodeReviewLocalConfig {
  const cached = storage.get<Partial<TrainingCodeReviewLocalConfig>>(
    STORAGE_KEYS.TRAINING_CODE_REVIEW_CONFIG,
  );
  return {
    enableTrainingCodeAdminReview:
      cached?.enableTrainingCodeAdminReview ?? DEFAULT_ADMIN_REVIEW,
  };
}

export function setTrainingCodeReviewLocalConfig(
  config: Partial<TrainingCodeReviewLocalConfig>,
) {
  const next = {
    ...getTrainingCodeReviewLocalConfig(),
    ...config,
  };
  storage.set(STORAGE_KEYS.TRAINING_CODE_REVIEW_CONFIG, next);
  return next;
}

/** 是否启用管理员人工审核（系统配置开关，默认 false） */
export function isTrainingCodeAdminReviewEnabled(): boolean {
  return getTrainingCodeReviewLocalConfig().enableTrainingCodeAdminReview;
}

/** 是否自动审核通过（管理员审核关闭时为 true） */
export function isTrainingCodeAutoApproveEnabled(): boolean {
  return !isTrainingCodeAdminReviewEnabled();
}

/**
 * 从系统配置接口同步训练代码审核开关到本机缓存。
 * 接口失败时保留已有缓存 / 默认值（管理员审核关闭）。
 */
export async function syncTrainingCodeReviewConfigFromServer(options?: {
  [key: string]: any;
}): Promise<TrainingCodeReviewLocalConfig> {
  try {
    const { fetchSystemConfig } = await import('@/services/system/config');
    const res = await fetchSystemConfig({
      skipErrorHandler: true,
      ...(options || {}),
    });
    if (res?.code === 200 && res.data) {
      const enableAdminReview =
        res.data.enableTrainingCodeAdminReview ??
        String(res.data.trainingCodeReviewMode || '').toUpperCase() ===
          'STANDARD_REVIEW';
      return setTrainingCodeReviewLocalConfig({
        enableTrainingCodeAdminReview: enableAdminReview,
      });
    }
  } catch {
    // 保留本地缓存
  }
  return getTrainingCodeReviewLocalConfig();
}
