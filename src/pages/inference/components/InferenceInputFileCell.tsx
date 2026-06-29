import { FileOutlined } from '@ant-design/icons';
import { Typography } from 'antd';
import React from 'react';
import { formatBytes } from '@/utils/formatBytes';

const { Text } = Typography;

type Props = { fileName?: string; displayName?: string; sizeBytes?: number };

const InferenceInputFileCell: React.FC<Props> = ({
  fileName,
  displayName,
  sizeBytes,
}) => {
  const label = fileName || displayName || '-';
  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}
    >
      <FileOutlined
        style={{ fontSize: 14, marginTop: 3, flexShrink: 0, opacity: 0.45 }}
      />
      <div style={{ minWidth: 0 }}>
        <Text ellipsis={{ tooltip: label }}>{label}</Text>
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
};

export default InferenceInputFileCell;
