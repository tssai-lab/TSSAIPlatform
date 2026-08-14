import { CopyOutlined, ReloadOutlined } from '@ant-design/icons';
import { Alert, Button, message, Space, Spin, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import { downloadObject } from '@/services/files';
import { objectNameFromMinioPath } from '@/services/inference';

const DEFAULT_MAX_PREVIEW_BYTES = 1_000_000;

const RUNNING_STATUSES = new Set(['pending', 'queued', 'scheduled', 'running']);

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty'; message: string }
  | {
      status: 'ready';
      content: string;
      truncated: boolean;
      sizeBytes: number;
    }
  | { status: 'error'; message: string };

export type InferenceLogPanelProps = {
  logPath?: string | null;
  status?: string;
  /** 超过该字节数只保留末尾，默认 1MB */
  maxPreviewBytes?: number;
};

async function readLogBlob(
  blob: Blob,
  maxPreviewBytes: number,
): Promise<{ content: string; truncated: boolean; sizeBytes: number }> {
  if (blob.type && blob.type.includes('application/json')) {
    const text = await blob.text();
    let msg = text;
    try {
      const json = JSON.parse(text) as {
        errorMessage?: string;
        message?: string;
      };
      msg = json.errorMessage || json.message || text;
    } catch {
      // 非 JSON 时沿用原文
    }
    throw new Error(msg || '日志加载失败');
  }

  const sizeBytes = blob.size;
  if (sizeBytes <= maxPreviewBytes) {
    return {
      content: await blob.text(),
      truncated: false,
      sizeBytes,
    };
  }

  const slice = blob.slice(sizeBytes - maxPreviewBytes);
  let content = await slice.text();
  const firstNl = content.indexOf('\n');
  if (firstNl >= 0 && firstNl < content.length - 1) {
    content = content.slice(firstNl + 1);
  }
  return { content, truncated: true, sizeBytes };
}

const InferenceLogPanel: React.FC<InferenceLogPanelProps> = ({
  logPath,
  status,
  maxPreviewBytes = DEFAULT_MAX_PREVIEW_BYTES,
}) => {
  const [state, setState] = useState<LoadState>({ status: 'idle' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      const objectName = objectNameFromMinioPath(logPath);
      if (!objectName) {
        const running = status ? RUNNING_STATUSES.has(status) : false;
        if (!cancelled) {
          setState({
            status: 'empty',
            message: running ? '任务进行中，日志生成后可查看' : '暂无日志文件',
          });
        }
        return;
      }

      if (!cancelled) setState({ status: 'loading' });
      try {
        const blob = await downloadObject(objectName, {
          skipErrorHandler: true,
        });
        if (cancelled) return;
        if (!(blob instanceof Blob)) {
          throw new Error('日志响应不是文件流');
        }
        const result = await readLogBlob(blob, maxPreviewBytes);
        if (cancelled) return;
        if (!result.content.trim()) {
          setState({ status: 'empty', message: '日志文件为空' });
          return;
        }
        setState({
          status: 'ready',
          content: result.content,
          truncated: result.truncated,
          sizeBytes: result.sizeBytes,
        });
      } catch (err: any) {
        if (cancelled) return;
        setState({
          status: 'error',
          message: err?.message || '日志加载失败',
        });
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [logPath, status, maxPreviewBytes, reloadKey]);

  const handleCopy = async () => {
    if (state.status !== 'ready') return;
    try {
      await navigator.clipboard.writeText(state.content);
      message.success('已复制日志');
    } catch {
      message.error('复制失败');
    }
  };

  return (
    <div>
      <Space
        align="center"
        style={{
          width: '100%',
          justifyContent: 'space-between',
          marginBottom: 8,
        }}
      >
        <Typography.Title level={5} style={{ margin: 0 }}>
          运行日志
        </Typography.Title>
        <Space size={4}>
          <Button
            type="text"
            size="small"
            icon={<ReloadOutlined />}
            disabled={!logPath || state.status === 'loading'}
            onClick={() => setReloadKey((k) => k + 1)}
          >
            刷新
          </Button>
          <Button
            type="text"
            size="small"
            icon={<CopyOutlined />}
            disabled={state.status !== 'ready'}
            onClick={() => void handleCopy()}
          >
            复制
          </Button>
        </Space>
      </Space>

      {state.status === 'ready' && state.truncated && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 8 }}
          message={`日志较大（约 ${(state.sizeBytes / 1024).toFixed(0)} KB），仅预览末尾；完整内容请使用「下载日志」。`}
        />
      )}

      {state.status === 'loading' || state.status === 'idle' ? (
        <div style={{ padding: 24, textAlign: 'center' }}>
          <Spin size="small" />
        </div>
      ) : state.status === 'empty' || state.status === 'error' ? (
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {state.message}
        </Typography.Text>
      ) : (
        <pre
          style={{
            margin: 0,
            padding: 12,
            minHeight: 120,
            maxHeight: 360,
            overflow: 'auto',
            background: '#111827',
            color: '#e5e7eb',
            borderRadius: 6,
            fontSize: 12,
            lineHeight: 1.5,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {state.content}
        </pre>
      )}
    </div>
  );
};

export default InferenceLogPanel;
