import { Alert, Space, Tag, Typography } from 'antd';
import React, { useMemo } from 'react';
import ClassificationView from './ClassificationView';
import DetectionView from './DetectionView';
import { isPlainObject, resolveView } from './resolveView';
import TabularView from './TabularView';
import {
  INFERENCE_VIEW_META,
  type InferenceView,
  type ResultVisualProps,
} from './types';

const InferenceResultVisual: React.FC<ResultVisualProps> = ({
  result,
  outputPath,
  onDownloadObject,
}) => {
  const view = useMemo(() => resolveView(result), [result]);
  const meta = INFERENCE_VIEW_META[view];

  if (!result || !isPlainObject(result) || !Object.keys(result).length) {
    return (
      <Alert
        type="info"
        showIcon
        message="暂无可视化数据"
        description="任务尚未生成结构化 result，或结果为空。"
      />
    );
  }

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <div>
        <Typography.Text type="secondary" style={{ marginRight: 8 }}>
          识别类型
        </Typography.Text>
        <Tag color={meta.color}>{meta.label}</Tag>
        <Typography.Text
          type="secondary"
          style={{ marginLeft: 8, fontSize: 12 }}
        >
          view={view}
          {result.view ? '（来自 result.view）' : '（字段探测）'}
        </Typography.Text>
      </div>

      {renderByView(view, result, outputPath, onDownloadObject)}
    </Space>
  );
};

function renderByView(
  view: InferenceView,
  result: Record<string, unknown>,
  outputPath?: string | null,
  onDownloadObject?: ResultVisualProps['onDownloadObject'],
) {
  switch (view) {
    case 'image_detection':
      return (
        <DetectionView
          result={result}
          outputPath={outputPath}
          onDownloadObject={onDownloadObject}
        />
      );
    case 'image_classification':
      return <ClassificationView result={result} />;
    case 'table_classification':
      return <TabularView result={result} />;
    case 'unknown':
      return (
        <Alert
          type="warning"
          showIcon
          message="未匹配到已实现的专业视图"
          description="可展开上方结构化结果查看原文，或使用「下载结果」。若后端提供 result.view，将优先按协议分流。"
        />
      );
    default:
      return (
        <Alert
          type="info"
          showIcon
          message={`「${INFERENCE_VIEW_META[view].label}」视图尚未实现`}
          description="枚举已预留，待有真实 result 样例后可继续加积木。当前请查看结构化结果或使用「下载结果」。"
        />
      );
  }
}

export default InferenceResultVisual;
export { resolveView } from './resolveView';
export type { InferenceView, ResultVisualProps } from './types';
export { INFERENCE_VIEW_META, INFERENCE_VIEWS } from './types';
