/** 在线推理：训练产出模态转换与列表筛选 */

export type InferenceModelItem = API.ModelItem & {
  modality: API.InferenceModality;
  experimentId: string;
  versionNo: number;
  taskRecordId?: string;
};

/** 将训练产出上下文转为工作台模型项 */
export function trainingContextToModelItem(
  ctx: API.InferenceTrainingContext,
): InferenceModelItem {
  return {
    id: `training:${ctx.experimentId}:${ctx.versionNo}`,
    name: ctx.modelName || ctx.name,
    type: ctx.modality === 'NLP' ? 'NLP' : 'CV',
    version: ctx.versionLabel || `v${ctx.versionNo}`,
    remark:
      ctx.remark ||
      `训练产出 · ${ctx.experimentId} ${ctx.versionLabel || `v${ctx.versionNo}`}`,
    storagePath: ctx.outputPath,
    modality: ctx.modality,
    experimentId: ctx.experimentId,
    versionNo: ctx.versionNo,
    taskRecordId: ctx.taskRecordId,
  };
}

/** 根据模型资产类型推断推理模态 */
export function toInferenceModality(
  type?: string,
  remark?: string,
): API.InferenceModality {
  const r = (remark || '').toLowerCase();
  if (r.includes('多模态') || r.includes('multimodal') || r.includes('图文')) {
    return 'MULTIMODAL';
  }
  if (type === 'NLP') return 'NLP';
  return 'CV';
}

export function filterTrainingCandidates(
  list: API.InferenceTrainingCandidate[],
  modality: API.InferenceModality,
  keyword?: string,
) {
  const kw = keyword?.trim().toLowerCase();
  return list.filter((item) => {
    if (item.modality !== modality || item.status !== 'success') return false;
    if (!kw) return true;
    return (
      item.name.toLowerCase().includes(kw) ||
      item.modelName.toLowerCase().includes(kw) ||
      item.experimentId.toLowerCase().includes(kw) ||
      (item.remark || '').toLowerCase().includes(kw)
    );
  });
}

export function countTrainingCandidatesByModality(
  list: API.InferenceTrainingCandidate[],
) {
  const counts: Record<API.InferenceModality, number> = {
    CV: 0,
    NLP: 0,
    MULTIMODAL: 0,
  };
  for (const item of list) {
    if (item.status === 'success') {
      counts[item.modality] += 1;
    }
  }
  return counts;
}
