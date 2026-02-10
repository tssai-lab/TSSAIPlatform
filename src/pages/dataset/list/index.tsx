import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import React from 'react';
import { history } from '@umijs/max';
import { MOCK_DATASETS } from '@/constants/mockData';

/**
 * 数据集列表页（与 TSSAIPlatform-frontend-prototype 一致）
 */
const DatasetList: React.FC = () => {
  const fetchDatasetList = async (params: any) => {
    const { name, type, current = 1, pageSize = 10 } = params;
    let list = [...MOCK_DATASETS];
    if (name) list = list.filter((d) => d.name.includes(name));
    if (type) list = list.filter((d) => d.type === type);
    const start = (current - 1) * pageSize;
    const data = list.slice(start, start + pageSize);
    return { data, success: true, total: list.length };
  };

  const handleDelete = async (datasetId: string) => {
    try {
      // TODO: 调用接口 DELETE /api/dataset/delete
      console.log('删除数据集:', datasetId);
      message.success('删除成功');
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






