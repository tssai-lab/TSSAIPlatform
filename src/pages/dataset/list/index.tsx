import type { ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Button, message, Popconfirm, Space, Tag, Tooltip } from 'antd';
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
        POINT_CLOUD: { text: '点云' },
        MULTIMODAL: { text: '多模态' },
      },
    },
    {
      title: '导入状态',
      dataIndex: 'importStatus',
      key: 'importStatus',
      hideInSearch: true,
      width: 120,
      render: (_, record) => {
        if (record.type !== 'MULTIMODAL' || !record.importStatus) {
          return '-';
        }
        const color =
          record.importStatus === 'FAILED'
            ? 'error'
            : record.importStatus === 'SUCCESS'
              ? 'success'
              : 'processing';
        const label =
          record.importStatus === 'PENDING'
            ? '等待导入'
            : record.importStatus === 'RUNNING'
              ? '导入中'
              : record.importStatus === 'FAILED'
                ? '导入失败'
                : record.importStatus;
        const tag = <Tag color={color}>{label}</Tag>;
        if (record.importErrorMessage) {
          return <Tooltip title={record.importErrorMessage}>{tag}</Tooltip>;
        }
        return tag;
      },
    },
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      hideInSearch: true,
      width: 100,
    },
    {
      title: '版本描述',
      dataIndex: 'versionRemark',
      key: 'versionRemark',
      hideInSearch: true,
      ellipsis: true,
      render: (_, record) => record.versionRemark || '-',
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
              const versionId = record.versionId;
              const query =
                versionId && versionId !== assetId
                  ? `?versionId=${encodeURIComponent(versionId)}`
                  : '';
              history.push(`/dataset/detail/${assetId}${query}`);
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
            title="确认删除该数据集？"
            onConfirm={() => handleDelete(record.assetId || record.id)}
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
