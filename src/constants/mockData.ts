/**
 * Mock 数据（与 TSSAIPlatform-frontend-prototype 一致）
 * 用于开发阶段展示，后端接口就绪后可移除或改为接口返回
 */

export const MOCK_MODELS: API.ModelItem[] = [
  { id: '1', name: 'YOLOv8-目标检测', version: '1.0.0', type: 'CV', uploadTime: '2026-01-20 10:30:00', size: '245 MB' },
  { id: '2', name: 'BERT-文本分类', version: '2.1.0', type: 'NLP', uploadTime: '2026-01-19 14:20:00', size: '512 MB' },
  { id: '3', name: 'ResNet50-图像分类', version: '1.5.0', type: 'CV', uploadTime: '2026-01-18 09:15:00', size: '98 MB' },
  { id: '4', name: 'GPT-2-文本生成', version: '1.0.0', type: 'NLP', uploadTime: '2026-01-17 16:45:00', size: '1.2 GB' },
  { id: '5', name: 'MobileNet-轻量级分类', version: '1.2.0', type: 'CV', uploadTime: '2026-01-16 11:30:00', size: '16 MB' },
  { id: '6', name: 'LSTM-情感分析', version: '1.0.0', type: 'NLP', uploadTime: '2026-01-15 13:20:00', size: '128 MB' },
  { id: '7', name: 'EfficientNet-图像识别', version: '2.0.0', type: 'CV', uploadTime: '2026-01-14 10:10:00', size: '89 MB' },
  { id: '8', name: 'Transformer-机器翻译', version: '1.3.0', type: 'NLP', uploadTime: '2026-01-13 15:00:00', size: '856 MB' },
];

export const MOCK_DATASETS: API.DatasetItem[] = [
  { id: '1', name: 'COCO-2017-训练集', type: 'CV', uploadTime: '2026-01-20 10:30:00', size: '18.5 GB', fileCount: 118287 },
  { id: '2', name: 'IMDB-电影评论', type: 'NLP', uploadTime: '2026-01-19 14:20:00', size: '2.3 GB', fileCount: 50000 },
  { id: '3', name: 'ImageNet-图像分类', type: 'CV', uploadTime: '2026-01-18 09:15:00', size: '150 GB', fileCount: 1281167 },
  { id: '4', name: 'SQuAD-问答数据集', type: 'NLP', uploadTime: '2026-01-17 16:45:00', size: '850 MB', fileCount: 108442 },
  { id: '5', name: 'CIFAR-10-图像分类', type: 'CV', uploadTime: '2026-01-16 11:30:00', size: '170 MB', fileCount: 60000 },
  { id: '6', name: 'GLUE-自然语言理解', type: 'NLP', uploadTime: '2026-01-15 13:20:00', size: '1.2 GB', fileCount: 1000000 },
];

export const MOCK_TASKS: API.TaskItem[] = [
  { id: '1', name: 'YOLOv8-目标检测训练', modelName: 'YOLOv8-目标检测', datasetName: 'COCO-2017-训练集', createTime: '2026-01-25 09:00:00', status: 'success', progress: 100 },
  { id: '2', name: 'BERT-文本分类微调', modelName: 'BERT-文本分类', datasetName: 'IMDB-电影评论', createTime: '2026-01-24 14:20:00', status: 'running', progress: 65 },
  { id: '3', name: 'ResNet50-图像分类', modelName: 'ResNet50-图像分类', datasetName: 'ImageNet-图像分类', createTime: '2026-01-23 10:15:00', status: 'pending', progress: 0 },
];

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
    trainParams: 'epochs: 10, batch_size: 32, learning_rate: 0.001, optimizer: Adam',
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
  versionHistory: [{ version: '1.0.0', updateTime: '2026-01-20 10:30:00', timestamp: '1705728600' }],
};

export const MOCK_TASK_DETAIL = {
  id: '1',
  name: 'YOLOv8-目标检测训练',
  modelName: 'YOLOv8-目标检测 (v1.0.0)',
  datasetName: 'COCO-2017-训练集',
  createTime: '2026-01-25 09:00:00',
  completeTime: '2026-01-25 12:30:00',
  status: 'success',
  duration: '3小时30分钟',
  metrics: { accuracy: '95.2%', loss: '0.023', epochs: 10, batchSize: 32 },
  files: [
    { name: 'best.pt', desc: '最佳模型权重 - 245 MB' },
    { name: 'last.pt', desc: '最新模型权重 - 245 MB' },
    { name: 'results.csv', desc: '训练结果数据 - 2.5 KB' },
    { name: 'loss_curve.png', desc: '损失曲线图 - 45 KB' },
    { name: 'accuracy_curve.png', desc: '准确率曲线图 - 42 KB' },
  ],
};
