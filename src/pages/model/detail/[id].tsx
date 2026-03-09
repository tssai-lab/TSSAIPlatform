/**
 * 模型详情页（与 TSSAIPlatform-frontend-prototype 一致）
 * 基本信息、模型描述、模型参数（只读）、代码内容、版本历史；使用此模型训练、下载、删除
 */
import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Descriptions, message, Popconfirm, Space, Spin, Table, Tag } from 'antd';
import React, { useEffect, useState } from 'react';
import { history, useParams } from '@umijs/max';
import { fetchModelDetail, deleteModel } from '@/services/platform';
import { MOCK_MODEL_DETAIL } from '@/constants/mockData';

const ModelDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [modelInfo, setModelInfo] = useState<API.ModelDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetchModelDetail(id, { skipErrorHandler: true })
      .then((res) => {
        if (res?.data) {
          setModelInfo(res.data as API.ModelDetail);
        } else {
          setModelInfo(MOCK_MODEL_DETAIL as API.ModelDetail);
        }
      })
      .catch(() => {
        setModelInfo(MOCK_MODEL_DETAIL as API.ModelDetail);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const copyCode = () => {
    if (!modelInfo?.codeContent) return;
    navigator.clipboard.writeText(modelInfo.codeContent).then(
      () => message.success('代码已复制到剪贴板'),
      () => message.error('复制失败'),
    );
  };

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteModel(id);
      message.success('删除成功');
      history.push('/model/list');
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  if (loading) {
    return (
      <PageContainer title="模型详情" onBack={() => history.push('/model/list')}>
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!modelInfo) return null;

  return (
    <PageContainer
      title="模型详情"
      subTitle="查看模型的详细信息和元数据"
      onBack={() => history.push('/model/list')}
      extra={
        <Space>
          <Button type="primary" onClick={() => history.push(`/task/create?modelId=${id}`)}>
            使用此模型训练
          </Button>
          <Button onClick={() => message.info('下载功能待实现')}>下载模型</Button>
          <Popconfirm title="确定要删除这个模型吗？删除后无法恢复。" onConfirm={handleDelete}>
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
          <Descriptions.Item label="版本号">{modelInfo.version}</Descriptions.Item>
          <Descriptions.Item label="模型类型">
            <Tag color={modelInfo.type === 'CV' ? 'blue' : 'green'}>{modelInfo.type}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="文件大小">{modelInfo.size}</Descriptions.Item>
          <Descriptions.Item label="上传时间">{modelInfo.uploadTime}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{modelInfo.updateTime || '-'}</Descriptions.Item>
          {modelInfo.timestamp && (
            <Descriptions.Item label="时间戳">
              <span style={{ fontFamily: 'monospace' }}>{modelInfo.timestamp}</span>
              <span style={{ marginLeft: 8, color: '#8c8c8c', fontSize: 12 }}>(Unix Timestamp)</span>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="备注" span={2}>
            {modelInfo.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {modelInfo.params && (
        <Card title="模型参数（只读）" style={{ marginBottom: 16 }}>
          <div style={{ color: '#8c8c8c', fontSize: 12, marginBottom: 12 }}>
            提示：模型参数是在训练时确定的，无法直接修改。如需调整参数，请使用此模型重新训练。
          </div>
          <Descriptions column={2}>
            <Descriptions.Item label="框架">{modelInfo.params.framework || '-'}</Descriptions.Item>
            <Descriptions.Item label="输入尺寸">{modelInfo.params.inputSize || '-'}</Descriptions.Item>
            <Descriptions.Item label="类别数">{modelInfo.params.numClasses || '-'}</Descriptions.Item>
            <Descriptions.Item label="参数量">{modelInfo.params.paramsCount || '-'}</Descriptions.Item>
            <Descriptions.Item label="训练数据集">{modelInfo.params.trainDataset || '-'}</Descriptions.Item>
            <Descriptions.Item label="训练参数" span={2}>
              <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{modelInfo.params.trainParams || '-'}</span>
            </Descriptions.Item>
          </Descriptions>
        </Card>
      )}

      {modelInfo.codeContent && (
        <Card
          title="代码内容"
          extra={<Button size="small" onClick={copyCode}>复制代码</Button>}
          style={{ marginBottom: 16 }}
        >
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
          <div style={{ marginTop: 12, color: '#8c8c8c', fontSize: 12 }}>
            提示：代码内容从模型文件中提取，支持查看和复制
          </div>
        </Card>
      )}

      {modelInfo.versionHistory && modelInfo.versionHistory.length > 0 && (
        <Card title="版本历史">
          <Table
            dataSource={modelInfo.versionHistory}
            rowKey="version"
            pagination={false}
            columns={[
              { title: '版本', dataIndex: 'version', key: 'version' },
              { title: '更新时间', dataIndex: 'updateTime', key: 'updateTime' },
              { title: '时间戳', dataIndex: 'timestamp', key: 'timestamp', render: (v: string) => <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{v}</span> },
              {
                title: '操作',
                key: 'action',
                render: () => (
                  <Space>
                    <Button type="link" size="small">下载</Button>
                    <Button type="link" size="small">查看代码</Button>
                  </Space>
                ),
              },
            ]}
          />
        </Card>
      )}
    </PageContainer>
  );
};

export default ModelDetail;
