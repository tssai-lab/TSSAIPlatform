/**
 * 系统管理-日志管理模块 - Services 层
 * 封装日志管理相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
import { SYSTEM_API_CONFIG } from '@/constants/system';

import type { CurrentUserRoleForApi } from './user';

/** 查询日志列表请求参数 */
export interface LogListParams {
  pageNum?: number;
  pageSize?: number;
  username?: string;
  operateType?: string;
  operateTime?: string[];
  ip?: string;
  result?: string;
  /** 系统日志 | 操作日志 */
  logType?: 'system' | 'operation';
  /** 当前登录用户角色（用于后端按权限返回数据范围） */
  currentUserRole?: CurrentUserRoleForApi;
  /** 仅查看当前用户自己的操作记录（个人中心-我的操作记录） */
  currentUsername?: string;
  /** 操作内容关键词（我的操作记录筛选） */
  content?: string;
}

/** 查询日志列表响应 */
export interface LogListResponse {
  code: number;
  message: string;
  data: {
    list: LogItem[];
    total: number;
  };
}

/** 日志项（username 为操作人姓名/账号） */
export interface LogItem {
  id: number;
  username: string;
  operateType: string;
  operateTime: string; // YYYY-MM-DD HH:mm:ss
  ip: string;
  content: string;
  result: 'success' | 'failed';
  /** 系统日志 | 操作日志 */
  logType?: 'system' | 'operation';
}

/** 通用响应 */
export interface CommonResponse<T = any> {
  code: number;
  message: string;
  data?: T;
}

/** 查询日志列表 GET /api/system/log/list */
export async function fetchLogList(params: LogListParams) {
  return request<LogListResponse>(SYSTEM_API_CONFIG.ENDPOINTS.LOG_LIST, {
    method: 'GET',
    params,
  });
}

/** 导出日志 GET /api/system/log/export */
export async function exportLog(params: LogListParams) {
  return request<CommonResponse>(SYSTEM_API_CONFIG.ENDPOINTS.LOG_EXPORT, {
    method: 'GET',
    params,
  });
}

