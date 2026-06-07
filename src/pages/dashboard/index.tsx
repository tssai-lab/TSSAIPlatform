import { PageContainer } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Progress,
  Row,
  Spin,
  Statistic,
  Tag,
} from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import { MOCK_DATASETS, MOCK_MODELS, MOCK_TASKS } from '@/constants/mockData';
import { TASK_STATUS } from '@/constants/platform';
import {
  fetchDatasetList,
  fetchModelList,
  fetchResourceMonitorSummary,
  fetchTaskList,
} from '@/services/platform';
import { enrichTaskItemsWithDisplayNames } from '@/utils/taskDisplayNames';

type ResourceSummary = {
  total: number;
  online: number;
  runningTasks: number;
  queuedTasks: number;
  avgGpu: number | string;
};

type DashboardStats = {
  modelTotal: number;
  datasetTotal: number;
  taskTotal: number;
  runningTotal: number;
};

const STATUS_TAG_COLOR: Record<string, string> = {
  pending: 'default',
  queued: 'warning',
  running: 'processing',
  success: 'success',
  failed: 'error',
  stopped: 'default',
};

const getStatusLabel = (status: string) => {
  const entry = Object.values(TASK_STATUS).find(
    (item) => item.value === status,
  );
  return entry?.label ?? status;
};

const parseTaskList = (res: unknown): API.TaskItem[] => {
  const payload = res as { data?: { data?: API.TaskItem[] } | API.TaskItem[] };
  if (Array.isArray(payload?.data)) return payload.data;
  return payload?.data?.data ?? [];
};

const parseTaskTotal = (res: unknown, fallback: number) => {
  const payload = res as { data?: { total?: number } };
  return payload?.data?.total ?? fallback;
};

/** 按列表项 status 统计，避免后端 total 未随 status 筛选变化 */
const countTasksByStatus = (
  tasks: API.TaskItem[],
  status: API.TaskItem['status'],
) => tasks.filter((t) => t.status === status).length;

const pickLatestTask = (tasks: API.TaskItem[]) => {
  if (!tasks.length) return null;
  return [...tasks].sort((a, b) => b.createTime.localeCompare(a.createTime))[0];
};

const cardStyles = {
  header: { minHeight: 38, padding: '0 14px', fontSize: 14 },
  body: { padding: '12px 14px' },
};

const statProps = {
  valueStyle: { fontSize: 22 },
};

/**
 * 首页/仪表盘 — 从后端拉取资产与任务统计
 */
