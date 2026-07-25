/**
 * 训练代码审核相关配置读取。
 *
 * 对接后端 `trainingCodeReviewMode`：
 * - DIRECT_PASS：自动通过（不跑风险扫描/不等人工）
 * - STANDARD_REVIEW：标准审核链路
 *
 * 系统管理页开关「训练代码管理员审核」：
 * - 关闭 → DIRECT_PASS
 * - 开启 → STANDARD_REVIEW
 *
 * 配置优先读系统配置接口；前端同时缓存到 localStorage。
 */
import { STORAGE_KEYS, storage } from '@/utils/storage';

const DEFAULT_ADMIN_REVIEW = false;

/** @deprecated 请改用 isTrainingCodeAutoApproveEnabled()；保留仅为兼容旧引用 */
export const TRAINING_CODE_AUTO_APPROVE = !DEFAULT_ADMIN_REVIEW;

export type TrainingCodeReviewLocalConfig = {
  /** true = STANDARD_REVIEW；false = DIRECT_PASS */
  enableTrainingCodeAdminReview: boolean;
  trainingCodeReviewMode?: 'DIRECT_PASS' | 'STANDARD_REVIEW';
};

export function getTrainingCodeReviewLocalConfig(): TrainingCodeReviewLocalConfig {
  const cached = storage.get<Partial<TrainingCodeReviewLocalConfig>>(
    STORAGE_KEYS.TRAINING_CODE_REVIEW_CONFIG,
  );
  const enable = cached?.enableTrainingCodeAdminReview ?? DEFAULT_ADMIN_REVIEW;
  return {
    enableTrainingCodeAdminReview: enable,
    trainingCodeReviewMode:
      cached?.trainingCodeReviewMode ||
      (enable ? 'STANDARD_REVIEW' : 'DIRECT_PASS'),
  };
}

export function setTrainingCodeReviewLocalConfig(
  config: Partial<TrainingCodeReviewLocalConfig>,
) {
  const prev = getTrainingCodeReviewLocalConfig();
  let enable = config.enableTrainingCodeAdminReview;
  let mode = config.trainingCodeReviewMode;
  if (mode) {
    enable = String(mode).toUpperCase() === 'STANDARD_REVIEW';
  } else if (enable != null) {
    mode = enable ? 'STANDARD_REVIEW' : 'DIRECT_PASS';
  } else {
    enable = prev.enableTrainingCodeAdminReview;
    mode = prev.trainingCodeReviewMode;
  }
  const next: TrainingCodeReviewLocalConfig = {
    enableTrainingCodeAdminReview: !!enable,
    trainingCodeReviewMode: mode || 'DIRECT_PASS',
  };
  storage.set(STORAGE_KEYS.TRAINING_CODE_REVIEW_CONFIG, next);
  return next;
}

/** 是否启用管理员人工审核（STANDARD_REVIEW） */
export function isTrainingCodeAdminReviewEnabled(): boolean {
  return getTrainingCodeReviewLocalConfig().enableTrainingCodeAdminReview;
}

/** 是否自动审核通过（DIRECT_PASS） */
export function isTrainingCodeAutoApproveEnabled(): boolean {
  return !isTrainingCodeAdminReviewEnabled();
}

/**
 * 从系统配置接口同步训练代码审核模式到本机缓存。
 * 接口失败时保留已有缓存 / 默认值。
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
      return setTrainingCodeReviewLocalConfig({
        enableTrainingCodeAdminReview:
          res.data.enableTrainingCodeAdminReview ?? false,
        trainingCodeReviewMode: res.data.trainingCodeReviewMode,
      });
    }
  } catch {
    // 保留本地缓存
  }
  return getTrainingCodeReviewLocalConfig();
}
