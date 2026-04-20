import { PageContainer, ProTable } from '@ant-design/pro-components';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space, Tag } from 'antd';
import React, { useRef } from 'react';
import { history } from '@umijs/max';
import {
  deleteTrainingTask,
  listTrainingTasks,
  stopTrainingTask,
} from '@/services/ant-design-pro/task';

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'default', text: '等待中' },
  running: { color: 'processing', text: '运行中' },
  success: { color: 'success', text: '已完成' },
  failed: { color: 'error', text: '已失败' },
  stopped: { color: 'warning', text: '已停止' },
};

const getStatusTag = (status?: string) => {
  const info = statusMap[status || ''] || { color: 'default', text: status || '-' };
  return <Tag color={info.color}>{info.text}</Tag>;
};

const TaskList: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);

  const fetchTaskList = async () => {
    const res = await listTrainingTasks({ skipErrorHandler: true });
    const payload = res?.data ?? { data: [], total: 0 };
    return {
      data: payload.data ?? [],
      success: true,
      total: payload.total ?? 0,
    };
  };

  const handleStop = async (taskId: string) => {
    try {
      await stopTrainingTask(taskId, { skipErrorHandler: true });
      message.success('任务已停止');
      actionRef.current?.reload?.();
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '停止失败');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTrainingTask(taskId, { skipErrorHandler: true });
      message.success('删除成功');
      actionRef.current?.reload?.();
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '删除失败');
    }
  };

  const columns: ProColumns<API.TaskItem>[] = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '实验 ID',
      dataIndex: 'experimentId',
      key: 'experimentId',
      ellipsis: true,
    },
    {
      title: '版本',
      dataIndex: 'versionNo',
      key: 'versionNo',
      search: false,
      renderText: (value) => `v${value ?? '-'}`,
    },
    {
      title: '代码版本',
      dataIndex: 'codeVersionId',
      key: 'codeVersionId',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      key: 'createdAt',
      valueType: 'dateTime',
      search: false,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (_, record) => getStatusTag(record.status),
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      search: false,
      render: (progress) => `${progress || 0}%`,
    },
    {
      title: '操作',
      key: 'action',
      search: false,
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => history.push(`/task/detail/${record.id}`)}>
            查看详情
          </Button>
          {record.status === 'running' && (
            <Popconfirm title="确定要停止任务吗？" onConfirm={() => handleStop(record.id)}>
              <Button type="link" danger>
                停止任务
              </Button>
            </Popconfirm>
          )}
          <Popconfirm title="确定要删除该实验吗？" onConfirm={() => handleDelete(record.id)}>
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
        <Button key="create" type="primary" onClick={() => history.push('/task/create')}>
          发起训练
        </Button>,
      ]}
    >
      <ProTable
        actionRef={actionRef}
        columns={columns}
        request={fetchTaskList}
        rowKey="id"
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10 }}
      />
    </PageContainer>
  );
};

export default TaskList;
