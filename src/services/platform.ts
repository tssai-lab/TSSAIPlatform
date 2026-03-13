/**
 * 平台业务接口 - Services 层统一导出
 * 按业务模块拆分，此处汇总导出便于 Page 层按需引用
 * @see services/model.ts - 模型
 * @see services/dataset.ts - 数据集
 * @see services/task.ts - 任务
 */
export {
  fetchModelList,
  fetchModelDetail,
  modelUploadInit,
  modelUploadChunk,
  modelUploadComplete,
  deleteModel,
} from './model';

export {
  fetchDatasetList,
  fetchDatasetDetail,
  uploadDataset,
  deleteDataset,
} from './dataset';

export {
  fetchTaskList,
  fetchTaskDetail,
  createTaskWithParams,
  createTaskWithTrainingCode,
  stopTask,
  deleteTask,
} from './task';

export {
  fetchMlflowMetricHistory,
  fetchMlflowMetricsBulk,
  MLFLOW_METRIC_KEYS,
} from './mlflow';
