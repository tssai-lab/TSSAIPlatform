import { PageContainer } from '@ant-design/pro-components';
import { Button, Card, Descriptions, Input, message, Modal, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React, { useCallback, useEffect, useState } from 'react';
import { history, useParams } from '@umijs/max';
import {
  getTrainingTaskDetail,
  listExperimentVersions,
  updateExperimentHyperParams,
} from '@/services/ant-design-pro/task';

const statusMap: Record<string, { color: string; text: string }> = {
  pending: { color: 'default', text: '等待中' },
  running: { color: 'processing', text: '运行中' },
  success: { color: 'success', text: '已完成' },
  failed: { color: 'error', text: '已失败' },
  stopped: { color: 'warning', text: '已停止' },
};

const getStatusTag = (status?: string) => {
  const info = statusMap[status || ''] || { color: 'default', text: status || '-' };
  return <Tag color={info.color}>{info.text}</Tag>;
};

const prettyJson = (value: any) => {
  if (value === undefined || value === null) return '{}';
  try {
    return typeof value === 'string' ? JSON.stringify(JSON.parse(value), null, 2) : JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

const TaskDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [loading, setLoading] = useState(false);
  const [taskInfo, setTaskInfo] = useState<API.TrainingExperimentVersion | null>(null);
  const [versions, setVersions] = useState<API.TrainingExperimentVersion[]>([]);
  const [editingVersion, setEditingVersion] = useState<API.TrainingExperimentVersion | null>(null);
  const [paramsText, setParamsText] = useState('');
  const [remarkText, setRemarkText] = useState('');
  const [saving, setSaving] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const detailRes = await getTrainingTaskDetail(id, { skipErrorHandler: true });
      const detail = detailRes?.data ?? null;
      setTaskInfo(detail);
      if (detail?.experimentId) {
        const historyRes = await listExperimentVersions(detail.experimentId, { skipErrorHandler: true });
        setVersions(historyRes?.data ?? []);
      } else {
        setVersions([]);
      }
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '加载训练详情失败');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const openEditModal = (version: API.TrainingExperimentVersion) => {
    setEditingVersion(version);
    setParamsText(prettyJson(version.hyperParams));
    setRemarkText(version.remark || '');
  };

  const handleSaveParams = async () => {
    if (!editingVersion?.experimentId || editingVersion.versionNo === undefined) return;
    let hyperParams: Record<string, any>;
    try {
      hyperParams = JSON.parse(paramsText);
    } catch {
      message.error('超参数必须是合法 JSON');
      return;
    }
    setSaving(true);
    try {
      await updateExperimentHyperParams(
        editingVersion.experimentId,
        editingVersion.versionNo,
        {
          hyperParams,
          remark: remarkText,
        },
        { skipErrorHandler: true },
      );
      message.success('超参数已更新');
      setEditingVersion(null);
      await loadDetail();
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '更新超参数失败');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<API.TrainingExperimentVersion> = [
    {
      title: '版本',
      dataIndex: 'versionNo',
      render: (value) => `v${value}`,
    },
    {
      title: '模型版本 ID',
      dataIndex: 'modelVersionId',
      ellipsis: true,
      render: (value) => <Typography.Text copyable>{value}</Typography.Text>,
    },
    {
      title: '数据集版本 ID',
      dataIndex: 'datasetVersionId',
      ellipsis: true,
      render: (value) => <Typography.Text copyable>{value}</Typography.Text>,
    },
    {
      title: '代码版本',
      dataIndex: 'codeVersionId',
      ellipsis: true,
      render: (value) => <Typography.Text copyable>{value}</Typography.Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value) => getStatusTag(value),
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      render: (value) => value || '-',
    },
    {
      title: '操作',
      key: 'action',
      render: (_, record) => (
        <Button type="link" onClick={() => openEditModal(record)}>
          修改超参数
        </Button>
      ),
    },
  ];

  return (
    <PageContainer title="训练实验详情" onBack={() => history.push('/task/list')}>
      <Card title="实验信息" loading={loading} style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="任务名称">{taskInfo?.name || '-'}</Descriptions.Item>
          <Descriptions.Item label="实验 ID">
            <Typography.Text copyable={Boolean(taskInfo?.experimentId)}>
              {taskInfo?.experimentId || '-'}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="当前版本">v{taskInfo?.versionNo ?? '-'}</Descriptions.Item>
          <Descriptions.Item label="状态">{getStatusTag(taskInfo?.status)}</Descriptions.Item>
          <Descriptions.Item label="模型版本 ID">
            <Typography.Text copyable={Boolean(taskInfo?.modelVersionId)}>
              {taskInfo?.modelVersionId || '-'}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="数据集版本 ID">
            <Typography.Text copyable={Boolean(taskInfo?.datasetVersionId)}>
              {taskInfo?.datasetVersionId || '-'}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="代码版本">
            <Typography.Text copyable={Boolean(taskInfo?.codeVersionId)}>
              {taskInfo?.codeVersionId || '-'}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{taskInfo?.createdAt || '-'}</Descriptions.Item>
          <Descriptions.Item label="备注" span={2}>{taskInfo?.remark || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="当前超参数" style={{ marginBottom: 16 }}>
        <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{prettyJson(taskInfo?.hyperParams)}</pre>
      </Card>

      <Card title="实验版本历史">
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={versions}
          expandable={{
            expandedRowRender: (record) => (
              <Space direction="vertical" style={{ width: '100%' }}>
                <Typography.Text strong>超参数</Typography.Text>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{prettyJson(record.hyperParams)}</pre>
                <Typography.Text type="secondary">备注：{record.remark || '-'}</Typography.Text>
              </Space>
            ),
          }}
          pagination={{ pageSize: 5 }}
        />
      </Card>

      <Modal
        title={`修改实验版本 v${editingVersion?.versionNo ?? ''} 超参数`}
        open={Boolean(editingVersion)}
        onCancel={() => setEditingVersion(null)}
        onOk={handleSaveParams}
        confirmLoading={saving}
        width={760}
      >
        <Typography.Paragraph type="secondary">
          将更新该 experimentId 下指定版本的超参数配置。
        </Typography.Paragraph>
        <Input.TextArea
          rows={12}
          value={paramsText}
          onChange={(event) => setParamsText(event.target.value)}
        />
        <Input.TextArea
          rows={3}
          value={remarkText}
          onChange={(event) => setRemarkText(event.target.value)}
          placeholder="修改说明（可选）"
          style={{ marginTop: 12 }}
        />
      </Modal>
    </PageContainer>
  );
};

export default TaskDetail;
