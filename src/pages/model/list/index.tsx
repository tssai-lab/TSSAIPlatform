import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import React from 'react';
import { history } from '@umijs/max';
import { MOCK_MODELS } from '@/constants/mockData';

/**
 * 模型列表页（与 TSSAIPlatform-frontend-prototype 一致）
 */
const ModelList: React.FC = () => {
  const fetchModelList = async (params: any) => {
    // 开发阶段使用 Mock，后端就绪后改为 request(API_CONFIG.ENDPOINTS.MODEL_LIST, { params })
    const { name, type, current = 1, pageSize = 10 } = params;
    let list = [...MOCK_MODELS];
    if (name) list = list.filter((m) => m.name.includes(name));
    if (type) list = list.filter((m) => m.type === type);
    const start = (current - 1) * pageSize;
    const data = list.slice(start, start + pageSize);
    return { data, success: true, total: list.length };
  };

  const handleDelete = async (modelId: string) => {
    try {
      // TODO: 调用接口 DELETE /api/model/delete
      console.log('删除模型:', modelId);
      message.success('删除成功');
    } catch (error) {
      message.error('删除失败');
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
      title="模型管理"
      subTitle="管理所有已上传的模型，支持搜索、筛选、删除等操作"
      extra={[
        <Button
          key="upload"
          type="primary"
          onClick={() => history.push('/model/upload')}
        >
          + 上传模型
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






