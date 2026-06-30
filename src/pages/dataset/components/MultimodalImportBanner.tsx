import { RedoOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, message, Progress, Space, Typography } from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchMultimodalImportStatus,
  MULTIMODAL_IMPORT_STATUS_LABEL,
  type MultimodalImportJob,
  type MultimodalImportStatus,
  retryMultimodalImport,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';

const ACTIVE_IMPORT_STATUSES: MultimodalImportStatus[] = ['PENDING', 'RUNNING'];

type MultimodalImportBannerProps = {
  importJobId?: string | null;
  initialStatus?: string | null;
  initialProgress?: number | null;
  initialErrorMessage?: string | null;
  onImportFinished?: () => void;
};

const MultimodalImportBanner: React.FC<MultimodalImportBannerProps> = ({
  importJobId,
  initialStatus,
  initialProgress,
  initialErrorMessage,
  onImportFinished,
}) => {
  const [job, setJob] = useState<MultimodalImportJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(
    async (silent = false) => {
      if (!importJobId) return;
      if (!silent) setLoading(true);
      setError(null);
      try {
        const res = await fetchMultimodalImportStatus(importJobId, {
          skipErrorHandler: true,
        });
        const data = res?.data;
        if (data) {
          setJob(data);
        }
      } catch (e: unknown) {
        if (!silent) {
          setError(getApiErrorMessage(e));
        }
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [importJobId],
  );

  useEffect(() => {
    if (!importJobId) {
      setJob(null);
      return;
    }
    loadStatus(false);
  }, [importJobId, loadStatus]);

  const status = job?.status ?? initialStatus ?? undefined;
  const progress = job?.progress ?? initialProgress ?? 0;
  const errorMessage = job?.errorMessage ?? initialErrorMessage ?? undefined;

  const handleRetry = async () => {
    if (!importJobId) return;
    setRetrying(true);
    setError(null);
    try {
      await retryMultimodalImport(importJobId, { skipErrorHandler: true });
      message.success('已提交重新导入，请稍候');
      await loadStatus(true);
    } catch (e: unknown) {
      setError(getApiErrorMessage(e));
    } finally {
      setRetrying(false);
    }
  };

  useEffect(() => {
    if (!importJobId || !status) return;
    if (!ACTIVE_IMPORT_STATUSES.includes(status as MultimodalImportStatus)) {
      if (status === 'SUCCESS') {
        onImportFinished?.();
      }
      return;
    }
    const timer = window.setInterval(() => {
      void loadStatus(true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [importJobId, status, loadStatus, onImportFinished]);

  if (!importJobId) {
    return null;
  }

  if (status === 'SUCCESS') {
    return (
      <Alert
        type="success"
        showIcon
        message="多模态数据导入已完成"
        description="版本已推进为 READY，可在下方浏览样本。"
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (status === 'FAILED') {
    return (
      <Alert
        type="error"
        showIcon
        message="多模态数据导入失败"
        description={
          <Space direction="vertical" style={{ width: '100%' }}>
            <span>{errorMessage || '请检查 manifest 与 zip 内容后重试。'}</span>
            <Space>
              <Button
                type="primary"
                size="small"
                icon={<RedoOutlined />}
                loading={retrying}
                onClick={() => void handleRetry()}
              >
                重试导入
              </Button>
              {error && (
                <Typography.Text type="danger">{error}</Typography.Text>
              )}
            </Space>
          </Space>
        }
        style={{ marginBottom: 16 }}
      />
    );
  }

  if (
    !status ||
    !ACTIVE_IMPORT_STATUSES.includes(status as MultimodalImportStatus)
  ) {
    return null;
  }

  return (
    <Alert
      type="info"
      showIcon
      message={
        <Space>
          <span>
            多模态数据导入中（
            {MULTIMODAL_IMPORT_STATUS_LABEL[status as MultimodalImportStatus] ??
              status}
            ）
          </span>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            loading={loading}
            onClick={() => loadStatus(false)}
          >
            刷新
          </Button>
        </Space>
      }
      description={
        <Space direction="vertical" style={{ width: '100%' }}>
          <Progress percent={Math.min(100, Math.max(0, progress))} />
          {job?.totalSamples != null && (
            <Typography.Text type="secondary">
              已导入 {job.importedSamples ?? 0} / {job.totalSamples} 个样本
            </Typography.Text>
          )}
          {error && <Typography.Text type="danger">{error}</Typography.Text>}
        </Space>
      }
      style={{ marginBottom: 16 }}
    />
  );
};

export default MultimodalImportBanner;
