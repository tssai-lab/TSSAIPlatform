import { Space, Tag, Typography } from 'antd';
import React from 'react';
import type { InferenceModelItem } from '@/services/platform';

type InferenceMetricsBarProps = {
  result: API.InferencePredictResult;
  model: InferenceModelItem;
  latencyMs?: number;
};

const InferenceMetricsBar: React.FC<InferenceMetricsBarProps> = ({
  result,
  model,
  latencyMs,
}) => {
  const ms = latencyMs ?? result.latencyMs;
  const modelLabel = `${result.modelName ?? model.name} v${result.modelVersion ?? model.version}`;

  return (
    <div
      style={{
        flexShrink: 0,
        marginTop: 8,
        paddingTop: 6,
        borderTop: '1px solid #f0f0f0',
        lineHeight: '20px',
      }}
    >
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        <Space
          split={<span style={{ color: '#e8e8e8', margin: '0 2px' }}>|</span>}
          size={4}
        >
          <span>
            耗时:{' '}
            <Typography.Text style={{ fontSize: 12 }}>
              {ms != null ? `${ms}ms` : '—'}
            </Typography.Text>
          </span>
          <span>
            模型:{' '}
            <Typography.Text style={{ fontSize: 12 }}>
              {modelLabel}
            </Typography.Text>
          </span>
          <span>
            状态:{' '}
            <Tag
              color="success"
              bordered={false}
              style={{
                margin: 0,
                fontSize: 11,
                lineHeight: '18px',
                padding: '0 6px',
              }}
            >
              成功
            </Tag>
          </span>
        </Space>
      </Typography.Text>
    </div>
  );
};

export default InferenceMetricsBar;
