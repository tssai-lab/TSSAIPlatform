// @ts-ignore
/* eslint-disable */

 // 这段代码是 TypeScript 的全局类型声明，核心是定义前端调用后端 API 时的入参 / 出参数据结构；
 // 所有前端与后端交互的通用数据结构（接口入参、出参、通用错误格式等），都推荐集中写在这个文件里
declare namespace API {
  type CurrentUser = {
    name?: string;
    avatar?: string
    userid?: string;
    email?: string;
    signature?: string;
    title?: string;
    group?: string;
    tags?: { key?: string; label?: string }[];
    notifyCount?: number;
    unreadCount?: number;
    country?: string;
    access?: string;
    geographic?: {
      province?: { label?: string; key?: string };
      city?: { label?: string; key?: string };
    };
    address?: string;
    phone?: string;
  };

  type LoginResult = {
    status?: string;
    type?: string;
    currentAuthority?: string;
  };

  type FakeCaptcha = {
    code?: number;
    status?: string;
  };

  type LoginParams = {
    username?: string;
    password?: string;
    autoLogin?: boolean;
    type?: string;
  };

  type ErrorResponse = {
    /** 业务约定的错误码 */
    errorCode: string;
    /** 业务上的错误信息 */
    errorMessage?: string;
    /** 业务上的请求是否成功 */
    success?: boolean;
  };

  type TaskType = 'CV' | 'NLP';

  /** 模型列表项 */
  type ModelItem = {
    id?: string;
    name?: string;
    version?: string;
    type?: TaskType;
    remark?: string;
    storagePath?: string;
    createdAt?: string;
    sizeBytes?: number;
  };

  /** 分片上传初始化请求 */
  type ModelUploadInitParams = {
    fileName: string;
    fileSize: number;
    fileFingerprint?: string;
  };

  /** 分片上传初始化响应（后端生成 uploadId，用于 MinIO 等） */
  type ModelUploadInitResult = {
    uploadId: string;
    status?: 'UPLOADING' | 'COMPLETED' | string;
    fileName?: string;
    fileSize?: number;
    chunkSize: number;
    totalChunks: number;
    uploadedChunks?: number;
    uploadedBytes?: number;
    uploadedPartIndexes: number[];
    storagePath?: string;
    assetId?: string;
    versionId?: string;
    createdAt?: string;
    updatedAt?: string;
  };

  /** 分片上传完成请求（后端合并分片并写入 MinIO，落库模型记录） */
  type ModelUploadCompleteParams = {
    uploadId: string;
    modelName: string;
    version: string;
    type: TaskType;
    remark: string;
  };

  type ModelCodeFile = {
    path: string;
    fileName: string;
    extension?: string;
    sizeBytes?: number;
  };

  type ModelCodePreview = {
    path: string;
    fileName: string;
    content: string;
    sizeBytes?: number;
  };

  type JsonObject = Record<string, any>;

  /** 训练实验版本记录 */
  type TrainingExperimentVersion = {
    id: string;
    experimentId: string;
    versionNo: number;
    name?: string;
    modelVersionId: string;
    codeVersionId: string;
    datasetVersionId: string;
    hyperParams?: JsonObject;
    status?: 'pending' | 'running' | 'success' | 'failed' | 'stopped' | string;
    progress?: number;
    remark?: string;
    createdAt?: string;
    updatedAt?: string;
    createTime?: string;
  };

  /** 训练任务列表项；id 为版本记录 ID，experimentId 为一次训练的唯一实验 ID */
  type TaskItem = TrainingExperimentVersion & {
    id: string;
    modelName?: string;
    datasetName?: string;
    duration?: string;
  };

  /** 发起训练请求：后端会自动生成唯一 experimentId，并创建 versionNo=1 */
  type CreateTrainingExperimentParams = {
    name?: string;
    modelVersionId: string;
    codeVersionId: string;
    datasetVersionId: string;
    hyperParams?: JsonObject | string;
    params?: JsonObject | string;
    remark?: string;
  };

  /** 创建实验新版本请求：不传字段时后端会继承实验最新版本的对应字段 */
  type CreateExperimentVersionParams = {
    name?: string;
    modelVersionId?: string;
    codeVersionId?: string;
    datasetVersionId?: string;
    hyperParams?: JsonObject | string;
    params?: JsonObject | string;
    remark?: string;
  };

  /** 修改指定实验版本的超参数配置 */
  type UpdateHyperParamsParams = {
    hyperParams?: JsonObject | string;
    params?: JsonObject | string;
    remark?: string;
  };
}
