import { MoreOutlined } from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Button, Dropdown, message, Popconfirm, Space, Tag } from 'antd';
import React, { useRef } from 'react';
import { MOCK_TASKS } from '@/constants/mockData';
import {
  deleteTask,
  fetchTaskList as fetchTaskListService,
  stopTask,
} from '@/services/platform';
import { enrichTaskItemsWithDisplayNames } from '@/utils/taskDisplayNames';

/**
 * 训练任务列表页 - Page 层
 * 调用 Services 层接口，适配 ProTable 的 request 格式
 */
const TaskList: React.FC = () => {
  const actionRef = useRef<ActionType>();

  const fetchTaskList = async (params: any) => {
    try {
      const res = await fetchTaskListService(params);
      let list = (res as any)?.data?.data ?? [];
      const experimentKeyword = params.experimentId?.trim?.();
      if (experimentKeyword) {
        list = list.filter((item: API.TaskItem) =>
          String(item.experimentId || '').includes(experimentKeyword),
        );
      }
      const total = experimentKeyword ? list.length : (res as any)?.data?.total ?? list.length;
      const enriched = await enrichTaskItemsWithDisplayNames(list, {
        skipErrorHandler: true,
      });
      return { data: enriched, success: true, total };
    } catch {
      return { data: MOCK_TASKS, success: true, total: MOCK_TASKS.length };
    }
  };

  const handleStop = async (taskId: string) => {
    try {
      await stopTask(taskId);
      message.success('任务已终止');
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '终止失败');
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      message.success('删除成功');
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const getStatusTag = (status: string) => {
    const statusMap: Record<string, { color: string; text: string }> = {
      pending: { color: 'default', text: '待执行' },
      queued: { color: 'warning', text: '排队中' },
      running: { color: 'processing', text: '运行中' },
      success: { color: 'success', text: '成功' },
      failed: { color: 'error', text: '失败' },
      stopped: { color: 'default', text: '已停止' },
    };
    const statusInfo = statusMap[status] || { color: 'default', text: status };
    return <Tag color={statusInfo.color}>{statusInfo.text}</Tag>;
  };

  const columns: ProColumns<API.TaskItem>[] = [
    {
      title: '实验ID',
      dataIndex: 'experimentId',
      key: 'experimentId',
      width: 220,
      ellipsis: true,
      copyable: true,
    },
    {
      title: '版本号',
      dataIndex: 'versionNo',
      key: 'versionNo',
      width: 90,
      hideInSearch: true,
    },
    {
      title: '任务名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '模型名称',
      dataIndex: 'modelName',
      key: 'modelName',
      render: (_, record) => record.modelName || '-',
    },
    {
      title: '数据集名称',
      dataIndex: 'datasetName',
      key: 'datasetName',
      render: (_, record) => record.datasetName || '-',
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
      hideInSearch: true,
      render: (progress) => `${progress || 0}%`,
    },
    {
      title: '操作',
      key: 'action',
      hideInSearch: true,
      fixed: 'right',
      width: 160,
      render: (_, record) => (
        <Space size={4} wrap={false}>
          <Button
            type="link"
            style={{ paddingLeft: 0 }}
            onClick={() =>
              history.push(
                `/task/detail/${encodeURIComponent(record.id || record.experimentId || '')}`,
              )
            }
          >
            查看详情
          </Button>
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                ...(record.experimentId
                  ? [
                      {
                        key: 'trace-history',
                        label: '追溯历史版本',
                        onClick: () =>
                          history.push(
                            `/task/detail/${encodeURIComponent(record.experimentId!)}#version-history`,
                          ),
                      },
                    ]
                  : []),
                ...(record.status === 'running'
                  ? [
                      {
                        key: 'stop',
                        label: (
                          <Popconfirm
                            title="确定要终止任务吗？"
                            onConfirm={() => handleStop(record.id)}
                          >
                            <span style={{ color: '#ff4d4f' }}>终止任务</span>
                          </Popconfirm>
                        ),
                      },
                    ]
                  : []),
                {
                  key: 'delete',
                  label: (
                    <Popconfirm
                      title="确定要删除吗？"
                      onConfirm={() => handleDelete(record.id)}
                    >
                      <span style={{ color: '#ff4d4f' }}>删除</span>
                    </Popconfirm>
                  ),
                },
              ],
            }}
          >
            <Button type="text" size="small" icon={<MoreOutlined />} />
          </Dropdown>
        </Space>
      ),
    },
  ];

  return (
    <PageContainer
      title="训练任务"
      subTitle="管理所有训练任务；列表展示各实验最新版本，可进入详情追溯历史"
      extra={[
        <Button key="compare" onClick={() => history.push('/task/compare')}>
          模型性能对比
        </Button>,
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
        actionRef={actionRef}
        columns={columns}
        request={fetchTaskList}
        polling={3000}
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
