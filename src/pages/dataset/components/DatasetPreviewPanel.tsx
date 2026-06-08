import {
  Alert,
  Button,
  Col,
  Empty,
  Image,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type DatasetPreviewContentData,
  type DatasetPreviewFileItem,
  DatasetPreviewFileKind,
  type DatasetPreviewFilesData,
  fetchDatasetPreviewContent,
  fetchDatasetPreviewFiles,
  getDatasetPreviewImage,
} from '@/services/datasetPreview';
import { getApiErrorMessage } from '@/utils/apiError';

const KIND_OPTIONS: { value: DatasetPreviewFileKind; label: string }[] = [
  { value: DatasetPreviewFileKind.IMAGE, label: '图片' },
  { value: DatasetPreviewFileKind.TEXT, label: '文本' },
  { value: DatasetPreviewFileKind.TABLE, label: '表格' },
  { value: DatasetPreviewFileKind.UNSUPPORTED, label: '不支持' },
];

const KIND_COLORS: Record<DatasetPreviewFileKind, string> = {
  [DatasetPreviewFileKind.IMAGE]: 'blue',
  [DatasetPreviewFileKind.TEXT]: 'green',
  [DatasetPreviewFileKind.TABLE]: 'orange',
  [DatasetPreviewFileKind.UNSUPPORTED]: 'default',
};

