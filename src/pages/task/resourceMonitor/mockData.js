/**
 * 算力资源监控 Mock 层
 * 返回结构与真实 API 一致：{ success, data, errorMessage }
 * 联调时由 services/resourceMonitor.ts 在请求失败时 fallback 调用
 */
import moment from 'moment';
import { DEFAULT_QUEUE_PRIORITY, getIntervalSpanLabel } from './constants';
import { renumberManualSortIndices, sortQueuedTasks } from './queueSort';

const TASK_NAMES = [
  'YOLOv8目标检测训练',
  'ResNet50图像分类',
  'BERT文本微调',
  'U-Net语义分割',
  'Stable Diffusion LoRA',
  'PointNet++点云分类',
  'Transformer时序预测',
  'Mask R-CNN实例分割',
];

const MODELS = [
  'YOLOv8',
  'ResNet50',
  'BERT-base',
  'U-Net',
  'SD-1.5',
  'PointNet++',
];
const DATASETS = [
  'COCO2017',
  'ImageNet',
  'SQuAD',
  'Cityscapes',
  'LAION',
  'ModelNet40',
];

const METRIC_INTERVAL_INTERNAL = {
  '1min': { unit: 'minute', step: 1, points: 60 },
  '10min': { unit: 'minute', step: 10, points: 72 },
  '1hour': { unit: 'hour', step: 1, points: 24 },
  '1day': { unit: 'day', step: 1, points: 30 },
};

