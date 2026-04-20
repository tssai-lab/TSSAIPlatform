import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Empty, List, message, Space, Tabs, Tag, Typography } from 'antd';
import React, { useEffect, useState } from 'react';
import { history, useParams } from '@umijs/max';
import CodePreview from '@/components/CodePreview';
import { getDownloadUrl } from '@/services/ant-design-pro/files';
import {
  getModelDetail,
  listModelCodeFiles,
  previewModelCode,
} from '@/services/ant-design-pro/model';

const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
};

const ModelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [modelInfo, setModelInfo] = useState<API.ModelDetail | null>(null);
  const [codeFiles, setCodeFiles] = useState<API.ModelCodeFile[]>([]);
  const [codeLoading, setCodeLoading] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewFileName, setPreviewFileName] = useState('');
  const [previewContent, setPreviewContent] = useState('');

  useEffect(() => {
    if (!id) return;
    getModelDetail(id)
      .then((res) => {
        setModelInfo(res?.data ?? null);
      })
      .catch((error: any) => {
        message.error(error?.info?.errorMessage ?? error?.message ?? '加载模型详情失败');
      });
  }, [id]);

  useEffect(() => {
    if (!id) return;
    setCodeLoading(true);
    listModelCodeFiles(id, { skipErrorHandler: true })
      .then((res) => {
        setCodeFiles(res?.data ?? []);
      })
      .catch((error: any) => {
        setCodeFiles([]);
        message.warning(error?.info?.errorMessage ?? error?.message ?? '暂未读取到模型代码文件');
      })
      .finally(() => {
        setCodeLoading(false);
      });
  }, [id]);

  const handlePreview = async (file: API.ModelCodeFile) => {
    if (!id) return;
    try {
      const res = await previewModelCode(id, file.path, { skipErrorHandler: true });
      setPreviewFileName(res?.data?.fileName ?? file.fileName);
      setPreviewContent(res?.data?.content ?? '');
      setPreviewVisible(true);
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '读取代码内容失败');
    }
  };

  return (
    <PageContainer
      title="模型详情"
      onBack={() => history.push('/model/list')}
      extra={[
        modelInfo?.storagePath ? (
          <Button
            key="download"
            type="primary"
            href={getDownloadUrl(modelInfo.storagePath)}
            target="_blank"
            rel="noreferrer"
          >
            下载模型
          </Button>
        ) : (
          <Button key="download" type="primary" disabled>
            下载模型
          </Button>
        ),
        <Button key="back" onClick={() => history.push('/model/list')}>
          返回列表
        </Button>,
      ]}
    >
      <Card title="基础信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="模型名称">{modelInfo?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="版本号">{modelInfo?.version || '-'}</Descriptions.Item>
          <Descriptions.Item label="类型">{modelInfo?.type || '-'}</Descriptions.Item>
          <Descriptions.Item label="上传时间">
            {modelInfo?.uploadTime || modelInfo?.createdAt || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="大小">
            {modelInfo?.size || formatBytes(modelInfo?.sizeBytes)}
          </Descriptions.Item>
          <Descriptions.Item label="备注">{modelInfo?.remark || '-'}</Descriptions.Item>
          <Descriptions.Item label="存储路径" span={2}>
            <Typography.Text copyable={Boolean(modelInfo?.storagePath)}>
              {modelInfo?.storagePath || '-'}
            </Typography.Text>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card>
        <Tabs
          items={[
            {
              key: 'code',
              label: '代码预览',
              children: codeFiles.length ? (
                <List
                  loading={codeLoading}
                  dataSource={codeFiles}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button key="preview" type="link" onClick={() => handlePreview(item)}>
                          预览
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space>
                            <Typography.Text>{item.path}</Typography.Text>
                            {item.extension ? <Tag>{item.extension}</Tag> : null}
                          </Space>
                        }
                        description={`大小：${formatBytes(item.sizeBytes)}`}
                      />
                    </List.Item>
                  )}
                />
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={codeLoading ? '正在读取代码文件' : '未找到可预览的代码文件'}
                />
              ),
            },
            {
              key: 'dataset',
              label: '关联数据集',
              children: (
                <Typography.Paragraph type="secondary">
                  关联数据集会在训练实验记录中展示，可进入训练任务详情按实验 ID 查看。
                </Typography.Paragraph>
              ),
            },
          ]}
        />
      </Card>

      <CodePreview
        visible={previewVisible}
        fileName={previewFileName}
        codeText={previewContent}
        onClose={() => setPreviewVisible(false)}
      />
    </PageContainer>
  );
};

export default ModelDetail;
