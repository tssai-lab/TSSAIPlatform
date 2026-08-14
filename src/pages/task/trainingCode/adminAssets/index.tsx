import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import {
  Button,
  Col,
  Drawer,
  Empty,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Tree,
  Typography,
} from 'antd';
import type { DataNode } from 'antd/es/tree';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { V2AdminCodeAsset, V2CodeVersion } from '@/services/platform';
import {
  deleteAdminCodeAsset,
  extractV2FileText,
  fetchAllV2CodeTreeFiles,
  getAdminCodeAsset,
  getAdminCodeVersionFileContent,
  getAdminCodeVersionTree,
  getAdminCodeWorkspaceFileContent,
  getAdminCodeWorkspaceTree,
  listAdminCodeAssets,
  listAdminCodeAssetVersions,
  normalizeAdminCodeAssetPage,
  openAdminCodeAssetWorkspace,
  patchAdminCodeAsset,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  buildCodeFileTreeData,
  collectCodeFileTreeExpandedKeys,
} from '@/utils/codeFileTree';
import { formatDisplayDateTime } from '@/utils/formatDateTime';

type BrowseMode = 'workspace' | 'version';

type BrowseState = {
  mode: BrowseMode;
  title: string;
  subtitle?: string;
  /** 工作区 id 或版本 id */
  targetId: string;
};

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
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsAssetName, setVersionsAssetName] = useState('');
  const [versions, setVersions] = useState<V2CodeVersion[]>([]);

  const [browse, setBrowse] = useState<BrowseState | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseFiles, setBrowseFiles] = useState<
    Array<{ path: string; fileName?: string; sizeBytes?: number }>
  >([]);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);

  useEffect(() => {
    if (!access.isAdmin) {
      history.replace('/403');
    }
  }, [access.isAdmin]);

  const treeData = useMemo(
    () => buildCodeFileTreeData(browseFiles),
    [browseFiles],
  );

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

  const loadBrowseTree = async (state: BrowseState) => {
    setBrowseLoading(true);
    setBrowseFiles([]);
    setSelectedPath(undefined);
    setPreviewContent('');
    try {
      const files = await fetchAllV2CodeTreeFiles(
        (prefix) =>
          state.mode === 'workspace'
            ? getAdminCodeWorkspaceTree(state.targetId, prefix, {
                skipErrorHandler: true,
              })
            : getAdminCodeVersionTree(state.targetId, prefix, {
                skipErrorHandler: true,
              }),
        { maxDepth: 8 },
      );
      setBrowseFiles(files);
      const data = buildCodeFileTreeData(files);
      setExpandedKeys(collectCodeFileTreeExpandedKeys(data));
      if (files[0]?.path) {
        await loadBrowseFile(state, files[0].path);
      }
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '加载目录失败'));
    } finally {
      setBrowseLoading(false);
    }
  };

  const loadBrowseFile = async (state: BrowseState, path: string) => {
    setSelectedPath(path);
    setPreviewLoading(true);
    try {
      const res =
        state.mode === 'workspace'
          ? await getAdminCodeWorkspaceFileContent(state.targetId, path, {
              skipErrorHandler: true,
            })
          : await getAdminCodeVersionFileContent(state.targetId, path, {
              skipErrorHandler: true,
            });
      setPreviewContent(extractV2FileText(res as any) || '');
    } catch (e: unknown) {
      setPreviewContent('');
      message.error(getApiErrorMessage(e, '读取文件失败'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const openWorkspaceBrowse = async (record: V2AdminCodeAsset) => {
    const assetId = record.assetId || record.id;
    if (!assetId) return;
    try {
      const ws = await openAdminCodeAssetWorkspace(assetId, {
        skipErrorHandler: true,
      });
      const workspaceId = ws?.id?.trim();
      if (!workspaceId) {
        message.error('工作区已创建，但未返回 workspace id');
        return;
      }
      const state: BrowseState = {
        mode: 'workspace',
        title: `工作区 · ${record.name || assetId}`,
        subtitle: `workspaceId=${workspaceId} · revision=${ws.revision ?? '-'} · base=${ws.baseVersionId || '-'}（只读浏览，不授予训练消费权）`,
        targetId: workspaceId,
      };
      setBrowse(state);
      await loadBrowseTree(state);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '打开工作区失败'));
    }
  };

  const openVersions = async (record: V2AdminCodeAsset) => {
    const assetId = record.assetId || record.id;
    if (!assetId) return;
    setVersionsAssetName(record.name || assetId);
    setVersionsOpen(true);
    setVersionsLoading(true);
    setVersions([]);
    try {
      const list = await listAdminCodeAssetVersions(assetId, {
        skipErrorHandler: true,
      });
      setVersions(Array.isArray(list) ? list : []);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '加载版本失败'));
    } finally {
      setVersionsLoading(false);
    }
  };

  const openVersionBrowse = async (version: V2CodeVersion) => {
    const versionId = version.versionId || version.id || version.codeVersionId;
    if (!versionId) {
      message.error('缺少 versionId');
      return;
    }
    const label = version.versionLabel || version.version || versionId;
    const state: BrowseState = {
      mode: 'version',
      title: `版本快照 · ${label}`,
      subtitle: `versionId=${versionId} · 生命周期=${version.status || '-'} · 审核=${version.approvalStatus || '-'}（只读）`,
      targetId: versionId,
    };
    setBrowse(state);
    await loadBrowseTree(state);
  };

  const columns: ProColumns<V2AdminCodeAsset>[] = [
    {
      title: '资产名称',
      dataIndex: 'name',
      width: 200,
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
            <Button type="link" onClick={() => void openVersions(record)}>
              版本
            </Button>
            <Button
              type="link"
              onClick={() => void openWorkspaceBrowse(record)}
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

  const versionColumns = [
    {
      title: '版本标签',
      dataIndex: 'versionLabel',
      width: 120,
      ellipsis: true,
      render: (_: unknown, r: V2CodeVersion) =>
        r.versionLabel || r.version || '-',
    },
    {
      title: '生命周期',
      dataIndex: 'status',
      width: 100,
      render: (v: string | undefined) => <Tag>{v || '-'}</Tag>,
    },
    {
      title: '审核',
      dataIndex: 'approvalStatus',
      width: 110,
      render: (v: string | undefined) => {
        const s = String(v || '').toUpperCase();
        if (s === 'APPROVED') return <Tag color="success">APPROVED</Tag>;
        if (s === 'PENDING') return <Tag color="warning">PENDING</Tag>;
        if (s === 'REJECTED') return <Tag color="error">REJECTED</Tag>;
        return <Tag>{v || '-'}</Tag>;
      },
    },
    {
      title: '校验',
      dataIndex: 'validationStatus',
      width: 100,
      render: (v: string | undefined) => v || '-',
    },
    {
      title: 'versionId',
      dataIndex: 'versionId',
      ellipsis: true,
      render: (_: unknown, r: V2CodeVersion) =>
        r.versionId || r.id || r.codeVersionId || '-',
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, r: V2CodeVersion) => (
        <Button type="link" onClick={() => void openVersionBrowse(r)}>
          查看文件
        </Button>
      ),
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
        scroll={{ x: 960 }}
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
            const pageData = normalizeAdminCodeAssetPage(res);
            return {
              data: pageData.items,
              success: true,
              total: pageData.total,
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
        title={`资产版本 · ${versionsAssetName}`}
        open={versionsOpen}
        onCancel={() => setVersionsOpen(false)}
        footer={null}
        width={860}
        destroyOnClose
      >
        <Table<V2CodeVersion>
          size="small"
          loading={versionsLoading}
          rowKey={(r) =>
            r.versionId || r.id || r.codeVersionId || String(Math.random())
          }
          dataSource={versions}
          pagination={false}
          locale={{ emptyText: '暂无版本' }}
          columns={versionColumns as any}
          scroll={{ x: 720 }}
        />
      </Modal>

      <Drawer
        title={browse?.title || '浏览'}
        open={Boolean(browse)}
        onClose={() => {
          setBrowse(null);
          setBrowseFiles([]);
          setPreviewContent('');
          setSelectedPath(undefined);
        }}
        width={960}
        destroyOnClose
      >
        {browse?.subtitle ? (
          <Typography.Paragraph type="secondary" style={{ marginTop: 0 }}>
            {browse.subtitle}
          </Typography.Paragraph>
        ) : null}
        <Spin spinning={browseLoading}>
          {browseFiles.length === 0 && !browseLoading ? (
            <Empty description="工作区/版本下暂无文件" />
          ) : (
            <Row gutter={16}>
              <Col span={8}>
                <Typography.Text strong>文件目录</Typography.Text>
                <div
                  style={{ marginTop: 8, maxHeight: '70vh', overflow: 'auto' }}
                >
                  <Tree
                    treeData={treeData as DataNode[]}
                    selectedKeys={selectedPath ? [selectedPath] : []}
                    expandedKeys={expandedKeys}
                    onExpand={(keys) => setExpandedKeys(keys)}
                    onSelect={(keys, info) => {
                      if (!browse || !info.node.isLeaf) return;
                      const path = String(keys[0] || '');
                      if (!path) return;
                      void loadBrowseFile(browse, path);
                    }}
                  />
                </div>
              </Col>
              <Col span={16}>
                <Typography.Text strong>
                  预览{selectedPath ? ` · ${selectedPath}` : ''}
                </Typography.Text>
                <Spin spinning={previewLoading}>
                  <pre
                    style={{
                      marginTop: 8,
                      padding: 12,
                      background: '#fafafa',
                      border: '1px solid #f0f0f0',
                      borderRadius: 6,
                      maxHeight: '70vh',
                      overflow: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      minHeight: 200,
                    }}
                  >
                    {previewContent || '选择左侧文件查看内容'}
                  </pre>
                </Spin>
              </Col>
            </Row>
          )}
        </Spin>
      </Drawer>
    </PageContainer>
  );
};

export default AdminCodeAssetsPage;
