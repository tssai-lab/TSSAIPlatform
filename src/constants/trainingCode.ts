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
 * 注意：GET/POST /api/system/config/* 仅管理员可用；普通用户会 403。
 * 因此不能把「同步失败 / 未同步」当成「审核已关闭」。
 */
import { STORAGE_KEYS, storage } from '@/utils/storage';

const DEFAULT_ADMIN_REVIEW = false;

/** @deprecated 请改用 isTrainingCodeAutoApproveEnabled()；保留仅为兼容旧引用 */
export const TRAINING_CODE_AUTO_APPROVE = !DEFAULT_ADMIN_REVIEW;

export type TrainingCodeReviewLocalConfig = {
  /** true = STANDARD_REVIEW；false = DIRECT_PASS */
  enableTrainingCodeAdminReview: boolean;
  trainingCodeReviewMode?: 'DIRECT_PASS' | 'STANDARD_REVIEW';
  /** 是否已从服务端成功同步（普通用户通常为 false） */
  syncedFromServer?: boolean;
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
    syncedFromServer: cached?.syncedFromServer === true,
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
    syncedFromServer:
      config.syncedFromServer != null
        ? !!config.syncedFromServer
        : prev.syncedFromServer === true,
  };
  storage.set(STORAGE_KEYS.TRAINING_CODE_REVIEW_CONFIG, next);
  return next;
}

/** 是否已从服务端成功读到审核开关（管理员保存/拉取后为 true） */
export function hasSyncedTrainingCodeReviewConfig(): boolean {
  return getTrainingCodeReviewLocalConfig().syncedFromServer === true;
}

/**
 * 是否启用管理员人工审核（STANDARD_REVIEW）。
 * 未同步成功前不假定已关闭，避免普通用户 403 后被误导。
 */
export function isTrainingCodeAdminReviewEnabled(): boolean {
  const cfg = getTrainingCodeReviewLocalConfig();
  if (!cfg.syncedFromServer) return true;
  return cfg.enableTrainingCodeAdminReview;
}

/**
 * 是否自动审核通过（DIRECT_PASS）。
 * 未同步成功前返回 false，避免前端误走「自动审批」旁路。
 */
export function isTrainingCodeAutoApproveEnabled(): boolean {
  const cfg = getTrainingCodeReviewLocalConfig();
  if (!cfg.syncedFromServer) return false;
  return !cfg.enableTrainingCodeAdminReview;
}

/**
 * 从系统配置接口同步训练代码审核模式到本机缓存。
 * 接口失败（含普通用户 403）时保留已有缓存，且不得写成「已关闭」。
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
        syncedFromServer: true,
      });
    }
  } catch {
    // 保留本地缓存；普通用户 403 时保持 syncedFromServer 原值
  }
  return getTrainingCodeReviewLocalConfig();
}
