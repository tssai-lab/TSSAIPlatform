import {
  CloudServerOutlined,
  DeleteOutlined,
  PlusOutlined,
  RightOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import {
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Statistic,
  Tag,
  Typography,
} from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createResourceMonitorServer,
  deleteResourceMonitorServer,
  fetchResourceMonitorServers,
  fetchResourceMonitorSummary,
} from '@/services/platform';
import { getUsageColor, getUsageStatus } from './constants';

const { Search } = Input;
const { Text } = Typography;

const ServerCard = ({ server, onClick, onDelete, canManageNodes }) => {
  const usageItems = [
    { label: 'CPU', value: server.cpuRate },
    { label: '内存', value: server.memRate },
    { label: 'GPU', value: server.gpuRate },
  ];

  const hasRunningTasks = server.runTask > 0 || server.runningTasks?.length > 0;

  return (
    <Card
      hoverable
      onClick={onClick}
      style={{ cursor: 'pointer', height: '100%' }}
      styles={{ body: { padding: '16px 20px' } }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
        }}
      >
        <Space>
          <CloudServerOutlined style={{ fontSize: 20, color: '#1677ff' }} />
          <div>
            <Text strong style={{ fontSize: 15 }}>
              {server.serverIp}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              {server.hostname}
            </Text>
          </div>
        </Space>
        <Space size={4} onClick={(e) => e.stopPropagation()}>
          <Tag color={server.status === 'online' ? 'success' : 'warning'}>
            {server.status === 'online' ? '在线' : '告警'}
          </Tag>
          {canManageNodes && (
            <Popconfirm
              title="确认删除该服务器？"
              description={
                hasRunningTasks
                  ? '该服务器有运行中任务，无法删除。'
                  : '删除后将不再纳入监控，排队任务将一并清除。'
              }
              okText="删除"
              okButtonProps={{ danger: true, disabled: hasRunningTasks }}
              cancelText="取消"
              onConfirm={() => onDelete(server.serverIp)}
            >
              <Button
                type="text"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={hasRunningTasks}
              />
            </Popconfirm>
          )}
          <RightOutlined style={{ color: '#bfbfbf', fontSize: 12 }} />
        </Space>
      </div>

      <div style={{ marginTop: 14 }}>
        {usageItems.map((item) => (
          <div key={item.label} style={{ marginBottom: 6 }}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 2,
              }}
            >
              <Text type="secondary" style={{ fontSize: 12 }}>
                {item.label}
              </Text>
              <Text style={{ fontSize: 12 }}>{item.value}%</Text>
            </div>
            <Progress
              percent={item.value}
              showInfo={false}
              size="small"
              strokeColor={getUsageColor(item.value)}
              status={getUsageStatus(item.value)}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 10,
          display: 'flex',
          justifyContent: 'space-between',
        }}
      >
        <Text type="secondary" style={{ fontSize: 12 }}>
          运行 <Text strong>{server.runTask}</Text> / 排队{' '}
          <Text strong>{server.waitTask}</Text>
        </Text>
      </div>

      {server.runningTasks.length > 0 && (
        <div
          style={{
            marginTop: 10,
            padding: '8px 10px',
            background: '#f6ffed',
            borderRadius: 6,
            border: '1px solid #b7eb8f',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <Text
            type="secondary"
            style={{ fontSize: 11, display: 'block', marginBottom: 4 }}
          >
            正在运行
          </Text>
          <Space size={[4, 4]} wrap>
            {server.runningTasks.map((task) => (
              <Tag key={task.id} color="green" style={{ margin: 0 }}>
                {task.name}
              </Tag>
            ))}
          </Space>
        </div>
      )}
    </Card>
  );
};

