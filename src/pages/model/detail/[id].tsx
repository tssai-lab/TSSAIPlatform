import { CodeOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useParams } from '@umijs/max';
import {
  Button,
  Card,
  Descriptions,
  Empty,
  message,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
} from 'antd';
import React, { useEffect, useState } from 'react';
import CodePreview from '@/components/CodePreview';
import { MOCK_MODEL_DETAIL } from '@/constants/mockData';
import {
  deleteModel,
  fetchModelDetail,
  getDownloadUrl,
} from '@/services/platform';

const ModelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [modelInfo, setModelInfo] = useState<API.ModelDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [codePreviewVisible, setCodePreviewVisible] = useState(false);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    fetchModelDetail(id, { skipErrorHandler: true })
      .then((res) => {
        if (res?.data) {
          setModelInfo(res.data);
        } else {
          setModelInfo(MOCK_MODEL_DETAIL as API.ModelDetail);
        }
      })
      .catch(() => {
        setModelInfo(MOCK_MODEL_DETAIL as API.ModelDetail);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id) {
      return;
    }
    try {
      await deleteModel(id);
      message.success('删除成功');
      history.push('/model/list');
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const handleDownload = () => {
    if (!modelInfo?.storagePath) {
      message.warning('当前模型没有可下载文件');
      return;
    }
    window.open(getDownloadUrl(modelInfo.storagePath), '_blank');
  };

  const handleCopy = () => {
    if (!modelInfo?.codeContent) {
      return;
    }
    navigator.clipboard.writeText(modelInfo.codeContent).then(
      () => message.success('代码已复制'),
      () => message.error('复制失败'),
    );
  };

  if (loading) {
    return (
      <PageContainer
        title="模型详情"
        onBack={() => history.push('/model/list')}
      >
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!modelInfo) {
    return null;
  }

  return (
    <PageContainer
      title="模型详情"
      subTitle="查看与后端对齐的模型信息和代码预览"
      onBack={() => history.push('/model/list')}
      extra={
        <Space>
          <Button
            type="primary"
            onClick={() => history.push(`/task/create?modelId=${id}`)}
          >
            使用此模型训练
          </Button>
          <Button onClick={handleDownload}>下载模型</Button>
          <Popconfirm
            title="确认删除该模型？删除后无法恢复。"
            onConfirm={handleDelete}
          >
            <Button danger>删除模型</Button>
          </Popconfirm>
          <Button onClick={() => history.push('/model/list')}>返回列表</Button>
        </Space>
      }
    >
      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="模型名称">
            <strong>{modelInfo.name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="版本号">
            {modelInfo.version}
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            <Tag color={modelInfo.type === 'CV' ? 'blue' : 'green'}>
              {modelInfo.type}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="大小">
            {modelInfo.size || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="上传时间">
            {modelInfo.uploadTime || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="更新时间">
            {modelInfo.updateTime || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="存储路径" span={2}>
            <span style={{ fontFamily: 'monospace' }}>
              {modelInfo.storagePath || '-'}
            </span>
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {modelInfo.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title={
          <Space>
            <CodeOutlined />
            代码预览
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {modelInfo.codeContent ? (
          <>
            <Descriptions size="small" column={1} style={{ marginBottom: 12 }}>
              <Descriptions.Item label="预览文件">
                {modelInfo.codeFileName || modelInfo.codeFilePath || '-'}
              </Descriptions.Item>
            </Descriptions>
            <pre
              style={{
                background: '#f5f5f5',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                padding: 16,
                maxHeight: 400,
                overflow: 'auto',
                margin: 0,
                fontFamily: 'Courier New, monospace',
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {modelInfo.codeContent}
            </pre>
            <Space style={{ marginTop: 12 }}>
              <Button
                type="primary"
                size="small"
                icon={<CodeOutlined />}
                onClick={() => setCodePreviewVisible(true)}
              >
                弹窗查看
              </Button>
              <Button size="small" onClick={handleCopy}>
                复制代码
              </Button>
            </Space>
          </>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前模型包中没有可预览的代码文件"
          />
        )}
      </Card>

      {codePreviewVisible && modelInfo.codeContent && (
        <CodePreview
          visible={codePreviewVisible}
          codeText={modelInfo.codeContent}
          fileName={
            modelInfo.codeFileName || modelInfo.codeFilePath || 'model-code'
          }
          onClose={() => setCodePreviewVisible(false)}
        />
      )}

      {modelInfo.versionHistory && modelInfo.versionHistory.length > 0 && (
        <Card title="版本记录">
          <Table
            dataSource={modelInfo.versionHistory}
            rowKey={(record) => `${record.version}-${record.updateTime}`}
            pagination={false}
            columns={[
              { title: '版本号', dataIndex: 'version', key: 'version' },
              { title: '更新时间', dataIndex: 'updateTime', key: 'updateTime' },
              { title: '时间戳', dataIndex: 'timestamp', key: 'timestamp' },
            ]}
          />
        </Card>
      )}
    </PageContainer>
  );
};

export default ModelDetail;
