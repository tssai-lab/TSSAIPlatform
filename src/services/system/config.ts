/**
 * 系统配置模块 - Services 层
 * 封装系统配置相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
import { SYSTEM_API_CONFIG } from '@/constants/system';

export interface SystemConfig {
  enableAuditLog: boolean;
}

/** 获取系统配置 GET /api/system/config/get */
export async function fetchSystemConfig(options?: { [key: string]: any }) {
  return request<{ code: number; message: string; data: SystemConfig }>(
    SYSTEM_API_CONFIG.ENDPOINTS.CONFIG_GET,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** 更新系统配置 POST /api/system/config/update */
export async function updateSystemConfig(
  params: SystemConfig,
  options?: { [key: string]: any },
) {
  return request<{ code: number; message: string; data?: SystemConfig }>(
    SYSTEM_API_CONFIG.ENDPOINTS.CONFIG_UPDATE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: params,
      ...(options || {}),
    },
  );
}
