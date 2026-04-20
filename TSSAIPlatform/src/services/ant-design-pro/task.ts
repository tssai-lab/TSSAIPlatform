import { request } from '@umijs/max';

export async function createTrainingTask(
  body: API.CreateTrainingExperimentParams,
  options?: { [key: string]: any },
) {
  return request<{ data: API.TrainingExperimentVersion }>('/api/task/create', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function listTrainingTasks(options?: { [key: string]: any }) {
  return request<{ data: { data: API.TaskItem[]; total: number } }>('/api/task/list', {
    method: 'GET',
    ...(options || {}),
  });
}

export async function getTrainingTaskDetail(id: string, options?: { [key: string]: any }) {
  return request<{ data: API.TrainingExperimentVersion }>('/api/task/detail', {
    method: 'GET',
    params: { id },
    ...(options || {}),
  });
}

export async function stopTrainingTask(id: string, options?: { [key: string]: any }) {
  return request<{ data: API.TrainingExperimentVersion }>('/api/task/stop', {
    method: 'POST',
    params: { id },
    ...(options || {}),
  });
}

export async function deleteTrainingTask(id: string, options?: { [key: string]: any }) {
  return request<Record<string, any>>('/api/task/delete', {
    method: 'DELETE',
    params: { id },
    ...(options || {}),
  });
}

export async function createExperiment(
  body: API.CreateTrainingExperimentParams,
  options?: { [key: string]: any },
) {
  return request<{ data: API.TrainingExperimentVersion }>('/api/experiments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data: body,
    ...(options || {}),
  });
}

export async function listExperimentVersions(experimentId: string, options?: { [key: string]: any }) {
  return request<{ data: API.TrainingExperimentVersion[] }>(
    `/api/experiments/${encodeURIComponent(experimentId)}/versions`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

export async function getExperimentVersion(
  experimentId: string,
  versionNo: number,
  options?: { [key: string]: any },
) {
  return request<{ data: API.TrainingExperimentVersion }>(
    `/api/experiments/${encodeURIComponent(experimentId)}/versions/${versionNo}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

export async function createExperimentVersion(
  experimentId: string,
  body: API.CreateExperimentVersionParams,
  options?: { [key: string]: any },
) {
  return request<{ data: API.TrainingExperimentVersion }>(
    `/api/experiments/${encodeURIComponent(experimentId)}/versions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      ...(options || {}),
    },
  );
}

export async function updateExperimentHyperParams(
  experimentId: string,
  versionNo: number,
  body: API.UpdateHyperParamsParams,
  options?: { [key: string]: any },
) {
  return request<{ data: API.TrainingExperimentVersion }>(
    `/api/experiments/${encodeURIComponent(experimentId)}/versions/${versionNo}/hyper-parameters`,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      data: body,
      ...(options || {}),
    },
  );
}