const Dashboard: React.FC = () => {
  const { initialState } = useModel('@@initialState');
  const userName =
    initialState?.currentUser?.name || initialState?.currentUser?.username;

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    modelTotal: 0,
    datasetTotal: 0,
    taskTotal: 0,
    runningTotal: 0,
  });
  const [resourceSummary, setResourceSummary] =
    useState<ResourceSummary | null>(null);
  const [latestTask, setLatestTask] = useState<API.TaskItem | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const [modelRes, datasetRes, taskRes, runningRes, summaryRes] =
        await Promise.all([
          fetchModelList({ current: 1, pageSize: 1 }).catch(() => ({
            data: MOCK_MODELS,
            total: MOCK_MODELS.length,
          })),
          fetchDatasetList({ current: 1, pageSize: 1 }).catch(() => ({
            data: MOCK_DATASETS,
            total: MOCK_DATASETS.length,
          })),
          fetchTaskList({ current: 1, pageSize: 100 }).catch(() => ({
            data: { data: MOCK_TASKS, total: MOCK_TASKS.length },
          })),
          fetchTaskList({ current: 1, pageSize: 100, status: 'running' }).catch(
            () => ({
              data: {
                data: MOCK_TASKS.filter((t) => t.status === 'running'),
                total: MOCK_TASKS.filter((t) => t.status === 'running').length,
              },
            }),
          ),
          fetchResourceMonitorSummary().catch(() => null),
        ]);

      const allTasks = parseTaskList(taskRes);
      const runningTasks = parseTaskList(runningRes);
      const enrichedTasks = await enrichTaskItemsWithDisplayNames(allTasks, {
        skipErrorHandler: true,
      });

      if (summaryRes?.success && summaryRes.data) {
        setResourceSummary(summaryRes.data);
      } else {
        setResourceSummary(null);
      }

      setStats({
        modelTotal: modelRes?.total ?? modelRes?.data?.length ?? 0,
        datasetTotal: datasetRes?.total ?? datasetRes?.data?.length ?? 0,
        taskTotal: parseTaskTotal(taskRes, allTasks.length),
        runningTotal: runningRes
          ? countTasksByStatus(runningTasks, 'running')
          : countTasksByStatus(allTasks, 'running'),
      });
      setLatestTask(pickLatestTask(enrichedTasks));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  return (
    <PageContainer
      title="首页"
      subTitle={userName ? `欢迎回来，${userName}` : undefined}
    >
      <Spin spinning={loading}>
        <Row gutter={[12, 12]}>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" styles={cardStyles}>
              <Statistic
                title="模型总数"
                value={stats.modelTotal}
                suffix="个"
                {...statProps}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" styles={cardStyles}>
              <Statistic
                title="数据集总数"
                value={stats.datasetTotal}
                suffix="个"
                {...statProps}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" styles={cardStyles}>
              <Statistic
                title="训练任务"
                value={stats.taskTotal}
                suffix="个"
                {...statProps}
              />
            </Card>
          </Col>
          <Col xs={12} sm={12} md={6}>
            <Card size="small" styles={cardStyles}>
              <Statistic
                title="运行中任务"
                value={stats.runningTotal}
                suffix="个"
                {...statProps}
                valueStyle={{
                  ...statProps.valueStyle,
                  color: stats.runningTotal > 0 ? '#1890ff' : undefined,
                }}
              />
            </Card>
          </Col>
        </Row>

        <Card
          title="服务器资源总体概况"
          size="small"
          styles={cardStyles}
          style={{ marginTop: 12 }}
          extra={
            <Button
              type="link"
              size="small"
              onClick={() => history.push('/task/resourceMonitor')}
            >
              算力状态
            </Button>
          }
        >
          {resourceSummary ? (
            <Row gutter={[12, 0]} wrap={false}>
              <Col flex="1 1 0">
                <Statistic
                  title="GPU 服务器"
                  value={resourceSummary.total}
                  suffix="台"
                  {...statProps}
                />
              </Col>
              <Col flex="1 1 0">
                <Statistic
                  title="在线"
                  value={resourceSummary.online}
                  suffix={`/ ${resourceSummary.total}`}
                  {...statProps}
                  valueStyle={{ ...statProps.valueStyle, color: '#52c41a' }}
                />
              </Col>
              <Col flex="1 1 0">
                <Statistic
                  title="集群平均 GPU"
                  value={resourceSummary.avgGpu}
                  suffix="%"
                  {...statProps}
                />
              </Col>
              <Col flex="1 1 0">
                <Statistic
                  title="集群运行中任务"
                  value={resourceSummary.runningTasks}
                  suffix="个"
                  {...statProps}
                />
              </Col>
              <Col flex="1 1 0">
                <Statistic
                  title="集群排队任务"
                  value={resourceSummary.queuedTasks}
                  suffix="个"
                  {...statProps}
                />
              </Col>
            </Row>
          ) : (
            <Empty
              description="暂无法获取服务器资源信息"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Card>

        <Card
          title="最近一次训练"
          size="small"
          styles={cardStyles}
          style={{ marginTop: 12 }}
          extra={
            latestTask ? (
              <Button
                type="link"
                size="small"
                onClick={() => history.push('/task/list')}
              >
                查看全部任务
              </Button>
            ) : (
              <Button
                type="primary"
                size="small"
                onClick={() => history.push('/task/create')}
              >
                发起训练
              </Button>
            )
          }
        >
          {latestTask ? (
            <>
              <Descriptions size="small" column={{ xs: 1, sm: 2, md: 3 }}>
                <Descriptions.Item label="任务名称">
                  {latestTask.name}
                </Descriptions.Item>
                <Descriptions.Item label="状态">
                  <Tag color={STATUS_TAG_COLOR[latestTask.status] ?? 'default'}>
                    {getStatusLabel(latestTask.status)}
                  </Tag>
                </Descriptions.Item>
                <Descriptions.Item label="创建时间">
                  {latestTask.createTime}
                </Descriptions.Item>
                <Descriptions.Item label="模型">
                  {latestTask.modelName || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="数据集">
                  {latestTask.datasetName || '-'}
                </Descriptions.Item>
                <Descriptions.Item label="进度">
                  {latestTask.progress ?? 0}%
                </Descriptions.Item>
              </Descriptions>
              <Progress
                percent={latestTask.progress ?? 0}
                size="small"
                status={
                  latestTask.status === 'failed'
                    ? 'exception'
                    : latestTask.status === 'success'
                      ? 'success'
                      : 'active'
                }
                style={{ marginTop: 6, marginBottom: 10 }}
              />
              <Button
                size="small"
                type="primary"
                onClick={() => history.push(`/task/detail/${latestTask.id}`)}
              >
                查看训练详情
              </Button>
            </>
          ) : (
            <Empty
              description="暂无训练记录，发起第一次训练吧"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              style={{ margin: '8px 0' }}
            >
              <Button
                type="primary"
                size="small"
                onClick={() => history.push('/task/create')}
              >
                发起训练
              </Button>
            </Empty>
          )}
        </Card>
      </Spin>
    </PageContainer>
  );
};

export default Dashboard;
