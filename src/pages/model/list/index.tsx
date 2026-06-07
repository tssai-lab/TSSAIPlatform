import type { ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Button, message, Popconfirm, Space } from 'antd';
import React from 'react';
import { MOCK_MODELS } from '@/constants/mockData';
import {
  deleteModelAsset,
  deleteModelVersion,
  fetchModelList as fetchModelListService,
  getDownloadUrl,
} from '@/services/platform';

const ModelList: React.FC = () => {
  const fetchModelList = async (params: any) => {
    try {
      const res = await fetchModelListService(params);
      return {
        data: res?.data || [],
        success: true,
        total: res?.total ?? (res?.data?.length || 0),
      };
    } catch {
      return { data: MOCK_MODELS, success: true, total: MOCK_MODELS.length };
    }
  };

  const handleDeleteAsset = async (record: API.ModelItem) => {
    const assetId = record.assetId || record.id;
    try {
      if (record.assetId) {
        await deleteModelAsset(assetId);
      } else {
        await deleteModelVersion(record.id);
      }
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
    {
      title: '模型名称',
      dataIndex: 'name',
      key: 'name',
      width: 160,
      ellipsis: true,
    },
    { title: '版本号', dataIndex: 'version', key: 'version', width: 100 },
    {
      title: '类型',
      dataIndex: 'type',
      key: 'type',
      width: 88,
      valueEnum: {
        CV: { text: 'CV' },
        NLP: { text: 'NLP' },
        POINT_CLOUD: { text: '点云' },
      },
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      valueType: 'dateTime',
      width: 180,
      hideInSearch: true,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 100,
      hideInSearch: true,
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 200,
      ellipsis: true,
      hideInSearch: true,
    },
    {
      title: '操作',
      key: 'action',
      width: 180,
      align: 'left',
      hideInSearch: true,
      render: (_, record) => (
        <Space size={0} wrap={false}>
          <Button
            type="link"
            style={{ paddingLeft: 0 }}
            onClick={() => {
              const assetId = record.assetId || record.id;
              const query =
                record.assetId && record.id !== record.assetId
                  ? `?versionId=${encodeURIComponent(record.id)}`
                  : '';
              history.push(`/model/detail/${assetId}${query}`);
            }}
          >
            详情
          </Button>
          <Button
            type="link"
            style={{ paddingInline: 4 }}
            onClick={() => handleDownload(record.storagePath)}
          >
            下载
          </Button>
          <Popconfirm
            title={
              record.assetId
                ? '确认删除该模型资产及全部版本？'
                : '确认删除该模型版本？'
            }
            onConfirm={() => handleDeleteAsset(record)}
          >
            <Button type="link" danger style={{ paddingInline: 4 }}>
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
      subTitle="浏览模型资产与版本（列表展示各资产最新版本）"
      extra={
        <Button type="primary" onClick={() => history.push('/model/upload')}>
          + 上传模型
        </Button>
      }
    >
      <ProTable
        columns={columns}
        request={fetchModelList}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10 }}
        tableLayout="fixed"
        scroll={{ x: 'max-content' }}
      />
    </PageContainer>
  );
};

export default ModelList;