const seededRandom = (seed) => {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

const randomBetween = (rand, min, max) =>
  +(min + rand() * (max - min)).toFixed(1);

const pickSeeded = (arr, count, rand) => {
  const indices = arr.map((_, idx) => idx).sort(() => rand() - 0.5);
  return indices.slice(0, count).map((idx) => arr[idx]);
};

const IP_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/;

let cachedServers = null;

const createSuccess = (data) => ({
  success: true,
  data,
  errorMessage: null,
});

const buildSummary = (servers) => {
  const total = servers.length;
  const online = servers.filter((s) => s.status === 'online').length;
  const runningTasks = servers.reduce((sum, s) => sum + s.runTask, 0);
  const queuedTasks = servers.reduce((sum, s) => sum + s.waitTask, 0);
  const avgGpu =
    total > 0
      ? (servers.reduce((sum, s) => sum + s.gpuRate, 0) / total).toFixed(1)
      : '0';

  return { total, online, runningTasks, queuedTasks, avgGpu };
};

const generateHistoryPoints = (serverIp, interval = '1hour') => {
  const cfg =
    METRIC_INTERVAL_INTERNAL[interval] || METRIC_INTERVAL_INTERNAL['1hour'];
  const seed = Number(serverIp.split('.').pop()) || 1;
  const rand = seededRandom(
    seed * 7 + interval.split('').reduce((a, c) => a + c.charCodeAt(0), 0),
  );
  const seriesMeta = [
    { type: 'CPU', base: 20, range: 50, offset: seed % 10 },
    { type: '内存', base: 30, range: 45, offset: seed % 8 },
    { type: 'GPU', base: 15, range: 70, offset: seed % 12 },
  ];
  const points = [];

  for (let i = cfg.points - 1; i >= 0; i--) {
    const m = moment().subtract(i * cfg.step, cfg.unit);
    const fullTime = m.format('YYYY-MM-DD HH:mm:ss');
    let time;
    switch (interval) {
      case '1min':
        time = m.format('HH:mm');
        break;
      case '10min':
        time = m.format('HH:mm');
        break;
      case '1hour':
        time = m.format('MM-DD HH');
        break;
      case '1day':
        time = m.format('MM-DD');
        break;
      default:
        time = fullTime;
    }
    seriesMeta.forEach(({ type, base, range, offset }) => {
      const wave = Math.sin((i / cfg.points) * Math.PI * 2) * 8;
      points.push({
        time,
        fullTime,
        tickIndex: i,
        type,
        value: Math.min(
          99,
          Math.max(
            5,
            +(base + rand() * range + offset * 0.3 + wave).toFixed(1),
          ),
        ),
      });
    });
  }

  return points;
};

const ensureServers = (count = 12) => {
  if (cachedServers) return cachedServers;

  cachedServers = Array.from({ length: count }, (_, i) => {
    const ip = `192.168.1.${101 + i}`;
    const rand = seededRandom(101 + i);
    const runCount = Math.floor(rand() * 3);
    const waitCount = Math.floor(rand() * 5);
    const runningTasks = pickSeeded(TASK_NAMES, runCount, rand).map(
      (name, idx) => ({
        id: `run-${ip}-${idx}`,
        name,
        model: MODELS[Math.floor(rand() * MODELS.length)],
        dataset: DATASETS[Math.floor(rand() * DATASETS.length)],
        startTime: moment()
          .subtract(Math.floor(rand() * 120), 'minute')
          .format('YYYY-MM-DD HH:mm:ss'),
        progress: Math.floor(10 + rand() * 80),
        cpuUsage: randomBetween(rand, 20, 90),
        memUsage: randomBetween(rand, 2, 16),
        gpuUsage: randomBetween(rand, 30, 98),
      }),
    );
    let queuedTasks = pickSeeded(TASK_NAMES, waitCount, rand).map(
      (name, idx) => ({
        id: `queue-${ip}-${idx}`,
        name,
        model: MODELS[Math.floor(rand() * MODELS.length)],
        dataset: DATASETS[Math.floor(rand() * DATASETS.length)],
        submitTime: moment()
          .subtract(Math.floor(rand() * 60), 'minute')
          .format('YYYY-MM-DD HH:mm:ss'),
        priority: DEFAULT_QUEUE_PRIORITY,
        queueSortIndex: 0,
      }),
    );

    // 首台服务器演示队列：默认均为「中」，按提交时间 FIFO 排序
    if (i === 0) {
      queuedTasks = [
        {
          id: `queue-${ip}-0`,
          name: 'Mask R-CNN实例分割',
          model: 'Mask R-CNN',
          dataset: 'COCO2017',
          submitTime: moment()
            .subtract(50, 'minute')
            .format('YYYY-MM-DD HH:mm:ss'),
          priority: DEFAULT_QUEUE_PRIORITY,
          queueSortIndex: 0,
        },
        {
          id: `queue-${ip}-1`,
          name: 'ResNet50图像分类',
          model: 'ResNet50',
          dataset: 'ImageNet',
          submitTime: moment()
            .subtract(40, 'minute')
            .format('YYYY-MM-DD HH:mm:ss'),
          priority: DEFAULT_QUEUE_PRIORITY,
          queueSortIndex: 0,
        },
        {
          id: `queue-${ip}-2`,
          name: 'BERT文本微调',
          model: 'BERT-base',
          dataset: 'SQuAD',
          submitTime: moment()
            .subtract(30, 'minute')
            .format('YYYY-MM-DD HH:mm:ss'),
          priority: DEFAULT_QUEUE_PRIORITY,
          queueSortIndex: 0,
        },
        {
          id: `queue-${ip}-3`,
          name: 'PointNet++点云分类',
          model: 'PointNet++',
          dataset: 'ModelNet40',
          submitTime: moment()
            .subtract(20, 'minute')
            .format('YYYY-MM-DD HH:mm:ss'),
          priority: DEFAULT_QUEUE_PRIORITY,
          queueSortIndex: 0,
        },
      ];
    }

    queuedTasks = sortQueuedTasks(queuedTasks);

    const cpuRate = randomBetween(rand, 15, 95);
    const memRate = randomBetween(rand, 20, 90);
    const gpuRate = randomBetween(rand, 10, 98);

    return {
      serverIp: ip,
      hostname: `gpu-node-${String(i + 1).padStart(2, '0')}`,
      status: Math.max(cpuRate, memRate, gpuRate) >= 85 ? 'warning' : 'online',
      cpuRate,
      memRate,
      gpuRate,
      diskRate: randomBetween(rand, 30, 85),
      networkIn: randomBetween(rand, 50, 500),
      networkOut: randomBetween(rand, 30, 400),
      gpuMemRate: randomBetween(rand, 20, 95),
      gpuTemp: randomBetween(rand, 45, 82),
      runTask: runningTasks.length,
      waitTask: queuedTasks.length,
      runningTasks,
      queuedTasks,
      specs: {
        cpu: `${8 + (i % 4) * 8} 核`,
        memory: `${32 + (i % 3) * 32} GB`,
        gpu: i % 2 === 0 ? 'NVIDIA A100 80GB' : 'NVIDIA RTX 4090 24GB',
        os: 'Ubuntu 22.04',
      },
    };
  });

  return cachedServers;
};

const getServer = (serverIp) =>
  ensureServers().find((s) => s.serverIp === serverIp) || null;

const syncServerQueue = (server) => {
  server.queuedTasks = sortQueuedTasks(server.queuedTasks);
  server.waitTask = server.queuedTasks.length;
  return server;
};

const filterServers = (servers, { keyword, status } = {}) => {
  return servers.filter((s) => {
    const matchSearch =
      !keyword ||
      s.serverIp.includes(keyword) ||
      s.hostname.includes(keyword) ||
      s.runningTasks.some((t) => t.name.includes(keyword));
    const matchStatus = !status || status === 'all' || s.status === status;
    return matchSearch && matchStatus;
  });
};

/** GET /resource-monitor/summary */
export const mockFetchResourceSummary = () => {
  return createSuccess(buildSummary(ensureServers()));
};

/** GET /resource-monitor/servers */
export const mockFetchResourceServers = (params = {}) => {
  const servers = filterServers(ensureServers(), params);
  return createSuccess(servers);
};

/** GET /resource-monitor/servers/{serverIp} */
export const mockFetchResourceServerDetail = (serverIp) => {
  const server = getServer(serverIp);
  if (!server) {
    return { success: false, data: null, errorMessage: '未找到该服务器' };
  }
  return createSuccess(syncServerQueue(server));
};

/** GET /resource-monitor/servers/{serverIp}/metrics */
export const mockFetchResourceMetrics = (serverIp, interval = '1hour') => {
  const server = getServer(serverIp);
  if (!server) {
    return { success: false, data: null, errorMessage: '未找到该服务器' };
  }
  return createSuccess({
    interval,
    spanLabel: getIntervalSpanLabel(interval),
    points: generateHistoryPoints(serverIp, interval),
  });
};

/** POST /resource-monitor/servers */
export const mockCreateResourceServer = (payload = {}) => {
  const serverIp = payload?.serverIp?.trim();
  const hostname = payload?.hostname?.trim();

  if (!serverIp || !IP_REGEX.test(serverIp)) {
    return { success: false, data: null, errorMessage: '请输入合法的 IP 地址' };
  }
  if (!hostname) {
    return { success: false, data: null, errorMessage: '请输入主机名' };
  }
  if (ensureServers().some((s) => s.serverIp === serverIp)) {
    return { success: false, data: null, errorMessage: '该 IP 已存在' };
  }

  const specs = payload?.specs || {};
  const newServer = {
    serverIp,
    hostname,
    status: 'online',
    cpuRate: 0,
    memRate: 0,
    gpuRate: 0,
    diskRate: 0,
    networkIn: 0,
    networkOut: 0,
    gpuMemRate: 0,
    gpuTemp: 0,
    runTask: 0,
    waitTask: 0,
    runningTasks: [],
    queuedTasks: [],
    specs: {
      cpu: specs.cpu?.trim() || '待上报',
      memory: specs.memory?.trim() || '待上报',
      gpu: specs.gpu?.trim() || '待上报',
      os: specs.os?.trim() || 'Ubuntu 22.04',
    },
  };

  cachedServers.push(newServer);
  return createSuccess(newServer);
};

/** DELETE /resource-monitor/servers/{serverIp} */
export const mockDeleteResourceServer = (serverIp) => {
  const server = getServer(serverIp);
  if (!server) {
    return { success: false, data: null, errorMessage: '未找到该服务器' };
  }
  if (server.runTask > 0 || server.runningTasks?.length > 0) {
    return {
      success: false,
      data: null,
      errorMessage: '该服务器仍有运行中任务，无法删除',
    };
  }

  const index = cachedServers.findIndex((s) => s.serverIp === serverIp);
  if (index >= 0) {
    cachedServers.splice(index, 1);
  }
  return createSuccess(null);
};

/** PUT /resource-monitor/servers/{serverIp}/queue/reorder — 仅修改 queueSortIndex */
export const mockReorderResourceQueueTask = (serverIp, body = {}) => {
  const { taskId, direction } = body;
  const server = getServer(serverIp);
  if (!server) {
    return { success: false, data: null, errorMessage: '未找到该服务器' };
  }

  const sorted = sortQueuedTasks(server.queuedTasks);
  const currentIndex = sorted.findIndex((t) => t.id === taskId);
  if (currentIndex < 0) {
    return { success: false, data: null, errorMessage: '任务不存在' };
  }

  const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0) {
    return { success: false, data: null, errorMessage: '已在队首，无法上移' };
  }
  if (targetIndex >= sorted.length) {
    return { success: false, data: null, errorMessage: '已在队尾，无法下移' };
  }

  const movingTask = server.queuedTasks.find((t) => t.id === taskId);
  movingTask.queueSortIndex = targetIndex + 1;
  server.queuedTasks = renumberManualSortIndices(server.queuedTasks);
  server.waitTask = server.queuedTasks.length;

  return createSuccess({ queuedTasks: server.queuedTasks });
};

