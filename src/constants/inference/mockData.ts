/**
 * 推理模块 Mock 数据与内存 Store
 * @see docs/模型推理设计.md §8
 */
import dayjs from 'dayjs';

/** 可推理模型池 Mock — 唯一模型来源，与模型管理解耦 */
export const MOCK_INFERENCE_MODELS: API.InferenceModelOption[] = [
  {
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    name: 'yolo2',
    version: 'v1.0.0',
    taskType: 'CV',
    displayName: 'yolo2 · v1.0.0',
    source: 'training',
    remark: '目标检测',
    defaultInferenceParams: { confidence: 0.3, img_size: 640 },
  },
  {
    inferenceModelId: 'infer-model-cv-resnet50-v2',
    name: 'ResNet-50',
    version: 'v2.3',
    taskType: 'CV',
    displayName: 'ResNet-50 v2.3',
    source: 'registry',
    remark: '图像分类',
  },
  {
    inferenceModelId: 'infer-model-nlp-llama3-8b',
    name: 'Llama-3-8B-Instruct',
    version: 'v1.0',
    taskType: 'NLP',
    displayName: 'Llama-3-8B-Instruct',
    source: 'training',
    remark: '文本生成',
    defaultInferenceParams: { temperature: 0.8, max_tokens: 1024 },
  },
  {
    inferenceModelId: 'infer-model-nlp-bert-cls',
    name: 'BERT-文本分类',
    version: 'v2.1.0',
    taskType: 'NLP',
    displayName: 'BERT-文本分类 · v2.1.0',
    source: 'registry',
  },
  {
    inferenceModelId: 'infer-model-mm-qwen-vl',
    name: 'Qwen-VL',
    version: 'v1.2',
    taskType: 'MULTIMODAL',
    displayName: 'Qwen-VL · v1.2',
    source: 'training',
    remark: '图文问答',
  },
];

