/**
 * 系统配置模块 - Services 层
 * 对齐 GET/POST /api/system/config/*
 * data: trainingCodeReviewMode, logMaxSize, userLogStorageLimitMb, updatedAt
 */
import { request } from '@umijs/max';
import { SYSTEM_API_CONFIG } from '@/constants/system';

export type TrainingCodeReviewMode = 'DIRECT_PASS' | 'STANDARD_REVIEW';

export const DEFAULT_USER_LOG_LIMIT_MB = 50;
export const MIN_USER_LOG_LIMIT_MB = 1;
export const MAX_USER_LOG_LIMIT_MB = 10240;

export interface SystemConfig {
  /**
   * 前端开关：false=DIRECT_PASS，true=STANDARD_REVIEW
   */
  enableTrainingCodeAdminReview?: boolean;
  /** 后端字段 */
  trainingCodeReviewMode?: TrainingCodeReviewMode;
  /** 每用户日志上限 MB（写接口用 logMaxSize） */
  logMaxSize?: number;
  /** 与 logMaxSize 等价，读响应两者都会返回 */
  userLogStorageLimitMb?: number;
  updatedAt?: string;
}

export function reviewModeFromAdminFlag(
  enableAdminReview?: boolean,
): TrainingCodeReviewMode {
  return enableAdminReview ? 'STANDARD_REVIEW' : 'DIRECT_PASS';
}

export function adminFlagFromReviewMode(mode?: string | null): boolean {
  return String(mode || '').toUpperCase() === 'STANDARD_REVIEW';
}

function resolveUserLogLimitMb(raw?: Partial<SystemConfig> | null): number {
  const value = raw?.userLogStorageLimitMb ?? raw?.logMaxSize;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(
      MAX_USER_LOG_LIMIT_MB,
      Math.max(MIN_USER_LOG_LIMIT_MB, Math.floor(value)),
    );
  }
  return DEFAULT_USER_LOG_LIMIT_MB;
}

export function normalizeSystemConfig(
  raw?: Partial<SystemConfig> | null,
): SystemConfig {
  const mode =
    raw?.trainingCodeReviewMode ||
    reviewModeFromAdminFlag(raw?.enableTrainingCodeAdminReview);
  const limitMb = resolveUserLogLimitMb(raw);
  return {
    trainingCodeReviewMode: mode,
    enableTrainingCodeAdminReview: adminFlagFromReviewMode(mode),
    logMaxSize: limitMb,
    userLogStorageLimitMb: limitMb,
    updatedAt: raw?.updatedAt,
  };
}

/** 获取系统配置 GET /api/system/config/get */
export async function fetchSystemConfig(options?: { [key: string]: any }) {
  const res = await request<{
    code: number;
    message: string;
    data: SystemConfig;
  }>(SYSTEM_API_CONFIG.ENDPOINTS.CONFIG_GET, {
    method: 'GET',
    ...(options || {}),
  });
  if (res?.data) {
    return { ...res, data: normalizeSystemConfig(res.data) };
  }
  return res;
}

/** 更新系统配置 POST /api/system/config/update */
export async function updateSystemConfig(
  params: SystemConfig,
  options?: { [key: string]: any },
) {
  const trainingCodeReviewMode =
    params.trainingCodeReviewMode ||
    reviewModeFromAdminFlag(params.enableTrainingCodeAdminReview);
  const logMaxSize = resolveUserLogLimitMb(params);
  const res = await request<{
    code: number;
    message: string;
    data?: SystemConfig;
  }>(SYSTEM_API_CONFIG.ENDPOINTS.CONFIG_UPDATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: {
      trainingCodeReviewMode,
      logMaxSize,
    },
    ...(options || {}),
  });
  if (res?.data) {
    return { ...res, data: normalizeSystemConfig(res.data) };
  }
  return {
    ...res,
    data: normalizeSystemConfig({
      ...params,
      trainingCodeReviewMode,
      logMaxSize,
    }),
  };
}
