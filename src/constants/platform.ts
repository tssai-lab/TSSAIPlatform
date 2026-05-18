/**
 * 平台配置常量（源自 TSSAIPlatform-frontend-prototype）
 * 避免硬编码，便于二次开发和维护
 */

/** API 配置 */
export const API_CONFIG = {
  TIMEOUT: 30000,
  ENDPOINTS: {
    MODEL_LIST: '/api/model/list',
    MODEL_UPLOAD: '/api/model/upload',
    /** 分片上传（与 TSSAIPlatform-xyx 后端 ModelUploadController 对齐） */
    MODEL_UPLOAD_INIT: '/api/model/upload/init',
    MODEL_UPLOAD_CHUNK: '/api/model/upload/chunk',
    MODEL_UPLOAD_PROGRESS: '/api/model/upload/progress',
    MODEL_UPLOAD_COMPLETE: '/api/model/upload/complete',
    MODEL_DETAIL: '/api/model/detail',
    MODEL_DELETE: '/api/model/delete',
    MODEL_CODE_FILES: '/api/model/code-files',
    MODEL_PREVIEW_CODE: '/api/model/previewCode',

    DATASET_LIST: '/api/dataset/list',
    /** 数据集断点续传 */
    DATASET_UPLOAD_INIT: '/api/dataset/upload/init',
    DATASET_UPLOAD_CHUNK: '/api/dataset/upload/chunk',
    DATASET_UPLOAD_PROGRESS: '/api/dataset/upload/progress',
    DATASET_UPLOAD_COMPLETE: '/api/dataset/upload/complete',
    DATASET_UPLOAD_FOLDER: '/api/dataset/upload/folder',

    TASK_LIST: '/api/task/list',
    TASK_CREATE: '/api/task/create',
    TASK_DETAIL: '/api/task/detail',
    TASK_STOP: '/api/task/stop',
    TASK_DELETE: '/api/task/delete',

    /** 实验版本管理 */
    EXPERIMENT_VERSIONS: (experimentId: string) =>
      `/api/experiments/${encodeURIComponent(experimentId)}/versions`,
    EXPERIMENT_VERSION_DETAIL: (experimentId: string, versionNo: number) =>
      `/api/experiments/${encodeURIComponent(experimentId)}/versions/${encodeURIComponent(String(versionNo))}`,
    EXPERIMENT_VERSION_CREATE: (experimentId: string) =>
      `/api/experiments/${encodeURIComponent(experimentId)}/versions`,
    EXPERIMENT_HYPER_PARAMS_UPDATE: (experimentId: string, versionNo: number) =>
      `/api/experiments/${encodeURIComponent(experimentId)}/versions/${encodeURIComponent(String(versionNo))}/hyper-parameters`,

    /** 独立 MLflow 指标接口（经 proxy 转发） */
    MLFLOW_METRICS_HISTORY: '/mlflow-api/2.0/mlflow/metrics/get-history-bulk',
  },
} as const;

/** 文件上传配置 */
export const UPLOAD_CONFIG = {
  MODEL: {
    MAX_SIZE: 2 * 1024 * 1024 * 1024, // 2GB
    /** 单文件模型：.pt/.pth/.onnx 等；千问等大模型由多文件组成，请上传 .zip 包 */
    ACCEPT_TYPES: ['.zip'],
    REQUIRED_FIELDS: ['file', 'name', 'version', 'type', 'remark'],
  },
  DATASET: {
    MAX_SIZE: 50 * 1024 * 1024 * 1024, // 50GB
    ACCEPT_TYPES: [] as string[],
    REQUIRED_FIELDS: ['file', 'name'],
    REQUIRE_ANNOTATION: false,
  },
  TRAINING_CODE: {
    MAX_SIZE: 50 * 1024 * 1024, // 50MB
    ACCEPT_TYPES: ['.py', '.pyx', '.ipynb', '.txt'],
  },
} as const;

/** 模型类型 */
export const MODEL_TYPES = {
  CV: { label: 'CV（计算机视觉）', value: 'CV', color: '#1890ff' },
  NLP: { label: 'NLP（自然语言处理）', value: 'NLP', color: '#52c41a' },
} as const;

/** 数据集类型 */
export const DATASET_TYPES = {
  CV: { label: 'CV（计算机视觉）', value: 'CV', color: '#1890ff' },
  NLP: { label: 'NLP（自然语言处理）', value: 'NLP', color: '#52c41a' },
} as const;

/** 任务状态 */
export const TASK_STATUS = {
  PENDING: { label: '待执行', value: 'pending', color: '#595959' },
  RUNNING: { label: '运行中', value: 'running', color: '#1890ff' },
  SUCCESS: { label: '成功', value: 'success', color: '#52c41a' },
  FAILED: { label: '失败', value: 'failed', color: '#ff4d4f' },
} as const;

/** 训练可视化配置 */
export const VISUALIZATION_CONFIG = {
  REALTIME: false,
  GENERATE_AFTER_TRAINING: true,
  STORAGE_TYPE: 'cloud',
  SUPPORT_DISTRIBUTED: true,
  CHART_TYPES: ['loss', 'accuracy', 'precision', 'recall', 'f1'],
} as const;

/** 分页配置 */
export const PAGINATION_CONFIG = {
  DEFAULT_PAGE_SIZE: 10,
  PAGE_SIZE_OPTIONS: [10, 20, 50, 100],
} as const;

/** 日期格式 */
export const DATE_FORMAT = {
  DISPLAY: 'YYYY-MM-DD HH:mm:ss',
  TIMESTAMP: 'X',
} as const;
