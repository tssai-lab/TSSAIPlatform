import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import React from 'react';
import { history } from '@umijs/max';
import { deleteDatasetAsset, listDatasetAssets } from '@/services/ant-design-pro/dataset';
import { getDownloadUrl } from '@/services/ant-design-pro/files';

/**
 * 数据集列表页
 */
const DatasetList: React.FC = () => {
  const fetchDatasetList = async () => {
    const res = await listDatasetAssets({ skipErrorHandler: true });
    const list = res?.data ?? [];
    return {
      data: list.map((a: any) => ({
        id: a.id,
        name: a.name,
        type: a.type,
        uploadTime: a.createdAt,
        size: '-',
        fileCount: 0,
        // 版本文件下载暂不在列表页直接展示（需要 join version 表）
        storagePath: a.storagePath,
      })),
      success: true,
      total: list.length,
    };
  };

  const handleDelete = async (datasetId: string) => {
    try {
      await deleteDatasetAsset(datasetId, { skipErrorHandler: true });
      message.success('删除成功');
      window.location.reload();
    } catch (error) {
      message.error('删除失败');
    }
  };

  const columns: ProColumns<API.DatasetItem>[] = [
    {
      title: '数据集名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      valueEnum: {
        CV: { text: 'CV' },
        NLP: { text: 'NLP' },
      },
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      valueType: 'dateTime',
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
    },
    {
      title: '文件数',
      dataIndex: 'fileCount',
      key: 'fileCount',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => history.push(`/dataset/detail/${record.id}`)}>
            查看详情
          </Button>
          <Button
            type="link"
            disabled={!record?.storagePath}
            href={record?.storagePath ? getDownloadUrl(record.storagePath) : undefined}
            target="_blank"
            rel="noreferrer"
          >
            下载
          </Button>
          <Popconfirm
            title="确定要删除吗？"
            onConfirm={() => handleDelete(record.id)}
          >
            <Button type="link" danger>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      extra={[
        <Button
          key="upload"
          type="primary"
          onClick={() => history.push('/dataset/upload')}
        >
          上传数据集
        </Button>,
      ]}
    >
      <ProTable
        columns={columns}
        request={fetchDatasetList}
        rowKey="id"
        search={{
          labelWidth: 'auto',
        }}
        pagination={{
          pageSize: 10,
        }}
      />
    </PageContainer>
  );
};

export default DatasetList;






