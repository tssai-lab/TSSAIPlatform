import type { ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Button, message, Popconfirm, Space, Tag } from 'antd';
import React from 'react';
import {
  deleteDataset,
  fetchDatasetList as fetchDatasetListService,
  getDownloadUrl,
  V2_DISPLAY_STATUS_LABEL,
  type V2DatasetDisplayStatus,
} from '@/services/platform';

function resolveDetailHref(record: API.DatasetItem): string {
  const assetId = record.assetId || record.id;
  const versionId =
    record.versionId && record.versionId !== assetId
      ? record.versionId
      : record.latestDraftVersionId &&
          (record.importStatus === 'PENDING' ||
            record.importStatus === 'RUNNING' ||
            record.importStatus === 'FAILED' ||
            record.displayStatus === 'IMPORTING' ||
            record.displayStatus === 'IMPORT_FAILED')
        ? record.latestDraftVersionId
        : undefined;
  const query = versionId ? `?versionId=${encodeURIComponent(versionId)}` : '';
  return `/dataset/detail/${assetId}${query}`;
}

/** 仅在需要用户关注时返回状态角标（导入中、失败、编辑中等） */
function resolveVersionAttention(record: API.DatasetItem): {
  color: string;
  label: string;
  progress?: number | null;
} | null {
  const displayStatus = record.displayStatus as
    | V2DatasetDisplayStatus
    | undefined;

  if (displayStatus && displayStatus !== 'READY' && displayStatus !== 'EMPTY') {
    const colorMap: Record<string, string> = {
      IMPORTING: 'processing',
      EDITING: 'processing',
      IMPORT_FAILED: 'error',
    };
    return {
      color: colorMap[displayStatus] ?? 'default',
      label: V2_DISPLAY_STATUS_LABEL[displayStatus] ?? displayStatus,
      progress:
        displayStatus === 'IMPORTING' ? record.importProgress : undefined,
    };
  }

  if (record.type !== 'MULTIMODAL') {
    return null;
  }

  const importStatus = record.importStatus;
  if (importStatus === 'FAILED') {
    return { color: 'error', label: '导入失败' };
  }
  if (importStatus === 'PENDING' || importStatus === 'RUNNING') {
    return {
      color: 'processing',
      label: '导入中',
      progress: record.importProgress,
    };
  }
  if (record.latestDraftVersionId && !record.versionId) {
    return {
      color: 'processing',
      label: '导入中',
      progress: record.importProgress,
    };
  }

  return null;
}

function renderVersionCell(record: API.DatasetItem) {
  const attention = resolveVersionAttention(record);
  const versionText = record.version;

  if (versionText && !attention) {
    return versionText;
  }

  if (versionText && attention) {
    return (
      <Space size={4} wrap>
        <span>{versionText}</span>
        <Tag color={attention.color}>{attention.label}</Tag>
        {attention.progress != null && (
          <span style={{ fontSize: 12, color: '#999' }}>
            {attention.progress}%
          </span>
        )}
      </Space>
    );
  }

  if (attention) {
    return (
      <Space size={4} wrap>
        <Tag color={attention.color}>{attention.label}</Tag>
        {attention.progress != null && (
          <span style={{ fontSize: 12, color: '#999' }}>
            {attention.progress}%
          </span>
        )}
      </Space>
    );
  }

  return '-';
}

const DatasetList: React.FC = () => {
  const fetchDatasetList = async (params: any) => {
    const res = await fetchDatasetListService(params);
    return {
      data: res?.data || [],
      success: true,
      total: res?.total ?? (res?.data?.length || 0),
    };
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
        ROBOT: { text: '机器人' },
      },
    },
    {
      title: '版本号',
      dataIndex: 'version',
      key: 'version',
      hideInSearch: true,
      width: 140,
      render: (_, record) => renderVersionCell(record),
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
      render: (_, record) =>
        record.fileCount != null ? record.fileCount : '-',
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
            onClick={() => history.push(resolveDetailHref(record))}
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
