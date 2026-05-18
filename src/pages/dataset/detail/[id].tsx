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
import {
  deleteDataset,
  fetchDatasetDetail,
  getDownloadUrl,
} from '@/services/platform';

const DatasetDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [datasetInfo, setDatasetInfo] = useState<API.DatasetDetail | null>(
    null,
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    fetchDatasetDetail(id, { skipErrorHandler: true })
      .then((res) => {
        setDatasetInfo((res?.data as API.DatasetDetail | undefined) ?? null);
      })
      .catch((error: any) => {
        message.error(
          error?.info?.message || error?.message || '加载数据集详情失败',
        );
        setDatasetInfo(null);
      })
      .finally(() => setLoading(false));
  }, [id]);

  const handleDelete = async () => {
    if (!id) {
      return;
    }
    try {
      await deleteDataset(id);
      message.success('删除成功');
      history.push('/dataset/list');
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const handleDownload = (storagePath?: string) => {
    if (!storagePath) {
      message.warning('当前版本没有可下载文件');
      return;
    }
    window.open(getDownloadUrl(storagePath), '_blank');
  };

  if (loading) {
    return (
      <PageContainer
        title="数据集详情"
        onBack={() => history.push('/dataset/list')}
      >
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!datasetInfo) {
    return (
      <PageContainer
        title="数据集详情"
        onBack={() => history.push('/dataset/list')}
      >
        <Empty description="未找到数据集详情" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="数据集详情"
      subTitle="查看与后端对齐的数据集资产和版本信息"
      onBack={() => history.push('/dataset/list')}
      extra={
        <Space>
          <Button
            onClick={() =>
              handleDownload(datasetInfo.latestVersion?.storagePath)
            }
          >
            下载最新版本
          </Button>
          <Popconfirm
            title="确认删除该数据集？删除后无法恢复。"
            onConfirm={handleDelete}
          >
            <Button danger>删除数据集</Button>
          </Popconfirm>
          <Button onClick={() => history.push('/dataset/list')}>
            返回列表
          </Button>
        </Space>
      }
    >
      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="数据集名称">
            <strong>{datasetInfo.name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            <Tag color={datasetInfo.type === 'CV' ? 'blue' : 'green'}>
              {datasetInfo.type}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="最近上传时间">
            {datasetInfo.uploadTime || '-'}
          </Descriptions.Item>
          <Descriptions.Item label="版本数量">
            {datasetInfo.versions.length}
          </Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>
            {datasetInfo.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="版本列表">
        <Table
          dataSource={datasetInfo.versions}
          rowKey="id"
          pagination={false}
          locale={{ emptyText: '暂无版本记录' }}
          columns={[
            { title: '版本号', dataIndex: 'version', key: 'version' },
            { title: '文件名', dataIndex: 'fileName', key: 'fileName' },
            { title: '大小', dataIndex: 'size', key: 'size' },
            { title: '上传时间', dataIndex: 'createdAt', key: 'createdAt' },
            {
              title: '备注',
              dataIndex: 'remark',
              key: 'remark',
              ellipsis: true,
            },
            {
              title: '操作',
              key: 'action',
              render: (_, record: API.DatasetVersionDetail) => (
                <Button
                  type="link"
                  onClick={() => handleDownload(record.storagePath)}
                >
                  下载
                </Button>
              ),
            },
          ]}
        />
      </Card>
    </PageContainer>
  );
};

export default DatasetDetail;
