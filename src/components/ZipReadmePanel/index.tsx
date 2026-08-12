import { Empty, Spin, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import MarkdownPreview from '@/pages/dataset/components/MarkdownPreview';
import {
  fetchDatasetPreviewContent,
  fetchDatasetPreviewFiles,
} from '@/services/datasetPreview';
import { listModelCodeFiles, previewModelCode } from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import { findReadmePath } from '@/utils/readmePath';

export type ZipReadmeSource = 'model' | 'dataset';

type ZipReadmePanelProps = {
  source: ZipReadmeSource;
  versionId?: string;
  /** 模型侧可直接传入已加载的文件路径，避免重复请求 code-files */
  filePaths?: string[];
};

type LoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'empty'; message: string }
  | { status: 'ready'; path: string; content: string }
  | { status: 'error'; message: string };

async function loadModelReadme(
  versionId: string,
  filePaths?: string[],
): Promise<LoadState> {
  let paths = filePaths;
  if (!paths?.length) {
    const res = await listModelCodeFiles(versionId, {
      skipErrorHandler: true,
    });
    paths = (res?.data ?? [])
      .map((f) => f.path || f.fileName)
      .filter(Boolean) as string[];
  }
  const readmePath = findReadmePath(paths);
  if (!readmePath) {
    return {
      status: 'empty',
      message: '当前版本未包含 README.md',
    };
  }
  const previewRes = await previewModelCode(versionId, readmePath, {
    skipErrorHandler: true,
  });
  const content = previewRes?.data?.content;
  if (!content?.trim()) {
    return {
      status: 'empty',
      message: `已找到 ${readmePath}，但内容为空`,
    };
  }
  return { status: 'ready', path: readmePath, content };
}

async function loadDatasetReadme(versionId: string): Promise<LoadState> {
  const filesPage = await fetchDatasetPreviewFiles(
    versionId,
    { page: 1, pageSize: 200, keyword: 'readme' },
    { skipErrorHandler: true },
  );
  const paths = (filesPage.files ?? []).map((f) => f.path || f.fileName || '');
  let readmePath = findReadmePath(paths);

  // keyword 过滤可能漏掉根目录 README，再拉一页全量补一次
  if (!readmePath) {
    const allPage = await fetchDatasetPreviewFiles(
      versionId,
      { page: 1, pageSize: 200 },
      { skipErrorHandler: true },
    );
    readmePath = findReadmePath(
      (allPage.files ?? []).map((f) => f.path || f.fileName || ''),
    );
  }

  if (!readmePath) {
    return {
      status: 'empty',
      message: '当前版本未包含 README.md',
    };
  }

  const contentRes = await fetchDatasetPreviewContent(
    versionId,
    { path: readmePath },
    { skipErrorHandler: true },
  );
  const content = contentRes.content;
  if (!content?.trim()) {
    return {
      status: 'empty',
      message: `已找到 ${readmePath}，但内容为空`,
    };
  }
  return { status: 'ready', path: readmePath, content };
}

/**
 * 从模型/数据集版本 zip 中读取 README.md 并 Markdown 渲染。
 */
const ZipReadmePanel: React.FC<ZipReadmePanelProps> = ({
  source,
  versionId,
  filePaths,
}) => {
  const [state, setState] = useState<LoadState>({ status: 'idle' });

  useEffect(() => {
    if (!versionId) {
      setState({
        status: 'empty',
        message: '请先选择一个版本以查看 README',
      });
      return;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    (async () => {
      try {
        const next =
          source === 'model'
            ? await loadModelReadme(versionId, filePaths)
            : await loadDatasetReadme(versionId);
        if (!cancelled) setState(next);
      } catch (error: unknown) {
        if (!cancelled) {
          setState({
            status: 'error',
            message: getApiErrorMessage(error, '读取 README.md 失败'),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
    // filePaths 用 join 稳定依赖，避免父组件每次渲染新数组导致重复请求
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, versionId, filePaths?.join('\0')]);

  if (state.status === 'loading' || state.status === 'idle') {
    return (
      <div style={{ textAlign: 'center', padding: 48 }}>
        <Spin tip="加载 README…" />
      </div>
    );
  }

  if (state.status === 'empty' || state.status === 'error') {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description={state.message}
        style={{ padding: 48 }}
      />
    );
  }

  return (
    <div>
      <Typography.Text
        type="secondary"
        style={{ display: 'block', marginBottom: 12, fontSize: 12 }}
      >
        来源：{state.path}
      </Typography.Text>
      <div
        style={{
          border: '1px solid #f0f0f0',
          borderRadius: 8,
          padding: 16,
          background: '#fff',
        }}
      >
        <MarkdownPreview content={state.content} maxHeight="70vh" />
      </div>
    </div>
  );
};

export default ZipReadmePanel;
