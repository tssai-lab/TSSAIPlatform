import { DatabaseOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import React from 'react';
import { formatBytes } from '@/utils/formatBytes';

const { Text } = Typography;

type Props = { name: string; sizeBytes?: number };

const InferenceDatasetCell: React.FC<Props> = ({ name, sizeBytes }) => (
  <div
    style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}
  >
    <DatabaseOutlined
      style={{ fontSize: 14, marginTop: 3, flexShrink: 0, opacity: 0.45 }}
    />
    <div style={{ minWidth: 0 }}>
      <Text ellipsis={{ tooltip: name }}>{name}</Text>
      {sizeBytes != null && (
        <div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatBytes(sizeBytes)}
          </Text>
        </div>
      )}
    </div>
  </div>
);

export default InferenceDatasetCell;
