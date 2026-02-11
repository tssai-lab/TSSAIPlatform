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

  /** 模型列表项 */
  type ModelItem = {
    id?: string;
    name?: string;
    version?: string;
    type?: string;
    remark?: string;
    storagePath?: string;
    createdAt?: string;
  };

  /** 分片上传初始化请求 */
  type ModelUploadInitParams = {
    fileName: string;
    fileSize: number;
  };

  /** 分片上传初始化响应（后端生成 uploadId，用于 MinIO 等） */
  type ModelUploadInitResult = {
    uploadId: string;
    chunkSize?: number;
  };

  /** 分片上传完成请求（后端合并分片并写入 MinIO，落库模型记录） */
  type ModelUploadCompleteParams = {
    uploadId: string;
    modelName: string;
    version: string;
    type: string;
    remark: string;
  };
}
