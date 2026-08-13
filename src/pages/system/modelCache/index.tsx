import { DeleteOutlined, ReloadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Empty,
  message,
  Modal,
  Progress,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearModelCache,
  fetchModelCacheOverview,
  type ModelCacheEntry,
  type ModelCacheNode,
  type ModelCacheOverview,
} from '@/services/system/modelCache';

function formatBytes(value?: number): string {
  const bytes = Number(value || 0);
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function formatEpoch(value?: number): string {
  if (!value) return '-';
  return new Date(value * 1000).toLocaleString();
}

const ModelCachePage: React.FC = () => {
  const access = useAccess();
  const [overview, setOverview] = useState<ModelCacheOverview>();
  const [loading, setLoading] = useState(false);
  const [clearingNode, setClearingNode] = useState<string>();
  const [selectedByNode, setSelectedByNode] = useState<
    Record<string, React.Key[]>
  >({});

  useEffect(() => {
    if (!access.canAccessModelCache) {
      history.replace('/403');
    }
  }, [access.canAccessModelCache]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetchModelCacheOverview({ skipErrorHandler: true });
      if (response.code !== 200 || !response.data) {
        throw new Error(response.message || '模型缓存查询失败');
      }
      setOverview(response.data);
      setSelectedByNode({});
    } catch (error) {
      message.error(
        error instanceof Error ? error.message : '模型缓存查询失败',
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (access.canAccessModelCache) {
      void load();
    }
  }, [access.canAccessModelCache, load]);

  const executeClear = useCallback(
    async (node: ModelCacheNode, clearAll: boolean) => {
      const sha256s = clearAll
        ? []
        : (selectedByNode[node.serverIp] || []).map(String);
      if (!clearAll && sha256s.length === 0) {
        message.warning('请先选择要清理的权重');
        return;
      }
      setClearingNode(node.serverIp);
      try {
        const response = await clearModelCache(
          {
            serverIps: [node.serverIp],
            sha256s,
            clearAll,
          },
          { skipErrorHandler: true },
        );
        if (response.code !== 200 || !response.data) {
          throw new Error(response.message || '缓存清理失败');
        }
        const result = response.data.nodes[0];
        if (!result || result.error) {
          throw new Error(result?.error || '缓存节点未返回结果');
        }
        const parts = [`已清理 ${result.cleared.length} 项`];
        if (result.inUse.length > 0) {
          parts.push(`${result.inUse.length} 项正在使用，已安全跳过`);
        }
        if (result.notFound.length > 0) {
          parts.push(`${result.notFound.length} 项已不存在`);
        }
        message.success(parts.join('；'));
        await load();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '缓存清理失败');
      } finally {
        setClearingNode(undefined);
      }
    },
    [load, selectedByNode],
  );

  const confirmClear = useCallback(
    (node: ModelCacheNode, clearAll: boolean) => {
      const count = (selectedByNode[node.serverIp] || []).length;
      Modal.confirm({
        title: clearAll ? '清空该节点的模型缓存？' : `清理选中的 ${count} 项缓存？`,
        content:
          '这里只删除可重新下载的缓存副本，不删除对象存储中的原始模型。正在被训练或推理使用的权重会自动跳过。',
        okText: clearAll ? '确认清空' : '确认清理',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: () => executeClear(node, clearAll),
      });
    },
    [executeClear, selectedByNode],
  );

  const columns = useMemo<ColumnsType<ModelCacheEntry>>(
    () => [
      {
        title: '权重摘要',
        dataIndex: 'sha256',
        width: 180,
        render: (value: string) => (
          <Tooltip title={value}>
            <Typography.Text code copyable={{ text: value }}>
              {value.slice(0, 12)}…
            </Typography.Text>
          </Tooltip>
        ),
      },
      {
        title: '来源',
        dataIndex: 'storagePath',
        ellipsis: true,
        render: (value: string) => value || '-',
      },
      {
        title: '缓存占用',
        dataIndex: 'diskSizeBytes',
        width: 120,
        render: formatBytes,
      },
      {
        title: '最近使用',
        dataIndex: 'lastUsedAtEpochSeconds',
        width: 180,
        render: formatEpoch,
      },
      {
        title: '状态',
        width: 130,
        render: (_, entry) => {
          if (!entry.valid) return <Tag color="error">缓存异常</Tag>;
          if (entry.inUse) return <Tag color="processing">正在使用</Tag>;
          return <Tag color="success">可用</Tag>;
        },
      },
    ],
    [],
  );

  if (!access.canAccessModelCache) return null;

  return (
    <PageContainer
      title="模型缓存"
      subTitle="查看各物理计算节点上的训练/推理权重缓存"
      extra={[
        <Button
          key="refresh"
          icon={<ReloadOutlined />}
          onClick={() => void load()}
          loading={loading}
        >
          刷新
        </Button>,
      ]}
    >
      {!overview?.enabled ? (
        <Alert
          showIcon
          type="warning"
          message="模型缓存当前关闭"
          description="代码能力已安装，但必须先在维护窗口为 kubeadm 物理节点准备本地目录，通过真实 worker 探针并完成节点验证，才能安全启用。"
          style={{ marginBottom: 16 }}
        />
      ) : null}
      <Alert
        showIcon
        type="info"
        message="内存与磁盘保护"
        description={`权重以流式方式下载和校验，不会整体读入内存；节点缓存上限 ${formatBytes(
          overview?.maxBytes,
        )}，至少保留 ${formatBytes(
          overview?.minFreeBytes,
        )} 磁盘空间。清理时不会中断正在运行的任务。`}
        style={{ marginBottom: 16 }}
      />

      {!overview?.nodes?.length ? (
        <Card loading={loading}>
          <Empty description="暂无计算节点" />
        </Card>
      ) : (
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {overview.nodes.map((node) => {
            const percent = overview.maxBytes
              ? Math.min(100, Math.round((node.usedBytes / overview.maxBytes) * 100))
              : 0;
            const selected = selectedByNode[node.serverIp] || [];
            const clearing = clearingNode === node.serverIp;
            return (
              <Card
                key={node.serverIp}
                loading={loading}
                title={
                  <Space>
                    <span>{node.hostname || node.serverIp}</span>
                    <Typography.Text type="secondary">
                      {node.k8sNodeName || node.serverIp}
                    </Typography.Text>
                    {node.cacheReady ? (
                      <Tag color="success">缓存就绪</Tag>
                    ) : (
                      <Tag>未就绪</Tag>
                    )}
                  </Space>
                }
                extra={
                  access.canClearModelCache ? (
                    <Space>
                      <Button
                        danger
                        icon={<DeleteOutlined />}
                        disabled={!node.cacheReady || selected.length === 0}
                        loading={clearing}
                        onClick={() => confirmClear(node, false)}
                      >
                        清理所选
                      </Button>
                      <Button
                        danger
                        disabled={!node.cacheReady || node.entries.length === 0}
                        loading={clearing}
                        onClick={() => confirmClear(node, true)}
                      >
                        清空节点缓存
                      </Button>
                    </Space>
                  ) : null
                }
              >
                {node.error ? (
                  <Alert
                    showIcon
                    type="warning"
                    message={node.error}
                    style={{ marginBottom: 16 }}
                  />
                ) : null}
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Typography.Text>
                    已用 {formatBytes(node.usedBytes)} / 上限{' '}
                    {formatBytes(overview.maxBytes)}；磁盘可用{' '}
                    {formatBytes(node.diskFreeBytes)}
                  </Typography.Text>
                  <Progress percent={percent} status={percent >= 90 ? 'exception' : 'normal'} />
                  <Table<ModelCacheEntry>
                    rowKey="sha256"
                    size="small"
                    pagination={false}
                    columns={columns}
                    dataSource={node.entries}
                    rowSelection={
                      access.canClearModelCache
                        ? {
                            selectedRowKeys: selected,
                            getCheckboxProps: (entry) => ({ disabled: entry.inUse }),
                            onChange: (keys) =>
                              setSelectedByNode((current) => ({
                                ...current,
                                [node.serverIp]: keys,
                              })),
                          }
                        : undefined
                    }
                  />
                </Space>
              </Card>
            );
          })}
        </Space>
      )}
    </PageContainer>
  );
};

export default ModelCachePage;
