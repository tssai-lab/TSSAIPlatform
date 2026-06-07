import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CloseOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess, useParams } from '@umijs/max';
import {
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  message,
  Popconfirm,
  Progress,
  Row,
  Segmented,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  cancelResourceQueueTask,
  deleteResourceMonitorServer,
  fetchResourceMonitorMetrics,
  fetchResourceMonitorServerDetail,
  reorderResourceQueueTask,
} from '@/services/platform';
import {
  getIntervalSpanLabel,
  getUsageColor,
  getUsageStatus,
  TIME_INTERVAL_OPTIONS,
} from '../constants';
import ResourceTrendChart from '../ResourceTrendChart';

const { Text } = Typography;

const ServerDetail = () => {
  const { canManageResourceNodes, canManageResourceQueue } = useAccess();
  const { serverIp: encodedIp } = useParams();
  const serverIp = decodeURIComponent(encodedIp || '');
  const [server, setServer] = useState(null);
  const [queuedTasks, setQueuedTasks] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [timeInterval, setTimeInterval] = useState('1hour');
  const [loading, setLoading] = useState(true);

  const loadMetrics = useCallback(
    async (interval) => {
      const metricsRes = await fetchResourceMonitorMetrics(serverIp, interval);
      if (!metricsRes?.success) {
        message.error(metricsRes?.errorMessage || '加载趋势数据失败');
        return;
      }
      setHistoryData(metricsRes.data?.points ?? []);
    },
    [serverIp],
  );

  const loadServerDetail = useCallback(async () => {
    setLoading(true);
    try {
      const detailRes = await fetchResourceMonitorServerDetail(serverIp);
      if (!detailRes?.success) {
        setServer(null);
        setQueuedTasks([]);
        return;
      }
      setServer(detailRes.data);
      setQueuedTasks(
        detailRes.data?.queuedTasks ? [...detailRes.data.queuedTasks] : [],
      );
    } finally {
      setLoading(false);
    }
  }, [serverIp]);

  useEffect(() => {
    if (serverIp) {
      loadServerDetail();
    }
  }, [serverIp, loadServerDetail]);

  useEffect(() => {
    if (serverIp) {
      loadMetrics(timeInterval);
    }
  }, [serverIp, timeInterval, loadMetrics]);

  const handleMoveQueueTask = useCallback(
    async (taskId, direction) => {
      const res = await reorderResourceQueueTask(serverIp, {
        taskId,
        direction,
      });
      if (!res?.success) {
        message.error(res?.errorMessage || '调整失败');
        return;
      }
      setQueuedTasks(res.data?.queuedTasks ?? []);
      message.success(
        direction === 'up'
          ? '已上移（仅调整顺序，优先级不变）'
          : '已下移（仅调整顺序，优先级不变）',
      );
    },
    [serverIp],
  );

  const handleCancelQueueTask = useCallback(
    async (taskId) => {
      const res = await cancelResourceQueueTask(serverIp, taskId);
      if (!res?.success) {
        message.error(res?.errorMessage || '取消失败');
        return;
      }
      setQueuedTasks(res.data?.queuedTasks ?? []);
      message.success('已取消排队');
    },
    [serverIp],
  );

  const handleDeleteServer = async () => {
    const res = await deleteResourceMonitorServer(serverIp);
    if (!res?.success) {
      message.error(res?.errorMessage || '删除失败');
      return;
    }
    message.success('服务器已删除');
    history.push('/task/resourceMonitor');
  };

  const runningColumns = useMemo(
    () => [
      { title: '任务名称', dataIndex: 'name', key: 'name', ellipsis: true },
      { title: '模型', dataIndex: 'model', key: 'model', width: 120 },
      { title: '数据集', dataIndex: 'dataset', key: 'dataset', width: 120 },
      {
        title: '开始时间',
        dataIndex: 'startTime',
        key: 'startTime',
        width: 170,
      },
      {
        title: '进度',
        dataIndex: 'progress',
        key: 'progress',
        width: 140,
        render: (val) => <Progress percent={val} size="small" />,
      },
      {
        title: 'CPU',
        dataIndex: 'cpuUsage',
        key: 'cpuUsage',
        width: 80,
        render: (val) => `${val}%`,
      },
      {
        title: '内存',
        dataIndex: 'memUsage',
        key: 'memUsage',
        width: 90,
        render: (val) => `${val} GB`,
      },
      {
        title: 'GPU',
        dataIndex: 'gpuUsage',
        key: 'gpuUsage',
        width: 80,
        render: (val) => `${val}%`,
      },
      {
        title: '操作',
        key: 'action',
        width: 90,
        render: (_, record) => (
          <a onClick={() => history.push(`/task/detail/${record.id}`)}>详情</a>
        ),
      },
    ],
    [],
  );

  const queuedColumns = useMemo(() => {
    const columns = [
      {
        title: '排队序号',
        key: 'queueOrder',
        width: 90,
        render: (_, __, index) => <Text strong>{index + 1}</Text>,
      },
      { title: '任务名称', dataIndex: 'name', key: 'name', ellipsis: true },
      { title: '模型', dataIndex: 'model', key: 'model', width: 120 },
      { title: '数据集', dataIndex: 'dataset', key: 'dataset', width: 120 },
      {
        title: '提交时间',
        dataIndex: 'submitTime',
        key: 'submitTime',
        width: 170,
      },
      {
        title: '优先级',
        dataIndex: 'priority',
        key: 'priority',
        width: 90,
        render: (val) => {
          const colorMap = { 高: 'red', 中: 'orange', 低: 'default' };
          return <Tag color={colorMap[val]}>{val}</Tag>;
        },
      },
    ];

    if (canManageResourceQueue) {
      columns.push({
        title: '操作',
        key: 'action',
        width: 100,
        align: 'center',
        render: (_, record, index) => (
          <Space size={2}>
            <Tooltip title="上移（仅改人工排序，优先级标签不变）">
              <Button
                type="text"
                size="small"
                disabled={index === 0}
                icon={
                  <ArrowUpOutlined
                    style={{ color: index === 0 ? undefined : '#1677ff' }}
                  />
                }
                onClick={() => handleMoveQueueTask(record.id, 'up')}
              />
            </Tooltip>
            <Tooltip title="下移（仅改人工排序，优先级标签不变）">
              <Button
                type="text"
                size="small"
                disabled={index === queuedTasks.length - 1}
                icon={
                  <ArrowDownOutlined
                    style={{
                      color:
                        index === queuedTasks.length - 1
                          ? undefined
                          : '#1677ff',
                    }}
                  />
                }
                onClick={() => handleMoveQueueTask(record.id, 'down')}
              />
            </Tooltip>
            <Popconfirm
              title="确认取消该任务的排队？"
              description="取消后任务将退出当前服务器队列。"
              onConfirm={() => handleCancelQueueTask(record.id)}
            >
              <Tooltip title="取消排队">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined style={{ color: '#ff4d4f' }} />}
                />
              </Tooltip>
            </Popconfirm>
          </Space>
        ),
      });
    }

    return columns;
  }, [
    canManageResourceQueue,
    handleMoveQueueTask,
    handleCancelQueueTask,
    queuedTasks.length,
  ]);

  if (loading) {
    return (
      <PageContainer
        title="服务器详情"
        onBack={() => history.push('/task/resourceMonitor')}
      >
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!server) {
    return (
      <PageContainer
        title="服务器详情"
        onBack={() => history.push('/task/resourceMonitor')}
      >
        <Empty description="未找到该服务器" />
      </PageContainer>
    );
  }

  const usageItems = [
    { label: 'CPU 使用率', value: server.cpuRate },
    { label: '内存使用率', value: server.memRate },
    { label: 'GPU 使用率', value: server.gpuRate },
    { label: 'GPU 显存', value: server.gpuMemRate },
    { label: '磁盘使用率', value: server.diskRate },
  ];

  return (
    <PageContainer
      title={`服务器：${server.serverIp}`}
      subTitle={server.hostname}
      onBack={() => history.push('/task/resourceMonitor')}
      extra={
        <Space>
          <Tag color={server.status === 'online' ? 'success' : 'warning'}>
            {server.status === 'online' ? '在线' : '告警'}
          </Tag>
          {canManageResourceNodes && (
            <Popconfirm
              title="确认删除该服务器？"
              description={
                server.runTask > 0
                  ? '该服务器有运行中任务，无法删除。'
                  : '删除后将不再纳入监控，当前排队任务将一并清除。'
              }
              okText="删除"
              okButtonProps={{ danger: true, disabled: server.runTask > 0 }}
              cancelText="取消"
              onConfirm={handleDeleteServer}
            >
              <Button danger disabled={server.runTask > 0}>
                删除服务器
              </Button>
            </Popconfirm>
          )}
        </Space>
      }
    >
      <Card title="硬件信息" style={{ marginBottom: 16 }}>
        <Descriptions column={4}>
          <Descriptions.Item label="主机名">
            {server.hostname}
          </Descriptions.Item>
          <Descriptions.Item label="CPU">{server.specs.cpu}</Descriptions.Item>
          <Descriptions.Item label="内存">
            {server.specs.memory}
          </Descriptions.Item>
          <Descriptions.Item label="GPU">{server.specs.gpu}</Descriptions.Item>
          <Descriptions.Item label="操作系统">
            {server.specs.os}
          </Descriptions.Item>
          <Descriptions.Item label="GPU 温度">
            {server.gpuTemp} °C
          </Descriptions.Item>
          <Descriptions.Item label="网络入站">
            {server.networkIn} MB/s
          </Descriptions.Item>
          <Descriptions.Item label="网络出站">
            {server.networkOut} MB/s
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        {usageItems.map((item) => (
          <Col xs={24} sm={12} md={8} lg={4} key={item.label}>
            <Card size="small">
              <Text type="secondary">{item.label}</Text>
              <Progress
                percent={item.value}
                strokeColor={getUsageColor(item.value)}
                status={getUsageStatus(item.value)}
                style={{ marginTop: 8 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={8}>
          <Card>
            <Statistic title="运行中任务" value={server.runTask} suffix="个" />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="排队中任务"
              value={queuedTasks.length}
              suffix="个"
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="综合负载"
              value={Math.round(
                (server.cpuRate + server.memRate + server.gpuRate) / 3,
              )}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      <Card
        title="资源使用趋势"
        extra={
          <Space size="middle">
            <Text type="secondary" style={{ fontSize: 12 }}>
              {getIntervalSpanLabel(timeInterval)}
            </Text>
            <Segmented
              value={timeInterval}
              onChange={setTimeInterval}
              options={TIME_INTERVAL_OPTIONS}
            />
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <ResourceTrendChart
          data={historyData}
          height={400}
          showSlider
          interval={timeInterval}
        />
      </Card>

      <Card
        title={`正在运行的任务（${server.runningTasks.length}）`}
        style={{ marginBottom: 16 }}
      >
        <Table
          rowKey="id"
          columns={runningColumns}
          dataSource={server.runningTasks}
          pagination={false}
          locale={{ emptyText: '当前无运行中任务' }}
          scroll={{ x: 1100 }}
        />
      </Card>

      <Card title={`排队中的任务（${queuedTasks.length}）`}>
        <Table
          rowKey="id"
          columns={queuedColumns}
          dataSource={queuedTasks}
          pagination={false}
          locale={{ emptyText: '当前无排队任务' }}
        />
      </Card>
    </PageContainer>
  );
};

export default ServerDetail;
