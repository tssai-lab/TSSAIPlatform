import { PageContainer } from '@ant-design/pro-components';
import { history, useModel } from '@umijs/max';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Progress,
  Result,
  Row,
  Spin,
  Statistic,
  Tag,
} from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import { TASK_STATUS } from '@/constants/platform';
import {
  fetchDatasetList,
  fetchModelList,
  fetchResourceMonitorSummary,
  fetchTaskList,
} from '@/services/platform';
import { formatDisplayDateTime } from '@/utils/formatDateTime';
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
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setDashboardError(null);
    try {
      const [modelRes, datasetRes, taskRes, runningRes, summaryRes] =
        await Promise.all([
          fetchModelList({ current: 1, pageSize: 1 }),
          fetchDatasetList({ current: 1, pageSize: 1 }),
          fetchTaskList({ current: 1, pageSize: 100 }),
          fetchTaskList({ current: 1, pageSize: 100, status: 'running' }),
          fetchResourceMonitorSummary(),
        ]);

      if (!summaryRes?.success || !summaryRes.data) {
        throw new Error(
          summaryRes?.errorMessage || '服务器资源汇总接口返回失败',
        );
      }
      if (taskRes?.success === false || runningRes?.success === false) {
        throw new Error(
          taskRes?.errorMessage ||
            runningRes?.errorMessage ||
            '训练任务统计接口返回失败',
        );
      }

      const allTasks = parseTaskList(taskRes);
      const runningTasks = parseTaskList(runningRes);
      const latest = pickLatestTask(allTasks);
      // 首页只展示「最近一次」名称，勿对整表 100 条逐个打模型/数据集详情
      const enrichedLatest = latest
        ? (
            await enrichTaskItemsWithDisplayNames([latest], {
              skipErrorHandler: true,
            })
          )[0]
        : null;

      setResourceSummary(summaryRes.data);

      setStats({
        modelTotal: modelRes?.total ?? modelRes?.data?.length ?? 0,
        datasetTotal: datasetRes?.total ?? datasetRes?.data?.length ?? 0,
        taskTotal: parseTaskTotal(taskRes, allTasks.length),
        runningTotal: runningRes
          ? countTasksByStatus(runningTasks, 'running')
          : countTasksByStatus(allTasks, 'running'),
      });
      setLatestTask(enrichedLatest);
    } catch (error) {
      setStats({
        modelTotal: 0,
        datasetTotal: 0,
        taskTotal: 0,
        runningTotal: 0,
      });
      setResourceSummary(null);
      setLatestTask(null);
      setDashboardError(
        error instanceof Error && error.message
          ? error.message
          : '无法从后端获取首页统计数据',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  if (dashboardError && !loading) {
    return (
      <PageContainer
        title="首页"
        subTitle={userName ? `欢迎回来，${userName}` : undefined}
      >
        <Result
          status="error"
          title="首页数据加载失败"
          subTitle={`无法从后端获取真实统计数据，页面没有使用演示数据替代。${dashboardError ? ` 原因：${dashboardError}` : ''}`}
          extra={
            <Button type="primary" onClick={() => void loadDashboard()}>
              重新加载
            </Button>
          }
        />
      </PageContainer>
    );
  }

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
                  title="计算节点"
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
                  {formatDisplayDateTime(latestTask.createTime)}
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
