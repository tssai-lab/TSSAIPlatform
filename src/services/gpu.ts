/**
 * GPU 资源概况 — 待后端实现
 * 当前返回演示数据，接口就绪后替换 fetchGpuResourceOverview 内部实现即可。
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';

export type GpuDeviceStatus = 'idle' | 'busy' | 'offline';

export type GpuDevice = {
  id: string;
  name: string;
  index: number;
  status: GpuDeviceStatus;
  memoryUsedMb: number;
  memoryTotalMb: number;
  utilizationPercent: number;
  temperatureC?: number;
  powerWatts?: number;
  assignedTaskName?: string;
  assignedExperimentId?: string;
};

export type GpuResourceOverview = {
  clusterName: string;
  updatedAt: string;
  totalGpus: number;
  availableGpus: number;
  busyGpus: number;
  offlineGpus: number;
  avgUtilizationPercent: number;
  avgMemoryUsedPercent: number;
  devices: GpuDevice[];
  /** 是否为前端演示数据（后端接口未接入时为 true） */
  isMock?: boolean;
};

function buildMockGpuOverview(): GpuResourceOverview {
  const now = new Date().toISOString();
  const devices: GpuDevice[] = [
    {
      id: 'gpu-0',
      name: 'NVIDIA A100 80GB',
      index: 0,
      status: 'busy',
      memoryUsedMb: 62400,
      memoryTotalMb: 81920,
      utilizationPercent: 92,
      temperatureC: 71,
      powerWatts: 312,
      assignedTaskName: 'YOLOv8 目标检测训练',
      assignedExperimentId: 'exp-demo-001',
    },
    {
      id: 'gpu-1',
      name: 'NVIDIA A100 80GB',
      index: 1,
      status: 'busy',
      memoryUsedMb: 51200,
      memoryTotalMb: 81920,
      utilizationPercent: 78,
      temperatureC: 68,
      powerWatts: 285,
      assignedTaskName: 'BERT 文本分类微调',
      assignedExperimentId: 'exp-demo-002',
    },
    {
      id: 'gpu-2',
      name: 'NVIDIA A100 80GB',
      index: 2,
      status: 'idle',
      memoryUsedMb: 1024,
      memoryTotalMb: 81920,
      utilizationPercent: 0,
      temperatureC: 42,
      powerWatts: 58,
    },
    {
      id: 'gpu-3',
      name: 'NVIDIA A100 80GB',
      index: 3,
      status: 'offline',
      memoryUsedMb: 0,
      memoryTotalMb: 81920,
      utilizationPercent: 0,
    },
  ];

  const online = devices.filter((d) => d.status !== 'offline');
  const busy = devices.filter((d) => d.status === 'busy');
  const available = devices.filter((d) => d.status === 'idle');
  const avgUtilization =
    online.length > 0
      ? Math.round(
          online.reduce((sum, d) => sum + d.utilizationPercent, 0) / online.length,
        )
      : 0;
  const avgMemory =
    online.length > 0
      ? Math.round(
          (online.reduce((sum, d) => sum + d.memoryUsedMb / d.memoryTotalMb, 0) /
            online.length) *
            100,
        )
      : 0;

  return {
    clusterName: '训练集群 · Node-01',
    updatedAt: now,
    totalGpus: devices.length,
    availableGpus: available.length,
    busyGpus: busy.length,
    offlineGpus: devices.filter((d) => d.status === 'offline').length,
    avgUtilizationPercent: avgUtilization,
    avgMemoryUsedPercent: avgMemory,
    devices,
    isMock: true,
  };
}

/** 查询 GPU 资源使用概况（后端未实现时回退演示数据） */
export async function fetchGpuResourceOverview(options?: {
  skipErrorHandler?: boolean;
  [key: string]: unknown;
}): Promise<GpuResourceOverview> {
  try {
    const res = await request<{ success?: boolean; data?: GpuResourceOverview }>(
      API_CONFIG.ENDPOINTS.GPU_OVERVIEW,
      {
        method: 'GET',
        skipErrorHandler: true,
        ...options,
      },
    );
    const data = res?.data;
    if (data?.devices?.length) {
      return { ...data, isMock: false };
    }
  } catch {
    // 后端接口未就绪
  }
  return buildMockGpuOverview();
}
