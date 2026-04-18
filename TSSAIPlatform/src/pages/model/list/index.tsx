import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space } from 'antd';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import React, { useEffect, useMemo, useRef } from 'react';
import { history, useLocation } from '@umijs/max';
import { getModelList, deleteModel } from '@/services/ant-design-pro/model';
import { getDownloadUrl } from '@/services/ant-design-pro/files';

/**
 * 模型列表页（数据来自后端，模型文件存 MinIO）
 */
const ModelList: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const location = useLocation();

  const formatBytes = (bytes?: number) => {
    if (bytes === undefined || bytes === null || Number.isNaN(bytes)) return '-';
    if (bytes < 1024) return `${bytes} B`;
    const units = ['KB', 'MB', 'GB', 'TB'];
    let value = bytes / 1024;
    let idx = 0;
    while (value >= 1024 && idx < units.length - 1) {
      value /= 1024;
      idx += 1;
    }
    return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[idx]}`;
  };

  const refreshKey = useMemo(() => {
    const sp = new URLSearchParams(location.search || '');
    return sp.get('refresh');
  }, [location.search]);

  useEffect(() => {
    if (!refreshKey) return;
    // 来自上传页的刷新信号：自动刷新表格数据
    actionRef.current?.reload?.();
  }, [refreshKey]);

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
      // 只刷新表格，不整页刷新
      actionRef.current?.reload?.();
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
      render: (_, record) => record.size || formatBytes(record.sizeBytes),
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
        actionRef={actionRef}
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






