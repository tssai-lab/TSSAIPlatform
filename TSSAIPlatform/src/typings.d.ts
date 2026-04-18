declare namespace API {
  type CurrentUser = {
    access?: string;
    role?: 'admin' | 'user';
    name?: string;
    avatar?: string;
  };

  // 模型相关
  type ModelItem = {
    id: string;
    name: string;
    version: string;
    type: 'CV' | 'NLP';
    uploadTime: string;
    size?: string;
    sizeBytes?: number;
    remark?: string;
    storagePath?: string;
  };

  type ModelDetail = {
    id: string;
    name: string;
    version: string;
    type: 'CV' | 'NLP';
    createdAt?: string;
    uploadTime?: string;
    size?: string;
    sizeBytes?: number;
    remark?: string;
    storagePath?: string;
  };

  // 数据集相关
  type DatasetItem = {
    id: string;
    name: string;
    type: 'CV' | 'NLP';
    uploadTime: string;
    size: string;
    fileCount: number;
    storagePath?: string;
  };

  // 任务相关
  type TaskItem = {
    id: string;
    name: string;
    modelName: string;
    datasetName: string;
    createTime: string;
    status: 'pending' | 'running' | 'success' | 'failed';
    progress: number;
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
