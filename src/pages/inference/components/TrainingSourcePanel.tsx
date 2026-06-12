import { Descriptions, Spin, Tag, Typography } from 'antd';
import React from 'react';
import { INFERENCE_MODALITIES } from '@/constants/platform';

type TrainingSourcePanelProps = {
  context: API.InferenceTrainingContext | null;
  loading: boolean;
};

const TrainingSourcePanel: React.FC<TrainingSourcePanelProps> = ({
  context,
  loading,
}) => {
  if (loading) {
    return <Spin />;
  }

  if (!context) {
    return (
      <Typography.Text type="secondary">未加载训练产出信息</Typography.Text>
    );
  }

  const modalityMeta = INFERENCE_MODALITIES[context.modality];
  const ready = context.status === 'success';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 0 }}>
        训练产出
      </Typography.Title>
      <Descriptions column={1} size="small">
        <Descriptions.Item label="任务">
          <Typography.Text strong>{context.name}</Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="实验 ID">
          <Typography.Text code style={{ fontSize: 12 }}>
            {context.experimentId}
          </Typography.Text>
        </Descriptions.Item>
        <Descriptions.Item label="版本">
          <Tag color="blue">
            {context.versionLabel || `v${context.versionNo}`}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="模态">
          <Tag color={modalityMeta.tagColor}>{modalityMeta.label}</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="模型">{context.modelName}</Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag color={ready ? 'success' : 'default'}>
            {ready ? '可推理' : context.status}
          </Tag>
        </Descriptions.Item>
        {context.outputPath ? (
          <Descriptions.Item label="产出路径">
            <Typography.Text
              type="secondary"
              style={{ fontSize: 12, wordBreak: 'break-all' }}
            >
              {context.outputPath}
            </Typography.Text>
          </Descriptions.Item>
        ) : null}
      </Descriptions>
      {context.remark ? (
        <Typography.Paragraph
          type="secondary"
          style={{ fontSize: 12, marginBottom: 0 }}
        >
          {context.remark}
        </Typography.Paragraph>
      ) : null}
    </div>
  );
};

export default TrainingSourcePanel;
