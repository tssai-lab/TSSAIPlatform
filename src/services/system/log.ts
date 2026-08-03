import { request } from '@umijs/max';
import { SYSTEM_API_CONFIG } from '@/constants/system';

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
  operateTime?: string;
  remarks?: string;
  status?: string;
};

type OperationLogQueryData = {
  records?: OperationLogRaw[];
  total?: number;
  page?: number;
  size?: number;
};

/** POST /api/log/query Body（与后端约定对齐） */
export type OperationLogQueryBody = {
  page?: number;
  size?: number;
  username?: string;
  operationType?: string;
  operationObj?: string;
  status?: string;
  ipAddress?: string;
  remarksKeyword?: string;
  startTime?: string;
  endTime?: string;
};

/** 页面 / ProTable 入参（内部再映射为 Body） */
export interface LogListParams {
  pageNum?: number;
  pageSize?: number;
  username?: string;
  operateType?: string;
  operateTime?: string[];
  ip?: string;
  result?: string;
  /** 操作内容关键词 → remarksKeyword */
  content?: string;
  operationObj?: string;
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

/** 前端 result → 后端 status */
function mapResultToStatus(result?: string): string | undefined {
  if (!result) return undefined;
  if (result === 'failed') return 'FAILED';
  if (result === 'success') return 'SUCCESS';
  return result;
}

/** 展示用本地时间字符串 */
function formatOperationTime(value?: string): string {
  if (!value) return '';
  return value.replace('T', ' ').slice(0, 19);
}

/**
 * 查询时间进 Body：后端示例为 2026-01-01T00:00:00
 * 已是 ISO 则规范化；否则把空格换成 T
 */
function toApiDateTime(value?: string): string | undefined {
  if (!value?.trim()) return undefined;
  const normalized = value.trim().replace(' ', 'T');
  return normalized.slice(0, 19);
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
    operateTime: formatOperationTime(raw.operateTime ?? raw.operationTime),
    ip: raw.ipAddress ?? '',
    content: raw.remarks ?? '',
    result: mapStatusToResult(raw.status),
  };
}

/** GET /api/log/types */
export async function getOperationTypes(options?: {
  [key: string]: unknown;
}): Promise<Record<string, string>> {
  try {
    const res = await request<Module1Result<Record<string, string>>>(
      SYSTEM_API_CONFIG.ENDPOINTS.LOG_OPERATION_TYPES,
      { method: 'GET', skipErrorHandler: true, ...(options || {}) },
    );
    if (res.code !== 200 || !res.data) {
      return {};
    }
    return res.data;
  } catch {
    return {};
  }
}

/** ProTable valueEnum：key 为后端 operationType */
export async function getOperationTypeValueEnum(): Promise<
  Record<string, { text: string }>
> {
  const map = await getOperationTypes();
  return Object.fromEntries(
    Object.entries(map).map(([key, label]) => [key, { text: label }]),
  );
}

function toOperationLogQueryBody(params: LogListParams): OperationLogQueryBody {
  const body: OperationLogQueryBody = {
    page: params.pageNum ?? 1,
    size: params.pageSize ?? 10,
  };

  const username = params.username?.trim();
  if (username) body.username = username;

  const operationType = params.operateType?.trim();
  if (operationType) body.operationType = operationType;

  const operationObj = params.operationObj?.trim();
  if (operationObj) body.operationObj = operationObj;

  const status = mapResultToStatus(params.result);
  if (status) body.status = status;

  const ipAddress = params.ip?.trim();
  if (ipAddress) body.ipAddress = ipAddress;

  const remarksKeyword = params.content?.trim();
  if (remarksKeyword) body.remarksKeyword = remarksKeyword;

  if (params.operateTime?.length === 2) {
    const startTime = toApiDateTime(params.operateTime[0]);
    const endTime = toApiDateTime(params.operateTime[1]);
    if (startTime) body.startTime = startTime;
    if (endTime) body.endTime = endTime;
  }

  return body;
}

/** POST /api/log/query */
export async function queryOperationLogs(
  params?: LogListParams,
  options?: { [key: string]: unknown },
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

/**
 * 查询操作日志列表
 * - 条件全部进 Body，不做前端二次过滤
 * - 个人中心：不要传 username，由后端按 Token 限定本人
 */
export async function getLogList(
  params: LogListParams,
): Promise<LogListResponse> {
  const typeLabelMap = await getOperationTypes();
  const res = await queryOperationLogs(params);
  const msg = getResultMessage(res);
  if (res.code !== 200) {
    return {
      code: res.code ?? 500,
      msg: msg || '查询失败',
      data: { list: [], total: 0 },
    };
  }
  const records = res.data?.records ?? [];
  const list = records.map((row) =>
    mapOperationLogToLogItem(row, typeLabelMap),
  );
  return {
    code: 200,
    msg: msg || 'ok',
    data: {
      list,
      total: res.data?.total ?? list.length,
    },
  };
}

/** ProTable request 适配 */
export async function fetchLogList(
  params: LogListParams,
): Promise<LogListResponse> {
  return getLogList(params);
}
