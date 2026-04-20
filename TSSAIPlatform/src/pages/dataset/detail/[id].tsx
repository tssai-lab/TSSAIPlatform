import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Button, Card, Descriptions, message, Popconfirm, Space, Tag, Typography } from 'antd';
import React, { useEffect, useMemo, useState } from 'react';
import { history, useParams } from '@umijs/max';
import { getDownloadUrl } from '@/services/ant-design-pro/files';
import {
  deleteDatasetAsset,
  getDatasetAsset,
  listDatasetVersions,
  type DatasetAsset,
  type DatasetVersion,
} from '@/services/ant-design-pro/dataset';

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

const getVersionTime = (version: DatasetVersion) => {
  if (!version.createdAt) return 0;
  const time = Date.parse(version.createdAt);
  return Number.isNaN(time) ? 0 : time;
};

const DatasetDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [datasetInfo, setDatasetInfo] = useState<DatasetAsset | null>(null);
  const [versions, setVersions] = useState<DatasetVersion[]>([]);

  const sortedVersions = useMemo(
    () => [...versions].sort((a, b) => getVersionTime(b) - getVersionTime(a)),
    [versions],
  );
  const currentVersion = sortedVersions[0];

  const typeTag = datasetInfo?.type ? (
    <Tag color={datasetInfo.type === 'CV' ? 'blue' : 'green'}>{datasetInfo.type}</Tag>
  ) : (
    '-'
  );

  const getVersionRemark = (version?: DatasetVersion) => {
    if (!version) return '-';
    return version.remark || datasetInfo?.remark || '-';
  };

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getDatasetAsset(id, { skipErrorHandler: true }),
      listDatasetVersions(id, { skipErrorHandler: true }),
    ])
      .then(([assetRes, versionRes]) => {
        setDatasetInfo(assetRes?.data ?? null);
        setVersions(versionRes?.data ?? []);
      })
      .catch((error: any) => {
        message.error(error?.info?.errorMessage ?? error?.message ?? '加载数据集详情失败');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      const res = await deleteDatasetAsset(id, { skipErrorHandler: true });
      const result = res?.data;
      message.success(
        result
          ? `删除成功，已清理 ${result.deletedVersions} 个版本、${result.deletedObjects} 个文件`
          : '删除成功',
      );
      history.push('/dataset/list');
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '删除失败');
    }
  };

  const columns: ProColumns<DatasetVersion>[] = [
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      render: (_, record) => (
        <Space>
          <span>{record.version || '-'}</span>
          {record.id === currentVersion?.id ? <Tag color="processing">当前</Tag> : null}
        </Space>
      ),
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      key: 'fileName',
      search: false,
      renderText: (value) => value || '-',
    },
    {
      title: '大小',
      dataIndex: 'sizeBytes',
      key: 'sizeBytes',
      search: false,
      renderText: (value) => formatBytes(value as number | undefined),
    },
    {
      title: '上传时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      valueType: 'dateTime',
      search: false,
    },
    {
      title: '版本说明',
      dataIndex: 'remark',
      key: 'remark',
      search: false,
      ellipsis: true,
      render: (_, record) => getVersionRemark(record),
    },
    {
      title: '操作',
      key: 'action',
      search: false,
      render: (_, record) => (
        <Button
          type="link"
          disabled={!record.storagePath}
          href={record.storagePath ? getDownloadUrl(record.storagePath) : undefined}
          target="_blank"
          rel="noreferrer"
        >
          下载该版本
        </Button>
      ),
    },
  ];

  return (
    <PageContainer
      title="数据集详情"
      onBack={() => history.push('/dataset/list')}
      extra={[
        currentVersion?.storagePath ? (
          <Button
            key="download"
            type="primary"
            href={getDownloadUrl(currentVersion.storagePath)}
            target="_blank"
            rel="noreferrer"
          >
            下载当前版本
          </Button>
        ) : (
          <Button key="download" type="primary" disabled>
            下载当前版本
          </Button>
        ),
        <Button key="back" onClick={() => history.push('/dataset/list')}>
          返回列表
        </Button>,
        <Popconfirm
          key="delete"
          title="确定删除该数据集吗？"
          description="将同步删除该数据集的所有版本记录和 MinIO 文件。"
          okText="删除"
          cancelText="取消"
          onConfirm={handleDelete}
        >
          <Button danger>删除数据集</Button>
        </Popconfirm>,
      ]}
    >
      <Card title="基础信息" loading={loading} style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="数据集名称">{datasetInfo?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="类型">{typeTag}</Descriptions.Item>
          <Descriptions.Item label="当前版本">{currentVersion?.version || '-'}</Descriptions.Item>
          <Descriptions.Item label="版本数量">{sortedVersions.length}</Descriptions.Item>
          <Descriptions.Item label="当前文件">{currentVersion?.fileName || '-'}</Descriptions.Item>
          <Descriptions.Item label="当前大小">{formatBytes(currentVersion?.sizeBytes)}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{datasetInfo?.createdAt || '-'}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{datasetInfo?.updatedAt || '-'}</Descriptions.Item>
          <Descriptions.Item label="版本说明" span={2}>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {getVersionRemark(currentVersion)}
            </Typography.Paragraph>
          </Descriptions.Item>
          <Descriptions.Item label="数据集备注" span={2}>
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {datasetInfo?.remark || '-'}
            </Typography.Paragraph>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="版本历史">
        <ProTable<DatasetVersion>
          columns={columns}
          dataSource={sortedVersions}
          loading={loading}
          rowKey="id"
          search={false}
          toolBarRender={false}
          pagination={{
            pageSize: 10,
          }}
        />
      </Card>
    </PageContainer>
  );
};

export default DatasetDetail;