const initialList: API.InferenceTaskListItem[] = [
  {
    id: 'INF-20260628-001',
    name: 'ImageNet 验证集推理',
    taskType: 'CV',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-cv-resnet50-v2',
    modelDisplayName: 'ResNet-50 v2.3',
    datasetDisplayName: 'ImageNet-Val-2026',
    datasetSizeBytes: 6878658560,
    datasetItemCount: 50000,
    hasInferenceInput: false,
    status: 'running',
    progress: 42,
    createdAt: '2026-06-28T08:30:00Z',
  },
  {
    id: 'INF-20260628-002',
    name: '单图目标检测',
    taskType: 'CV',
    inputMode: 'single',
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    modelDisplayName: 'yolo2 · v1.0.0',
    inputFileName: 'photo.jpg',
    inputSizeBytes: 2201600,
    hasInferenceInput: true,
    status: 'success',
    progress: 100,
    createdAt: '2026-06-28T09:15:00Z',
    finishedAt: '2026-06-28T09:16:00Z',
  },
  {
    id: 'INF-20260628-003',
    name: '情感分析批量',
    taskType: 'NLP',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-nlp-bert-cls',
    modelDisplayName: 'BERT-文本分类 · v2.1.0',
    datasetDisplayName: 'IMDB-电影评论',
    datasetSizeBytes: 2469606195,
    datasetItemCount: 50000,
    hasInferenceInput: false,
    status: 'success',
    progress: 100,
    createdAt: '2026-06-27T14:00:00Z',
    finishedAt: '2026-06-27T15:30:00Z',
  },
  {
    id: 'INF-20260628-004',
    name: '短文本分类',
    taskType: 'NLP',
    inputMode: 'single',
    inferenceModelId: 'infer-model-nlp-llama3-8b',
    modelDisplayName: 'Llama-3-8B-Instruct',
    inputDisplayName: '这部电影非常精彩，值得推荐…',
    hasInferenceInput: false,
    status: 'success',
    progress: 100,
    createdAt: '2026-06-27T16:00:00Z',
    finishedAt: '2026-06-27T16:00:05Z',
  },
  {
    id: 'INF-20260628-005',
    name: '图文问答单条',
    taskType: 'MULTIMODAL',
    inputMode: 'single',
    inferenceModelId: 'infer-model-mm-qwen-vl',
    modelDisplayName: 'Qwen-VL · v1.2',
    inputFileName: 'scene.jpg',
    inputSizeBytes: 1536000,
    hasInferenceInput: true,
    status: 'success',
    progress: 100,
    createdAt: '2026-06-28T10:00:00Z',
    finishedAt: '2026-06-28T10:00:15Z',
  },
  {
    id: 'INF-20260628-006',
    name: '新闻标题情感批量推理',
    taskType: 'NLP',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-nlp-bert-cls',
    modelDisplayName: 'BERT-文本分类 · v2.1.0',
    datasetDisplayName: 'News-Headlines-2026',
    datasetSizeBytes: 524288000,
    datasetItemCount: 12000,
    hasInferenceInput: false,
    useCustomScript: false,
    status: 'running',
    progress: 68,
    createdAt: '2026-06-28T11:20:00Z',
  },
  {
    id: 'INF-20260628-007',
    name: '路口监控单帧检测',
    taskType: 'CV',
    inputMode: 'single',
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    modelDisplayName: 'yolo2 · v1.0.0',
    inputFileName: 'intersection.jpg',
    inputSizeBytes: 3145728,
    hasInferenceInput: true,
    useCustomScript: false,
    status: 'running',
    progress: 78,
    createdAt: '2026-06-28T11:45:00Z',
  },
  {
    id: 'INF-20260628-008',
    name: '图文对批量问答',
    taskType: 'MULTIMODAL',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-mm-qwen-vl',
    modelDisplayName: 'Qwen-VL · v1.2',
    datasetDisplayName: 'VQA-Pairs-Val',
    datasetSizeBytes: 3221225472,
    datasetItemCount: 8000,
    hasInferenceInput: false,
    useCustomScript: false,
    status: 'running',
    progress: 31,
    createdAt: '2026-06-28T12:00:00Z',
  },
  {
    id: 'INF-20260628-009',
    name: '客服工单摘要生成',
    taskType: 'NLP',
    inputMode: 'single',
    inferenceModelId: 'infer-model-nlp-llama3-8b',
    modelDisplayName: 'Llama-3-8B-Instruct',
    inputDisplayName: '用户反馈：物流延迟三天仍未送达…',
    hasInferenceInput: false,
    useCustomScript: false,
    status: 'queued',
    progress: 0,
    createdAt: '2026-06-28T12:15:00Z',
  },
  {
    id: 'INF-20260628-010',
    name: '交通标志分类验证集',
    taskType: 'CV',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-cv-resnet50-v2',
    modelDisplayName: 'ResNet-50 v2.3',
    datasetDisplayName: 'GTSRB-Test-2026',
    datasetSizeBytes: 838860800,
    datasetItemCount: 12630,
    hasInferenceInput: false,
    useCustomScript: false,
    status: 'pending',
    progress: 0,
    createdAt: '2026-06-28T12:20:00Z',
  },
  {
    id: 'INF-20260628-011',
    name: '仓库货架检测批量',
    taskType: 'CV',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    modelDisplayName: 'yolo2 · v1.0.0',
    datasetDisplayName: 'Warehouse-Shelves-Q2',
    datasetSizeBytes: 1610612736,
    datasetItemCount: 3200,
    hasInferenceInput: false,
    useCustomScript: false,
    status: 'success',
    progress: 100,
    createdAt: '2026-06-28T06:00:00Z',
    finishedAt: '2026-06-28T06:45:00Z',
  },
  {
    id: 'INF-20260628-012',
    name: '产品评论实体抽取',
    taskType: 'NLP',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-nlp-llama3-8b',
    modelDisplayName: 'Llama-3-8B-Instruct',
    datasetDisplayName: 'Ecommerce-Reviews',
    datasetSizeBytes: 1073741824,
    datasetItemCount: 25000,
    hasInferenceInput: false,
    useCustomScript: false,
    status: 'success',
    progress: 100,
    createdAt: '2026-06-28T07:10:00Z',
    finishedAt: '2026-06-28T08:02:00Z',
  },
  {
    id: 'INF-20260628-013',
    name: '菜单图片识别问答',
    taskType: 'MULTIMODAL',
    inputMode: 'single',
    inferenceModelId: 'infer-model-mm-qwen-vl',
    modelDisplayName: 'Qwen-VL · v1.2',
    inputFileName: 'menu.jpg',
    inputSizeBytes: 1843200,
    hasInferenceInput: true,
    useCustomScript: false,
    status: 'success',
    progress: 100,
    createdAt: '2026-06-28T07:30:00Z',
    finishedAt: '2026-06-28T07:30:12Z',
  },
  {
    id: 'INF-20260628-014',
    name: '人脸考勤单图识别',
    taskType: 'CV',
    inputMode: 'single',
    inferenceModelId: 'infer-model-cv-resnet50-v2',
    modelDisplayName: 'ResNet-50 v2.3',
    inputFileName: 'attendance.jpg',
    inputSizeBytes: 890880,
    hasInferenceInput: true,
    useCustomScript: false,
    status: 'success',
    progress: 100,
    createdAt: '2026-06-28T08:00:00Z',
    finishedAt: '2026-06-28T08:00:03Z',
  },
  {
    id: 'INF-20260628-015',
    name: '论坛帖子批量分类',
    taskType: 'NLP',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-nlp-bert-cls',
    modelDisplayName: 'BERT-文本分类 · v2.1.0',
    datasetDisplayName: 'Forum-Posts-June',
    datasetSizeBytes: 419430400,
    datasetItemCount: 8600,
    hasInferenceInput: false,
    useCustomScript: false,
    status: 'stopped',
    progress: 55,
    createdAt: '2026-06-28T09:00:00Z',
    finishedAt: '2026-06-28T09:18:00Z',
  },
  {
    id: 'INF-20260627-001',
    name: 'COCO 批量检测',
    taskType: 'CV',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    modelDisplayName: 'yolo2 · v1.0.0',
    datasetDisplayName: 'COCO-2017-训练集',
    datasetSizeBytes: 19864223744,
    datasetItemCount: 118287,
    hasInferenceInput: false,
    status: 'failed',
    progress: 12,
    createdAt: '2026-06-27T08:00:00Z',
    finishedAt: '2026-06-27T08:05:00Z',
  },
];

