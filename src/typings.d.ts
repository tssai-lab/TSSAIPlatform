declare namespace API {
  // 模型相关
  type ModelItem = {
    id: string;
    name: string;
    version: string;
    type: 'CV' | 'NLP' | 'POINT_CLOUD' | 'ROBOT';
    uploadTime?: string;
    size?: string;
    sizeBytes?: number;
    remark?: string;
    storagePath?: string;
    fileName?: string;
    createdAt?: string;
    updatedAt?: string;
    assetId?: string;
  };

  type ModelVersionDetail = {
    id: string;
    assetId: string;
    version: string;
    name?: string;
    type?: ModelItem['type'];
    fileName?: string;
    storagePath?: string;
    sizeBytes?: number;
    size?: string;
    createdAt?: string;
    codeContent?: string;
    codeFileName?: string;
    codeFilePath?: string;
    codeFiles?: API.ModelCodeFile[];
  };

  type ModelAssetDetail = {
    id: string;
    name: string;
    type: ModelItem['type'];
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
    uploadTime?: string;
    latestVersion?: ModelVersionDetail;
    versions: ModelVersionDetail[];
    defaultVersionId?: string;
  };

  /** 分片上传初始化请求 */
  type ModelUploadInitParams = {
    fileName: string;
    fileSize: number;
    fileFingerprint?: string;
  };

  /** 分片上传进度 / 初始化响应 */
  type ModelUploadInitResult = {
    uploadId: string;
    chunkSize?: number;
    status?: string;
    fileName?: string;
    fileSize?: number;
    totalChunks?: number;
    uploadedChunks?: number;
    uploadedBytes?: number;
    uploadedPartIndexes?: number[];
  };

  type ModelUploadCompleteParams = {
    uploadId: string;
    modelName: string;
    version: string;
    type: string;
    remark: string;
  };

  /** GET /api/model/code-files 返回项（与 backend-api.md 对齐，兼容旧字段） */
  type ModelCodeFile = {
    path: string;
    fileName?: string;
    name?: string;
    extension?: string;
    sizeBytes?: number;
    size?: number;
  };

  /** GET /api/model/previewCode */
  type ModelCodePreview = {
    path?: string;
    fileName?: string;
    content: string;
    sizeBytes?: number;
    language?: string;
  };

  // 数据集相关（列表聚合行字段与 services/dataset 对齐）
  type DatasetItem = {
    id: string;
    assetId?: string;
    name: string;
    type: 'CV' | 'NLP' | 'POINT_CLOUD' | 'MULTIMODAL';
    uploadTime?: string;
    size?: string;
    fileCount: number;
    version?: string;
    versionId?: string;
    versionStatus?: string;
    remark?: string;
    storagePath?: string;
    sizeBytes?: number;
    createdAt?: string;
    updatedAt?: string;
    fileName?: string;
    versionRemark?: string;
    latestDraftVersionId?: string | null;
    importJobId?: string | null;
    importStatus?: string | null;
    importProgress?: number | null;
    importErrorMessage?: string | null;
  };

  // 任务相关
  type TaskItem = {
    id: string;
    name: string;
    experimentId?: string;
    versionNo?: number;
    modelName?: string;
    datasetName?: string;
    createTime: string;
    status: 'pending' | 'queued' | 'running' | 'success' | 'failed' | 'stopped';
    progress: number;
    modelVersionId?: string;
    codeVersionId?: string;
    trainingProfile?: string;
    datasetVersionId?: string;
    hyperParams?: Record<string, any>;
    metrics?: Record<string, any>;
    runId?: string;
    logPath?: string;
    outputPath?: string;
    errorMessage?: string;
    startedAt?: string;
    finishedAt?: string;
    remark?: string;
  };

  /** 训练实验版本记录（后端 TrainingExperimentVersion） */
  type TrainingExperimentVersion = {
    id: string;
    experimentId: string;
    versionNo: number;
    name?: string;
    modelVersionId?: string;
    codeVersionId: string;
    trainingProfile?: string;
    datasetVersionId: string;
    hyperParams?: Record<string, any>;
    status: 'pending' | 'queued' | 'running' | 'success' | 'failed' | 'stopped';
    progress?: number;
    metrics?: Record<string, any>;
    runId?: string;
    logPath?: string;
    outputPath?: string;
    errorMessage?: string;
    startedAt?: string;
    finishedAt?: string;
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
    createTime?: string;
  };

  // 模型详情（扩展字段，后端可能部分返回）
  type ModelDetail = API.ModelItem & {
    updateTime?: string;
    timestamp?: string;
    params?: {
      framework?: string;
      inputSize?: string;
      numClasses?: string;
      paramsCount?: string;
      trainDataset?: string;
      trainParams?: string;
    };
    codeContent?: string;
    codeFileName?: string;
    codeFilePath?: string;
    codeFiles?: API.ModelCodeFile[];
    versionHistory?: {
      version: string;
      updateTime: string;
      timestamp: string;
    }[];
  };

  type DatasetVersionDetail = {
    id: string;
    assetId: string;
    version: string;
    fileName?: string;
    storagePath?: string;
    sizeBytes?: number;
    size?: string;
    remark?: string;
    status?: 'DRAFT' | 'READY' | 'DEPRECATED' | 'ARCHIVED' | string;
    createdAt?: string;
  };

  type DatasetDetail = {
    id: string;
    name: string;
    type: 'CV' | 'NLP' | 'POINT_CLOUD' | 'MULTIMODAL';
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
    uploadTime?: string;
    latestVersion?: API.DatasetVersionDetail;
    versions: API.DatasetVersionDetail[];
    latestDraftVersionId?: string | null;
    importJobId?: string | null;
    importStatus?: string | null;
    importProgress?: number | null;
    importErrorMessage?: string | null;
  };

  // MLflow 指标点
  type MlflowMetricPoint = {
    key: string;
    value: number;
    timestamp?: number;
    step: number;
    run_id?: string;
  };

  // 用户相关
  type UserItem = {
    id: string;
    username: string;
    phone: string;
    role: 'admin' | 'user';
    createTime: string;
    status: 'enabled' | 'disabled';
  };

  // 日志相关
  type LogItem = {
    id: string;
    username: string;
    operateType: string;
    operateTime: string;
    ip: string;
    content: string;
    result: 'success' | 'failed';
  };

  // 算力资源监控
  type ResourceMonitorServerSpecs = {
    cpu: string;
    memory: string;
    gpu: string;
    os: string;
  };

  type ResourceMonitorRunningTask = {
    id: string;
    name: string;
    model: string;
    dataset: string;
    startTime: string;
    progress: number;
    cpuUsage: number;
    memUsage: number;
    gpuUsage: number;
  };

  type ResourceMonitorQueuedTask = {
    id: string;
    name: string;
    model: string;
    dataset: string;
    submitTime: string;
    /** 业务优先级，默认「中」；上下移动不会改变；预留后续多优先级需求 */
    priority: '高' | '中' | '低' | string;
    /** 人工排序标记：0=无干预，非 0=超管手动指定槽位（越小越靠前） */
    queueSortIndex: number;
  };

  type ResourceMonitorServerItem = {
    serverIp: string;
    hostname: string;
    status: 'online' | 'warning';
    cpuRate: number;
    memRate: number;
    gpuRate: number;
    diskRate?: number;
    networkIn?: number;
    networkOut?: number;
    gpuMemRate?: number;
    gpuTemp?: number;
    runTask: number;
    waitTask: number;
    runningTasks: API.ResourceMonitorRunningTask[];
    queuedTasks: API.ResourceMonitorQueuedTask[];
    specs?: API.ResourceMonitorServerSpecs;
  };

  type ResourceMonitorSummary = {
    total: number;
    online: number;
    runningTasks: number;
    queuedTasks: number;
    avgGpu: string | number;
  };

  type ResourceMonitorMetricPoint = {
    tickIndex: number;
    fullTime: string;
    time: string;
    type: string;
    value: number;
  };

  type ResourceMonitorMetrics = {
    interval: string;
    spanLabel: string;
    points: API.ResourceMonitorMetricPoint[];
  };

  // 模型推理任务（见 docs/模型推理设计.md）
  type InferenceTaskStatus =
    | 'pending'
    | 'queued'
    | 'running'
    | 'success'
    | 'failed'
    | 'stopped';

  type InferenceTaskType = 'CV' | 'NLP' | 'MULTIMODAL';

  type InferenceInputMode = 'single' | 'batch';

  type InferenceModelOption = {
    inferenceModelId: string;
    name: string;
    version: string;
    taskType: InferenceTaskType;
    displayName: string;
    source?: string;
    remark?: string;
    defaultInferenceParams?: Record<string, string | number>;
  };

  type InferenceTaskListItem = {
    id: string;
    name: string;
    taskType: InferenceTaskType;
    inputMode: InferenceInputMode;
    inferenceModelId: string;
    modelDisplayName: string;
    datasetDisplayName?: string;
    datasetSizeBytes?: number;
    datasetItemCount?: number;
    inputDisplayName?: string;
    inputFileName?: string;
    inputSizeBytes?: number;
    hasInferenceInput?: boolean;
    useCustomScript?: boolean;
    status: InferenceTaskStatus;
    progress?: number;
    createdAt: string;
    finishedAt?: string;
  };

  type InferenceTaskStats = {
    total: number;
    running: number;
    success: number;
    failed: number;
  };

  type CreateInferenceTaskRequest = {
    name: string;
    inferenceModelId: string;
    inputMode: InferenceInputMode;
    remark?: string;
    datasetVersionId?: string;
    inferenceInputId?: string;
    text?: string;
    prompt?: string;
    inferenceParams?: Record<string, string | number>;
    useCustomScript?: boolean;
    customScriptId?: string;
    scriptEntryPoint?: string;
  };

  type InferenceCvPrediction = {
    label: string;
    score: number;
    bbox?: [number, number, number, number];
  };

  type InferenceNlpEntity = {
    text: string;
    label: string;
    start: number;
    end: number;
  };

  type InferenceResultPreviewItem = {
    index: number;
    inputName: string;
    /** 批量 NLP 等：输入文本摘要/预览（非仅文件名） */
    inputPreview?: string;
    status: 'success' | 'failed';
    summary?: string;
  };

  type InferenceTaskResult = {
    latencyMs?: number;
    predictions?: InferenceCvPrediction[];
    annotatedImageUrl?: string;
    label?: string;
    score?: number;
    generatedText?: string;
    entities?: InferenceNlpEntity[];
    answer?: string;
    summary?: {
      total: number;
      success: number;
      failed: number;
    };
    previewItems?: InferenceResultPreviewItem[];
    outputObjectName?: string;
    outputDownloadUrl?: string;
  };

  type InferenceTaskDetail = {
    id: string;
    name: string;
    taskType: InferenceTaskType;
    inputMode: InferenceInputMode;
    inferenceModelId: string;
    modelDisplayName: string;
    inputDisplayName: string;
    datasetVersionId?: string;
    inferenceInputId?: string;
    inputPreviewUrl?: string;
    /** NLP 单文件粘贴的完整输入文本 */
    inputText?: string;
    /** 多模态单文件的 Prompt */
    prompt?: string;
    inferenceParams?: Record<string, string | number>;
    useCustomScript?: boolean;
    customScriptId?: string;
    scriptFileName?: string;
    scriptEntryPoint?: string;
    status: InferenceTaskStatus;
    progress: number;
    progressMessage?: string;
    processedCount?: number;
    totalCount?: number;
    errorMessage?: string | null;
    remark?: string;
    createdAt: string;
    startedAt?: string;
    finishedAt?: string;
    result?: InferenceTaskResult;
  };

  type InferenceTaskDeleteResult = {
    id: string;
    deleted: boolean;
    resultsDeleted: boolean;
    inputDeleted?: boolean;
    scriptDeleted?: boolean;
  };

  type InferenceScriptUploadResult = {
    customScriptId: string;
    fileName: string;
    sizeBytes: number;
    objectName: string;
  };

  type InferenceParamSchema = {
    taskType: InferenceTaskType;
    common: {
      key: string;
      label: string;
      type: 'number' | 'select' | 'string';
      default: string | number;
      min?: number;
      max?: number;
      step?: number;
      options?: { label: string; value: string | number }[];
      tooltip?: string;
    }[];
    specific: {
      key: string;
      label: string;
      type: 'number' | 'select' | 'string';
      default: string | number;
      min?: number;
      max?: number;
      step?: number;
      options?: { label: string; value: string | number }[];
      tooltip?: string;
    }[];
  };

  type InferenceInputUploadResult = {
    inferenceInputId: string;
    fileName: string;
    sizeBytes: number;
    objectName: string;
    previewUrl?: string;
  };
}
