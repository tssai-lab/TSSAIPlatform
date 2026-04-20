import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space } from 'antd';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import React, { useRef } from 'react';
import { history } from '@umijs/max';
import { deleteDatasetAsset, getDatasetList } from '@/services/ant-design-pro/dataset';
import { getDownloadUrl } from '@/services/ant-design-pro/files';

/**
 * 数据集列表页
 */
const DatasetList: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);

  const fetchDatasetList = async (params: any) => {
    const type = params?.type === 'CV' || params?.type === 'NLP' ? params.type : undefined;
    const res = await getDatasetList(type ? { type } : undefined, { skipErrorHandler: true });
    const payload = res?.data ?? { data: [], total: 0 };
    return {
      data: payload.data ?? [],
      success: true,
      total: payload.total ?? 0,
    };
  };

  const handleDelete = async (datasetId: string) => {
    try {
      const res = await deleteDatasetAsset(datasetId, { skipErrorHandler: true });
      const result = res?.data;
      message.success(
        result
          ? `删除成功，已清理 ${result.deletedVersions} 个版本、${result.deletedObjects} 个文件`
          : '删除成功',
      );
      actionRef.current?.reload?.();
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '删除失败');
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
      title: '当前版本',
      dataIndex: 'version',
      key: 'version',
      search: false,
      renderText: (value) => value || '-',
    },
    {
      title: '上传时间',
      dataIndex: 'uploadTime',
      key: 'uploadTime',
      valueType: 'dateTime',
      search: false,
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      search: false,
    },
    {
      title: '文件数',
      dataIndex: 'fileCount',
      key: 'fileCount',
      search: false,
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
            title="确定删除该数据集吗？"
            description="将同步删除该数据集的所有版本记录和 MinIO 文件。"
            okText="删除"
            cancelText="取消"
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
        actionRef={actionRef}
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



