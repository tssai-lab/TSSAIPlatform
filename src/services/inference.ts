/**
 * 在线推理 - Services 层
 *
 * 训练产出来源：任务列表（success）+ 实验版本历史（复用 task.ts）
 * 推理请求：POST /inference/predict/*，sourceType=TRAINING_OUTPUT
 */
import { request } from '@umijs/max';
import { INFERENCE_TASK_FETCH_PAGE_SIZE } from '@/constants/inference';
import { API_CONFIG, INFERENCE_CONFIG } from '@/constants/platform';
import { uploadObject } from '@/services/files';
import { getModelDetail } from '@/services/model';
import {
  fetchTaskList,
  getExperimentVersion,
  listExperimentVersions,
} from '@/services/task';
import {
  toInferenceModality,
  type InferenceModelItem,
} from '@/utils/inferenceModality';

export type { InferenceModelItem };

const PREDICT_OPTIONS = { timeout: INFERENCE_CONFIG.PREDICT_TIMEOUT_MS };

/** 表单输入状态（Page 层维护，提交时传入 runInference） */
export type CvInputState = {
  file?: File;
  previewUrl?: string;
  objectName?: string;
};

export type NlpInputState = {
  text: string;
};

export type MultimodalInputState = {
  file?: File;
  previewUrl?: string;
  objectName?: string;
  prompt: string;
};

export type RunInferenceParams = {
  model: InferenceModelItem;
  params: API.InferenceParams;
  cvInput?: CvInputState;
  nlpInput?: NlpInputState;
  multimodalInput?: MultimodalInputState;
};

type TrainingOutputPayload = {
  sourceType: 'TRAINING_OUTPUT';
  experimentId: string;
  versionNo: number;
};

type PredictResponse = {
  success?: boolean;
  data?: API.InferencePredictResult;
  errorMessage?: string | null;
};

type ModelMeta = {
  name: string;
  modality: API.InferenceModality;
};

const modelMetaCache = new Map<string, ModelMeta>();

async function resolveModelMeta(
  modelVersionId?: string,
  options?: { skipErrorHandler?: boolean },
): Promise<ModelMeta> {
  if (!modelVersionId) {
    return { name: '未知模型', modality: 'CV' };
  }
  const cached = modelMetaCache.get(modelVersionId);
  if (cached) return cached;

  try {
    const res = await getModelDetail(modelVersionId, {
      skipErrorHandler: options?.skipErrorHandler ?? true,
    });
    const item = res?.data;
    if (item?.name) {
      const meta: ModelMeta = {
        name: item.name,
        modality: toInferenceModality(item.type, item.remark),
      };
      modelMetaCache.set(modelVersionId, meta);
      return meta;
    }
  } catch {
    // 单条解析失败时回退
  }

  const fallback = {
    name: modelVersionId,
    modality: 'CV' as API.InferenceModality,
  };
  modelMetaCache.set(modelVersionId, fallback);
  return fallback;
}

function versionRunKey(version: API.TrainingExperimentVersion) {
  return `${version.experimentId}:${version.versionNo}`;
}

function finishedAtMs(value?: string) {
  if (!value) return 0;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : 0;
}

function sortVersionsByFinishedAtDesc(
  versions: API.TrainingExperimentVersion[],
) {
  return [...versions].sort(
    (a, b) => finishedAtMs(b.finishedAt) - finishedAtMs(a.finishedAt),
  );
}

function sortCandidatesByFinishedAtDesc(
  candidates: API.InferenceTrainingCandidate[],
) {
  return [...candidates].sort(
    (a, b) => finishedAtMs(b.finishedAt) - finishedAtMs(a.finishedAt),
  );
}

async function fetchAllSuccessTasks(options?: { skipErrorHandler?: boolean }) {
  const reqOpts = { skipErrorHandler: options?.skipErrorHandler ?? true };
  const pageSize = INFERENCE_TASK_FETCH_PAGE_SIZE;
  const tasks: API.TaskItem[] = [];
  let current = 1;
  let total = Number.POSITIVE_INFINITY;

  while (tasks.length < total) {
    const listRes = await fetchTaskList({
      current,
      pageSize,
      status: 'success',
      ...reqOpts,
    });
    const page: API.TaskItem[] =
      (listRes as { data?: { data?: API.TaskItem[] } })?.data?.data ?? [];
    total =
      (listRes as { data?: { total?: number } })?.data?.total ?? page.length;
    tasks.push(...page);
    if (page.length < pageSize) break;
    current += 1;
  }

  return tasks;
}

async function fetchSuccessfulTrainingVersions(options?: {
  skipErrorHandler?: boolean;
}) {
  const reqOpts = { skipErrorHandler: options?.skipErrorHandler ?? true };
  const tasks = await fetchAllSuccessTasks(options);

  const experimentIds = Array.from(
    new Set(
      tasks
        .map((task) => task.experimentId)
        .filter((id): id is string => !!id),
    ),
  );

  if (experimentIds.length === 0) {
    return [];
  }

  const versionGroups = await Promise.all(
    experimentIds.map(async (experimentId) => {
      try {
        const res = await listExperimentVersions(experimentId, reqOpts);
        return (res?.data ?? []).filter((item) => item.status === 'success');
      } catch {
        return [] as API.TrainingExperimentVersion[];
      }
    }),
  );

  const deduped = new Map<string, API.TrainingExperimentVersion>();
  for (const version of versionGroups.flat()) {
    deduped.set(versionRunKey(version), version);
  }
  return sortVersionsByFinishedAtDesc(Array.from(deduped.values()));
}

