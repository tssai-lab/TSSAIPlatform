import type { ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Button, message, Popconfirm, Space } from 'antd';
import React from 'react';
import { MOCK_DATASETS } from '@/constants/mockData';
import {
  deleteDataset,
  fetchDatasetList as fetchDatasetListService,
  getDownloadUrl,
} from '@/services/platform';

const DatasetList: React.FC = () => {
  const fetchDatasetList = async (params: any) => {
    try {
      const res = await fetchDatasetListService(params);
      return {
        data: res?.data || [],
        success: true,
        total: res?.total ?? (res?.data?.length || 0),
      };
    } catch {
      return {
        data: MOCK_DATASETS,
        success: true,
        total: MOCK_DATASETS.length,
      };
    }
  };

  const handleDelete = async (datasetId: string) => {
    try {
      await deleteDataset(datasetId);
      message.success('删除成功');
      window.location.reload();
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const handleDownload = (storagePath?: string) => {
    if (!storagePath) {
      message.warning('当前数据集没有可下载文件');
      return;
    }
    window.open(getDownloadUrl(storagePath), '_blank');
  };

  const columns: ProColumns<API.DatasetItem>[] = [
    { title: '数据集名称', dataIndex: 'name', key: 'name' },
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
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      hideInSearch: true,
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      valueType: 'dateTime',
      hideInSearch: true,
    },
    { title: '大小', dataIndex: 'size', key: 'size', hideInSearch: true },
    {
      title: '文件数',
      dataIndex: 'fileCount',
      key: 'fileCount',
      hideInSearch: true,
    },
    {
      title: '操作',
      key: 'action',
      hideInSearch: true,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() =>
              history.push(`/dataset/detail/${record.assetId || record.id}`)
            }
          >
            详情
          </Button>
          <Button
            type="link"
            onClick={() => handleDownload(record.storagePath)}
          >
            下载
          </Button>
          <Popconfirm
            title="确认删除该数据集？"
            onConfirm={() => handleDelete(record.assetId || record.id)}
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
      title="数据集管理"
      subTitle="浏览已上传的数据集资产和版本"
      extra={[
        <Button
          key="upload"
          type="primary"
          onClick={() => history.push('/dataset/upload')}
        >
          + 上传数据集
        </Button>,
      ]}
    >
      <ProTable
        columns={columns}
        request={fetchDatasetList}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10 }}
      />
    </PageContainer>
  );
};

export default DatasetList;
