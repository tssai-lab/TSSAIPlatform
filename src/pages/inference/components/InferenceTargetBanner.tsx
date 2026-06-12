import { ExperimentOutlined, SwapOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
import React from 'react';
import { INFERENCE_MODALITIES } from '@/constants/platform';

type InferenceTargetBannerProps = {
  context: API.InferenceTrainingContext;
  onChangeTarget?: () => void;
};

const InferenceTargetBanner: React.FC<InferenceTargetBannerProps> = ({
  context,
  onChangeTarget,
}) => {
  const modalityMeta = INFERENCE_MODALITIES[context.modality];
  const versionLabel = context.versionLabel || `v${context.versionNo}`;

  return (
    <Card
      size="small"
      style={{
        borderColor: '#1890ff',
        background:
          'linear-gradient(90deg, rgba(24,144,255,0.06) 0%, rgba(24,144,255,0.02) 100%)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            当前推理目标
          </Typography.Text>
          <div style={{ marginTop: 4 }}>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {context.name}
            </Typography.Title>
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {context.modelName} · {versionLabel}
            </Typography.Text>
          </div>
          <Space wrap size={6} style={{ marginTop: 8 }}>
            <Tag color="gold">训练产出</Tag>
            <Tag color={modalityMeta.tagColor}>{modalityMeta.label}</Tag>
            <Tag icon={<ExperimentOutlined />} color="blue">
              {context.experimentId} / {versionLabel}
            </Tag>
          </Space>
        </div>
        {onChangeTarget ? (
          <Button icon={<SwapOutlined />} onClick={onChangeTarget}>
            更换训练产出
          </Button>
        ) : null}
      </div>
    </Card>
  );
};

export default InferenceTargetBanner;
