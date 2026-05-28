import { request } from '@umijs/max';
import { SYSTEM_API_CONFIG } from '@/constants/system';
import type { CurrentUserRoleForApi } from './user';

/** 模块一统一响应 */
type Module1Result<T> = {
  code: number;
  message?: string;
  msg?: string;
  data?: T;
};

/** 后端操作日志原始字段 */
type OperationLogRaw = {
  id?: number;
  userId?: number;
  userName?: string;
  operationType?: string;
  operationObj?: string;
  ipAddress?: string;
  operationTime?: string;
  remarks?: string;
  status?: string;
};

type OperationLogQueryData = {
  records?: OperationLogRaw[];
  total?: number;
  page?: number;
  size?: number;
};

/** 查询日志列表请求参数 */
export interface LogListParams {
  pageNum?: number;
  pageSize?: number;
  username?: string;
  operateType?: string;
  operateTime?: string[];
  ip?: string;
  result?: string;
  currentUserRole?: CurrentUserRoleForApi;
  /** 个人中心：仅当前用户 */
  currentUsername?: string;
  content?: string;
}

/** 查询日志列表响应（兼容页面使用的 msg 字段） */
export interface LogListResponse {
  code: number;
  msg: string;
  data: {
    list: LogItem[];
    total: number;
  };
}

/** 页面展示用日志项 */
export interface LogItem {
  id: number;
  username: string;
  operateType: string;
  operateTime: string;
  ip: string;
  content: string;
  result: 'success' | 'failed';
}

export interface CommonResponse<T = unknown> {
  code: number;
  msg: string;
  data?: T;
}

function getResultMessage(res?: Module1Result<unknown>): string {
  return res?.message ?? res?.msg ?? '';
}

function mapStatusToResult(status?: string): 'success' | 'failed' {
  const s = (status ?? '').toUpperCase();
  if (s === 'FAIL' || s === 'FAILED' || s === '失败') {
    return 'failed';
  }
  return 'success';
}

function mapResultToStatus(result?: string): string | undefined {
  if (!result) return undefined;
  if (result === 'failed') return 'FAIL';
  if (result === 'success') return 'SUCCESS';
  return result;
}

function formatOperationTime(value?: string): string {
  if (!value) return '';
  return value.replace('T', ' ').slice(0, 19);
}

function mapOperationLogToLogItem(
  raw: OperationLogRaw,
  typeLabelMap?: Record<string, string>,
): LogItem {
  const typeKey = raw.operationType ?? '';
  return {
    id: Number(raw.id ?? 0),
    username: raw.userName ?? '',
    operateType: typeLabelMap?.[typeKey] ?? typeKey,
    operateTime: formatOperationTime(raw.operationTime),
    ip: raw.ipAddress ?? '',
    content: raw.remarks ?? '',
    result: mapStatusToResult(raw.status),
  };
}

function applyClientFilters(list: LogItem[], params: LogListParams): LogItem[] {
  let rows = [...list];

  if (params.currentUsername) {
    rows = rows.filter((r) => r.username === params.currentUsername);
  }

  if (params.username?.trim()) {
    const kw = params.username.trim().toLowerCase();
    rows = rows.filter((r) => r.username.toLowerCase().includes(kw));
  }

  if (params.content?.trim()) {
    const kw = params.content.trim();
    rows = rows.filter((r) => r.content.includes(kw));
  }

  if (params.ip?.trim()) {
    const kw = params.ip.trim();
    rows = rows.filter((r) => r.ip.includes(kw));
  }

  if (params.operateTime?.length === 2 && params.operateTime[0] && params.operateTime[1]) {
    const start = params.operateTime[0];
    const end = params.operateTime[1];
    rows = rows.filter((r) => r.operateTime >= start && r.operateTime <= end);
  }

  return rows;
}

async function loadOperationTypeLabelMap(): Promise<Record<string, string>> {
  try {
    const res = await request<Module1Result<Record<string, string>>>(
      SYSTEM_API_CONFIG.ENDPOINTS.LOG_OPERATION_TYPES,
      { method: 'GET', skipErrorHandler: true },
    );
    if (res.code !== 200 || !res.data) {
      return {};
    }
    return res.data;
  } catch {
    return {};
  }
}

function toOperationLogQueryBody(params: LogListParams) {
  const body: Record<string, unknown> = {
    page: params.pageNum ?? 1,
    size: params.pageSize ?? 10,
    operationType: params.operateType || undefined,
    status: mapResultToStatus(params.result),
  };
  if (params.operateTime?.length === 2) {
    body.startTime = params.operateTime[0];
    body.endTime = params.operateTime[1];
  }
  return body;
}

/** POST /log/query（操作日志分页） */
export async function queryOperationLogs(
  params?: LogListParams,
  options?: { [key: string]: any },
) {
  return request<Module1Result<OperationLogQueryData>>(
    SYSTEM_API_CONFIG.ENDPOINTS.LOG_QUERY,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: params ? toOperationLogQueryBody(params) : { page: 1, size: 10 },
      ...(options || {}),
    },
  );
}

/** 查询操作日志列表 POST /log/query */
export async function getLogList(params: LogListParams): Promise<LogListResponse> {
  const typeLabelMap = await loadOperationTypeLabelMap();
  const res = await queryOperationLogs(params);
  const msg = getResultMessage(res);
  if (res.code !== 200) {
    return { code: res.code ?? 500, msg: msg || '查询失败', data: { list: [], total: 0 } };
  }
  const records = res.data?.records ?? [];
  let list = records.map((row) => mapOperationLogToLogItem(row, typeLabelMap));
  list = applyClientFilters(list, params);
  return {
    code: 200,
    msg: msg || 'ok',
    data: { list, total: res.data?.total ?? list.length },
  };
}

/** ProTable request 适配 */
export async function fetchLogList(params: LogListParams): Promise<LogListResponse> {
  return getLogList(params);
}
