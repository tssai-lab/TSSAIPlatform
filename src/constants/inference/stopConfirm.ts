/** 推理任务停止确认文案 — §6.6.2 */

export function getInferenceStopConfirm(): {
  title: string;
  description: string;
} {
  return {
    title: '确定停止该推理任务？',
    description: '停止后任务将不再继续执行，已产生的部分结果可能不完整。',
  };
}
