import { Progress, Typography } from 'antd';
import React from 'react';

const { Text } = Typography;

type Props = {
  progress: number;
  progressMessage?: string;
  processedCount?: number;
  totalCount?: number;
  size?: 'default' | 'small';
  showInfo?: boolean;
  /** stopped 时冻结进度条，灰色、无动画 — §6.6.4 */
  frozen?: boolean;
};

const InferenceProgress: React.FC<Props> = ({
  progress,
  progressMessage,
  processedCount,
  totalCount,
  size = 'default',
  showInfo = true,
  frozen = false,
}) => {
  const pct = Math.min(100, Math.max(0, progress ?? 0));
  return (
    <div style={{ minWidth: size === 'small' ? 80 : 200 }}>
      <Progress
        percent={pct}
        size={size === 'small' ? 'small' : undefined}
        showInfo={showInfo}
        status={frozen ? 'normal' : pct >= 100 ? 'success' : 'active'}
        strokeColor={frozen ? '#bfbfbf' : undefined}
      />
      {size === 'default' && progressMessage && (
        <Text type="secondary" style={{ fontSize: 12 }}>
          {progressMessage}
        </Text>
      )}
      {size === 'default' &&
        processedCount != null &&
        totalCount != null &&
        totalCount > 0 && (
          <div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              已处理 {processedCount.toLocaleString()} /{' '}
              {totalCount.toLocaleString()}
            </Text>
          </div>
        )}
    </div>
  );
};

export default InferenceProgress;
