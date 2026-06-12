import { ExperimentOutlined, RightOutlined } from '@ant-design/icons';
import { Card, Space, Tag, Typography } from 'antd';
import React from 'react';
import { INFERENCE_MODALITIES } from '@/constants/platform';

type TrainingRunCardProps = {
  candidate: API.InferenceTrainingCandidate;
  onSelect: (candidate: API.InferenceTrainingCandidate) => void;
};

const TrainingRunCard: React.FC<TrainingRunCardProps> = ({
  candidate,
  onSelect,
}) => {
  const modalityMeta = INFERENCE_MODALITIES[candidate.modality];
  const versionLabel = candidate.versionLabel || `v${candidate.versionNo}`;

  return (
    <Card
      size="small"
      hoverable
      onClick={() => onSelect(candidate)}
      style={{ height: '100%' }}
      styles={{
        body: {
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
        },
      }}
    >
      <Space direction="vertical" size={8} style={{ width: '100%', flex: 1 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 8,
          }}
        >
          <Typography.Text strong ellipsis style={{ flex: 1 }}>
            {candidate.name}
          </Typography.Text>
          <Tag color="blue">{versionLabel}</Tag>
        </div>

        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {candidate.modelName}
        </Typography.Text>

        {candidate.remark ? (
          <Typography.Paragraph
            type="secondary"
            ellipsis={{ rows: 2 }}
            style={{ fontSize: 12, marginBottom: 0, flex: 1 }}
          >
            {candidate.remark}
          </Typography.Paragraph>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 'auto',
            paddingTop: 8,
            borderTop: '1px solid #f0f0f0',
          }}
        >
          <Space size={4} wrap>
            <Tag color={modalityMeta.tagColor}>{modalityMeta.label}</Tag>
            <Tag icon={<ExperimentOutlined />}>
              {candidate.experimentId.length > 16
                ? `${candidate.experimentId.slice(0, 16)}…`
                : candidate.experimentId}
            </Tag>
          </Space>
          <Typography.Link style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
            推理 <RightOutlined />
          </Typography.Link>
        </div>
      </Space>
    </Card>
  );
};

export default TrainingRunCard;
