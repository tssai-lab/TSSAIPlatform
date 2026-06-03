declare namespace API {
  // 模型相关
  type ModelItem = {
    id: string;
    name: string;
    version: string;
    type: 'CV' | 'NLP';
    uploadTime?: string;
    size?: string;
    sizeBytes?: number;
    remark?: string;
    storagePath?: string;
    createdAt?: string;
    updatedAt?: string;
    assetId?: string;
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
    type: 'CV' | 'NLP';
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
}