/** PUT /resource-monitor/servers/{serverIp}/queue/priority — 修改原生业务优先级 */
export const mockUpdateResourceQueuePriority = (serverIp, body = {}) => {
  const { taskId, priority } = body;
  const server = getServer(serverIp);
  if (!server) {
    return { success: false, data: null, errorMessage: '未找到该服务器' };
  }
  if (!['高', '中', '低'].includes(priority)) {
    return {
      success: false,
      data: null,
      errorMessage: '优先级无效，仅支持 高 / 中 / 低',
    };
  }

  const task = server.queuedTasks.find((t) => t.id === taskId);
  if (!task) {
    return { success: false, data: null, errorMessage: '任务不存在' };
  }

  task.priority = priority;
  server.queuedTasks = sortQueuedTasks(server.queuedTasks);
  server.waitTask = server.queuedTasks.length;

  return createSuccess({ queuedTasks: server.queuedTasks });
};

/** DELETE /resource-monitor/servers/{serverIp}/queue/{taskId} */
export const mockCancelResourceQueueTask = (serverIp, taskId) => {
  const server = getServer(serverIp);
  if (!server) {
    return { success: false, data: null, errorMessage: '未找到该服务器' };
  }

  server.queuedTasks = server.queuedTasks.filter((t) => t.id !== taskId);
  server.queuedTasks = renumberManualSortIndices(server.queuedTasks);
  server.waitTask = server.queuedTasks.length;
  return createSuccess({ queuedTasks: server.queuedTasks });
};
