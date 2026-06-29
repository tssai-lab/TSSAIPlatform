/**
 * 任务模块 - Services 层
 * 封装训练任务相关接口，供 Page 层调用
 */
import { request } from '@umijs/max';
import { API_CONFIG } from '@/constants/platform';

/** 获取任务列表 */
export async function fetchTaskList(options?: {
  current?: number;
  pageSize?: number;
  status?: string;
  skipErrorHandler?: boolean;
  [key: string]: unknown;
}) {
  const { current, pageSize, status, ...rest } = options || {};
  return request<{ success: boolean; data: { data: API.TaskItem[]; total: number }; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.TASK_LIST,
    {
      method: 'GET',
      params: { current, pageSize, status },
      ...rest,
    },
  );
}

/** 获取任务详情 */
export async function fetchTaskDetail(id: string, options?: { [key: string]: any }) {
  return request<{ success: boolean; data: API.TrainingExperimentVersion; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.TASK_DETAIL,
    {
      method: 'GET',
      params: { id },
      ...(options || {}),
    },
  );
}

/** 图文一致性训练演示固定参数（后端种子资产） */
export const CONSISTENCY_DEMO_PARAMS = {
  trainingProfile: 'image_text_consistency_fusion_logreg',
  codeVersionId: 'code-ver-consistency-test-v1',
  datasetVersionId: 'dataset-ver-consistency-test-data-v1',
  hyperParams: {} as Record<string, unknown>,
};

export const CONSISTENCY_TRAINING_PROFILE = CONSISTENCY_DEMO_PARAMS.trainingProfile;

/** 发起训练任务（会自动生成 experimentId，并创建 versionNo=1） */
export async function createTask(
  params: {
    name?: string;
    baseModelVersionId?: string;
    modelVersionId?: string;
    codeVersionId: string;
    datasetVersionId: string;
    trainingProfile?: string;
    hyperParams?: Record<string, unknown> | string;
    remark?: string;
  },
  options?: { [key: string]: any },
) {
  return request<{ success: boolean; data: API.TrainingExperimentVersion; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.TASK_CREATE,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: params,
      ...(options || {}),
    },
  );
}

/** 图文一致性训练演示：固定 profile + 种子 code/dataset 版本 */
export async function createConsistencyTask(
  body: { name?: string },
  options?: { [key: string]: any },
) {
  return createTask({ ...CONSISTENCY_DEMO_PARAMS, name: body.name }, options);
}

/** 使用上传得到的 code/dataset 版本发起 profile 训练 */
export async function createProfileTrainingTask(
  params: {
    name?: string;
    codeVersionId: string;
    datasetVersionId: string;
    trainingProfile?: string;
    hyperParams?: Record<string, unknown>;
    remark?: string;
  },
  options?: { [key: string]: any },
) {
  return createTask(
    {
      name: params.name,
      trainingProfile: params.trainingProfile || CONSISTENCY_DEMO_PARAMS.trainingProfile,
      codeVersionId: params.codeVersionId,
      datasetVersionId: params.datasetVersionId,
      hyperParams: params.hyperParams ?? {},
      remark: params.remark,
    },
    options,
  );
}

/** 按 experimentId 查看历史版本 */
export async function listExperimentVersions(experimentId: string, options?: { [key: string]: any }) {
  return request<{ success: boolean; data: API.TrainingExperimentVersion[]; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.EXPERIMENT_VERSIONS(experimentId),
    { method: 'GET', ...(options || {}) },
  );
}

/** 查询指定实验版本详情 */
export async function getExperimentVersion(
  experimentId: string,
  versionNo: number,
  options?: { [key: string]: any },
) {
  return request<{ success: boolean; data: API.TrainingExperimentVersion; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.EXPERIMENT_VERSION_DETAIL(experimentId, versionNo),
    { method: 'GET', ...(options || {}) },
  );
}

/** 修改指定版本的超参数 */
export async function updateExperimentHyperParams(
  experimentId: string,
  versionNo: number,
  body: { hyperParams: Record<string, unknown> | string; remark?: string },
  options?: { [key: string]: any },
) {
  return request<{ success: boolean; data: API.TrainingExperimentVersion; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.EXPERIMENT_HYPER_PARAMS_UPDATE(experimentId, versionNo),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      ...(options || {}),
    },
  );
}

/** 创建实验新版本（versionNo 自动递增，不传字段继承最新版本） */
export async function createExperimentVersion(
  experimentId: string,
  body: {
    name?: string;
    baseModelVersionId?: string;
    modelVersionId?: string;
    codeVersionId?: string;
    datasetVersionId?: string;
    hyperParams?: Record<string, unknown> | string;
    remark?: string;
  },
  options?: { [key: string]: any },
) {
  return request<{ success: boolean; data: API.TrainingExperimentVersion; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.EXPERIMENT_VERSION_CREATE(experimentId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      ...(options || {}),
    },
  );
}

/** 终止任务 */
export async function stopTask(id: string, options?: { [key: string]: any }) {
  return request<{ success: boolean; data: API.TrainingExperimentVersion; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.TASK_STOP,
    {
      method: 'POST',
      params: { id },
      ...(options || {}),
    },
  );
}

/** 删除任务 */
export async function deleteTask(id: string, options?: { [key: string]: any }) {
  return request<{ success: boolean; data: any; errorMessage?: string }>(
    API_CONFIG.ENDPOINTS.TASK_DELETE,
    {
      method: 'DELETE',
      params: { id },
      ...(options || {}),
    },
  );
}
