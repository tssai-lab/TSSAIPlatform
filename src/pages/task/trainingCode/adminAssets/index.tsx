import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import {
  Button,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Space,
  Typography,
} from 'antd';
import React, { useEffect, useRef, useState } from 'react';
import type { V2AdminCodeAsset } from '@/services/platform';
import {
  deleteAdminCodeAsset,
  getAdminCodeAsset,
  listAdminCodeAssets,
  listAdminCodeAssetVersions,
  openAdminCodeAssetWorkspace,
  patchAdminCodeAsset,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDisplayDateTime } from '@/utils/formatDateTime';

/**
 * 管理员跨 owner 代码资产管理（/api/v2/admin/code-assets）
 * 支持服务端 sortBy/sortDirection；不授予训练消费权。
 */
const AdminCodeAssetsPage: React.FC = () => {
  const access = useAccess();
  const actionRef = useRef<ActionType>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<V2AdminCodeAsset | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [form] = Form.useForm();
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [versions, setVersions] = useState<
    Array<{ versionId?: string; versionLabel?: string; status?: string }>
  >([]);

  useEffect(() => {
    if (!access.isAdmin) {
      history.replace('/403');
    }
  }, [access.isAdmin]);

  const openEdit = async (record: V2AdminCodeAsset) => {
    try {
      const detail = await getAdminCodeAsset(record.assetId || record.id!, {
        skipErrorHandler: true,
      });
      setEditing(detail);
      form.setFieldsValue({
        name: detail.name,
        trainingProfile: detail.trainingProfile,
        purpose: detail.purpose,
        runtime: detail.runtime,
        entryScript: detail.entryScript,
        remark: detail.remark,
      });
      setEditOpen(true);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '加载资产失败'));
    }
  };

  const submitEdit = async () => {
    if (!editing?.assetId && !editing?.id) return;
    const assetId = editing.assetId || editing.id!;
    const values = await form.validateFields();
    setEditLoading(true);
    try {
      await patchAdminCodeAsset(
        assetId,
        {
          assetRevision: Number(editing.assetRevision ?? 0),
          name: values.name?.trim(),
          trainingProfile: values.trainingProfile?.trim(),
          purpose: values.purpose?.trim(),
          runtime: values.runtime?.trim(),
          entryScript: values.entryScript?.trim(),
          remark: values.remark?.trim(),
        },
        { skipErrorHandler: true },
      );
      message.success('资产已更新');
      setEditOpen(false);
      actionRef.current?.reload();
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '更新失败'));
    } finally {
      setEditLoading(false);
    }
  };

  const columns: ProColumns<V2AdminCodeAsset>[] = [
    {
      title: '资产名称',
      dataIndex: 'name',
      ellipsis: true,
      sorter: true,
    },
    {
      title: 'ownerUserId',
      dataIndex: 'ownerUserId',
      width: 160,
      ellipsis: true,
      sorter: true,
      hideInSearch: true,
    },
    {
      title: 'ownerUserId',
      dataIndex: 'ownerUserId',
      hideInTable: true,
      fieldProps: { placeholder: '按 owner 过滤' },
    },
    {
      title: 'trainingProfile',
      dataIndex: 'trainingProfile',
      width: 140,
      ellipsis: true,
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      valueType: 'dateTime',
      sorter: true,
      hideInSearch: true,
      render: (_, r) => formatDisplayDateTime(r.updatedAt) || '-',
    },
    {
      title: '创建时间',
      dataIndex: 'createdAt',
      width: 180,
      sorter: true,
      hideInSearch: true,
      hideInTable: true,
      render: (_, r) => formatDisplayDateTime(r.createdAt) || '-',
    },
    {
      title: '关键词',
      dataIndex: 'keyword',
      hideInTable: true,
      fieldProps: { placeholder: '名称关键字' },
    },
    {
      title: '操作',
      valueType: 'option',
      width: 280,
      render: (_, record) => {
        const assetId = record.assetId || record.id;
        if (!assetId) return null;
        return (
          <Space size={0} wrap>
            <Button type="link" onClick={() => void openEdit(record)}>
              编辑
            </Button>
            <Button
              type="link"
              onClick={async () => {
                try {
                  const list = await listAdminCodeAssetVersions(assetId, {
                    skipErrorHandler: true,
                  });
                  setVersions(Array.isArray(list) ? list : []);
                  setVersionsOpen(true);
                } catch (e: unknown) {
                  message.error(getApiErrorMessage(e, '加载版本失败'));
                }
              }}
            >
              版本
            </Button>
            <Button
              type="link"
              onClick={async () => {
                try {
                  const ws = await openAdminCodeAssetWorkspace(assetId, {
                    skipErrorHandler: true,
                  });
                  message.success(
                    `已打开工作区 ${ws?.workspaceId || ''}（revision ${ws?.workspaceRevision ?? '-'}）`,
                  );
                } catch (e: unknown) {
                  message.error(getApiErrorMessage(e, '打开工作区失败'));
                }
              }}
            >
              打开工作区
            </Button>
            <Popconfirm
              title="确认软删除该代码资产？"
              onConfirm={async () => {
                try {
                  await deleteAdminCodeAsset(assetId, {
                    skipErrorHandler: true,
                  });
                  message.success('已删除');
                  actionRef.current?.reload();
                } catch (e: unknown) {
                  message.error(getApiErrorMessage(e, '删除失败'));
                }
              }}
            >
              <Button type="link" danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  return (
    <PageContainer
      title="代码资产管理（管理员）"
      subTitle="跨 owner 维护；不授予训练消费权。列表支持服务端排序。"
    >
      <ProTable<V2AdminCodeAsset>
        actionRef={actionRef}
        rowKey={(r) => r.assetId || r.id || r.name || String(Math.random())}
        columns={columns}
        search={{ labelWidth: 'auto' }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
        request={async (params, sort) => {
          const sortEntry = Object.entries(sort || {})[0];
          let sortBy: string = 'UPDATED_AT';
          let sortDirection: 'ASC' | 'DESC' = 'DESC';
          if (sortEntry) {
            const [field, order] = sortEntry;
            sortDirection = order === 'ascend' ? 'ASC' : 'DESC';
            if (field === 'name') sortBy = 'NAME';
            else if (field === 'ownerUserId') sortBy = 'OWNER_USER_ID';
            else if (field === 'createdAt') sortBy = 'CREATED_AT';
            else sortBy = 'UPDATED_AT';
          }
          // 后端 page 从 0 开始
          const page = Math.max(0, (params.current || 1) - 1);
          try {
            const res = await listAdminCodeAssets(
              {
                page,
                pageSize: params.pageSize || 20,
                keyword: params.keyword?.trim() || undefined,
                ownerUserId: params.ownerUserId?.trim() || undefined,
                trainingProfile: params.trainingProfile?.trim() || undefined,
                sortBy,
                sortDirection,
              },
              { skipErrorHandler: true },
            );
            const list = Array.isArray(res?.data) ? res.data : [];
            return {
              data: list,
              success: true,
              total: res?.total ?? list.length,
            };
          } catch (e: unknown) {
            message.error(getApiErrorMessage(e, '加载管理员代码资产失败'));
            return { data: [], success: false, total: 0 };
          }
        }}
      />

      <Modal
        title="编辑代码资产"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={() => void submitEdit()}
        confirmLoading={editLoading}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="trainingProfile" label="trainingProfile">
            <Input />
          </Form.Item>
          <Form.Item name="purpose" label="purpose">
            <Input />
          </Form.Item>
          <Form.Item name="runtime" label="runtime">
            <Input />
          </Form.Item>
          <Form.Item name="entryScript" label="entryScript">
            <Input />
          </Form.Item>
          <Form.Item name="remark" label="备注">
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="资产版本"
        open={versionsOpen}
        onCancel={() => setVersionsOpen(false)}
        footer={null}
        width={640}
      >
        {versions.length === 0 ? (
          <Typography.Text type="secondary">暂无版本</Typography.Text>
        ) : (
          versions.map((v) => (
            <div
              key={v.versionId || v.versionLabel}
              style={{ marginBottom: 8 }}
            >
              <Typography.Text>
                {v.versionLabel || v.versionId} · {v.status || '-'}
              </Typography.Text>
              {v.versionId && (
                <Button
                  type="link"
                  size="small"
                  onClick={() =>
                    history.push(
                      `/task/code/detail/${encodeURIComponent(v.versionId!)}`,
                    )
                  }
                >
                  打开详情
                </Button>
              )}
            </div>
          ))
        )}
      </Modal>
    </PageContainer>
  );
};

export default AdminCodeAssetsPage;
