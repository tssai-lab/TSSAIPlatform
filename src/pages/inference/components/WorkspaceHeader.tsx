import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { Button, Space, Tag, Typography } from 'antd';
import React from 'react';
import { INFERENCE_MODALITIES } from '@/constants/platform';
import type { InferenceModelItem } from '@/services/platform';

type WorkspaceHeaderProps = {
  model: InferenceModelItem | null;
  trainingContext?: API.InferenceTrainingContext | null;
  onReset: () => void;
};

const WorkspaceHeader: React.FC<WorkspaceHeaderProps> = ({
  model,
  trainingContext,
  onReset,
}) => {
  if (!model || !trainingContext) {
    return <Typography.Text type="secondary">训练产出加载中…</Typography.Text>;
  }

  const modalityMeta = INFERENCE_MODALITIES[model.modality];

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
        flexWrap: 'wrap',
        gap: 12,
        paddingBottom: 8,
        borderBottom: '1px solid #f0f0f0',
      }}
    >
      <Space wrap>
        <ThunderboltOutlined style={{ color: '#1890ff' }} />
        <Typography.Text strong>推理工作区</Typography.Text>
        <Tag color={modalityMeta.tagColor}>{modalityMeta.label}</Tag>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {trainingContext.modelName} ·{' '}
          {trainingContext.versionLabel || `v${trainingContext.versionNo}`}
        </Typography.Text>
      </Space>
      <Button icon={<ReloadOutlined />} onClick={onReset}>
        重置输入
      </Button>
    </div>
  );
};

export default WorkspaceHeader;