function formatBytes(size?: number | null): string {
  if (size == null || size < 0) return '-';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

const DEFAULT_CSV_PAGE_SIZE = 50;
const CSV_PAGE_SIZE_OPTIONS = ['20', '50', '100', '200'];

function isCsvBackendPagination(
  data: DatasetPreviewContentData | null | undefined,
): data is DatasetPreviewContentData & { total: number } {
  return (
    !!data?.pageable &&
    data.total != null &&
    typeof data.total === 'number' &&
    data.total >= 0
  );
}

/** 后端未返回 total 时的兜底：固定展示 2 个页码 */
function getCsvFallbackVisiblePageNumbers(
  currentPage: number,
  hasMoreRows: boolean,
): number[] {
  if (hasMoreRows) {
    return [currentPage, currentPage + 1];
  }
  if (currentPage > 1) {
    return [currentPage - 1, currentPage];
  }
  return [1];
}

export type DatasetPreviewPanelProps = {
  versionId?: string;
  /** 嵌入详情页时使用较小高度 */
  compact?: boolean;
};

const DatasetPreviewPanel: React.FC<DatasetPreviewPanelProps> = ({
  versionId,
  compact = false,
}) => {
  const listScrollY = compact ? 320 : 480;
  const contentMaxHeight = compact ? '45vh' : '65vh';
  const previewPadding = compact ? 48 : 80;

  const [meta, setMeta] = useState<DatasetPreviewFilesData | null>(null);
  const [files, setFiles] = useState<DatasetPreviewFileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [keyword, setKeyword] = useState('');
  const [kindFilter, setKindFilter] = useState<
    DatasetPreviewFileKind | undefined
  >();
  const [filePage, setFilePage] = useState(1);
  const [filePageSize, setFilePageSize] = useState(compact ? 20 : 50);
  const [fileTotal, setFileTotal] = useState(0);

  const [selected, setSelected] = useState<DatasetPreviewFileItem | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [contentData, setContentData] =
    useState<DatasetPreviewContentData | null>(null);
  const [contentPage, setContentPage] = useState(1);
  const [contentPageSize, setContentPageSize] = useState(DEFAULT_CSV_PAGE_SIZE);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  const imageUrlRef = useRef<string | null>(null);
  const loadAbortRef = useRef<AbortController | null>(null);

  const revokeImageUrl = useCallback(() => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = null;
    }
    setImageUrl(null);
  }, []);

  const resetPreviewState = useCallback(() => {
    loadAbortRef.current?.abort();
    revokeImageUrl();
    setSelected(null);
    setPreviewError(null);
    setContentData(null);
    setPreviewLoading(false);
    setKeyword('');
    setKindFilter(undefined);
    setFilePage(1);
    setMeta(null);
    setFiles([]);
    setFileTotal(0);
    setFilesError(null);
  }, [revokeImageUrl]);

  useEffect(() => {
    resetPreviewState();
  }, [versionId, resetPreviewState]);

  useEffect(() => {
    return () => {
      loadAbortRef.current?.abort();
      revokeImageUrl();
    };
  }, [revokeImageUrl]);

  const loadFiles = useCallback(async () => {
    if (!versionId) return;
    if (/^dataset-asset-/i.test(versionId) || /^\d+$/.test(versionId)) {
      setFilesError(
        `当前 ID「${versionId}」是资产 ID 或 Mock 数据，不能用于预览。请使用 dataset-ver-... 版本 ID（从数据集列表进入详情会自动带上 ?versionId=）。`,
      );
      setMeta(null);
      setFiles([]);
      setFileTotal(0);
      return;
    }
    setFilesLoading(true);
    setFilesError(null);
    try {
      const data = await fetchDatasetPreviewFiles(
        versionId,
        {
          page: filePage,
          pageSize: filePageSize,
          keyword: keyword.trim() || undefined,
          kind: kindFilter,
        },
        { skipErrorHandler: true },
      );
      setMeta(data);
      setFiles(data.files ?? []);
      setFileTotal(data.total ?? 0);
    } catch (e: unknown) {
      setFilesError(getApiErrorMessage(e));
      setMeta(null);
      setFiles([]);
      setFileTotal(0);
    } finally {
      setFilesLoading(false);
    }
  }, [versionId, filePage, filePageSize, keyword, kindFilter]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  const loadContentPreview = useCallback(
    async (
      file: DatasetPreviewFileItem,
      page: number,
      pageSize: number,
      signal: AbortSignal,
    ) => {
      const data = await fetchDatasetPreviewContent(
        versionId as string,
        {
          path: file.path ?? undefined,
          page,
          pageSize,
        },
        { skipErrorHandler: true, signal },
      );
      setContentData(data);
      setContentPage(data.page ?? page);
      setContentPageSize(data.pageSize ?? pageSize);
    },
    [versionId],
  );

  const loadImagePreview = useCallback(
    async (file: DatasetPreviewFileItem, signal: AbortSignal) => {
      const blob = await getDatasetPreviewImage(
        versionId as string,
        file.path,
        {
          skipErrorHandler: true,
          signal,
        },
      );
      revokeImageUrl();
      const url = URL.createObjectURL(blob);
      imageUrlRef.current = url;
      setImageUrl(url);
      setContentData(null);
    },
    [versionId, revokeImageUrl],
  );

  const openPreview = useCallback(
    async (file: DatasetPreviewFileItem) => {
      if (!versionId) return;
      setSelected(file);
      setPreviewError(null);
      setContentData(null);
      revokeImageUrl();

      if (!file.previewAllowed) {
        setPreviewError(file.message || '该文件不支持在线预览');
        return;
      }

      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      setPreviewLoading(true);

      try {
        if (file.kind === DatasetPreviewFileKind.IMAGE) {
          await loadImagePreview(file, controller.signal);
        } else if (
          file.kind === DatasetPreviewFileKind.TEXT ||
          file.kind === DatasetPreviewFileKind.TABLE
        ) {
          setContentPage(1);
          await loadContentPreview(file, 1, contentPageSize, controller.signal);
        } else {
          setPreviewError(
            file.message || '该文件类型暂不支持在线预览，请下载后查看',
          );
        }
      } catch (e: unknown) {
        if ((e as Error)?.name !== 'AbortError') {
          setPreviewError(getApiErrorMessage(e));
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [
      versionId,
      loadContentPreview,
      loadImagePreview,
      revokeImageUrl,
      contentPageSize,
    ],
  );

  const goToContentPage = useCallback(
    async (page: number, pageSize: number) => {
      if (
        !selected ||
        !versionId ||
        selected.kind !== DatasetPreviewFileKind.TABLE
      ) {
        return;
      }
      loadAbortRef.current?.abort();
      const controller = new AbortController();
      loadAbortRef.current = controller;
      setPreviewLoading(true);
      setPreviewError(null);
      try {
        await loadContentPreview(selected, page, pageSize, controller.signal);
      } catch (e: unknown) {
        if ((e as Error)?.name !== 'AbortError') {
          setPreviewError(getApiErrorMessage(e));
        }
      } finally {
        setPreviewLoading(false);
      }
    },
    [selected, versionId, loadContentPreview],
  );

  const fileColumns: ColumnsType<DatasetPreviewFileItem> = [
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      ellipsis: true,
      render: (_, record) => (
        <Typography.Text
          ellipsis={{ tooltip: record.path || record.fileName }}
          style={{ maxWidth: compact ? 160 : 220 }}
        >
          {record.path || record.fileName}
        </Typography.Text>
      ),
    },
    {
      title: '类型',
      dataIndex: 'kind',
      key: 'kind',
      width: 88,
      render: (kind: DatasetPreviewFileKind) => (
        <Tag color={KIND_COLORS[kind] ?? 'default'}>{kind}</Tag>
      ),
    },
    {
      title: '大小',
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      width: 88,
      render: (v: number | null) => formatBytes(v),
    },
    {
      title: '预览',
      key: 'preview',
      width: 72,
      render: (_, record) => (
        <Typography.Link
          disabled={!record.previewAllowed}
          onClick={(e) => {
            e.stopPropagation();
            openPreview(record);
          }}
        >
          查看
        </Typography.Link>
      ),
    },
  ];

  const csvColumns =
    contentData?.columns?.map((col, index) => ({
      title: col,
      dataIndex: index,
      key: `${col}-${index}`,
      ellipsis: true,
    })) ?? [];

  const csvDataSource =
    contentData?.rows?.map((row, rowIndex) => {
      const record: Record<string, string> = {
        key: String((contentPage - 1) * contentPageSize + rowIndex),
      };
      row.forEach((cell, colIndex) => {
        record[colIndex] = cell;
      });
      return record;
    }) ?? [];

  const csvRowCount = contentData?.rows?.length ?? 0;
  const csvUseBackendPagination = isCsvBackendPagination(contentData);
  const csvHasMoreRows = csvRowCount >= contentPageSize;
  const csvFallbackVisiblePages = getCsvFallbackVisiblePageNumbers(
    contentPage,
    csvHasMoreRows,
  );

  const handleCsvTableChange = (pagination: TablePaginationConfig) => {
    void goToContentPage(
      pagination.current ?? 1,
      pagination.pageSize ?? contentPageSize,
    );
  };

  if (!versionId) {
    return <Empty description="请选择要预览的数据集版本" />;
  }

  const metaHint = meta
    ? `${meta.type} · ${meta.fileName}${meta.sourceArchive ? '（压缩包）' : ''}`
    : null;

  return (
    <div>
      {metaHint && (
        <Typography.Text
          type="secondary"
          style={{ display: 'block', marginBottom: 12 }}
        >
          {metaHint}
        </Typography.Text>
      )}
      {filesError && (
        <Alert
          type="error"
          showIcon
          message={filesError}
          style={{ marginBottom: 16 }}
        />
      )}

      <Row gutter={16}>
        <Col xs={24} lg={10}>
          <Space
            direction="vertical"
            style={{ width: '100%', marginBottom: 12 }}
          >
            <Input.Search
              allowClear
              placeholder="按路径 / 文件名 / 扩展名搜索"
              onSearch={(v) => {
                setKeyword(v);
                setFilePage(1);
              }}
            />
            <Select
              allowClear
              placeholder="按类型筛选"
              style={{ width: '100%' }}
              options={KIND_OPTIONS}
              value={kindFilter}
              onChange={(v) => {
                setKindFilter(v);
                setFilePage(1);
              }}
            />
            <Typography.Text type="secondary">
              共 {fileTotal} 项
            </Typography.Text>
          </Space>
          <Table<DatasetPreviewFileItem>
            size="small"
            rowKey={(row) => row.path ?? row.fileName}
            loading={filesLoading}
            columns={fileColumns}
            dataSource={files}
            pagination={{
              current: filePage,
              pageSize: filePageSize,
              total: fileTotal,
              showSizeChanger: true,
              pageSizeOptions: ['20', '50', '100', '200'],
              onChange: (page, pageSize) => {
                setFilePage(page);
                setFilePageSize(pageSize);
              },
            }}
            onRow={(record) => {
              const key = record.path ?? record.fileName;
              const selKey = selected?.path ?? selected?.fileName;
              const active = key === selKey;
              return {
                onClick: () => {
                  if (record.previewAllowed) openPreview(record);
                },
                style: {
                  cursor: record.previewAllowed ? 'pointer' : 'default',
                  background: active ? '#e6f4ff' : undefined,
                },
              };
            }}
            locale={{ emptyText: '暂无文件或当前筛选无结果' }}
            scroll={{ y: listScrollY }}
          />
        </Col>

        <Col xs={24} lg={14}>
          <Typography.Title level={5} style={{ marginTop: 0 }}>
            {selected ? selected.fileName : '预览区'}
          </Typography.Title>
          {!selected && (
            <Empty
              description="请从左侧选择可预览的文件"
              style={{ padding: previewPadding }}
            />
          )}
          {selected && previewError && (
            <Alert type="warning" showIcon message={previewError} />
          )}
          {selected && previewLoading && (
            <div style={{ textAlign: 'center', padding: previewPadding }}>
              <Spin size="large" tip="加载预览…" />
            </div>
          )}
          {selected &&
            !previewLoading &&
            !previewError &&
            imageUrl &&
            selected.kind === DatasetPreviewFileKind.IMAGE && (
              <div
                style={{
                  textAlign: 'center',
                  maxHeight: contentMaxHeight,
                  overflow: 'auto',
                }}
              >
                <Image
                  src={imageUrl}
                  alt={selected.fileName}
                  style={{ maxWidth: '100%' }}
                />
              </div>
            )}
          {selected &&
            !previewLoading &&
            !previewError &&
            contentData &&
            contentData.contentType === 'TEXT' && (
              <Space direction="vertical" style={{ width: '100%' }}>
                {contentData.truncated && (
                  <Alert
                    type="info"
                    showIcon
                    message="内容已截断，仅展示允许的最大字节数"
                  />
                )}
                {contentData.message && (
                  <Alert type="info" showIcon message={contentData.message} />
                )}
                <pre
                  style={{
                    margin: 0,
                    padding: 12,
                    maxHeight: contentMaxHeight,
                    overflow: 'auto',
                    background: '#fafafa',
                    borderRadius: 8,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {contentData.content ?? ''}
                </pre>
              </Space>
            )}
          {selected &&
            !previewLoading &&
            !previewError &&
            contentData &&
            contentData.contentType === 'CSV' && (
              <Space direction="vertical" style={{ width: '100%' }}>
                {contentData.truncated && (
                  <Alert
                    type="info"
                    showIcon
                    message="内容已按最大可读字节截断；total 仅表示本次可预览范围内的行数，不代表完整文件总行数"
                  />
                )}
                {contentData.message && (
                  <Alert type="info" showIcon message={contentData.message} />
                )}
                <Table
                  size="small"
                  columns={csvColumns}
                  dataSource={csvDataSource}
                  pagination={
                    csvUseBackendPagination
                      ? {
                          current: contentPage,
                          pageSize: contentPageSize,
                          total: contentData.total,
                          showSizeChanger: true,
                          hideOnSinglePage: (contentData.totalPages ?? 0) > 1,
                          pageSizeOptions: CSV_PAGE_SIZE_OPTIONS,
                          showTotal: (total) => {
                            const pages =
                              contentData.totalPages ??
                              Math.max(1, Math.ceil(total / contentPageSize));
                            return `共 ${total} 条，${pages} 页`;
                          },
                        }
                      : false
                  }
                  onChange={
                    csvUseBackendPagination ? handleCsvTableChange : undefined
                  }
                  scroll={{ x: 'max-content', y: compact ? 280 : 400 }}
                />
                {!csvUseBackendPagination && (
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'flex-end',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <Button
                      size="small"
                      disabled={contentPage <= 1 || previewLoading}
                      onClick={() =>
                        goToContentPage(contentPage - 1, contentPageSize)
                      }
                    >
                      上一页
                    </Button>
                    {csvFallbackVisiblePages.map((pageNum) => (
                      <Button
                        key={pageNum}
                        size="small"
                        type={pageNum === contentPage ? 'primary' : 'default'}
                        disabled={previewLoading}
                        onClick={() => {
                          if (pageNum !== contentPage) {
                            void goToContentPage(pageNum, contentPageSize);
                          }
                        }}
                      >
                        {pageNum}
                      </Button>
                    ))}
                    <Button
                      size="small"
                      disabled={!csvHasMoreRows || previewLoading}
                      onClick={() =>
                        goToContentPage(contentPage + 1, contentPageSize)
                      }
                    >
                      下一页
                    </Button>
                    <Select
                      size="small"
                      value={contentPageSize}
                      style={{ width: 116 }}
                      options={CSV_PAGE_SIZE_OPTIONS.map((value) => ({
                        value: Number(value),
                        label: `${value} 条/页`,
                      }))}
                      onChange={(pageSize) => goToContentPage(1, pageSize)}
                    />
                  </div>
                )}
              </Space>
            )}
        </Col>
      </Row>
    </div>
  );
};

export default DatasetPreviewPanel;