const initialDetails: Record<string, API.InferenceTaskDetail> = {
  'INF-20260628-001': {
    id: 'INF-20260628-001',
    name: 'ImageNet 验证集推理',
    taskType: 'CV',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-cv-resnet50-v2',
    modelDisplayName: 'ResNet-50 v2.3',
    inputDisplayName: 'ImageNet-Val-2026',
    datasetVersionId: 'ds-ver-imagenet-val',
    status: 'running',
    progress: 42,
    progressMessage: '正在推理第 21000/50000 张',
    processedCount: 21000,
    totalCount: 50000,
    inferenceParams: {
      device: 'cuda',
      batch_size: 16,
      confidence: 0.25,
      iou_threshold: 0.45,
      img_size: 640,
      max_detections: 100,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T08:30:00Z',
    startedAt: '2026-06-28T08:31:00Z',
  },
  'INF-20260628-002': {
    id: 'INF-20260628-002',
    name: '单图目标检测',
    taskType: 'CV',
    inputMode: 'single',
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    modelDisplayName: 'yolo2 · v1.0.0',
    inputDisplayName: 'photo.jpg',
    inferenceInputId: 'inp-cv-001',
    inputPreviewUrl: 'https://picsum.photos/seed/inference-cv/640/480',
    status: 'success',
    progress: 100,
    inferenceParams: {
      device: 'cuda:0',
      batch_size: 1,
      confidence: 0.3,
      iou_threshold: 0.45,
      img_size: 640,
      max_detections: 100,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T09:15:00Z',
    finishedAt: '2026-06-28T09:16:00Z',
    result: {
      latencyMs: 320,
      predictions: [
        { label: 'cat', score: 0.92, bbox: [10, 20, 100, 120] },
        { label: 'dog', score: 0.87, bbox: [150, 80, 280, 220] },
      ],
      annotatedImageUrl:
        'https://picsum.photos/seed/inference-cv-annot/640/480',
    },
  },
  'INF-20260628-003': {
    id: 'INF-20260628-003',
    name: '情感分析批量',
    taskType: 'NLP',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-nlp-bert-cls',
    modelDisplayName: 'BERT-文本分类 · v2.1.0',
    inputDisplayName: 'IMDB-电影评论',
    datasetVersionId: '2',
    status: 'success',
    progress: 100,
    processedCount: 50000,
    totalCount: 50000,
    createdAt: '2026-06-27T14:00:00Z',
    finishedAt: '2026-06-27T15:30:00Z',
    result: {
      summary: { total: 50000, success: 49820, failed: 180 },
      previewItems: [
        {
          index: 1,
          inputName: 'review_0001.txt',
          inputPreview:
            '这部电影太棒了，剧情紧凑，演员表演也很到位，强烈推荐。',
          status: 'success',
          summary: 'positive (0.98)',
        },
        {
          index: 2,
          inputName: 'review_0002.txt',
          inputPreview: '节奏拖沓，情节老套，看完觉得浪费时间，不太推荐。',
          status: 'success',
          summary: 'negative (0.91)',
        },
        {
          index: 3,
          inputName: 'review_0003.txt',
          inputPreview: '{\n  "text": "invalid json',
          status: 'failed',
          summary: 'parse error',
        },
      ],
      outputDownloadUrl:
        '/api/inference/outputs/INF-20260628-003/results.jsonl',
    },
  },
  'INF-20260628-004': {
    id: 'INF-20260628-004',
    name: '短文本分类',
    taskType: 'NLP',
    inputMode: 'single',
    inferenceModelId: 'infer-model-nlp-llama3-8b',
    modelDisplayName: 'Llama-3-8B-Instruct',
    inputDisplayName: '这部电影非常精彩，值得推荐…',
    inputText: '这部电影非常精彩，值得推荐，演员表演也很到位，整体观感非常好。',
    status: 'success',
    progress: 100,
    inferenceParams: {
      device: 'cpu',
      batch_size: 1,
      max_tokens: 1024,
      temperature: 0.8,
      top_p: 0.9,
      top_k: 50,
    },
    useCustomScript: false,
    createdAt: '2026-06-27T16:00:00Z',
    finishedAt: '2026-06-27T16:00:05Z',
    result: {
      latencyMs: 180,
      label: 'positive',
      score: 0.96,
      generatedText: '该评论表达了强烈的正面情感，属于 positive 类别。',
      entities: [
        { text: '电影', label: 'SUBJECT', start: 2, end: 4 },
        { text: '精彩', label: 'SENTIMENT', start: 6, end: 8 },
      ],
    },
  },
  'INF-20260628-005': {
    id: 'INF-20260628-005',
    name: '图文问答单条',
    taskType: 'MULTIMODAL',
    inputMode: 'single',
    inferenceModelId: 'infer-model-mm-qwen-vl',
    modelDisplayName: 'Qwen-VL · v1.2',
    inputDisplayName: 'scene.jpg',
    inferenceInputId: 'inp-mm-001',
    inputPreviewUrl: 'https://picsum.photos/seed/inference-mm/640/480',
    prompt: '请描述图片中的场景，并说明主要物体有哪些。',
    status: 'success',
    progress: 100,
    createdAt: '2026-06-28T10:00:00Z',
    startedAt: '2026-06-28T10:00:02Z',
    finishedAt: '2026-06-28T10:00:15Z',
    result: {
      latencyMs: 890,
      answer:
        '画面中是一条城市街道，前景有行人和几辆共享单车，右侧有咖啡店招牌，背景是几栋现代玻璃幕墙建筑，天气晴朗。',
    },
  },
  'INF-20260628-006': {
    id: 'INF-20260628-006',
    name: '新闻标题情感批量推理',
    taskType: 'NLP',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-nlp-bert-cls',
    modelDisplayName: 'BERT-文本分类 · v2.1.0',
    inputDisplayName: 'News-Headlines-2026',
    datasetVersionId: 'ds-news-headlines',
    status: 'running',
    progress: 68,
    progressMessage: '正在推理第 8160/12000 条',
    processedCount: 8160,
    totalCount: 12000,
    inferenceParams: {
      device: 'cuda',
      batch_size: 32,
      max_tokens: 128,
      temperature: 0.3,
      top_p: 0.9,
      top_k: 40,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T11:20:00Z',
    startedAt: '2026-06-28T11:21:00Z',
  },
  'INF-20260628-007': {
    id: 'INF-20260628-007',
    name: '路口监控单帧检测',
    taskType: 'CV',
    inputMode: 'single',
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    modelDisplayName: 'yolo2 · v1.0.0',
    inputDisplayName: 'intersection.jpg',
    inferenceInputId: 'inp-cv-002',
    inputPreviewUrl: 'https://picsum.photos/seed/inference-cv2/640/480',
    status: 'running',
    progress: 78,
    progressMessage: '后处理与 NMS 中…',
    inferenceParams: {
      device: 'cuda:0',
      batch_size: 1,
      confidence: 0.3,
      iou_threshold: 0.45,
      img_size: 640,
      max_detections: 100,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T11:45:00Z',
    startedAt: '2026-06-28T11:45:02Z',
  },
  'INF-20260628-008': {
    id: 'INF-20260628-008',
    name: '图文对批量问答',
    taskType: 'MULTIMODAL',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-mm-qwen-vl',
    modelDisplayName: 'Qwen-VL · v1.2',
    inputDisplayName: 'VQA-Pairs-Val',
    datasetVersionId: 'ds-vqa-pairs',
    status: 'running',
    progress: 31,
    progressMessage: '正在推理第 2480/8000 条',
    processedCount: 2480,
    totalCount: 8000,
    inferenceParams: {
      device: 'cuda',
      batch_size: 4,
      max_tokens: 512,
      temperature: 0.7,
      top_p: 0.9,
      top_k: 50,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T12:00:00Z',
    startedAt: '2026-06-28T12:01:00Z',
  },
  'INF-20260628-009': {
    id: 'INF-20260628-009',
    name: '客服工单摘要生成',
    taskType: 'NLP',
    inputMode: 'single',
    inferenceModelId: 'infer-model-nlp-llama3-8b',
    modelDisplayName: 'Llama-3-8B-Instruct',
    inputDisplayName: '用户反馈：物流延迟三天仍未送达…',
    inputText:
      '用户反馈：物流延迟三天仍未送达，客服电话打不通，要求退款并补偿。订单号 20260628001。',
    status: 'queued',
    progress: 0,
    progressMessage: '排队等待 GPU 资源…',
    inferenceParams: {
      device: 'cuda',
      batch_size: 1,
      max_tokens: 1024,
      temperature: 0.8,
      top_p: 0.9,
      top_k: 50,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T12:15:00Z',
  },
  'INF-20260628-010': {
    id: 'INF-20260628-010',
    name: '交通标志分类验证集',
    taskType: 'CV',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-cv-resnet50-v2',
    modelDisplayName: 'ResNet-50 v2.3',
    inputDisplayName: 'GTSRB-Test-2026',
    datasetVersionId: 'ds-gtsrb-test',
    status: 'pending',
    progress: 0,
    progressMessage: '任务已提交，等待调度…',
    processedCount: 0,
    totalCount: 12630,
    inferenceParams: {
      device: 'cuda',
      batch_size: 64,
      confidence: 0.25,
      iou_threshold: 0.45,
      img_size: 224,
      max_detections: 50,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T12:20:00Z',
  },
  'INF-20260628-011': {
    id: 'INF-20260628-011',
    name: '仓库货架检测批量',
    taskType: 'CV',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    modelDisplayName: 'yolo2 · v1.0.0',
    inputDisplayName: 'Warehouse-Shelves-Q2',
    datasetVersionId: 'ds-warehouse',
    status: 'success',
    progress: 100,
    processedCount: 3200,
    totalCount: 3200,
    inferenceParams: {
      device: 'cuda:0',
      batch_size: 16,
      confidence: 0.35,
      iou_threshold: 0.5,
      img_size: 640,
      max_detections: 200,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T06:00:00Z',
    startedAt: '2026-06-28T06:01:00Z',
    finishedAt: '2026-06-28T06:45:00Z',
    result: {
      summary: { total: 3200, success: 3186, failed: 14 },
      previewItems: [
        {
          index: 1,
          inputName: 'shelf_a_001.jpg',
          inputPreview: '货架 A 区第 1 层',
          status: 'success',
          summary: '3 boxes detected',
        },
        {
          index: 2,
          inputName: 'shelf_b_012.jpg',
          inputPreview: '货架 B 区第 12 层',
          status: 'success',
          summary: '5 boxes detected',
        },
      ],
      outputDownloadUrl:
        '/api/inference/outputs/INF-20260628-011/results.jsonl',
    },
  },
  'INF-20260628-012': {
    id: 'INF-20260628-012',
    name: '产品评论实体抽取',
    taskType: 'NLP',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-nlp-llama3-8b',
    modelDisplayName: 'Llama-3-8B-Instruct',
    inputDisplayName: 'Ecommerce-Reviews',
    datasetVersionId: 'ds-ecommerce-reviews',
    status: 'success',
    progress: 100,
    processedCount: 25000,
    totalCount: 25000,
    inferenceParams: {
      device: 'cuda',
      batch_size: 8,
      max_tokens: 256,
      temperature: 0.5,
      top_p: 0.85,
      top_k: 40,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T07:10:00Z',
    startedAt: '2026-06-28T07:11:00Z',
    finishedAt: '2026-06-28T08:02:00Z',
    result: {
      summary: { total: 25000, success: 24912, failed: 88 },
      previewItems: [
        {
          index: 1,
          inputName: 'review_8842.txt',
          inputPreview: '电池续航比宣传短很多，充电一次只能用半天。',
          status: 'success',
          summary: '实体: 电池(产品), 续航(属性)',
        },
        {
          index: 2,
          inputName: 'review_12001.txt',
          inputPreview: '物流很快，包装完好，推荐购买。',
          status: 'success',
          summary: '实体: 物流(服务), 包装(属性)',
        },
      ],
      outputDownloadUrl:
        '/api/inference/outputs/INF-20260628-012/results.jsonl',
    },
  },
  'INF-20260628-013': {
    id: 'INF-20260628-013',
    name: '菜单图片识别问答',
    taskType: 'MULTIMODAL',
    inputMode: 'single',
    inferenceModelId: 'infer-model-mm-qwen-vl',
    modelDisplayName: 'Qwen-VL · v1.2',
    inputDisplayName: 'menu.jpg',
    inferenceInputId: 'inp-mm-002',
    inputPreviewUrl: 'https://picsum.photos/seed/inference-mm2/640/480',
    prompt: '这张菜单上有哪些主菜？价格分别是多少？',
    status: 'success',
    progress: 100,
    inferenceParams: {
      device: 'cuda:0',
      batch_size: 1,
      max_tokens: 512,
      temperature: 0.6,
      top_p: 0.9,
      top_k: 50,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T07:30:00Z',
    startedAt: '2026-06-28T07:30:01Z',
    finishedAt: '2026-06-28T07:30:12Z',
    result: {
      latencyMs: 760,
      answer:
        '主菜包括：宫保鸡丁 ¥38、鱼香肉丝 ¥32、麻婆豆腐 ¥26。侧边栏有今日例汤和米饭套餐可选。',
    },
  },
  'INF-20260628-014': {
    id: 'INF-20260628-014',
    name: '人脸考勤单图识别',
    taskType: 'CV',
    inputMode: 'single',
    inferenceModelId: 'infer-model-cv-resnet50-v2',
    modelDisplayName: 'ResNet-50 v2.3',
    inputDisplayName: 'attendance.jpg',
    inferenceInputId: 'inp-cv-003',
    inputPreviewUrl: 'https://picsum.photos/seed/inference-cv3/640/480',
    status: 'success',
    progress: 100,
    inferenceParams: {
      device: 'cpu',
      batch_size: 1,
      confidence: 0.5,
      iou_threshold: 0.45,
      img_size: 224,
      max_detections: 10,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T08:00:00Z',
    startedAt: '2026-06-28T08:00:01Z',
    finishedAt: '2026-06-28T08:00:03Z',
    result: {
      latencyMs: 95,
      label: 'employee',
      score: 0.99,
      predictions: [
        { label: 'employee', score: 0.99, bbox: [120, 80, 280, 360] },
      ],
    },
  },
  'INF-20260628-015': {
    id: 'INF-20260628-015',
    name: '论坛帖子批量分类',
    taskType: 'NLP',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-nlp-bert-cls',
    modelDisplayName: 'BERT-文本分类 · v2.1.0',
    inputDisplayName: 'Forum-Posts-June',
    datasetVersionId: 'ds-forum-posts',
    status: 'stopped',
    progress: 55,
    progressMessage: '任务已停止于 55%',
    processedCount: 4730,
    totalCount: 8600,
    errorMessage: '任务已手动停止',
    inferenceParams: {
      device: 'cuda',
      batch_size: 16,
      max_tokens: 128,
      temperature: 0.3,
      top_p: 0.9,
      top_k: 40,
    },
    useCustomScript: false,
    createdAt: '2026-06-28T09:00:00Z',
    startedAt: '2026-06-28T09:01:00Z',
    finishedAt: '2026-06-28T09:18:00Z',
    result: {
      summary: { total: 8600, success: 4730, failed: 0 },
      previewItems: [
        {
          index: 1,
          inputName: 'post_001.txt',
          inputPreview: '求助：模型训练 loss 不下降怎么办？',
          status: 'success',
          summary: 'tech (0.94)',
        },
        {
          index: 2,
          inputName: 'post_002.txt',
          inputPreview: '转让二手显卡，九成新。',
          status: 'success',
          summary: 'marketplace (0.88)',
        },
      ],
      outputDownloadUrl:
        '/api/inference/outputs/INF-20260628-015/partial-results.jsonl',
    },
  },
  'INF-20260627-001': {
    id: 'INF-20260627-001',
    name: 'COCO 批量检测',
    taskType: 'CV',
    inputMode: 'batch',
    inferenceModelId: 'infer-model-cv-yolo2-v1',
    modelDisplayName: 'yolo2 · v1.0.0',
    inputDisplayName: 'COCO-2017-训练集',
    datasetVersionId: '1',
    status: 'failed',
    progress: 12,
    progressMessage: '推理中断',
    processedCount: 14200,
    totalCount: 118287,
    errorMessage: 'GPU OOM：显存不足，请减小 batch size 后重试',
    createdAt: '2026-06-27T08:00:00Z',
    finishedAt: '2026-06-27T08:05:00Z',
  },
};

let taskListStore = [...initialList];
const taskDetailStore: Record<string, API.InferenceTaskDetail> = {
  ...initialDetails,
};
const inputStore: Record<
  string,
  {
    objectName: string;
    previewUrl?: string;
    fileName: string;
    sizeBytes: number;
  }
> = {
  'inp-cv-001': {
    objectName: 'inference/inputs/inp-cv-001/photo.jpg',
    fileName: 'photo.jpg',
    sizeBytes: 2201600,
  },
  'inp-mm-001': {
    objectName: 'inference/inputs/inp-mm-001/scene.jpg',
    fileName: 'scene.jpg',
    sizeBytes: 1536000,
  },
  'inp-cv-002': {
    objectName: 'inference/inputs/inp-cv-002/intersection.jpg',
    fileName: 'intersection.jpg',
    sizeBytes: 3145728,
  },
  'inp-cv-003': {
    objectName: 'inference/inputs/inp-cv-003/attendance.jpg',
    fileName: 'attendance.jpg',
    sizeBytes: 890880,
  },
  'inp-mm-002': {
    objectName: 'inference/inputs/inp-mm-002/menu.jpg',
    fileName: 'menu.jpg',
    sizeBytes: 1843200,
  },
};

const scriptStore: Record<
  string,
  { objectName: string; fileName: string; sizeBytes: number }
> = {};

let dailySeqCounter = 15;

function generateTaskId(): string {
  const dateStr = dayjs().format('YYYYMMDD');
  dailySeqCounter += 1;
  return `INF-${dateStr}-${String(dailySeqCounter).padStart(3, '0')}`;
}

function computeStats(
  list: API.InferenceTaskListItem[],
): API.InferenceTaskStats {
  return {
    total: list.length,
    running: list.filter(
      (t) =>
        t.status === 'running' ||
        t.status === 'queued' ||
        t.status === 'pending',
    ).length,
    success: list.filter((t) => t.status === 'success').length,
    failed: list.filter((t) => t.status === 'failed' || t.status === 'stopped')
      .length,
  };
}

function findModel(modelId: string) {
  return MOCK_INFERENCE_MODELS.find((m) => m.inferenceModelId === modelId);
}

export function mockFetchInferenceTaskStats() {
  return { success: true, data: computeStats(taskListStore) };
}

export function mockFetchInferenceTaskList(params?: {
  current?: number;
  pageSize?: number;
  status?: string;
  keyword?: string;
}) {
  const { current = 1, pageSize = 10, status, keyword } = params || {};
  let list = [...taskListStore];
  if (status) list = list.filter((t) => t.status === status);
  if (keyword?.trim()) {
    const kw = keyword.trim().toLowerCase();
    list = list.filter(
      (t) =>
        t.id.toLowerCase().includes(kw) ||
        t.name.toLowerCase().includes(kw) ||
        t.modelDisplayName.toLowerCase().includes(kw),
    );
  }
  list.sort(
    (a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf(),
  );
  const total = list.length;
  const start = (current - 1) * pageSize;
  return {
    success: true,
    data: { data: list.slice(start, start + pageSize), total },
  };
}

export function mockFetchInferenceTaskDetail(id: string) {
  const detail = taskDetailStore[id];
  if (!detail) return null;
  if (detail.status === 'running' && detail.progress < 100) {
    const bumped = Math.min(100, detail.progress + 3);
    const updated: API.InferenceTaskDetail = {
      ...detail,
      progress: bumped,
      progressMessage:
        detail.inputMode === 'batch' && detail.totalCount
          ? `正在推理第 ${Math.round((bumped / 100) * detail.totalCount)}/${detail.totalCount} 条`
          : detail.progressMessage,
      processedCount:
        detail.totalCount != null
          ? Math.round((bumped / 100) * detail.totalCount)
          : detail.processedCount,
    };
    taskDetailStore[id] = updated;
    const idx = taskListStore.findIndex((t) => t.id === id);
    if (idx >= 0)
      taskListStore[idx] = { ...taskListStore[idx], progress: bumped };
    return { success: true, data: updated };
  }
  return { success: true, data: detail };
}

export function mockFetchInferenceModels(params?: {
  current?: number;
  pageSize?: number;
  taskType?: string;
  keyword?: string;
}) {
  const { current = 1, pageSize = 20, taskType, keyword } = params || {};
  let list = [...MOCK_INFERENCE_MODELS];
  if (taskType) list = list.filter((m) => m.taskType === taskType);
  if (keyword?.trim()) {
    const kw = keyword.trim().toLowerCase();
    list = list.filter(
      (m) =>
        m.displayName.toLowerCase().includes(kw) ||
        m.name.toLowerCase().includes(kw),
    );
  }
  const total = list.length;
  const start = (current - 1) * pageSize;
  return {
    success: true,
    data: { data: list.slice(start, start + pageSize), total },
  };
}

export function mockCreateInferenceTask(body: API.CreateInferenceTaskRequest) {
  const model = findModel(body.inferenceModelId);
  if (!model) throw new Error('可推理模型不存在');

  const id = generateTaskId();
  const now = new Date().toISOString();
  const hasInferenceInput = Boolean(body.inferenceInputId);

  if (body.useCustomScript && !body.customScriptId) {
    throw new Error('已启用自定义脚本，请上传推理脚本');
  }

  const scriptMeta = body.customScriptId
    ? scriptStore[body.customScriptId]
    : undefined;

  const listItem: API.InferenceTaskListItem = {
    id,
    name: body.name,
    taskType: model.taskType,
    inputMode: body.inputMode,
    inferenceModelId: body.inferenceModelId,
    modelDisplayName: model.displayName,
    status: 'running',
    progress: 5,
    hasInferenceInput,
    useCustomScript: Boolean(body.useCustomScript),
    createdAt: now,
  };

  if (body.inputMode === 'batch') {
    listItem.datasetDisplayName = body.datasetVersionId
      ? `dataset-${body.datasetVersionId}`
      : '未命名数据集';
    listItem.datasetSizeBytes = 1073741824;
    listItem.datasetItemCount = 1000;
  } else if (body.text) {
    listItem.inputDisplayName =
      body.text.length > 30 ? `${body.text.slice(0, 30)}…` : body.text;
    listItem.hasInferenceInput = false;
  } else if (body.inferenceInputId) {
    const stored = inputStore[body.inferenceInputId];
    listItem.inputFileName = stored?.fileName || 'uploaded-file';
    listItem.inputSizeBytes = stored?.sizeBytes;
    listItem.hasInferenceInput = true;
  }

  const detail: API.InferenceTaskDetail = {
    id,
    name: body.name,
    taskType: model.taskType,
    inputMode: body.inputMode,
    inferenceModelId: body.inferenceModelId,
    modelDisplayName: model.displayName,
    inputDisplayName:
      listItem.datasetDisplayName ||
      listItem.inputDisplayName ||
      listItem.inputFileName ||
      '-',
    datasetVersionId: body.datasetVersionId,
    inferenceInputId: body.inferenceInputId,
    inputPreviewUrl: body.inferenceInputId
      ? inputStore[body.inferenceInputId]?.previewUrl
      : undefined,
    inputText: body.text,
    prompt: body.prompt,
    status: 'running',
    progress: 5,
    progressMessage: '任务已提交，排队中…',
    remark: body.remark,
    createdAt: now,
    startedAt: now,
    processedCount: 0,
    totalCount:
      body.inputMode === 'batch' ? listItem.datasetItemCount : undefined,
    inferenceParams: body.inferenceParams,
    useCustomScript: Boolean(body.useCustomScript),
    customScriptId: body.customScriptId,
    scriptFileName: scriptMeta?.fileName,
    scriptEntryPoint: body.scriptEntryPoint || 'inference_handler',
  };

  taskListStore = [listItem, ...taskListStore];
  taskDetailStore[id] = detail;
  return { success: true, data: detail };
}

export function mockStopInferenceTask(id: string): {
  success: boolean;
  data: API.InferenceTaskDetail;
} {
  const detail = taskDetailStore[id];
  if (!detail) throw new Error('推理任务不存在');

  if (!['pending', 'queued', 'running'].includes(detail.status)) {
    throw new Error('任务已结束，无法停止');
  }

  const now = new Date().toISOString();
  const stoppedMessage =
    detail.progressMessage?.replace(/^正在/, '停止前正在') ||
    `任务已停止于 ${detail.progress}%`;

  let partialResult: API.InferenceTaskResult | undefined;
  if (
    detail.inputMode === 'batch' &&
    detail.processedCount != null &&
    detail.processedCount > 0
  ) {
    const total = detail.totalCount ?? detail.processedCount;
    partialResult = {
      summary: {
        total,
        success: detail.processedCount,
        failed: 0,
      },
      previewItems: [
        {
          index: 1,
          inputName: 'sample_0001.jpg',
          inputPreview: '（停止前已完成）样本预览 1',
          status: 'success',
          summary: 'partial result',
        },
        {
          index: 2,
          inputName: 'sample_0002.jpg',
          inputPreview: '（停止前已完成）样本预览 2',
          status: 'success',
          summary: 'partial result',
        },
      ],
      outputDownloadUrl: `/api/inference/outputs/${id}/partial-results.jsonl`,
    };
  }

  const updated: API.InferenceTaskDetail = {
    ...detail,
    status: 'stopped',
    finishedAt: now,
    errorMessage: '任务已手动停止',
    progressMessage: stoppedMessage,
    ...(partialResult ? { result: partialResult } : {}),
  };

  taskDetailStore[id] = updated;
  const idx = taskListStore.findIndex((t) => t.id === id);
  if (idx >= 0) {
    taskListStore[idx] = {
      ...taskListStore[idx],
      status: 'stopped',
      progress: updated.progress,
      finishedAt: now,
    };
  }

  return { success: true, data: updated };
}

export function mockDeleteInferenceTask(id: string): {
  success: boolean;
  data: API.InferenceTaskDeleteResult;
} {
  const detail = taskDetailStore[id];
  const listItem = taskListStore.find((t) => t.id === id);
  const inputMode = detail?.inputMode ?? listItem?.inputMode;
  const inferenceInputId = detail?.inferenceInputId;
  const customScriptId = detail?.customScriptId;

  taskListStore = taskListStore.filter((t) => t.id !== id);
  delete taskDetailStore[id];

  let inputDeleted = false;
  if (
    inputMode === 'single' &&
    inferenceInputId &&
    inputStore[inferenceInputId]
  ) {
    delete inputStore[inferenceInputId];
    inputDeleted = true;
  }

  let scriptDeleted = false;
  if (customScriptId && scriptStore[customScriptId]) {
    delete scriptStore[customScriptId];
    scriptDeleted = true;
  }

  return {
    success: true,
    data: {
      id,
      deleted: true,
      resultsDeleted: true,
      inputDeleted,
      scriptDeleted,
    },
  };
}

let inputUploadSeq = 100;
let scriptUploadSeq = 100;

export function mockUploadInferenceScript(file: File) {
  if (!file.name.endsWith('.py')) {
    throw new Error('仅支持 .py 推理脚本');
  }
  if (file.size > 1024 * 1024) {
    throw new Error('脚本文件不能超过 1MB');
  }
  scriptUploadSeq += 1;
  const customScriptId = `scr-mock-${scriptUploadSeq}`;
  scriptStore[customScriptId] = {
    objectName: `inference/scripts/${customScriptId}/${file.name}`,
    fileName: file.name,
    sizeBytes: file.size,
  };
  return {
    success: true,
    data: {
      customScriptId,
      fileName: file.name,
      sizeBytes: file.size,
      objectName: scriptStore[customScriptId].objectName,
    } satisfies API.InferenceScriptUploadResult,
  };
}

export function mockUploadInferenceInput(file: File) {
  inputUploadSeq += 1;
  const inferenceInputId = `inp-mock-${inputUploadSeq}`;
  const previewUrl = file.type.startsWith('image/')
    ? URL.createObjectURL(file)
    : undefined;
  inputStore[inferenceInputId] = {
    objectName: `inference/inputs/${inferenceInputId}/${file.name}`,
    fileName: file.name,
    sizeBytes: file.size,
    previewUrl,
  };
  return {
    success: true,
    data: {
      inferenceInputId,
      fileName: file.name,
      sizeBytes: file.size,
      objectName: inputStore[inferenceInputId].objectName,
      previewUrl,
    } satisfies API.InferenceInputUploadResult,
  };
}

export function getInferenceDeleteSuccessMessage(
  data: API.InferenceTaskDeleteResult,
) {
  const extras: string[] = [];
  if (data.inputDeleted) extras.push('输入文件');
  if (data.scriptDeleted) extras.push('自定义脚本');
  if (extras.length > 0) {
    return `已删除推理任务、结果及${extras.join('及')}`;
  }
  return '已删除推理任务及结果';
}
