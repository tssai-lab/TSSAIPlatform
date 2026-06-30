import { CodeOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation, useParams } from '@umijs/max';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  List,
  message,
  Popconfirm,
  Row,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CodePreview from '@/components/CodePreview';
import type { CodeVersionDetail, CodeVersionListItem } from '@/services/code';
import {
  deleteCodeVersion,
  fetchCodeVersionCodePreview,
  getCodeVersionDetail,
  getDownloadUrl,
  previewCodeVersionFile,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';

function approvalTag(status?: string) {
  if (status === 'APPROVED') {
    return <Tag color="success">APPROVED</Tag>;
  }
  if (status === 'PENDING') {
    return <Tag color="warning">PENDING</Tag>;
  }
  return <Tag>{status || '-'}</Tag>;
}

function statusTag(status?: string) {
  if (status === 'READY') {
    return <Tag color="success">READY</Tag>;
  }
  return <Tag>{status || '-'}</Tag>;
}

function formatBytes(bytes?: number) {
  if (bytes == null || Number.isNaN(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

const TrainingCodeDetail: React.FC = () => {
  const { codeVersionId = '' } = useParams<{ codeVersionId: string }>();
  const location = useLocation();
  const listRecord = (
    location.state as { record?: CodeVersionListItem } | undefined
  )?.record;

  const [meta, setMeta] = useState<CodeVersionDetail | null>(
    listRecord ? { ...listRecord } : null,
  );
  const [metaLoading, setMetaLoading] = useState(!listRecord);
  const [filesLoading, setFilesLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [codeFiles, setCodeFiles] = useState<API.ModelCodeFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [previewContent, setPreviewContent] = useState('');
  const [previewFileName, setPreviewFileName] = useState('');
  const [codePreviewVisible, setCodePreviewVisible] = useState(false);

  const loadMeta = useCallback(async () => {
    if (!codeVersionId) return;
    setMetaLoading(true);
    try {
      const res = await getCodeVersionDetail(codeVersionId, {
        skipErrorHandler: true,
      });
      if (res?.success === false) {
        if (!listRecord) {
          throw new Error(res?.errorMessage || '训练代码详情加载失败');
        }
        return;
      }
      if (res?.data) {
        setMeta((prev) => ({ ...prev, ...res.data }));
      }
    } catch (error: any) {
      if (!listRecord) {
        message.error(getApiErrorMessage(error, '训练代码详情加载失败'));
        setMeta(null);
      }
    } finally {
      setMetaLoading(false);
    }
  }, [codeVersionId, listRecord]);

  const loadPreview = useCallback(
    async (path: string) => {
      if (!codeVersionId || !path) return;
      setSelectedPath(path);
      setPreviewLoading(true);
      setPreviewContent('');
      setPreviewFileName(path);
      try {
        const res = await previewCodeVersionFile(codeVersionId, path, {
          skipErrorHandler: true,
        });
        const data = res?.data;
        setPreviewContent(data?.content || '');
        setPreviewFileName(data?.fileName || data?.path || path);
      } catch (error: any) {
        message.error(getApiErrorMessage(error, '代码预览加载失败'));
      } finally {
        setPreviewLoading(false);
      }
    },
    [codeVersionId],
  );

  const loadFiles = useCallback(async () => {
    if (!codeVersionId) return;
    setFilesLoading(true);
    try {
      const res = await fetchCodeVersionCodePreview(codeVersionId, {
        skipErrorHandler: true,
      });
      const files = res?.data?.codeFiles ?? [];
      setCodeFiles(files);
      if (res?.data?.codeFilePath && res?.data?.codeContent) {
        setSelectedPath(res.data.codeFilePath);
        setPreviewFileName(res.data.codeFileName || res.data.codeFilePath);
        setPreviewContent(res.data.codeContent);
      } else if (files[0]?.path) {
        await loadPreview(files[0].path);
      } else {
        setSelectedPath(undefined);
        setPreviewContent('');
        setPreviewFileName('');
      }
    } catch (error: any) {
      setCodeFiles([]);
      setSelectedPath(undefined);
      setPreviewContent('');
      message.error(getApiErrorMessage(error, '代码文件列表加载失败'));
    } finally {
      setFilesLoading(false);
    }
  }, [codeVersionId, loadPreview]);

  useEffect(() => {
    loadMeta();
    loadFiles();
  }, [loadMeta, loadFiles]);

  const handleSelectFile = (path: string) => {
    if (!codeVersionId || path === selectedPath) return;
    loadPreview(path);
  };

  const handleDelete = async () => {
    try {
      const res = await deleteCodeVersion(codeVersionId, {
        skipErrorHandler: true,
      });
      if (res?.success === false) {
        message.error(res?.errorMessage || '删除失败');
        return;
      }
      message.success('训练代码版本已删除');
      history.push('/task/code/list');
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '删除失败'));
    }
  };

  const title = useMemo(
    () => meta?.codeAssetName || codeVersionId || '训练代码详情',
    [codeVersionId, meta?.codeAssetName],
  );

  if (!codeVersionId) {
    return (
      <PageContainer
        title="训练代码详情"
        onBack={() => history.push('/task/code/list')}
      >
        <Empty description="缺少 codeVersionId" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={title}
      subTitle="查看训练代码 zip 包内的文件与源码预览"
      onBack={() => history.push('/task/code/list')}
      extra={
        <Space>
          {meta?.storagePath ? (
            <Button
              onClick={() => {
                const path = meta?.storagePath;
                if (path) {
                  window.open(getDownloadUrl(path), '_blank');
                }
              }}
            >
              下载 zip
            </Button>
          ) : null}
          <Popconfirm
            title="确认删除该训练代码版本？"
            description="若已被训练任务引用将无法删除。"
            onConfirm={handleDelete}
          >
            <Button danger>删除</Button>
          </Popconfirm>
        </Space>
      }
    >
      {metaLoading && !meta ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="代码名称">
                {meta?.codeAssetName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="zip 文件名">
                {meta?.fileName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="训练方案">
                <Typography.Text code style={{ fontSize: 12 }}>
                  {meta?.trainingProfile || '-'}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="审核状态">
                {approvalTag(meta?.approvalStatus)}
              </Descriptions.Item>
              <Descriptions.Item label="就绪状态">
                {statusTag(meta?.status)}
              </Descriptions.Item>
              <Descriptions.Item label="codeVersionId" span={2}>
                <Typography.Text copyable code style={{ fontSize: 12 }}>
                  {codeVersionId}
                </Typography.Text>
              </Descriptions.Item>
              {meta?.storagePath && (
                <Descriptions.Item label="存储路径" span={2}>
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {meta.storagePath}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.remark && (
                <Descriptions.Item label="备注" span={2}>
                  {meta.remark}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Card title="代码文件" style={{ marginBottom: 16 }}>
                {filesLoading ? (
                  <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin tip="加载文件列表…" />
                  </div>
                ) : codeFiles.length ? (
                  <List
                    size="small"
                    dataSource={codeFiles}
                    rowKey={(item) => item.path}
                    renderItem={(item) => {
                      const path = item.path;
                      const active = path === selectedPath;
                      return (
                        <List.Item
                          style={{
                            cursor: 'pointer',
                            background: active ? '#e6f4ff' : undefined,
                            borderRadius: 4,
                            paddingInline: 8,
                          }}
                          onClick={() => handleSelectFile(path)}
                        >
                          <List.Item.Meta
                            title={
                              <Typography.Text
                                ellipsis
                                style={{ maxWidth: '100%', fontSize: 13 }}
                              >
                                {item.fileName || item.name || path}
                              </Typography.Text>
                            }
                            description={
                              <span style={{ fontSize: 12, color: '#999' }}>
                                {formatBytes(item.sizeBytes ?? item.size)}
                              </span>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="未找到可预览的代码文件，请确认后端已部署 /code/code-files 接口"
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={16}>
              <Card
                title={
                  <Space>
                    <CodeOutlined />
                    代码预览
                    {previewFileName ? ` · ${previewFileName}` : ''}
                  </Space>
                }
              >
                {!selectedPath && !filesLoading && (
                  <Empty
                    description="请从左侧选择文件"
                    style={{ padding: 48 }}
                  />
                )}
                {selectedPath && previewLoading && (
                  <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin tip="加载代码内容…" />
                  </div>
                )}
                {selectedPath && !previewLoading && previewContent && (
                  <>
                    <pre
                      style={{
                        background: '#f5f5f5',
                        border: '1px solid #d9d9d9',
                        borderRadius: 6,
                        padding: 16,
                        maxHeight: 520,
                        overflow: 'auto',
                        margin: 0,
                        fontFamily: 'Courier New, monospace',
                        fontSize: 13,
                        lineHeight: 1.6,
                      }}
                    >
                      {previewContent}
                    </pre>
                    <Button
                      type="primary"
                      size="small"
                      icon={<CodeOutlined />}
                      style={{ marginTop: 12 }}
                      onClick={() => setCodePreviewVisible(true)}
                    >
                      弹窗查看
                    </Button>
                  </>
                )}
                {selectedPath && !previewLoading && !previewContent && (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="该文件暂无文本预览内容（可能为二进制文件）"
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      {codePreviewVisible && previewContent && (
        <CodePreview
          visible={codePreviewVisible}
          codeText={previewContent}
          fileName={previewFileName}
          onClose={() => setCodePreviewVisible(false)}
        />
      )}
    </PageContainer>
  );
};

export default TrainingCodeDetail;
