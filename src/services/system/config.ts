/**
 * 系统配置模块 - Services 层
 * 封装系统配置相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
import { SYSTEM_API_CONFIG } from '@/constants/system';

/** 后端契约：训练代码审核模式 */
export type TrainingCodeReviewMode = 'DIRECT_PASS' | 'STANDARD_REVIEW';

export interface SystemConfig {
  enableAuditLog?: boolean;
  /**
   * 前端开关语义（兼容旧 UI）：
   * - false：对应后端 DIRECT_PASS（自动通过）
   * - true：对应后端 STANDARD_REVIEW（标准审核）
   */
  enableTrainingCodeAdminReview?: boolean;
  /** 后端字段；读写时优先使用 */
  trainingCodeReviewMode?: TrainingCodeReviewMode;
  updatedAt?: string;
}

export function reviewModeFromAdminFlag(
  enableAdminReview?: boolean,
): TrainingCodeReviewMode {
  return enableAdminReview ? 'STANDARD_REVIEW' : 'DIRECT_PASS';
}

export function adminFlagFromReviewMode(
  mode?: string | null,
): boolean {
  return String(mode || '').toUpperCase() === 'STANDARD_REVIEW';
}

function normalizeSystemConfig(raw?: Partial<SystemConfig> | null): SystemConfig {
  const mode =
    raw?.trainingCodeReviewMode ||
    reviewModeFromAdminFlag(raw?.enableTrainingCodeAdminReview);
  return {
    enableAuditLog: raw?.enableAuditLog ?? true,
    trainingCodeReviewMode: mode,
    enableTrainingCodeAdminReview: adminFlagFromReviewMode(mode),
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
  const res = await request<{
    code: number;
    message: string;
    data?: SystemConfig;
  }>(SYSTEM_API_CONFIG.ENDPOINTS.CONFIG_UPDATE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: {
      trainingCodeReviewMode,
      ...(params.enableAuditLog != null
        ? { enableAuditLog: params.enableAuditLog }
        : {}),
    },
    ...(options || {}),
  });
  if (res?.data) {
    return { ...res, data: normalizeSystemConfig(res.data) };
  }
  // 部分后端只回 message，用请求体回填本地语义
  return {
    ...res,
    data: normalizeSystemConfig({
      ...params,
      trainingCodeReviewMode,
    }),
  };
}
