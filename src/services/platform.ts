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
  fetchModelAssetDetail,
  fetchModelVersionCodePreview,
  modelUploadInit,
  modelUploadChunk,
  modelUploadProgress,
  modelUploadComplete,
  createModelAsset,
  getModelAsset,
  listModelAssets,
  updateModelAsset,
  deleteModelAsset,
  createModelVersion,
  getModelVersion,
  listModelVersions,
  updateModelVersion,
  deleteModelVersion,
  deleteModel,
  resolveModelVersionId,
  type ModelAsset,
  type ModelVersion,
  type ModelTaskType,
} from './model';

export {
  fetchDatasetList,
  fetchDatasetDetail,
  listDatasetAssets,
  uploadDataset,
  deleteDataset,
  createDatasetVersion,
  updateDatasetVersion,
  deleteDatasetVersion,
  datasetUploadInit,
  datasetUploadChunk,
  datasetUploadProgress,
  datasetUploadComplete,
  datasetUploadFolder,
} from './dataset';

export {
  fetchTaskList,
  fetchTaskDetail,
  createTask,
  listExperimentVersions,
  getExperimentVersion,
  updateExperimentHyperParams,
  createExperimentVersion,
  stopTask,
  deleteTask,
} from './task';

export {
  fetchMlflowMetricHistory,
  fetchMlflowMetricsBulk,
  MLFLOW_METRIC_KEYS,
} from './mlflow';

export {
  fetchResourceMonitorSummary,
  fetchResourceMonitorServers,
  fetchResourceMonitorServerDetail,
  fetchResourceMonitorMetrics,
  createResourceMonitorServer,
  deleteResourceMonitorServer,
  reorderResourceQueueTask,
  updateResourceQueuePriority,
  cancelResourceQueueTask,
} from './resourceMonitor';

export { fileHealth, uploadObject, getDownloadUrl, deleteObject } from './files';

export {
  fetchGpuResourceOverview,
  type GpuDevice,
  type GpuDeviceStatus,
  type GpuResourceOverview,
} from './gpu';

export {
  getPointCloudPreview,
  getPointCloudFile,
  getPointCloudZipFile,
  fetchPointCloudPreviewInfo,
  PointCloudFileFormat,
  PointCloudPreviewFormat,
  type PointCloudPreviewInfo,
  type PointCloudZipEntry,
  type PointCloudApiResponse,
} from './pointcloud';

export {
  getDatasetPreviewFiles,
  getDatasetPreviewContent,
  getDatasetPreviewImage,
  fetchDatasetPreviewFiles,
  fetchDatasetPreviewContent,
  DatasetPreviewFileKind,
  type DatasetPreviewFilesData,
  type DatasetPreviewFileItem,
  type DatasetPreviewContentData,
  type DatasetPreviewApiResponse,
} from './datasetPreview';
