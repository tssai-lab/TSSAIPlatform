/**
 * Mock 数据（与 TSSAIPlatform-frontend-prototype 一致）
 * 用于开发阶段展示，后端接口就绪后可移除或改为接口返回
 */

export const MOCK_MODELS: API.ModelItem[] = [
  {
    id: '1',
    name: 'YOLOv8-目标检测',
    version: '1.0.0',
    type: 'CV',
    uploadTime: '2026-01-20 10:30:00',
    size: '245 MB',
  },
  {
    id: '2',
    name: 'BERT-文本分类',
    version: '2.1.0',
    type: 'NLP',
    uploadTime: '2026-01-19 14:20:00',
    size: '512 MB',
  },
  {
    id: '3',
    name: 'ResNet50-图像分类',
    version: '1.5.0',
    type: 'CV',
    uploadTime: '2026-01-18 09:15:00',
    size: '98 MB',
  },
  {
    id: '4',
    name: 'GPT-2-文本生成',
    version: '1.0.0',
    type: 'NLP',
    uploadTime: '2026-01-17 16:45:00',
    size: '1.2 GB',
  },
  {
    id: '5',
    name: 'MobileNet-轻量级分类',
    version: '1.2.0',
    type: 'CV',
    uploadTime: '2026-01-16 11:30:00',
    size: '16 MB',
  },
  {
    id: '6',
    name: 'LSTM-情感分析',
    version: '1.0.0',
    type: 'NLP',
    uploadTime: '2026-01-15 13:20:00',
    size: '128 MB',
  },
  {
    id: '7',
    name: 'EfficientNet-图像识别',
    version: '2.0.0',
    type: 'CV',
    uploadTime: '2026-01-14 10:10:00',
    size: '89 MB',
  },
  {
    id: '8',
    name: 'Transformer-机器翻译',
    version: '1.3.0',
    type: 'NLP',
    uploadTime: '2026-01-13 15:00:00',
    size: '856 MB',
  },
];

export const MOCK_DATASETS: API.DatasetItem[] = [
  {
    id: '1',
    name: 'COCO-2017-训练集',
    type: 'CV',
    uploadTime: '2026-01-20 10:30:00',
    size: '18.5 GB',
    fileCount: 118287,
  },
  {
    id: '2',
    name: 'IMDB-电影评论',
    type: 'NLP',
    uploadTime: '2026-01-19 14:20:00',
    size: '2.3 GB',
    fileCount: 50000,
  },
  {
    id: '3',
    name: 'ImageNet-图像分类',
    type: 'CV',
    uploadTime: '2026-01-18 09:15:00',
    size: '150 GB',
    fileCount: 1281167,
  },
  {
    id: '4',
    name: 'SQuAD-问答数据集',
    type: 'NLP',
    uploadTime: '2026-01-17 16:45:00',
    size: '850 MB',
    fileCount: 108442,
  },
  {
    id: '5',
    name: 'CIFAR-10-图像分类',
    type: 'CV',
    uploadTime: '2026-01-16 11:30:00',
    size: '170 MB',
    fileCount: 60000,
  },
  {
    id: '6',
    name: 'GLUE-自然语言理解',
    type: 'NLP',
    uploadTime: '2026-01-15 13:20:00',
    size: '1.2 GB',
    fileCount: 1000000,
  },
];

export const MOCK_TASKS: API.TaskItem[] = [
  {
    id: '1',
    name: 'YOLOv8-目标检测训练',
    modelName: 'YOLOv8-目标检测',
    datasetName: 'COCO-2017-训练集',
    createTime: '2026-01-25 09:00:00',
    status: 'success',
    progress: 100,
  },
  {
    id: '4',
    name: 'YOLOv8-二阶段训练',
    modelName: 'YOLOv8-目标检测',
    datasetName: 'COCO-2017-训练集',
    createTime: '2026-01-24 10:00:00',
    status: 'success',
    progress: 100,
  },
  {
    id: '5',
    name: 'YOLOv8-强数据增强',
    modelName: 'YOLOv8-目标检测',
    datasetName: 'COCO-2017-训练集',
    createTime: '2026-01-23 08:00:00',
    status: 'success',
    progress: 100,
  },
  {
    id: '2',
    name: 'BERT-文本分类微调',
    modelName: 'BERT-文本分类',
    datasetName: 'IMDB-电影评论',
    createTime: '2026-01-24 14:20:00',
    status: 'running',
    progress: 65,
  },
  {
    id: '3',
    name: 'ResNet50-图像分类',
    modelName: 'ResNet50-图像分类',
    datasetName: 'ImageNet-图像分类',
    createTime: '2026-01-23 10:15:00',
    status: 'pending',
    progress: 0,
  },
  {
    id: '6',
    name: 'YOLOv8-CIFAR 基线',
    modelName: 'YOLOv8-目标检测',
    datasetName: 'CIFAR-10-图像分类',
    createTime: '2026-01-22 09:00:00',
    status: 'success',
    progress: 100,
  },
  {
    id: '7',
    name: 'YOLOv8-CIFAR 调参',
    modelName: 'YOLOv8-目标检测',
    datasetName: 'CIFAR-10-图像分类',
    createTime: '2026-01-21 09:00:00',
    status: 'success',
    progress: 100,
  },
];

