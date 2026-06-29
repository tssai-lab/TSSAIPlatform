import { ReloadOutlined } from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import {
  Button,
  Card,
  Col,
  message,
  Popconfirm,
  Row,
  Space,
  Statistic,
  Tag,
} from 'antd';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  INFERENCE_POLL_INTERVAL_MS,
  INFERENCE_TASK_STATUS,
  INFERENCE_TASK_TYPE,
  isActiveInferenceStatus,
} from '@/constants/inference/constants';
import { getInferenceDeleteConfirm } from '@/constants/inference/deleteConfirm';
import { getInferenceDeleteSuccessMessage } from '@/constants/inference/mockData';
import { getInferenceStopConfirm } from '@/constants/inference/stopConfirm';
import {
  deleteInferenceTask,
  fetchInferenceTaskList,
  fetchInferenceTaskStats,
  stopInferenceTask,
} from '@/services/platform';
import InferenceDatasetCell from '../components/InferenceDatasetCell';
import InferenceInputFileCell from '../components/InferenceInputFileCell';
import InferenceProgress from '../components/InferenceProgress';
import InferenceTaskId from '../components/InferenceTaskId';

const InferenceList: React.FC = () => {
  const actionRef = useRef<ActionType | undefined>(undefined);
  const [stats, setStats] = useState<API.InferenceTaskStats>({
    total: 0,
    running: 0,
    success: 0,
    failed: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  const loadStats = useCallback(async () => {
    try {
      const res = await fetchInferenceTaskStats({ skipErrorHandler: true });
      if (res?.data) setStats(res.data);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  const requestList = async (params: Record<string, unknown>) => {
    const res = await fetchInferenceTaskList(
      {
        current: params.current as number,
        pageSize: params.pageSize as number,
        status: params.status as string,
        keyword: params.keyword as string,
      },
      { skipErrorHandler: true },
    );
    await loadStats();
    const payload = res?.data;
    return {
      data: payload?.data ?? [],
      success: true,
      total: payload?.total ?? 0,
    };
  };

  const handleDelete = async (record: API.InferenceTaskListItem) => {
    try {
      const res = await deleteInferenceTask(record.id, {
        skipErrorHandler: true,
      });
      message.success(getInferenceDeleteSuccessMessage(res.data));
      actionRef.current?.reload();
      loadStats();
    } catch (error: unknown) {
      const err = error as { message?: string; info?: { message?: string } };
      message.error(err?.info?.message || err?.message || '删除失败');
    }
  };

  const handleStop = async (record: API.InferenceTaskListItem) => {
    try {
      await stopInferenceTask(record.id, { skipErrorHandler: true });
      message.success('推理任务已停止');
      actionRef.current?.reload();
      loadStats();
    } catch (error: unknown) {
      const err = error as { message?: string; info?: { message?: string } };
      message.error(err?.info?.message || err?.message || '停止失败');
    }
  };

  const handleManualRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([actionRef.current?.reload?.(), loadStats()]);
    } finally {
      setRefreshing(false);
    }
  };

  const stopConfirm = getInferenceStopConfirm();

  const columns: ProColumns<API.InferenceTaskListItem>[] = [
    {
      title: '推理任务 ID',
      dataIndex: 'id',
      width: 180,
      hideInSearch: true,
      fixed: 'left',
      render: (_, r) => <InferenceTaskId id={r.id} />,
    },
    {
      title: '任务名称',
      dataIndex: 'name',
      width: 180,
      ellipsis: true,
      hideInSearch: true,
    },
    {
      title: '任务类型',
      dataIndex: 'taskType',
      width: 100,
      hideInSearch: true,
      render: (_, r) => INFERENCE_TASK_TYPE[r.taskType]?.label ?? r.taskType,
    },
    {
      title: '模型',
      dataIndex: 'modelDisplayName',
      width: 200,
      hideInSearch: true,
      render: (_, r) => r.modelDisplayName,
    },
    {
      title: '数据',
      key: 'data',
      width: 220,
      hideInSearch: true,
      render: (_, r) =>
        r.inputMode === 'batch' ? (
          <InferenceDatasetCell
            name={r.datasetDisplayName || '-'}
            sizeBytes={r.datasetSizeBytes}
          />
        ) : (
          <InferenceInputFileCell
            fileName={r.inputFileName}
            displayName={r.inputDisplayName}
            sizeBytes={r.inputSizeBytes}
          />
        ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 100,
      valueEnum: {
        pending: { text: '待执行' },
        queued: { text: '排队中' },
        running: { text: '运行中' },
        success: { text: '已完成' },
        failed: { text: '失败' },
        stopped: { text: '已停止' },
      },
      render: (_, r) => {
        const info = INFERENCE_TASK_STATUS[r.status];
        return <Tag color={info?.color}>{info?.label ?? r.status}</Tag>;
      },
    },
    {
      title: '进度',
      dataIndex: 'progress',
      width: 120,
      hideInSearch: true,
      render: (_, r) =>
        r.status === 'running' ? (
          <InferenceProgress progress={r.progress ?? 0} size="small" showInfo />
        ) : r.status === 'success' ? (
          '100%'
        ) : (
          '-'
        ),
    },
    {
      title: '提交时间',
      dataIndex: 'createdAt',
      valueType: 'dateTime',
      hideInSearch: true,
      width: 170,
    },
    {
      title: '操作',
      key: 'action',
      fixed: 'right',
      width: 180,
      hideInSearch: true,
      render: (_, record) => {
        const confirm = getInferenceDeleteConfirm(record);
        const canStop = isActiveInferenceStatus(record.status);
        return (
          <Space size={4}>
            <Button
              type="link"
              style={{ paddingLeft: 0 }}
              onClick={() =>
                history.push(
                  `/inference/detail/${encodeURIComponent(record.id)}`,
                )
              }
            >
              详情
            </Button>
            {canStop && (
              <Popconfirm
                title={stopConfirm.title}
                description={stopConfirm.description}
                onConfirm={() => handleStop(record)}
              >
                <Button type="link" style={{ paddingLeft: 0 }}>
                  停止
                </Button>
              </Popconfirm>
            )}
            <Popconfirm
              title={confirm.title}
              description={confirm.description}
              onConfirm={() => handleDelete(record)}
            >
              <Button type="link" danger style={{ paddingLeft: 0 }}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
    {
      title: '关键词',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '任务 ID / 名称 / 模型' },
    },
  ];

  return (
    <PageContainer
      title="推理任务"
      subTitle="模型来自可推理模型池；批量数据来自数据集管理"
      extra={[
        <Button
          key="refresh"
          icon={<ReloadOutlined />}
          loading={refreshing}
          onClick={handleManualRefresh}
        >
          刷新
        </Button>,
        <Button
          key="create"
          type="primary"
          onClick={() => history.push('/inference/create')}
        >
          创建推理任务
        </Button>,
      ]}
    >
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="全部" value={stats.total} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="运行中" value={stats.running} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="已完成" value={stats.success} />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="失败" value={stats.failed} />
          </Card>
        </Col>
      </Row>

      <ProTable<API.InferenceTaskListItem>
        actionRef={actionRef}
        columns={columns}
        request={requestList}
        rowKey="id"
        polling={INFERENCE_POLL_INTERVAL_MS}
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1300 }}
      />
    </PageContainer>
  );
};

export default InferenceList;
