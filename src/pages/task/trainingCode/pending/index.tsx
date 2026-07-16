import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess, useModel } from '@umijs/max';
import {
  Alert,
  Button,
  Drawer,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import {
  approveCodeVersion,
  CONSISTENCY_TRAINING_PROFILE,
  checkCodeVersionForTraining,
  fetchAdminCodeFindings,
  fetchPendingCodeReviewTasks,
  rejectCodeVersion,
  rescanCodeReviewTask,
  upgradeCodeArtifact,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import type { PendingCodeVersionRecord } from '@/utils/pendingCodeVersions';
import {
  listPendingCodeVersions,
  markPendingCodeApproved,
  removePendingCodeVersion,
  upsertPendingCodeVersion,
} from '@/utils/pendingCodeVersions';

function approvalTag(status?: string) {
  if (status === 'APPROVED') {
    return <Tag color="success">APPROVED</Tag>;
  }
  if (status === 'PENDING') {
    return <Tag color="warning">PENDING</Tag>;
  }
  if (status === 'REJECTED') {
    return <Tag color="error">REJECTED</Tag>;
  }
  return <Tag>{status || 'PENDING'}</Tag>;
}

type FindingRow = {
  id?: string;
  ruleId?: string;
  severity?: string;
  category?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  description?: string;
};

const TrainingCodePending: React.FC = () => {
  const access = useAccess();
  const { initialState } = useModel('@@initialState');
  const actionRef = useRef<ActionType>();
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [adding, setAdding] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] =
    useState<PendingCodeVersionRecord | null>(null);
  const [rejectForm] = Form.useForm();
  const [rejecting, setRejecting] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [findingsTitle, setFindingsTitle] = useState('');

  useEffect(() => {
    if (!access.isAdmin) {
      message.warning('仅管理员可访问训练代码待审核');
      history.push('/task/code/list');
    }
  }, [access.isAdmin]);

  const requestList = async () => {
    const local = listPendingCodeVersions().filter((item) => {
      const status = String(item.approvalStatus || 'PENDING').toUpperCase();
      return status !== 'APPROVED' && status !== 'REJECTED';
    });

    let remote: PendingCodeVersionRecord[] = [];
    try {
      const res = await fetchPendingCodeReviewTasks(
        { current: 1, pageSize: 100 },
        { skipErrorHandler: true },
      );
      const rows = Array.isArray(res?.data) ? res.data : [];
      remote = rows
        .filter((item) => {
          const status = String(item.approvalStatus || 'PENDING').toUpperCase();
          return status === 'PENDING';
        })
        .map((item) => ({
          codeVersionId: item.codeVersionId,
          codeAssetName: item.codeAssetName,
          fileName: item.fileName,
          trainingProfile: item.trainingProfile,
          approvalStatus: 'PENDING',
          source: 'api' as const,
          uploadedAt: item.submittedAt,
        }));
      remote.forEach((item) => {
        upsertPendingCodeVersion(item);
      });
    } catch {
      // ignore
    }

    const merged = new Map<string, PendingCodeVersionRecord>();
    [...remote, ...local].forEach((item) => {
      if (!item.codeVersionId) return;
      const prev = merged.get(item.codeVersionId);
      merged.set(item.codeVersionId, {
        ...prev,
        ...item,
        approvalStatus:
          item.source === 'manual' || item.source === 'upload'
            ? item.approvalStatus || 'PENDING'
            : prev?.approvalStatus || item.approvalStatus || 'PENDING',
      });
    });
    local.forEach((item) => {
      merged.set(item.codeVersionId, {
        ...merged.get(item.codeVersionId),
        ...item,
        approvalStatus: 'PENDING',
      });
    });

    const data = [...merged.values()];
    return { data, success: true, total: data.length };
  };

  const handleApprove = async (record: PendingCodeVersionRecord) => {
    try {
      try {
        await checkCodeVersionForTraining(
          record.codeVersionId,
          record.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
          { skipErrorHandler: true },
        );
      } catch {
        // 校验失败时仍尝试审核
      }
      const res = await approveCodeVersion(record.codeVersionId, {
        skipErrorHandler: true,
      });
      if (res?.success === false) {
        message.error(res?.errorMessage || '审核失败');
        return;
      }
      markPendingCodeApproved(record.codeVersionId);
      message.success('审核通过，已可在「训练代码」列表中查看');
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '审核失败'));
    }
  };

  const openReject = (record: PendingCodeVersionRecord) => {
    setRejectTarget(record);
    rejectForm.resetFields();
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    const values = await rejectForm.validateFields();
    setRejecting(true);
    try {
      const res = await rejectCodeVersion(
        rejectTarget.codeVersionId,
        String(values.reason || '').trim(),
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        message.error(res?.errorMessage || '拒绝失败');
        return;
      }
      removePendingCodeVersion(rejectTarget.codeVersionId);
      message.success('已拒绝该训练代码版本');
      setRejectOpen(false);
      setRejectTarget(null);
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '拒绝失败'));
    } finally {
      setRejecting(false);
    }
  };

  const handleRescan = async (record: PendingCodeVersionRecord) => {
    try {
      await rescanCodeReviewTask(record.codeVersionId, {
        skipErrorHandler: true,
      });
      message.success('已触发风险重扫');
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '重扫失败'));
    }
  };

  const handleUpgrade = async (record: PendingCodeVersionRecord) => {
    try {
      const res = await upgradeCodeArtifact(record.codeVersionId, {
        skipErrorHandler: true,
      });
      message.success(
        res?.data?.upgraded === false
          ? '制品已是规范路径，无需升级'
          : '制品升级完成，请重新审核',
      );
      actionRef.current?.reload();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '制品升级失败'));
    }
  };

  const handleOpenFindings = async (record: PendingCodeVersionRecord) => {
    setFindingsTitle(record.codeAssetName || record.codeVersionId);
    setFindingsOpen(true);
    setFindingsLoading(true);
    setFindings([]);
    try {
      const res = await fetchAdminCodeFindings(record.codeVersionId, {
        skipErrorHandler: true,
      });
      setFindings(res.data || []);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, 'Findings 加载失败'));
    } finally {
      setFindingsLoading(false);
    }
  };

  const handleManualAdd = async () => {
    const values = await addForm.validateFields();
    setAdding(true);
    try {
      const codeVersionId = String(values.codeVersionId || '').trim();
      upsertPendingCodeVersion({
        codeVersionId,
        codeAssetName: values.codeAssetName?.trim(),
        fileName: values.fileName?.trim(),
        trainingProfile:
          values.trainingProfile?.trim() || CONSISTENCY_TRAINING_PROFILE,
        approvalStatus: 'PENDING',
        source: 'manual',
        uploadedAt: new Date().toISOString(),
      });
      message.success('已加入待审核列表');
      setAddOpen(false);
      addForm.resetFields();
      actionRef.current?.reload();
    } finally {
      setAdding(false);
    }
  };

  const columns: ProColumns<PendingCodeVersionRecord>[] = [
    {
      title: '代码名称',
      dataIndex: 'codeAssetName',
      ellipsis: true,
      render: (_, r) => r.codeAssetName || '-',
    },
    {
      title: '文件名',
      dataIndex: 'fileName',
      ellipsis: true,
      hideInSearch: true,
      render: (_, r) => r.fileName || '-',
    },
    {
      title: '训练方案',
      dataIndex: 'trainingProfile',
      ellipsis: true,
      hideInSearch: true,
      width: 220,
      render: (_, r) => r.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
    },
    {
      title: '审核状态',
      dataIndex: 'approvalStatus',
      width: 110,
      hideInSearch: true,
      render: (_, r) => approvalTag(r.approvalStatus),
    },
    {
      title: '登记时间',
      dataIndex: 'uploadedAt',
      width: 180,
      hideInSearch: true,
      render: (_, r) => r.uploadedAt || '-',
    },
    {
      title: 'codeVersionId',
      dataIndex: 'codeVersionId',
      hideInSearch: true,
      width: 220,
      render: (_, r) => (
        <Typography.Text copyable code style={{ fontSize: 12 }}>
          {r.codeVersionId}
        </Typography.Text>
      ),
    },
    {
      title: '操作',
      key: 'action',
      width: 360,
      hideInSearch: true,
      render: (_, record) => (
        <Space size={0} wrap>
          <Button
            type="link"
            style={{ paddingLeft: 0 }}
            onClick={() => handleApprove(record)}
          >
            通过
          </Button>
          <Button type="link" danger onClick={() => openReject(record)}>
            拒绝
          </Button>
          <Button type="link" onClick={() => handleOpenFindings(record)}>
            Findings
          </Button>
          <Popconfirm
            title="触发风险重扫？"
            description="会生成新风险证据，已批准版本可能回到 PENDING。"
            onConfirm={() => handleRescan(record)}
          >
            <Button type="link">重扫</Button>
          </Popconfirm>
          <Popconfirm
            title="执行制品升级？"
            description="仅用于历史路径迁移，成功后需重新校验/审核。"
            onConfirm={() => handleUpgrade(record)}
          >
            <Button type="link">制品升级</Button>
          </Popconfirm>
          <Button
            type="link"
            onClick={() =>
              history.push(
                `/task/code/detail/${encodeURIComponent(record.codeVersionId)}`,
                { record, from: 'pending' },
              )
            }
          >
            查看
          </Button>
        </Space>
      ),
    },
  ];

  if (!access.isAdmin) {
    return null;
  }

  return (
    <PageContainer
      title="训练代码待审核"
      subTitle="处理 PENDING 版本：通过 / 拒绝 / Findings / 重扫 / 制品升级"
      breadcrumb={{
        items: [
          {
            title: (
              <a onClick={() => history.push('/task/code/list')}>训练代码</a>
            ),
          },
          { title: '待审核' },
        ],
      }}
      extra={[
        <Button key="add" onClick={() => setAddOpen(true)}>
          手工登记 codeVersionId
        </Button>,
        <Button
          key="list"
          type="primary"
          onClick={() => history.push('/task/code/list')}
        >
          训练代码
        </Button>,
      ]}
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message="说明"
        description={
          <span>
            待审列表优先走管理员 V2 审核队列；「拒绝」需填写原因并携带审批证据。
            「重扫 / 制品升级」为运维操作。当前管理员：
            {initialState?.currentUser?.name ||
              initialState?.currentUser?.userid ||
              '-'}
          </span>
        }
      />
      <ProTable<PendingCodeVersionRecord>
        actionRef={actionRef}
        columns={columns}
        request={requestList}
        rowKey="codeVersionId"
        search={false}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1200 }}
        toolBarRender={() => [
          <Button key="reload" onClick={() => actionRef.current?.reload()}>
            刷新
          </Button>,
        ]}
      />

      <Modal
        title="手工登记待审核代码"
        open={addOpen}
        onCancel={() => setAddOpen(false)}
        onOk={handleManualAdd}
        confirmLoading={adding}
        destroyOnClose
      >
        <Form form={addForm} layout="vertical">
          <Form.Item
            name="codeVersionId"
            label="codeVersionId"
            rules={[{ required: true, message: '请输入 codeVersionId' }]}
          >
            <Input placeholder="例如：code-version-xxxx" />
          </Form.Item>
          <Form.Item name="codeAssetName" label="代码名称（可选）">
            <Input />
          </Form.Item>
          <Form.Item name="fileName" label="文件名（可选）">
            <Input />
          </Form.Item>
          <Form.Item
            name="trainingProfile"
            label="训练方案"
            initialValue={CONSISTENCY_TRAINING_PROFILE}
          >
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="拒绝训练代码版本"
        open={rejectOpen}
        onCancel={() => setRejectOpen(false)}
        onOk={handleReject}
        confirmLoading={rejecting}
        okText="确认拒绝"
        okButtonProps={{ danger: true }}
        destroyOnClose
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item
            name="reason"
            label="拒绝原因"
            rules={[{ required: true, message: '请填写拒绝原因' }]}
          >
            <Input.TextArea rows={4} placeholder="说明拒绝理由（必填）" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`风险 Findings · ${findingsTitle}`}
        open={findingsOpen}
        onClose={() => setFindingsOpen(false)}
        width={720}
      >
        <Table<FindingRow>
          size="small"
          loading={findingsLoading}
          rowKey={(r, idx) => r.id || `${r.ruleId}-${idx}`}
          dataSource={findings}
          pagination={false}
          locale={{ emptyText: '暂无 findings' }}
          columns={[
            { title: '规则', dataIndex: 'ruleId', width: 140, ellipsis: true },
            { title: '等级', dataIndex: 'severity', width: 90 },
            {
              title: '类别',
              dataIndex: 'category',
              width: 100,
              ellipsis: true,
            },
            {
              title: '位置',
              key: 'loc',
              ellipsis: true,
              render: (_, r) =>
                `${r.filePath || '-'}${
                  r.lineStart != null ? `:${r.lineStart}` : ''
                }`,
            },
            {
              title: '说明',
              dataIndex: 'description',
              ellipsis: true,
            },
          ]}
        />
      </Drawer>
    </PageContainer>
  );
};

export default TrainingCodePending;