const ResourceMonitor = () => {
  const { canManageResourceNodes } = useAccess();
  const [servers, setServers] = useState([]);
  const [summary, setSummary] = useState({
    total: 0,
    online: 0,
    runningTasks: 0,
    queuedTasks: 0,
    avgGpu: 0,
  });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const loadPageData = useCallback(async () => {
    setLoading(true);
    try {
      const [summaryRes, serversRes] = await Promise.all([
        fetchResourceMonitorSummary(),
        fetchResourceMonitorServers(),
      ]);

      if (!summaryRes?.success) {
        message.error(summaryRes?.errorMessage || '加载汇总失败');
        return;
      }
      if (!serversRes?.success) {
        message.error(serversRes?.errorMessage || '加载服务器列表失败');
        return;
      }

      setSummary(summaryRes.data);
      setServers(serversRes.data ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPageData();
  }, [loadPageData]);

  const filteredServers = useMemo(() => {
    return servers.filter((s) => {
      const matchSearch =
        !searchText ||
        s.serverIp.includes(searchText) ||
        s.hostname.includes(searchText) ||
        s.runningTasks.some((t) => t.name.includes(searchText));
      const matchStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [servers, searchText, statusFilter]);

  const handleServerClick = (serverIp) => {
    history.push(
      `/task/resourceMonitor/detail/${encodeURIComponent(serverIp)}`,
    );
  };

  const handleDeleteServer = async (serverIp) => {
    const res = await deleteResourceMonitorServer(serverIp);
    if (!res?.success) {
      message.error(res?.errorMessage || '删除失败');
      return;
    }
    message.success('服务器已删除');
    await loadPageData();
  };

  const handleAddServer = async () => {
    try {
      const values = await form.validateFields();
      setAddSubmitting(true);
      const res = await createResourceMonitorServer({
        serverIp: values.serverIp,
        hostname: values.hostname,
        specs: {
          cpu: values.cpu,
          memory: values.memory,
          gpu: values.gpu,
          os: values.os,
        },
      });

      if (!res?.success) {
        message.error(res?.errorMessage || '添加失败');
        return;
      }

      message.success('服务器添加成功');
      setAddModalOpen(false);
      form.resetFields();
      await loadPageData();
    } catch (error) {
      if (error?.errorFields) return;
      message.error(error?.message || '添加失败');
    } finally {
      setAddSubmitting(false);
    }
  };

  return (
    <PageContainer
      title="算力状态"
      subTitle="实时查看集群服务器资源占用与任务调度情况"
    >
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic title="服务器总数" value={summary.total} suffix="台" />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="在线"
              value={summary.online}
              suffix={`/ ${summary.total}`}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="运行中任务"
              value={summary.runningTasks}
              suffix="个"
            />
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small">
            <Statistic
              title="平均 GPU 使用率"
              value={summary.avgGpu}
              suffix="%"
            />
          </Card>
        </Col>
      </Row>

      <Card
        title={`服务器列表（${filteredServers.length} 台）`}
        loading={loading}
        extra={
          <Space wrap>
            {canManageResourceNodes && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setAddModalOpen(true)}
              >
                添加服务器
              </Button>
            )}
            <Search
              placeholder="搜索 IP / 主机名 / 任务名"
              allowClear
              style={{ width: 220 }}
              onSearch={setSearchText}
              onChange={(e) => !e.target.value && setSearchText('')}
            />
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 120 }}
              options={[
                { label: '全部状态', value: 'all' },
                { label: '在线', value: 'online' },
                { label: '告警', value: 'warning' },
              ]}
            />
          </Space>
        }
        style={{ marginBottom: 20 }}
      >
        <Row gutter={[16, 16]}>
          {filteredServers.map((server) => (
            <Col xs={24} sm={12} md={8} lg={6} key={server.serverIp}>
              <ServerCard
                server={server}
                onClick={() => handleServerClick(server.serverIp)}
                onDelete={handleDeleteServer}
                canManageNodes={canManageResourceNodes}
              />
            </Col>
          ))}
        </Row>
        {filteredServers.length === 0 && (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
            没有匹配的服务器
          </div>
        )}
      </Card>

      <Modal
        title="添加服务器"
        open={addModalOpen}
        onOk={handleAddServer}
        onCancel={() => {
          setAddModalOpen(false);
          form.resetFields();
        }}
        confirmLoading={addSubmitting}
        okText="添加"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="serverIp"
            label="服务器 IP"
            rules={[
              { required: true, message: '请输入服务器 IP' },
              {
                pattern: /^(\d{1,3}\.){3}\d{1,3}$/,
                message: '请输入合法的 IP 地址',
              },
            ]}
          >
            <Input placeholder="例如 192.168.1.120" />
          </Form.Item>
          <Form.Item
            name="hostname"
            label="主机名"
            rules={[{ required: true, message: '请输入主机名' }]}
          >
            <Input placeholder="例如 gpu-node-13" />
          </Form.Item>
          <Form.Item name="cpu" label="CPU 规格">
            <Input placeholder="例如 16 核（选填）" />
          </Form.Item>
          <Form.Item name="memory" label="内存规格">
            <Input placeholder="例如 64 GB（选填）" />
          </Form.Item>
          <Form.Item name="gpu" label="GPU 型号">
            <Input placeholder="例如 NVIDIA A100 80GB（选填）" />
          </Form.Item>
          <Form.Item name="os" label="操作系统" initialValue="Ubuntu 22.04">
            <Input placeholder="例如 Ubuntu 22.04" />
          </Form.Item>
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default ResourceMonitor;
