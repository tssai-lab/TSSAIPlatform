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
    type: 'CV' | 'NLP' | 'POINT_CLOUD';
    uploadTime?: string;
    size?: string;
    fileCount: number;
    version?: string;
    versionId?: string;
    remark?: string;
    storagePath?: string;
    sizeBytes?: number;
    createdAt?: string;
    updatedAt?: string;
    fileName?: string;
    versionRemark?: string;
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
    modelVersionId: string;
    codeVersionId: string;
    datasetVersionId: string;
    hyperParams: Record<string, any>;
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
    createdAt?: string;
  };

  type DatasetDetail = {
    id: string;
    name: string;
    type: 'CV' | 'NLP' | 'POINT_CLOUD';
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
    uploadTime?: string;
    latestVersion?: API.DatasetVersionDetail;
    versions: API.DatasetVersionDetail[];
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

  /** 推理模态 */
  type InferenceModality = 'CV' | 'NLP' | 'MULTIMODAL';

  /** 可推理的训练产出候选项（训练成功列表） */
  type InferenceTrainingCandidate = {
    experimentId: string;
    versionNo: number;
    taskRecordId?: string;
    name: string;
    modelName: string;
    versionLabel: string;
    modality: InferenceModality;
    status: 'pending' | 'queued' | 'running' | 'success' | 'failed' | 'stopped';
    finishedAt?: string;
    remark?: string;
  };

  /** 训练产出推理上下文（experimentId + versionNo） */
  type InferenceTrainingContext = {
    experimentId: string;
    versionNo: number;
    taskRecordId?: string;
    name: string;
    modality: InferenceModality;
    modelName: string;
    versionLabel: string;
    outputPath?: string;
    status: 'pending' | 'queued' | 'running' | 'success' | 'failed' | 'stopped';
    remark?: string;
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

  /** 在线推理响应 */
  type InferencePredictResult = {
    recordId?: string;
    type: InferenceModality;
    cvTaskType?: string;
    latencyMs?: number;
    predictions?: InferenceCvPrediction[];
    label?: string;
    score?: number;
    generatedText?: string;
    tokenCount?: number;
    entities?: InferenceNlpEntity[];
    answer?: string;
    scene?: string;
    semanticLabels?: string[];
    annotatedImageUrl?: string;
    modelName?: string;
    modelVersion?: string;
  };

  type InferenceParams = {
    confidence?: number;
    topK?: number;
    temperature?: number;
    maxTokens?: number;
    topP?: number;
  };
}
