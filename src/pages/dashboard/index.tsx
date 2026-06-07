import { PageContainer } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import {
  Button,
  Card,
  Col,
  Row,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import GpuResourceOverviewPanel from '@/components/GpuResourceOverview';
import {
  fetchTaskList,
  listDatasetAssets,
  listModelAssets,
} from '@/services/platform';

const POLL_INTERVAL_MS = 15000;

type DashboardStats = {
  modelCount: number;
  datasetCount: number;
  taskCount: number;
  runningCount: number;
};

type RecentTask = API.TaskItem;

function statusText(status?: string) {
  const map: Record<string, string> = {
    pending: '待执行',
    queued: '排队中',
    running: '运行中',
    success: '成功',
    failed: '失败',
    stopped: '已停止',
  };
  return status ? map[status] || status : '-';
}

function statusColor(status?: string) {
  if (status === 'success') return 'success';
  if (status === 'running') return 'processing';
  if (status === 'queued') return 'warning';
  if (status === 'failed') return 'error';
  return 'default';
}

function isActiveTask(status?: string) {
  return status === 'running' || status === 'queued';
}

async function loadDashboardData(): Promise<{
  stats: DashboardStats;
  recentTasks: RecentTask[];
}> {
  const [modelRes, datasetRes, taskRes] = await Promise.all([
    listModelAssets({ skipErrorHandler: true }),
    listDatasetAssets({ skipErrorHandler: true }),
    fetchTaskList({ skipErrorHandler: true }),
  ]);

  const tasks = taskRes?.data?.data ?? [];
  const sortedTasks = [...tasks].sort((a, b) => {
    const ta = Date.parse(a.createTime || '') || 0;
    const tb = Date.parse(b.createTime || '') || 0;
    return tb - ta;
  });

  return {
    stats: {
      modelCount: Array.isArray(modelRes?.data) ? modelRes.data.length : 0,
      datasetCount: Array.isArray(datasetRes?.data) ? datasetRes.data.length : 0,
      taskCount: taskRes?.data?.total ?? tasks.length,
      runningCount: tasks.filter((t) => isActiveTask(t.status)).length,
    },
    recentTasks: sortedTasks.slice(0, 5),
  };
}

/**
 * 首页/仪表盘 — 从后端拉取资产与任务统计
 */
const Dashboard: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    modelCount: 0,
    datasetCount: 0,
    taskCount: 0,
    runningCount: 0,
  });
  const [recentTasks, setRecentTasks] = useState<RecentTask[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState('');
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const { stats: nextStats, recentTasks: nextTasks } = await loadDashboardData();
      setStats(nextStats);
      setRecentTasks(nextTasks);
      setLoadError(false);
      setLastUpdatedAt(new Date().toLocaleTimeString());
    } catch {
      setLoadError(true);
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(true);
    const timer = window.setInterval(() => refresh(false), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return (
    <PageContainer
      title="首页"
      subTitle={
        lastUpdatedAt
          ? `数据来自后端实时统计 · 每 ${POLL_INTERVAL_MS / 1000}s 自动刷新 · 更新于 ${lastUpdatedAt}`
          : '数据来自后端实时统计'
      }
      extra={
        <Button onClick={() => refresh(true)} loading={loading}>
          刷新
        </Button>
      }
    >
      {loadError && (
        <Typography.Text type="danger" style={{ display: 'block', marginBottom: 16 }}>
          部分数据加载失败，请检查登录状态与后端服务。
        </Typography.Text>
      )}

      <Spin spinning={loading && !lastUpdatedAt}>
        <Row gutter={[16, 16]}>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => history.push('/model/list')}>
              <Statistic title="模型资产" value={stats.modelCount} suffix="个" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => history.push('/dataset/list')}>
              <Statistic title="数据集资产" value={stats.datasetCount} suffix="个" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => history.push('/task/list')}>
              <Statistic title="训练实验" value={stats.taskCount} suffix="个" />
            </Card>
          </Col>
          <Col xs={24} sm={12} lg={6}>
            <Card hoverable onClick={() => history.push('/task/list')}>
              <Statistic
                title="运行中 / 排队中"
                value={stats.runningCount}
                suffix="个"
                valueStyle={stats.runningCount > 0 ? { color: '#1677ff' } : undefined}
              />
            </Card>
          </Col>
        </Row>
      </Spin>

      <GpuResourceOverviewPanel pollIntervalMs={POLL_INTERVAL_MS} />

      <Card title="最近训练任务" style={{ marginTop: 16 }}>
        <Table<RecentTask>
          rowKey="id"
          size="small"
          pagination={false}
          dataSource={recentTasks}
          locale={{ emptyText: loading ? '加载中…' : '暂无训练任务' }}
          columns={[
            {
              title: '任务名称',
              dataIndex: 'name',
              ellipsis: true,
            },
            {
              title: '实验 ID',
              dataIndex: 'experimentId',
              ellipsis: true,
              render: (v: string) => (
                <Typography.Text code style={{ fontSize: 11 }}>
                  {v || '-'}
                </Typography.Text>
              ),
            },
            {
              title: '版本',
              dataIndex: 'versionNo',
              width: 72,
              render: (v) => (v != null ? `v${v}` : '-'),
            },
            {
              title: '状态',
              dataIndex: 'status',
              width: 100,
              render: (s: string) => (
                <Tag color={statusColor(s)}>{statusText(s)}</Tag>
              ),
            },
            {
              title: '进度',
              dataIndex: 'progress',
              width: 80,
              render: (p) => `${p ?? 0}%`,
            },
            {
              title: '创建时间',
              dataIndex: 'createTime',
              width: 180,
            },
            {
              title: '操作',
              key: 'action',
              width: 88,
              render: (_, record) => (
                <Button
                  type="link"
                  style={{ paddingLeft: 0 }}
                  onClick={() =>
                    history.push(
                      `/task/detail/${encodeURIComponent(record.id || record.experimentId || '')}`,
                    )
                  }
                >
                  详情
                </Button>
              ),
            },
          ]}
        />
        <div style={{ marginTop: 12, textAlign: 'right' }}>
          <Button type="link" onClick={() => history.push('/task/list')}>
            查看全部任务
          </Button>
        </div>
      </Card>
    </PageContainer>
  );
};

export default Dashboard;