async function versionToTrainingContext(
  version: API.TrainingExperimentVersion,
  options?: { skipErrorHandler?: boolean },
): Promise<API.InferenceTrainingContext> {
  const meta = await resolveModelMeta(version.modelVersionId, options);
  return {
    experimentId: version.experimentId,
    versionNo: version.versionNo,
    taskRecordId: version.id,
    name: version.name || `训练 v${version.versionNo}`,
    modality: meta.modality,
    modelName: meta.name,
    versionLabel: `v${version.versionNo}`,
    outputPath: version.outputPath,
    status: version.status,
    remark: version.remark,
  };
}

async function versionToCandidate(
  version: API.TrainingExperimentVersion,
  options?: { skipErrorHandler?: boolean },
): Promise<API.InferenceTrainingCandidate> {
  const meta = await resolveModelMeta(version.modelVersionId, options);
  return {
    experimentId: version.experimentId,
    versionNo: version.versionNo,
    taskRecordId: version.id,
    name: version.name || `训练 v${version.versionNo}`,
    modelName: meta.name,
    versionLabel: `v${version.versionNo}`,
    modality: meta.modality,
    status: version.status,
    finishedAt: version.finishedAt,
    remark: version.remark,
  };
}

function buildTrainingOutputPayload(
  model: InferenceModelItem,
): TrainingOutputPayload {
  if (!model.experimentId || model.versionNo == null) {
    throw new Error('缺少训练产出标识（experimentId / versionNo）');
  }
  return {
    sourceType: 'TRAINING_OUTPUT',
    experimentId: model.experimentId,
    versionNo: model.versionNo,
  };
}

function enrichPredictResult(
  data: API.InferencePredictResult,
  model: InferenceModelItem,
): API.InferencePredictResult {
  return {
    ...data,
    modelName: model.name,
    modelVersion: model.version,
  };
}

async function ensureInputObjectName(file: File, existing?: string) {
  if (existing) return existing;
  const res = await uploadObject(
    file,
    `inference/inputs/${Date.now()}_${file.name}`,
    { skipErrorHandler: true },
  );
  const objectName = (res as { data?: { objectName?: string } })?.data
    ?.objectName;
  if (!objectName) {
    throw new Error('输入文件上传失败');
  }
  return objectName;
}

async function resolveImageObjectName(input: {
  file?: File;
  objectName?: string;
}) {
  if (input.objectName) return input.objectName;
  if (input.file) {
    return ensureInputObjectName(input.file);
  }
  throw new Error('请先上传图片');
}

async function postPredict(
  endpoint: string,
  data: Record<string, unknown>,
  options?: Record<string, unknown>,
): Promise<PredictResponse> {
  const res = await request<PredictResponse>(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    data,
    skipErrorHandler: true,
    ...PREDICT_OPTIONS,
    ...options,
  });
  if (!res?.success || !res.data) {
    throw new Error(res?.errorMessage || '推理失败');
  }
  return res;
}

/** 获取可推理的训练产出列表（仅 status=success，按完成时间倒序） */
export async function fetchInferenceTrainingCandidates(options?: {
  skipErrorHandler?: boolean;
}) {
  const versions = await fetchSuccessfulTrainingVersions(options);
  const candidates = await Promise.all(
    versions.map((version) => versionToCandidate(version, options)),
  );
  return sortCandidatesByFinishedAtDesc(candidates);
}

/** 加载指定训练产出的推理上下文 */
export async function fetchTrainingInferenceContext(
  experimentId: string,
  versionNo: number,
  options?: { skipErrorHandler?: boolean },
): Promise<API.InferenceTrainingContext> {
  const res = await getExperimentVersion(experimentId, versionNo, {
    skipErrorHandler: options?.skipErrorHandler ?? true,
  });
  if (!res?.success || !res.data) {
    throw new Error(res?.errorMessage || '训练产出加载失败');
  }
  if (res.data.status !== 'success') {
    throw new Error('该训练版本尚未成功完成，暂无法推理');
  }
  return versionToTrainingContext(res.data, options);
}

/** 执行一次在线推理 */
export async function runInference(
  ctx: RunInferenceParams,
  options?: { skipErrorHandler?: boolean },
) {
  const { model, params } = ctx;
  const source = buildTrainingOutputPayload(model);
  const reqOpts = { skipErrorHandler: options?.skipErrorHandler ?? true };

  let res: PredictResponse;

  if (model.modality === 'CV') {
    if (!ctx.cvInput?.file && !ctx.cvInput?.objectName) {
      throw new Error('请先上传图片');
    }
    const objectName = await resolveImageObjectName(ctx.cvInput);
    res = await postPredict(
      API_CONFIG.ENDPOINTS.INFERENCE_PREDICT_CV,
      { ...source, inputObjectName: objectName, params },
      reqOpts,
    );
  } else if (model.modality === 'NLP') {
    const text = ctx.nlpInput?.text?.trim();
    if (!text) {
      throw new Error('请输入文本');
    }
    res = await postPredict(
      API_CONFIG.ENDPOINTS.INFERENCE_PREDICT_NLP,
      { ...source, text, params },
      reqOpts,
    );
  } else {
    const prompt = ctx.multimodalInput?.prompt?.trim();
    if (!prompt) {
      throw new Error('请输入问题或 Prompt');
    }
    if (!ctx.multimodalInput?.file && !ctx.multimodalInput?.objectName) {
      throw new Error('请先上传图片');
    }
    const objectName = await resolveImageObjectName(ctx.multimodalInput);
    res = await postPredict(
      API_CONFIG.ENDPOINTS.INFERENCE_PREDICT_MULTIMODAL,
      { ...source, inputObjectName: objectName, prompt, params },
      reqOpts,
    );
  }

  return enrichPredictResult(res.data!, model);
}
