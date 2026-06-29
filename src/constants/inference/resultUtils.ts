/** 推理结果是否可展示 — §6.6.4 */

export function hasInferenceResult(
  detail: Pick<API.InferenceTaskDetail, 'result'>,
): boolean {
  const r = detail.result;
  if (!r) return false;
  return Boolean(
    (r.predictions && r.predictions.length > 0) ||
      r.annotatedImageUrl ||
      r.label ||
      r.generatedText ||
      r.answer ||
      (r.entities && r.entities.length > 0) ||
      (r.previewItems && r.previewItems.length > 0) ||
      r.outputDownloadUrl ||
      r.summary,
  );
}
