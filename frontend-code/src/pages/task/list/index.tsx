import { PageContainer, ProTable } from '@ant-design/pro-components';
import { Button, message, Popconfirm, Space, Tag } from 'antd';
import type { ProColumns } from '@ant-design/pro-components';
import React from 'react';
import { history } from '@umijs/max';
import { MOCK_TASKS } from '@/constants/mockData';

/**
 * 训练任务列表页（与 TSSAIPlatform-frontend-prototype 一致）
 */
const TaskList: React.FC = () => {
  const fetchTaskList = async (params: any) => {
    const { name, status, current = 1, pageSize = 10 } = params;
    let list = [...MOCK_TASKS];
    if (name) list = list.filter((t) => t.name.includes(name));
    if (status) list = list.filter((t) => t.status === status);
    const start = (current - 1) * pageSize;
    const data = list.slice(start, start + pageSize);
    return { data, success: true, total: list.length };
  };

  const handleStop = async (taskId: string) => {
    try {
      // TODO: 调用接口 POST /api/task/stop
      console.log('终止任务:', taskId);
      message.success('任务已终止');
    } catch (error) {
      message.error('终止失败');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      // TODO: 调用接口 DELETE /api/task/delete
      console.log('删除任务:', taskId);
      message.success('删除成功');
    } catch (error) {
      message.error('删除失败');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待执行' },
      running: { color: 'processing', text: '运行中' },
      success: { color: 'success', text: '成功' },
      failed: { color: 'error', text: '失败' },
    };
    const statusInfo = statusMap[status] || { color: 'default', text: status };
    return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
  };

  const columns: ProColumns<API.TaskItem>[] = [
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '模型名称',
      dataIndex: 'modelName',
      key: 'modelName',
    },
    {
      title: '数据集名称',
      dataIndex: 'datasetName',
      key: 'datasetName',
    },
    {
      title: '创建时间',
      dataIndex: 'createTime',
      key: 'createTime',
      valueType: 'dateTime',
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
      render: (progress) => `${progress || 0}%`,
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            onClick={() => history.push(`/task/detail/${record.id}`)}
          >
            查看详情
          </Button>
          {record.status === 'running' && (
            <Popconfirm
              title="确定要终止任务吗？"
              onConfirm={() => handleStop(record.id)}
            >
              <Button type="link" danger>
                终止任务
              </Button>
            </Popconfirm>
          )}
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
      title="训练任务"
      subTitle="管理所有训练任务，支持状态筛选、终止、删除等操作"
      extra={[
        <Button
          key="create"
          type="primary"
          onClick={() => history.push('/task/create')}
        >
          发起训练
        </Button>,
      ]}
    >
      <ProTable
        columns={columns}
        request={fetchTaskList}
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

export default TaskList;






