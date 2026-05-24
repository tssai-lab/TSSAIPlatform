import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ProColumns } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space } from 'antd';
import React from 'react';
import { history } from '@umijs/max';
import { MOCK_MODELS } from '@/constants/mockData';
import { deleteModel, fetchModelList as fetchModelListService, getDownloadUrl } from '@/services/platform';

const ModelList: React.FC = () => {
  const fetchModelList = async (params: any) => {
    try {
      const res = await fetchModelListService(params);
      return { data: res?.data || [], success: true, total: res?.total ?? (res?.data?.length || 0) };
    } catch {
      return { data: MOCK_MODELS, success: true, total: MOCK_MODELS.length };
    }
  };

  const handleDelete = async (modelId: string) => {
    try {
      await deleteModel(modelId);
      message.success('删除成功');
      window.location.reload();
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const handleDownload = (storagePath?: string) => {
    if (!storagePath) {
      message.warning('当前模型没有可下载文件');
      return;
    }
    window.open(getDownloadUrl(storagePath), '_blank');
  };

  const columns: ProColumns<API.ModelItem>[] = [
    { title: '模型名称', dataIndex: 'name', key: 'name' },
    { title: '版本号', dataIndex: 'version', key: 'version' },
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
      hideInSearch: true,
    },
    { title: '大小', dataIndex: 'size', key: 'size', hideInSearch: true },
    { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, hideInSearch: true },
    {
      title: '操作',
      key: 'action',
      hideInSearch: true,
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => history.push(`/model/detail/${record.id}`)}>
            详情
          </Button>
          <Button type="link" onClick={() => handleDownload(record.storagePath)}>
            下载
          </Button>
          <Popconfirm title="确认删除该模型？" onConfirm={() => handleDelete(record.id)}>
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
      title="模型管理"
      subTitle="浏览已上传的模型版本"
      extra={[
        <Button key="upload" type="primary" onClick={() => history.push('/model/upload')}>
          + 上传模型
        </Button>,
      ]}
    >
      <ProTable
        columns={columns}
        request={fetchModelList}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10 }}
      />
    </PageContainer>
  );
};

export default ModelList;