/** 与列表 mock 对齐：详情里「模型 (v1.0.0)」也能匹配到「模型」 */
function normalizeModelNameForMatch(name: string): string {
  const idx = name.indexOf(' (');
  return (idx >= 0 ? name.slice(0, idx) : name).trim();
}

/**
 * 任务详情页：同模型 + 同数据集的历史任务（Mock）。
 * 有 modelId/datasetId 时优先按 ID 过滤（后端对齐后）；否则按名称匹配。
 */
export function getMockRelatedTasksForDetail(
  _currentTaskId: string,
  modelName: string,
  datasetName: string,
  modelId?: string,
  datasetId?: string,
): API.TaskItem[] {
  const ds = datasetName.trim();
  let matched: API.TaskItem[];
  if (modelId && datasetId) {
    matched = MOCK_TASKS.filter(
      (t) => t.modelId === modelId && t.datasetId === datasetId,
    );
  } else {
    const mn = normalizeModelNameForMatch(modelName);
    matched = MOCK_TASKS.filter(
      (t) =>
        normalizeModelNameForMatch(t.modelName) === mn &&
        t.datasetName.trim() === ds,
    );
  }
  return [...matched].sort((a, b) =>
    a.createTime < b.createTime ? 1 : a.createTime > b.createTime ? -1 : 0,
  );
}

export const MOCK_MODEL_DETAIL = {
  id: '1',
  name: 'YOLOv8-目标检测',
  version: '1.0.0',
  type: 'CV',
  size: '245 MB',
  uploadTime: '2026-01-20 10:30:00',
  updateTime: '2026-01-20 10:30:00',
  timestamp: '1705728600',
  remark: 'YOLOv8 目标检测模型，用于实时目标识别任务',
  params: {
    framework: 'PyTorch',
    inputSize: '640x640',
    numClasses: 80,
    paramsCount: '11.2M',
    trainDataset: 'COCO 2017',
    trainParams:
      'epochs: 10, batch_size: 32, learning_rate: 0.001, optimizer: Adam',
  },
  codeContent: `import torch
import torch.nn as nn

class YOLOv8(nn.Module):
    def __init__(self, num_classes=80):
        super(YOLOv8, self).__init__()
        self.num_classes = num_classes
        self.backbone = self._build_backbone()
        self.head = self._build_head()

    def _build_backbone(self):
        pass

    def _build_head(self):
        pass

    def forward(self, x):
        features = self.backbone(x)
        outputs = self.head(features)
        return outputs`,
  versionHistory: [
    {
      version: '1.0.0',
      updateTime: '2026-01-20 10:30:00',
      timestamp: '1705728600',
    },
  ],
};

/** 生成单条训练曲线的虚拟数据（模拟真实训练过程） */
function genMockCurve(
  steps: number,
  start: number,
  end: number,
  trend: 'down' | 'up',
  noise = 0.02,
  flattenEnd = true,
): { step: number; value: number }[] {
  const points: { step: number; value: number }[] = [];
  const lo = Math.min(start, end) - 0.1;
  const hi = Math.max(start, end) + 0.1;
  for (let i = 0; i <= steps; i++) {
    let t = i / steps;
    if (flattenEnd) t = t ** 0.85; // 末尾趋缓
    const base =
      trend === 'down' ? start - (start - end) * t : start + (end - start) * t;
    const n = (Math.random() - 0.5) * noise * (start + end);
    points.push({ step: i, value: Math.max(lo, Math.min(hi, base + n)) });
  }
  return points;
}

/** 为指定任务生成多指标虚拟曲线数据（用于曲线对比演示） */
export function genMockTaskMetrics(
  taskId: string,
  taskName: string,
  seed = 0,
): {
  taskId: string;
  taskName: string;
  runId: string;
  metrics: Record<string, { step: number; value: number }[]>;
} {
  const steps = 50;
  const _s = (x: number) => (seed * 0.1 + 1) * x; // 不同任务略有差异
  return {
    taskId,
    taskName,
    runId: `mock-${taskId}`,
    metrics: {
      train_loss: genMockCurve(steps, 2.0, 0.05 + seed * 0.01, 'down', 0.03),
      val_accuracy: genMockCurve(
        steps,
        0.1 + seed * 0.02,
        0.92 - seed * 0.02,
        'up',
        0.015,
      ),
      val_mAP50: genMockCurve(steps, 0.05, 0.78 - seed * 0.03, 'up', 0.02),
      val_mAP50_95: genMockCurve(steps, 0.02, 0.55 - seed * 0.05, 'up', 0.02),
    },
  };
}

export const MOCK_TASK_DETAIL = {
  id: '1',
  name: 'YOLOv8-目标检测训练',
  modelName: 'YOLOv8-目标检测 (v1.0.0)',
  datasetName: 'COCO-2017-训练集',
  createTime: '2026-01-25 09:00:00',
  completeTime: '2026-01-25 12:30:00',
  status: 'success',
  progress: 100,
  duration: '3小时30分钟',
  metrics: { accuracy: '95.2%', loss: '0.023', epochs: '10', batchSize: '32' },
  files: [
    { name: 'best.pt', desc: '最佳模型权重 - 245 MB' },
    { name: 'last.pt', desc: '最新模型权重 - 245 MB' },
    { name: 'results.csv', desc: '训练结果数据 - 2.5 KB' },
    { name: 'loss_curve.png', desc: '损失曲线图 - 45 KB' },
    { name: 'accuracy_curve.png', desc: '准确率曲线图 - 42 KB' },
  ],
};
