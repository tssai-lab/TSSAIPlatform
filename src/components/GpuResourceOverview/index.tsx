import { ThunderboltOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import {
  Button,
  Card,
  Col,
  Progress,
  Row,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchGpuResourceOverview,
  type GpuDevice,
  type GpuResourceOverview,
} from '@/services/gpu';

const POLL_INTERVAL_MS = 15000;

function formatMb(mb: number) {
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(1)} GB`;
  }
  return `${mb} MB`;
}

function statusTag(status: GpuDevice['status']) {
  if (status === 'busy') {
    return <Tag color="processing">使用中</Tag>;
  }
  if (status === 'idle') {
    return <Tag color="success">空闲</Tag>;
  }
  return <Tag>离线</Tag>;
}

function utilizationStrokeColor(percent: number) {
  if (percent >= 85) return '#ff4d4f';
  if (percent >= 60) return '#faad14';
  return '#1677ff';
}

type GpuResourceOverviewProps = {
  pollIntervalMs?: number;
};

const GpuResourceOverviewPanel: React.FC<GpuResourceOverviewProps> = ({
  pollIntervalMs = POLL_INTERVAL_MS,
}) => {
  const [overview, setOverview] = useState<GpuResourceOverview | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetchGpuResourceOverview({ skipErrorHandler: true });
      setOverview(data);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh(true);
    const timer = window.setInterval(() => refresh(true), pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [refresh, pollIntervalMs]);

  const devices = overview?.devices ?? [];

  return (
    <Card
      title={
        <Space size={8}>
          <ThunderboltOutlined />
          <span>GPU 资源使用概况</span>
          {overview?.isMock && <Tag color="default">演示数据</Tag>}
        </Space>
      }
      extra={
        <Space size={12}>
          {overview?.clusterName && (
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {overview.clusterName}
            </Typography.Text>
          )}
          <Button size="small" onClick={() => refresh(false)} loading={loading}>
            刷新
          </Button>
        </Space>
      }
      loading={loading && !overview}
      style={{ marginTop: 16 }}
    >
      {overview?.isMock && (
        <Typography.Paragraph
          type="secondary"
          style={{ marginBottom: 16, fontSize: 12 }}
        >
          后端 GPU
          监控接口尚未接入，当前为样式预览。接口就绪后将自动切换为实时数据。
        </Typography.Paragraph>
      )}

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8} md={4}>
          <Statistic
            title="GPU 总数"
            value={overview?.totalGpus ?? 0}
            suffix="卡"
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Statistic
            title="使用中"
            value={overview?.busyGpus ?? 0}
            suffix="卡"
            valueStyle={{ color: '#1677ff' }}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Statistic
            title="空闲"
            value={overview?.availableGpus ?? 0}
            suffix="卡"
            valueStyle={{ color: '#52c41a' }}
          />
        </Col>
        <Col xs={12} sm={8} md={4}>
          <Statistic
            title="离线"
            value={overview?.offlineGpus ?? 0}
            suffix="卡"
          />
        </Col>
        <Col xs={12} sm={12} md={4}>
          <Statistic
            title="平均利用率"
            value={overview?.avgUtilizationPercent ?? 0}
            suffix="%"
          />
        </Col>
        <Col xs={12} sm={12} md={4}>
          <Statistic
            title="平均显存占用"
            value={overview?.avgMemoryUsedPercent ?? 0}
            suffix="%"
          />
        </Col>
      </Row>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {devices.map((device) => {
          const memoryPercent = device.memoryTotalMb
            ? Math.round((device.memoryUsedMb / device.memoryTotalMb) * 100)
            : 0;

          return (
            <div
              key={device.id}
              style={{
                border: '1px solid #f0f0f0',
                borderRadius: 8,
                padding: 16,
                background: device.status === 'offline' ? '#fafafa' : '#fff',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: 12,
                  gap: 8,
                }}
              >
                <div>
                  <Typography.Text strong>GPU {device.index}</Typography.Text>
                  <div style={{ fontSize: 12, color: '#8c8c8c', marginTop: 4 }}>
                    {device.name}
                  </div>
                </div>
                {statusTag(device.status)}
              </div>

              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: '#8c8c8c',
                    marginBottom: 4,
                  }}
                >
                  <span>显存</span>
                  <span>
                    {formatMb(device.memoryUsedMb)} /{' '}
                    {formatMb(device.memoryTotalMb)}
                  </span>
                </div>
                <Progress
                  percent={memoryPercent}
                  size="small"
                  strokeColor={utilizationStrokeColor(memoryPercent)}
                  showInfo={false}
                />
              </div>

              <div style={{ marginBottom: 10 }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: 12,
                    color: '#8c8c8c',
                    marginBottom: 4,
                  }}
                >
                  <span>算力利用率</span>
                  <span>{device.utilizationPercent}%</span>
                </div>
                <Progress
                  percent={device.utilizationPercent}
                  size="small"
                  strokeColor={utilizationStrokeColor(
                    device.utilizationPercent,
                  )}
                  showInfo={false}
                />
              </div>

              <Space size={12} wrap style={{ fontSize: 12, color: '#8c8c8c' }}>
                {device.temperatureC != null && (
                  <span>温度 {device.temperatureC}°C</span>
                )}
                {device.powerWatts != null && (
                  <span>功耗 {device.powerWatts} W</span>
                )}
              </Space>

              {device.status === 'busy' && device.assignedTaskName && (
                <div style={{ marginTop: 10 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    占用任务：
                  </Typography.Text>
                  <Tooltip title={device.assignedExperimentId || ''}>
                    <Button
                      type="link"
                      size="small"
                      style={{ padding: 0, height: 'auto', fontSize: 12 }}
                      onClick={() => {
                        if (device.assignedExperimentId) {
                          history.push(
                            `/task/detail/${encodeURIComponent(device.assignedExperimentId)}`,
                          );
                        }
                      }}
                    >
                      {device.assignedTaskName}
                    </Button>
                  </Tooltip>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {overview?.updatedAt && (
        <Typography.Text
          type="secondary"
          style={{
            display: 'block',
            marginTop: 12,
            fontSize: 12,
            textAlign: 'right',
          }}
        >
          数据更新于 {new Date(overview.updatedAt).toLocaleString()}
        </Typography.Text>
      )}
    </Card>
  );
};

export default GpuResourceOverviewPanel;
