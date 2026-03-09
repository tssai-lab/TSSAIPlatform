import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import React from 'react';
import { history } from '@umijs/max';
import { fetchDatasetList as fetchDatasetListService, deleteDataset } from '@/services/platform';
import { MOCK_DATASETS } from '@/constants/mockData';

/**
 * 数据集列表页 - Page 层
 * 调用 Services 层接口，适配 ProTable 的 request 格式
 */
const DatasetList: React.FC = () => {
  const fetchDatasetList = async (params: any) => {
    try {
      const res = await fetchDatasetListService(params);
      return { data: res?.data || [], success: true, total: res?.total ?? (res?.data?.length || 0) };
    } catch {
      return { data: MOCK_DATASETS, success: true, total: MOCK_DATASETS.length };
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
      hideInSearch: true,
    },
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
          <Button type="link" onClick={() => history.push(`/dataset/detail/${record.id}`)}>
            查看详情
          </Button>
          <Button type="link">下载</Button>
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
      title="数据集管理"
      subTitle="管理所有已上传的数据集，支持搜索、筛选、删除等操作"
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






