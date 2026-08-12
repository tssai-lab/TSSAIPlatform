import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess, useModel } from '@umijs/max';
import {
  Alert,
  Button,
  Drawer,
  Dropdown,
  Form,
  Input,
  Modal,
  message,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import { isTrainingCodeAutoApproveEnabled } from '@/constants/trainingCode';
import type { CodeVersionListItem } from '@/services/code';
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
import { formatDisplayDateTime } from '@/utils/formatDateTime';
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

function riskLevelTag(level?: string) {
  const v = String(level || '').toUpperCase();
  if (v === 'HIGH') return <Tag color="error">HIGH</Tag>;
  if (v === 'MEDIUM') return <Tag color="warning">MEDIUM</Tag>;
  if (v === 'LOW') return <Tag color="success">LOW</Tag>;
  if (v === 'UNKNOWN') return <Tag>UNKNOWN</Tag>;
  return <Tag>{level || '-'}</Tag>;
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

function manualRecordToRow(
  record: PendingCodeVersionRecord,
): CodeVersionListItem {
  return {
    codeVersionId: record.codeVersionId,
    codeAssetId: '',
    codeAssetName: record.codeAssetName || '',
    version: '',
    fileName: record.fileName || '',
    trainingProfile: record.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
    approvalStatus: record.approvalStatus || 'PENDING',
    status: 'READY',
    submittedAt: record.uploadedAt,
  };
}

const TrainingCodePending: React.FC = () => {
  const access = useAccess();
  const { initialState } = useModel('@@initialState');
  const actionRef = useRef<ActionType | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm] = Form.useForm();
  const [adding, setAdding] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<CodeVersionListItem | null>(
    null,
  );
  const [rejectForm] = Form.useForm();
  const [rejecting, setRejecting] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(false);
  const [findingsLoading, setFindingsLoading] = useState(false);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [findingsTitle, setFindingsTitle] = useState('');

  useEffect(() => {
    if (!access.isAdmin) {
      history.replace('/403');
    }
  }, [access.isAdmin]);

  const requestList = async (params: {
    current?: number;
    pageSize?: number;
    riskLevel?: string;
    keyword?: string;
  }) => {
    const current = params.current ?? 1;
    const pageSize = params.pageSize ?? 10;

    let remote: CodeVersionListItem[] = [];
    let total = 0;
    try {
      const res = await fetchPendingCodeReviewTasks(
        {
          current,
          pageSize,
          riskLevel: params.riskLevel?.trim() || undefined,
          keyword: params.keyword?.trim() || undefined,
        },
        { skipErrorHandler: true },
      );
      remote = Array.isArray(res?.data) ? res.data : [];
      total = res?.total ?? remote.length;
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '加载待审核队列失败'));
    }

    // 仅合并手工登记、且不在远端队列中的条目（第一页展示）
    const remoteIds = new Set(remote.map((item) => item.codeVersionId));
    const manualOnly =
      current === 1
        ? listPendingCodeVersions()
            .filter((item) => item.source === 'manual')
            .filter((item) => {
              const status = String(
                item.approvalStatus || 'PENDING',
              ).toUpperCase();
              return status === 'PENDING' && !remoteIds.has(item.codeVersionId);
            })
            .map(manualRecordToRow)
        : [];

    const data = [...manualOnly, ...remote];
    return {
      data,
      success: true,
      total: total + manualOnly.length,
    };
  };

  const handleApprove = async (record: CodeVersionListItem) => {
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
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '审核失败'));
    }
  };

  const openReject = (record: CodeVersionListItem) => {
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
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '拒绝失败'));
    } finally {
      setRejecting(false);
    }
  };

  const handleRescan = async (record: CodeVersionListItem) => {
    try {
      await rescanCodeReviewTask(record.codeVersionId, {
        skipErrorHandler: true,
      });
      message.success('已触发风险重扫');
      actionRef.current?.reload();
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '重扫失败'));
    }
  };

  const handleUpgrade = async (record: CodeVersionListItem) => {
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
    } catch (error: unknown) {
      message.error(getApiErrorMessage(error, '制品升级失败'));
    }
  };

  const handleOpenFindings = async (record: CodeVersionListItem) => {
    setFindingsTitle(record.codeAssetName || record.codeVersionId);
    setFindingsOpen(true);
    setFindingsLoading(true);
    setFindings([]);
    try {
      const res = await fetchAdminCodeFindings(record.codeVersionId, {
        skipErrorHandler: true,
      });
      setFindings(res.data || []);
    } catch (error: unknown) {
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

  const columns: ProColumns<CodeVersionListItem>[] = [
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
      width: 200,
      render: (_, r) => r.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
    },
    {
      title: '校验',
      dataIndex: 'validationStatus',
      width: 90,
      hideInSearch: true,
      render: (_, r) => r.validationStatus || '-',
    },
    {
      title: '风险等级',
      dataIndex: 'riskLevel',
      width: 100,
      valueType: 'select',
      valueEnum: {
        LOW: { text: 'LOW' },
        MEDIUM: { text: 'MEDIUM' },
        HIGH: { text: 'HIGH' },
        UNKNOWN: { text: 'UNKNOWN' },
      },
      render: (_, r) => riskLevelTag(r.riskLevel),
    },
    {
      title: '风险扫描',
      dataIndex: 'riskStatus',
      width: 110,
      hideInSearch: true,
      render: (_, r) => r.riskStatus || '-',
    },
    {
      title: '审核状态',
      dataIndex: 'approvalStatus',
      width: 110,
      hideInSearch: true,
      render: (_, r) => approvalTag(r.approvalStatus),
    },
    {
      title: '提交时间',
      dataIndex: 'submittedAt',
      width: 180,
      hideInSearch: true,
      render: (_, r) => formatDisplayDateTime(r.submittedAt),
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
      width: 220,
      fixed: 'right',
      hideInSearch: true,
      render: (_, record) => (
        <Space size={0} style={{ whiteSpace: 'nowrap' }}>
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
          <Dropdown
            menu={{
              items: [
                {
                  key: 'findings',
                  label: 'Findings',
                  onClick: () => handleOpenFindings(record),
                },
                {
                  key: 'rescan',
                  label: '重扫',
                  onClick: () => {
                    Modal.confirm({
                      title: '触发风险重扫？',
                      content: '会生成新风险证据，已批准版本可能回到 PENDING。',
                      okText: '重扫',
                      onOk: () => handleRescan(record),
                    });
                  },
                },
                {
                  key: 'upgrade',
                  label: '制品升级',
                  onClick: () => {
                    Modal.confirm({
                      title: '执行制品升级？',
                      content: '仅用于历史路径迁移，成功后需重新校验/审核。',
                      okText: '升级',
                      onOk: () => handleUpgrade(record),
                    });
                  },
                },
              ],
            }}
          >
            <Button type="link">更多</Button>
          </Dropdown>
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
      subTitle={
        isTrainingCodeAutoApproveEnabled()
          ? '当前默认自动审核；本页保留通过/拒绝/Findings/重扫/制品升级，供运维与异常兜底'
          : '处理 PENDING 版本：通过 / 拒绝 / Findings / 重扫 / 制品升级'
      }
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
        type={isTrainingCodeAutoApproveEnabled() ? 'warning' : 'info'}
        showIcon
        style={{ marginBottom: 16 }}
        message="说明"
        description={
          <span>
            {isTrainingCodeAutoApproveEnabled() ? (
              <>
                当前系统配置中「训练代码管理员审核」为关闭：日常上传/发布会自动审核通过。
                本页仍保留完整人工审核与运维能力；若要启用强制人工审核，请到{' '}
                <a onClick={() => history.push('/system/config')}>
                  系统管理 · 系统配置
                </a>{' '}
                打开该开关。{' '}
              </>
            ) : (
              <>
                当前已开启「训练代码管理员审核」，新上传/发布的版本需在本页人工处理。{' '}
              </>
            )}
            列表来自{' '}
            <Typography.Text code>
              GET /api/v2/admin/code-review-tasks
            </Typography.Text>
            ；通过/拒绝会携带四个 expected*
            审批证据。重扫与制品升级为运维操作。当前管理员：
            {initialState?.currentUser?.name ||
              initialState?.currentUser?.userid ||
              '-'}
          </span>
        }
      />
      <ProTable<CodeVersionListItem>
        actionRef={actionRef}
        columns={columns}
        request={requestList}
        rowKey="codeVersionId"
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
        scroll={{ x: 1400 }}
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
