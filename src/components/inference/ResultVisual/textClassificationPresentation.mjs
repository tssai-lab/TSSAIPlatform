export function listTextClassificationRows(result) {
  const source = Array.isArray(result?.predictionsPreview)
    ? result.predictionsPreview
    : Array.isArray(result?.samples)
      ? result.samples
      : [];
  return source.filter(
    (row) =>
      row &&
      typeof row === 'object' &&
      typeof row.text === 'string' &&
      row.text.trim().length > 0,
  );
}

export function confidencePercent(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.min(100, Math.max(0, Number((value * 100).toFixed(1))));
}
