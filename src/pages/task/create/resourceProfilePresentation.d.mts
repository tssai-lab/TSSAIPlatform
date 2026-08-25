import type { TrainingPlan } from '@/services/trainingPlans';

export type CpuTrainingResourceProfile =
  TrainingPlan['runtimes'][number]['resourceProfiles'][number] & {
    runtimeId: string;
    deviceType: 'CPU';
  };

export function listCpuTrainingResourceProfiles(
  plan?: TrainingPlan,
): CpuTrainingResourceProfile[];

export function firstCpuTrainingResourceProfileId(
  plan?: TrainingPlan,
): string | undefined;
