/**
 * 算力资源监控 - Services 层
 * 优先请求真实接口，失败时 fallback 到 mock（与 task/list 模式一致）
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';
import {
  mockCancelResourceQueueTask,
  mockCreateResourceServer,
  mockDeleteResourceServer,
  mockFetchResourceMetrics,
  mockFetchResourceServerDetail,
  mockFetchResourceServers,
  mockFetchResourceSummary,
  mockReorderResourceQueueTask,
  mockUpdateResourceQueuePriority,
} from '@/pages/task/resourceMonitor/mockData';

export type MetricInterval = '1min' | '10min' | '1hour' | '1day';

export type ResourceMonitorResponse<T> = {
  success: boolean;
  data: T;
  errorMessage?: string | null;
};

export type AddServerPayload = {
  serverIp: string;
  hostname: string;
  specs?: {
    cpu?: string;
    memory?: string;
    gpu?: string;
    os?: string;
  };
};

const { ENDPOINTS } = API_CONFIG;

/** GET /resource-monitor/summary */
export async function fetchResourceMonitorSummary(options?: { skipErrorHandler?: boolean }) {
  try {
    return await request<ResourceMonitorResponse<API.ResourceMonitorSummary>>(
      ENDPOINTS.RESOURCE_MONITOR_SUMMARY,
      { method: 'GET', ...(options || {}) },
    );
  } catch {
    return mockFetchResourceSummary();
  }
}

/** GET /resource-monitor/servers */
export async function fetchResourceMonitorServers(
  params?: { keyword?: string; status?: string },
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<ResourceMonitorResponse<API.ResourceMonitorServerItem[]>>(
      ENDPOINTS.RESOURCE_MONITOR_SERVERS,
      { method: 'GET', params, ...(options || {}) },
    );
  } catch {
    return mockFetchResourceServers(params);
  }
}

/** GET /resource-monitor/servers/{serverIp} */
export async function fetchResourceMonitorServerDetail(
  serverIp: string,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<ResourceMonitorResponse<API.ResourceMonitorServerItem>>(
      ENDPOINTS.RESOURCE_MONITOR_SERVER(serverIp),
      { method: 'GET', ...(options || {}) },
    );
  } catch {
    return mockFetchResourceServerDetail(serverIp);
  }
}

/** GET /resource-monitor/servers/{serverIp}/metrics */
export async function fetchResourceMonitorMetrics(
  serverIp: string,
  interval: MetricInterval = '1hour',
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<ResourceMonitorResponse<API.ResourceMonitorMetrics>>(
      ENDPOINTS.RESOURCE_MONITOR_METRICS(serverIp),
      { method: 'GET', params: { interval }, ...(options || {}) },
    );
  } catch {
    return mockFetchResourceMetrics(serverIp, interval);
  }
}

/** POST /resource-monitor/servers */
export async function createResourceMonitorServer(
  payload: AddServerPayload,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<ResourceMonitorResponse<API.ResourceMonitorServerItem>>(
      ENDPOINTS.RESOURCE_MONITOR_SERVERS,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        data: payload,
        ...(options || {}),
      },
    );
  } catch {
    return mockCreateResourceServer(payload);
  }
}

/** DELETE /resource-monitor/servers/{serverIp} */
export async function deleteResourceMonitorServer(
  serverIp: string,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<ResourceMonitorResponse<null>>(
      ENDPOINTS.RESOURCE_MONITOR_SERVER(serverIp),
      { method: 'DELETE', ...(options || {}) },
    );
  } catch {
    return mockDeleteResourceServer(serverIp);
  }
}

/** PUT /resource-monitor/servers/{serverIp}/queue/reorder */
export async function reorderResourceQueueTask(
  serverIp: string,
  body: { taskId: string; direction: 'up' | 'down' },
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<ResourceMonitorResponse<{ queuedTasks: API.ResourceMonitorQueuedTask[] }>>(
      ENDPOINTS.RESOURCE_MONITOR_QUEUE_REORDER(serverIp),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: body,
        ...(options || {}),
      },
    );
  } catch {
    return mockReorderResourceQueueTask(serverIp, body);
  }
}

/** PUT /resource-monitor/servers/{serverIp}/queue/priority */
export async function updateResourceQueuePriority(
  serverIp: string,
  body: { taskId: string; priority: '高' | '中' | '低' },
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<ResourceMonitorResponse<{ queuedTasks: API.ResourceMonitorQueuedTask[] }>>(
      ENDPOINTS.RESOURCE_MONITOR_QUEUE_PRIORITY(serverIp),
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        data: body,
        ...(options || {}),
      },
    );
  } catch {
    return mockUpdateResourceQueuePriority(serverIp, body);
  }
}

/** DELETE /resource-monitor/servers/{serverIp}/queue/{taskId} */
export async function cancelResourceQueueTask(
  serverIp: string,
  taskId: string,
  options?: { skipErrorHandler?: boolean },
) {
  try {
    return await request<ResourceMonitorResponse<{ queuedTasks: API.ResourceMonitorQueuedTask[] }>>(
      ENDPOINTS.RESOURCE_MONITOR_QUEUE_TASK(serverIp, taskId),
      { method: 'DELETE', ...(options || {}) },
    );
  } catch {
    return mockCancelResourceQueueTask(serverIp, taskId);
  }
}
