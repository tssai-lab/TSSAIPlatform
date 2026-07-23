import { request } from '@umijs/max';

export type TrainingPlan = {
  id: string;
  version: string;
  displayName: string;
  description?: string;
  enabled: boolean;
  trainingModes: string[];
  execution: {
    interpreter: 'python' | 'python3';
    entrypoint: string;
    arguments: string[];
  };
  inputs: {
    model: { taskTypes: string[] };
    dataset: {
      taskTypes: string[];
      cvTaskTypes?: string[];
      annotationFormats?: string[];
    };
  };
  runtimes: Array<{
    id: string;
    deviceType: 'CPU' | 'NVIDIA_GPU';
    resourceProfiles: Array<{ id: string; gpuCount: number }>;
  }>;
};

/** 后端是可选训练方案的唯一可信来源。 */
export async function fetchTrainingPlans(options?: { [key: string]: unknown }) {
  return request<{ success: boolean; data: TrainingPlan[]; errorMessage?: string }>(
    '/training-plans',
    { method: 'GET', ...(options || {}) },
  );
}
