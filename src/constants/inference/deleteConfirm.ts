/** 推理任务删除确认文案 — §6.5.3 */

type DeleteConfirmSource = Pick<
  API.InferenceTaskListItem,
  'inputMode' | 'hasInferenceInput' | 'useCustomScript'
> &
  Partial<Pick<API.InferenceTaskDetail, 'inferenceInputId'>>;

export function getInferenceDeleteConfirm(record: DeleteConfirmSource): {
  title: string;
  description: string;
} {
  const title = '确定删除该推理任务？';

  if (record.inputMode === 'batch') {
    const scriptNote = record.useCustomScript
      ? ' 将同时删除已上传的自定义推理脚本。'
      : '';
    return {
      title,
      description: `将删除任务记录及推理结果。不会删除关联的数据集，请在数据集管理中手动删除。${scriptNote}`,
    };
  }

  const hasInput =
    record.hasInferenceInput === true || Boolean(record.inferenceInputId);
  const scriptNote = record.useCustomScript ? '及自定义推理脚本' : '';

  if (hasInput) {
    return {
      title,
      description: `将删除任务记录、推理结果、已上传的输入文件${scriptNote}（不可恢复）。`,
    };
  }

  if (record.useCustomScript) {
    return {
      title,
      description: '将删除任务记录、推理结果及自定义推理脚本（不可恢复）。',
    };
  }

  return {
    title,
    description: '将删除任务记录及推理结果。',
  };
}
