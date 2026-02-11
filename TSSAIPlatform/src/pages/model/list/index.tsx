import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import React from 'react';
import { history } from '@umijs/max';
import { getModelList, deleteModel } from '@/services/ant-design-pro/model';

/**
 * 模型列表页（数据来自后端，模型文件存 MinIO）
 */
const ModelList: React.FC = () => {
  const fetchModelList = async () => {
    const res = await getModelList({ skipErrorHandler: true });
    const payload = res?.data ?? { data: [], total: 0 };
    return {
      data: (payload.data ?? []).map((item: any) => ({
        ...item,
        uploadTime: item.createdAt ?? item.uploadTime,
      })),
      success: true,
      total: payload.total ?? 0,
    };
  };

  const handleDelete = async (modelId: string) => {
    try {
      await deleteModel(modelId, { skipErrorHandler: true });
      message.success('删除成功');
      // 刷新表格
      window.location.reload();
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '删除失败');
    }
  };

  const columns: ProColumns<API.ModelItem>[] = [
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
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
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => history.push(`/model/detail/${record.id}`)}
          >
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
      extra={[
        <Button
          key="upload"
          type="primary"
          onClick={() => history.push('/model/upload')}
        >
          上传模型
        </Button>,
      ]}
    >
      <ProTable
        columns={columns}
        request={fetchModelList}
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

export default ModelList;






