import {
  CodeOutlined,
  CopyOutlined,
  DownloadOutlined,
  EditOutlined,
  FileAddOutlined,
  ReloadOutlined,
  SaveOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useLocation, useParams } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Empty,
  Form,
  Input,
  List,
  Modal,
  message,
  Popconfirm,
  Row,
  Space,
  Spin,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import CodeEditor from '@/components/CodeEditor';
import CodePreview from '@/components/CodePreview';
import type { CodeVersionDetail, CodeVersionListItem } from '@/services/code';
import { getCodeUserDisplayName } from '@/services/code';
import {
  abandonCodeWorkspace,
  archiveCodeVersion,
  createCodeWorkspaceFile,
  deleteCodeAsset,
  deleteCodeWorkspaceFile,
  deprecateCodeVersion,
  downloadCodeVersionZip,
  fetchCodeEditablePreview,
  getCodeVersionDetail,
  listCodeAssetVersions,
  moveCodeWorkspaceFile,
  previewCodeEditableFile,
  publishCodeWorkspaceDraft,
  saveCodeVersionFileAndPublish,
  updateCodeAssetMeta,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import { formatDisplayDateTime } from '@/utils/formatDateTime';
import { removePendingCodeVersion } from '@/utils/pendingCodeVersions';

function approvalTag(status?: string) {
  if (status === 'APPROVED') {
    return <Tag color="success">APPROVED</Tag>;
  }
  if (status === 'PENDING') {
    return <Tag color="warning">PENDING</Tag>;
  }
  return <Tag>{status || '-'}</Tag>;
}

function statusTag(status?: string) {
  if (status === 'READY') {
    return <Tag color="success">READY</Tag>;
  }
  return <Tag>{status || '-'}</Tag>;
}

function formatBytes(bytes?: number) {
  if (bytes == null || Number.isNaN(bytes)) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

type EditNameFormValues = {
  name: string;
};

type NewFileFormValues = {
  path: string;
  content?: string;
};

type RenameFileFormValues = {
  targetPath: string;
};

const TrainingCodeDetail: React.FC = () => {
  const { codeVersionId = '' } = useParams<{ codeVersionId: string }>();
  const location = useLocation();
  const locationState = location.state as
    | { record?: CodeVersionListItem; from?: 'pending' | 'list' }
    | undefined;
  const listRecord = locationState?.record;
  const fromPending = locationState?.from === 'pending';
  const backPath = fromPending ? '/task/code/pending' : '/task/code/list';

  const [meta, setMeta] = useState<CodeVersionDetail | null>(
    listRecord ? { ...listRecord } : null,
  );
  const [metaLoading, setMetaLoading] = useState(!listRecord);
  const [filesLoading, setFilesLoading] = useState(true);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [codeFiles, setCodeFiles] = useState<API.ModelCodeFile[]>([]);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [previewContent, setPreviewContent] = useState('');
  const [originalPreviewContent, setOriginalPreviewContent] = useState('');
  const [previewFileName, setPreviewFileName] = useState('');
  const [codePreviewVisible, setCodePreviewVisible] = useState(false);
  const [filesLoadError, setFilesLoadError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [deprecating, setDeprecating] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [abandoning, setAbandoning] = useState(false);
  const [fileOpLoading, setFileOpLoading] = useState(false);
  const [editNameOpen, setEditNameOpen] = useState(false);
  const [editNameSubmitting, setEditNameSubmitting] = useState(false);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [renameFileOpen, setRenameFileOpen] = useState(false);
  const [assetVersions, setAssetVersions] = useState<CodeVersionListItem[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  /** 是否存在打开中的工作区草稿（含文件增删改） */
  const [workspaceDraftOpen, setWorkspaceDraftOpen] = useState(false);

  const [editNameForm] = Form.useForm<EditNameFormValues>();
  const [newFileForm] = Form.useForm<NewFileFormValues>();
  const [renameFileForm] = Form.useForm<RenameFileFormValues>();

  const codeAssetId = meta?.codeAssetId?.trim();

  const loadMeta = useCallback(async () => {
    if (!codeVersionId) return;
    setMetaLoading(true);
    try {
      const res = await getCodeVersionDetail(codeVersionId, {
        skipErrorHandler: true,
      });
      if (res?.success === false) {
        if (!listRecord) {
          throw new Error(res?.errorMessage || '训练代码详情加载失败');
        }
        return;
      }
      if (res?.data) {
        setMeta((prev) => ({ ...prev, ...res.data }));
      }
    } catch (error: any) {
      if (!listRecord) {
        message.error(getApiErrorMessage(error, '训练代码详情加载失败'));
        setMeta(null);
      }
    } finally {
      setMetaLoading(false);
    }
  }, [codeVersionId, listRecord]);

  const loadAssetVersions = useCallback(async () => {
    if (!codeAssetId) {
      setAssetVersions([]);
      return;
    }
    setVersionsLoading(true);
    try {
      const res = await listCodeAssetVersions(codeAssetId, {
        skipErrorHandler: true,
      });
      setAssetVersions(Array.isArray(res?.data) ? res.data : []);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '版本列表加载失败'));
      setAssetVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [codeAssetId]);

  const loadPreview = useCallback(
    async (path: string) => {
      if (!codeVersionId || !path) return;
      setSelectedPath(path);
      setPreviewLoading(true);
      setPreviewContent('');
      setPreviewFileName(path);
      try {
        const res = await previewCodeEditableFile(
          {
            codeVersionId,
            codeAssetId: meta?.codeAssetId,
            path,
          },
          { skipErrorHandler: true },
        );
        const data = res?.data;
        const content = data?.content || '';
        setPreviewContent(content);
        setOriginalPreviewContent(content);
        setPreviewFileName(data?.fileName || data?.path || path);
      } catch (error: any) {
        message.error(getApiErrorMessage(error, '代码预览加载失败'));
      } finally {
        setPreviewLoading(false);
      }
    },
    [codeVersionId, meta?.codeAssetId],
  );

  const loadFiles = useCallback(async () => {
    if (!codeVersionId) return;
    setFilesLoading(true);
    setFilesLoadError(undefined);
    try {
      const res = await fetchCodeEditablePreview(
        {
          codeVersionId,
          codeAssetId: meta?.codeAssetId,
        },
        { skipErrorHandler: true },
      );
      const files = res?.data?.codeFiles ?? [];
      setCodeFiles(files);
      setFilesLoadError(res?.data?.loadError);
      setWorkspaceDraftOpen(
        Boolean((res?.data as { fromWorkspace?: boolean })?.fromWorkspace),
      );
      if (res?.data?.codeFilePath && res?.data?.codeContent) {
        setSelectedPath(res.data.codeFilePath);
        setPreviewFileName(res.data.codeFileName || res.data.codeFilePath);
        setPreviewContent(res.data.codeContent);
        setOriginalPreviewContent(res.data.codeContent);
      } else if (files[0]?.path) {
        await loadPreview(files[0].path);
      } else {
        setSelectedPath(undefined);
        setPreviewContent('');
        setPreviewFileName('');
      }
    } catch (error: any) {
      setCodeFiles([]);
      setSelectedPath(undefined);
      setPreviewContent('');
      setWorkspaceDraftOpen(false);
      setFilesLoadError(getApiErrorMessage(error, '代码文件列表加载失败'));
    } finally {
      setFilesLoading(false);
    }
  }, [codeVersionId, loadPreview, meta?.codeAssetId]);

  useEffect(() => {
    loadMeta();
    loadFiles();
  }, [loadMeta, loadFiles]);

  useEffect(() => {
    loadAssetVersions();
  }, [loadAssetVersions]);

  const handleSelectFile = (path: string) => {
    if (!codeVersionId || path === selectedPath) return;
    loadPreview(path);
  };

  const handleResetPreviewContent = () => {
    setPreviewContent(originalPreviewContent);
    message.info('已恢复为服务端原始内容');
  };

  const handleCopyPreviewContent = () => {
    if (!previewContent) return;
    navigator.clipboard.writeText(previewContent).then(() => {
      message.success('代码已复制到剪贴板');
    });
  };

  const previewDirty = previewContent !== originalPreviewContent;
  /** 有工作区草稿或未保存内容修改时，才可点「保存并发布 / 放弃工作区」 */
  const hasDraft = workspaceDraftOpen || previewDirty;

  const handleSaveAndPublish = useCallback(
    (contentOverride?: string) => {
      const content =
        typeof contentOverride === 'string' ? contentOverride : previewContent;
      const dirty =
        typeof contentOverride === 'string'
          ? contentOverride !== originalPreviewContent
          : previewDirty;
      const publishFile = Boolean(selectedPath && dirty);
      const publishDraftOnly = !publishFile && workspaceDraftOpen;
      if (!publishFile && !publishDraftOnly) return;
      const assetId = meta?.codeAssetId?.trim();
      if (!assetId) {
        message.error('缺少 codeAssetId，无法保存（请刷新后重试）');
        return;
      }
      Modal.confirm({
        title: '保存并发布新版本？',
        content: (
          <div>
            <p>
              当前代码版本不可变。保存会把工作区修改发布为同一代码资产下的
              <strong>新版本</strong>。
            </p>
            <p style={{ color: '#8c8c8c', marginBottom: 0 }}>
              {publishFile
                ? `文件：${selectedPath}${
                    meta?.version ? `（基于 ${meta.version}）` : ''
                  }`
                : `将发布当前工作区草稿${
                    meta?.version ? `（基于 ${meta.version}）` : ''
                  }`}
            </p>
          </div>
        ),
        okText: '保存并发布',
        cancelText: '取消',
        onOk: async () => {
          setSaving(true);
          try {
            const res = publishFile
              ? await saveCodeVersionFileAndPublish(
                  {
                    codeAssetId: assetId,
                    baseVersionId: codeVersionId,
                    path: selectedPath!,
                    content,
                    currentVersionLabel: meta?.version,
                  },
                  { skipErrorHandler: true },
                )
              : await publishCodeWorkspaceDraft(
                  {
                    codeAssetId: assetId,
                    baseVersionId: codeVersionId,
                    currentVersionLabel: meta?.version,
                  },
                  { skipErrorHandler: true },
                );
            const newId = res.data.publishedVersionId;
            message.success(
              `已发布新版本 ${res.data.publishedVersion || ''}`.trim(),
            );
            if (publishFile) {
              setPreviewContent(content);
              setOriginalPreviewContent(content);
            }
            setWorkspaceDraftOpen(false);
            history.replace(
              `/task/code/detail/${encodeURIComponent(newId)}`,
              locationState?.from ? { from: locationState.from } : undefined,
            );
          } catch (error: any) {
            message.error(getApiErrorMessage(error, '保存训练代码失败'));
            throw error;
          } finally {
            setSaving(false);
          }
        },
      });
    },
    [
      codeVersionId,
      locationState?.from,
      meta?.codeAssetId,
      meta?.version,
      originalPreviewContent,
      previewContent,
      previewDirty,
      selectedPath,
      workspaceDraftOpen,
    ],
  );

  const handleDownloadZip = useCallback(async () => {
    if (!codeVersionId) return;
    setDownloading(true);
    try {
      await downloadCodeVersionZip(
        codeVersionId,
        meta?.fileName || `${codeVersionId}.zip`,
        { skipErrorHandler: true },
      );
      message.success('开始下载');
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '下载失败'));
    } finally {
      setDownloading(false);
    }
  }, [codeVersionId, meta?.fileName]);

  const handleOpenEditName = useCallback(() => {
    editNameForm.setFieldsValue({
      name: getCodeUserDisplayName(meta ?? undefined),
    });
    setEditNameOpen(true);
  }, [editNameForm, meta]);

  const handleEditNameSubmit = useCallback(async () => {
    if (!codeAssetId) {
      message.error('缺少 codeAssetId，无法修改名称');
      return;
    }
    try {
      const values = await editNameForm.validateFields();
      setEditNameSubmitting(true);
      await updateCodeAssetMeta(
        codeAssetId,
        { name: values.name.trim() },
        { skipErrorHandler: true },
      );
      message.success('代码名称已更新');
      setEditNameOpen(false);
      await loadMeta();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(getApiErrorMessage(error, '更新代码名称失败'));
    } finally {
      setEditNameSubmitting(false);
    }
  }, [codeAssetId, editNameForm, loadMeta]);

  const handleDeprecate = useCallback(async () => {
    if (!codeVersionId) return;
    setDeprecating(true);
    try {
      await deprecateCodeVersion(codeVersionId, { skipErrorHandler: true });
      message.success('已弃用该代码版本');
      await loadMeta();
      await loadAssetVersions();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '弃用失败'));
    } finally {
      setDeprecating(false);
    }
  }, [codeVersionId, loadAssetVersions, loadMeta]);

  const handleArchive = useCallback(async () => {
    if (!codeVersionId) return;
    setArchiving(true);
    try {
      await archiveCodeVersion(codeVersionId, { skipErrorHandler: true });
      message.success('已归档该代码版本');
      await loadMeta();
      await loadAssetVersions();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '归档失败'));
    } finally {
      setArchiving(false);
    }
  }, [codeVersionId, loadAssetVersions, loadMeta]);

  const handleAbandonWorkspace = useCallback(async () => {
    if (!codeAssetId) {
      message.error('缺少 codeAssetId，无法放弃工作区');
      return;
    }
    setAbandoning(true);
    try {
      if (workspaceDraftOpen) {
        const res = await abandonCodeWorkspace(codeAssetId, {
          skipErrorHandler: true,
        });
        if (res?.data?.abandoned) {
          message.success('已放弃工作区草稿');
        } else {
          message.info('当前无打开的工作区草稿');
        }
        setWorkspaceDraftOpen(false);
        await loadFiles();
        return;
      }
      if (previewContent !== originalPreviewContent) {
        setPreviewContent(originalPreviewContent);
        message.success('已放弃未保存的内容修改');
      }
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '放弃工作区失败'));
    } finally {
      setAbandoning(false);
    }
  }, [
    codeAssetId,
    loadFiles,
    originalPreviewContent,
    previewContent,
    workspaceDraftOpen,
  ]);

  const handleDeleteAsset = useCallback(async () => {
    const assetId = meta?.codeAssetId?.trim();
    if (!assetId) {
      message.error('缺少 codeAssetId，无法删除');
      return;
    }
    setDeleting(true);
    try {
      await deleteCodeAsset(assetId, { skipErrorHandler: true });
      removePendingCodeVersion(codeVersionId);
      message.success('已删除训练代码资产');
      history.push(backPath);
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '删除训练代码失败'));
    } finally {
      setDeleting(false);
    }
  }, [backPath, codeVersionId, meta?.codeAssetId]);

  const handleCreateFile = useCallback(async () => {
    if (!codeAssetId) {
      message.error('缺少 codeAssetId，无法新建文件');
      return;
    }
    try {
      const values = await newFileForm.validateFields();
      const path = values.path.trim();
      setFileOpLoading(true);
      await createCodeWorkspaceFile(
        {
          codeAssetId,
          baseVersionId: codeVersionId,
          path,
          content: values.content,
        },
        { skipErrorHandler: true },
      );
      message.success('文件已写入工作区草稿，需「保存并发布」才会成为新版本');
      setWorkspaceDraftOpen(true);
      setNewFileOpen(false);
      newFileForm.resetFields();
      await loadFiles();
      await loadPreview(path);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(getApiErrorMessage(error, '新建文件失败'));
    } finally {
      setFileOpLoading(false);
    }
  }, [codeAssetId, codeVersionId, loadFiles, loadPreview, newFileForm]);

  const handleRenameFile = useCallback(async () => {
    if (!codeAssetId || !selectedPath) {
      message.error('请先选择要重命名的文件');
      return;
    }
    try {
      const values = await renameFileForm.validateFields();
      const targetPath = values.targetPath.trim();
      setFileOpLoading(true);
      await moveCodeWorkspaceFile(
        {
          codeAssetId,
          baseVersionId: codeVersionId,
          sourcePath: selectedPath,
          targetPath,
        },
        { skipErrorHandler: true },
      );
      message.success(
        '文件已重命名（工作区草稿），需「保存并发布」才会成为新版本',
      );
      setWorkspaceDraftOpen(true);
      setRenameFileOpen(false);
      renameFileForm.resetFields();
      setSelectedPath(targetPath);
      await loadFiles();
      await loadPreview(targetPath);
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(getApiErrorMessage(error, '重命名文件失败'));
    } finally {
      setFileOpLoading(false);
    }
  }, [
    codeAssetId,
    codeVersionId,
    loadFiles,
    loadPreview,
    renameFileForm,
    selectedPath,
  ]);

  const handleDeleteFile = useCallback(async () => {
    if (!codeAssetId || !selectedPath) {
      message.error('请先选择要删除的文件');
      return;
    }
    setFileOpLoading(true);
    try {
      await deleteCodeWorkspaceFile(
        {
          codeAssetId,
          baseVersionId: codeVersionId,
          path: selectedPath,
        },
        { skipErrorHandler: true },
      );
      message.success('文件已从工作区草稿删除，需「保存并发布」才会成为新版本');
      setWorkspaceDraftOpen(true);
      setSelectedPath(undefined);
      setPreviewContent('');
      setPreviewFileName('');
      await loadFiles();
    } catch (error: any) {
      message.error(getApiErrorMessage(error, '删除文件失败'));
    } finally {
      setFileOpLoading(false);
    }
  }, [codeAssetId, codeVersionId, loadFiles, selectedPath]);

  const handleOpenRenameFile = useCallback(() => {
    if (!selectedPath) {
      message.warning('请先选择要重命名的文件');
      return;
    }
    renameFileForm.setFieldsValue({ targetPath: selectedPath });
    setRenameFileOpen(true);
  }, [renameFileForm, selectedPath]);

  const handleNavigateVersion = useCallback(
    (record: CodeVersionListItem) => {
      history.push(
        `/task/code/detail/${encodeURIComponent(record.codeVersionId)}`,
        locationState?.from ? { record, from: locationState.from } : { record },
      );
    },
    [locationState?.from],
  );

  const displayName = useMemo(
    () => getCodeUserDisplayName(meta ?? undefined),
    [meta],
  );

  const title = useMemo(() => {
    if (displayName !== '-') return displayName;
    return metaLoading ? '训练代码详情' : codeVersionId || '训练代码详情';
  }, [codeVersionId, displayName, metaLoading]);

  const breadcrumbItems = useMemo(() => {
    const items: { title: React.ReactNode }[] = [
      {
        title: <a onClick={() => history.push('/task/code/list')}>训练代码</a>,
      },
    ];
    if (fromPending) {
      items.push({
        title: <a onClick={() => history.push('/task/code/pending')}>待审核</a>,
      });
    }
    items.push({ title: title || '训练代码详情' });
    return items;
  }, [fromPending, title]);

  const versionColumns: ColumnsType<CodeVersionListItem> = useMemo(
    () => [
      {
        title: '版本',
        dataIndex: 'version',
        key: 'version',
        render: (version: string, record) => (
          <Space size={4}>
            <span>{version || '-'}</span>
            {record.codeVersionId === codeVersionId ? (
              <Tag color="blue">当前</Tag>
            ) : null}
          </Space>
        ),
      },
      {
        title: '就绪状态',
        dataIndex: 'status',
        key: 'status',
        render: (status: string) => statusTag(status),
      },
      {
        title: '审核状态',
        dataIndex: 'approvalStatus',
        key: 'approvalStatus',
        render: (status: string) => approvalTag(status),
      },
      {
        title: '校验状态',
        dataIndex: 'validationStatus',
        key: 'validationStatus',
        render: (status?: string) =>
          status ? (
            <Tag color={status === 'PASSED' ? 'success' : 'default'}>
              {status}
            </Tag>
          ) : (
            '-'
          ),
      },
      {
        title: '创建时间',
        dataIndex: 'createdAt',
        key: 'createdAt',
        render: (value?: string) => formatDisplayDateTime(value),
      },
      {
        title: '操作',
        key: 'action',
        width: 80,
        render: (_, record) => (
          <Button
            type="link"
            size="small"
            style={{ paddingLeft: 0 }}
            disabled={record.codeVersionId === codeVersionId}
            onClick={() => handleNavigateVersion(record)}
          >
            查看
          </Button>
        ),
      },
    ],
    [codeVersionId, handleNavigateVersion],
  );

  if (!codeVersionId) {
    return (
      <PageContainer
        title="训练代码详情"
        onBack={() => history.push(backPath)}
        breadcrumb={{ items: breadcrumbItems }}
      >
        <Empty description="缺少 codeVersionId" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={title}
      subTitle="查看训练代码版本详情、风险/审批证据与 zip 内源码预览"
      onBack={() => history.push(backPath)}
      breadcrumb={{ items: breadcrumbItems }}
      extra={
        codeAssetId ? (
          <div style={{ maxWidth: 640 }}>
            <Space wrap style={{ justifyContent: 'flex-end', width: '100%' }}>
              <Button
                icon={<DownloadOutlined />}
                loading={downloading}
                onClick={handleDownloadZip}
              >
                下载 ZIP
              </Button>
              <Button icon={<EditOutlined />} onClick={handleOpenEditName}>
                编辑名称
              </Button>
              <Popconfirm
                title="弃用该代码版本？"
                description="弃用后该版本不可再用于新训练，但历史记录仍保留。"
                okText="弃用"
                cancelText="取消"
                okButtonProps={{ danger: true, loading: deprecating }}
                onConfirm={handleDeprecate}
              >
                <Button danger loading={deprecating}>
                  弃用
                </Button>
              </Popconfirm>
              <Popconfirm
                title="归档该代码版本？"
                description="归档后版本将从常规列表隐藏，仍可查看历史。"
                okText="归档"
                cancelText="取消"
                okButtonProps={{ loading: archiving }}
                onConfirm={handleArchive}
              >
                <Button loading={archiving}>归档</Button>
              </Popconfirm>
              <Popconfirm
                title="删除训练代码资产？"
                description="将软删除整个代码资产（含其下版本）。若已被训练引用或存在打开工作区，删除会失败。"
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true, loading: deleting }}
                onConfirm={handleDeleteAsset}
              >
                <Button danger loading={deleting}>
                  删除资产
                </Button>
              </Popconfirm>
            </Space>
            <div
              style={{
                marginTop: 8,
                fontSize: 12,
                color: '#8c8c8c',
                lineHeight: 1.7,
                textAlign: 'right',
              }}
            >
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  弃用
                </Typography.Text>
                ：仅针对当前版本，标记后不可再用于新训练，详情与历史仍可查看。
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  归档
                </Typography.Text>
                ：仅针对当前版本，从常规列表中收起，需要时可继续打开历史详情。
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  删除资产
                </Typography.Text>
                ：删除整个代码资产（含其下全部版本）；若已被训练引用或存在打开中的工作区会失败。
              </div>
            </div>
          </div>
        ) : undefined
      }
    >
      {metaLoading && !meta ? (
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      ) : (
        <>
          <Card style={{ marginBottom: 16 }}>
            <Descriptions size="small" column={2}>
              <Descriptions.Item label="代码名称">
                {displayName}
              </Descriptions.Item>
              <Descriptions.Item label="zip 文件名">
                {meta?.fileName || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="训练方案">
                <Typography.Text code style={{ fontSize: 12 }}>
                  {meta?.trainingProfile || '-'}
                </Typography.Text>
              </Descriptions.Item>
              {meta?.entryScript && (
                <Descriptions.Item label="入口脚本">
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {meta.entryScript}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="审核状态">
                {approvalTag(meta?.approvalStatus)}
              </Descriptions.Item>
              <Descriptions.Item label="就绪状态">
                {statusTag(meta?.status)}
              </Descriptions.Item>
              <Descriptions.Item label="校验状态">
                {meta?.validationStatus ? (
                  <Tag
                    color={
                      meta.validationStatus === 'PASSED' ? 'success' : 'default'
                    }
                  >
                    {meta.validationStatus}
                  </Tag>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              <Descriptions.Item label="风险等级">
                {meta?.riskLevel ? (
                  <Tag color={meta.riskLevel === 'LOW' ? 'success' : 'warning'}>
                    {meta.riskLevel}
                  </Tag>
                ) : (
                  '-'
                )}
              </Descriptions.Item>
              {meta?.riskAssessment?.status && (
                <Descriptions.Item label="风险任务状态">
                  <Tag>{meta.riskAssessment.status}</Tag>
                </Descriptions.Item>
              )}
              <Descriptions.Item label="包大小">
                {formatBytes(meta?.sizeBytes)}
              </Descriptions.Item>
              <Descriptions.Item label="codeVersionId" span={2}>
                <Typography.Text copyable code style={{ fontSize: 12 }}>
                  {codeVersionId}
                </Typography.Text>
              </Descriptions.Item>
              {meta?.artifactSha256 && (
                <Descriptions.Item label="artifactSha256" span={2}>
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {meta.artifactSha256}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.consumerManifest?.validationRunId && (
                <Descriptions.Item label="validationRunId" span={2}>
                  <Typography.Text copyable code style={{ fontSize: 12 }}>
                    {meta.consumerManifest.validationRunId}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.consumerManifest?.approvalRecordId && (
                <Descriptions.Item label="approvalRecordId" span={2}>
                  <Typography.Text copyable code style={{ fontSize: 12 }}>
                    {meta.consumerManifest.approvalRecordId}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.consumerManifest?.approvalSource && (
                <Descriptions.Item label="approvalSource">
                  <Tag>{meta.consumerManifest.approvalSource}</Tag>
                </Descriptions.Item>
              )}
              {meta?.consumerManifest?.validationPolicyVersion && (
                <Descriptions.Item label="validationPolicyVersion">
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {meta.consumerManifest.validationPolicyVersion}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.runtime && (
                <Descriptions.Item label="runtime">
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {meta.runtime}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.purpose && (
                <Descriptions.Item label="purpose">
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {meta.purpose}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.trainingType && (
                <Descriptions.Item label="trainingType">
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {meta.trainingType}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.riskAssessment?.findings?.length ? (
                <Descriptions.Item label="风险 Findings" span={2}>
                  <Space wrap>
                    {meta.riskAssessment.findings.slice(0, 8).map((item) => (
                      <Tag
                        key={`${item.ruleId || 'rule'}-${item.filePath || ''}-${item.lineStart ?? ''}-${item.category || ''}-${item.description || ''}`}
                      >
                        {item.ruleId || item.category || 'finding'}
                        {item.filePath ? ` @ ${item.filePath}` : ''}
                      </Tag>
                    ))}
                  </Space>
                </Descriptions.Item>
              ) : null}
              {meta?.riskAssessment?.reasonCode && (
                <Descriptions.Item label="风险原因" span={2}>
                  <Typography.Text code style={{ fontSize: 12 }}>
                    {meta.riskAssessment.reasonCode}
                  </Typography.Text>
                </Descriptions.Item>
              )}
              {meta?.remark && (
                <Descriptions.Item label="备注" span={2}>
                  {meta.remark}
                </Descriptions.Item>
              )}
            </Descriptions>
          </Card>

          {codeAssetId ? (
            <Card title="资产版本" style={{ marginBottom: 16 }}>
              <Table<CodeVersionListItem>
                rowKey="codeVersionId"
                size="small"
                loading={versionsLoading}
                columns={versionColumns}
                dataSource={assetVersions}
                pagination={false}
                rowClassName={(record) =>
                  record.codeVersionId === codeVersionId
                    ? 'ant-table-row-selected'
                    : ''
                }
              />
            </Card>
          ) : null}

          {codeAssetId ? (
            <div style={{ marginBottom: 12 }}>
              <Space wrap>
                <Button
                  type={hasDraft ? 'primary' : 'default'}
                  icon={<SaveOutlined />}
                  loading={saving}
                  disabled={!hasDraft}
                  onClick={() => handleSaveAndPublish()}
                  style={
                    hasDraft
                      ? undefined
                      : { color: 'rgba(0,0,0,0.25)', borderColor: '#d9d9d9' }
                  }
                >
                  保存并发布
                </Button>
                <Popconfirm
                  title="放弃工作区草稿？"
                  description="将丢弃未发布的文件增删改与内容修改，恢复为当前版本基线。"
                  okText="放弃"
                  cancelText="取消"
                  okButtonProps={{ danger: true, loading: abandoning }}
                  disabled={!hasDraft}
                  onConfirm={handleAbandonWorkspace}
                >
                  {/* span：避免 disabled 按钮被 Popconfirm 包住后样式/点击异常 */}
                  <span>
                    <Button
                      danger={hasDraft}
                      loading={abandoning}
                      disabled={!hasDraft}
                      style={
                        hasDraft
                          ? undefined
                          : {
                              color: 'rgba(0,0,0,0.25)',
                              borderColor: '#d9d9d9',
                              background: '#f5f5f5',
                            }
                      }
                    >
                      放弃工作区
                    </Button>
                  </span>
                </Popconfirm>
              </Space>
              {hasDraft ? (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: '#ad6800',
                    lineHeight: 1.5,
                  }}
                >
                  {workspaceDraftOpen
                    ? '当前为未发布的工作区草稿（含增删改与内容修改），正式生效需「保存并发布」。'
                    : '当前文件有未发布的内容修改，正式生效需「保存并发布」。'}
                </div>
              ) : null}
            </div>
          ) : null}

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Card
                title="代码文件"
                style={{ marginBottom: 16 }}
                extra={
                  codeAssetId ? (
                    <Space wrap size={4}>
                      <Button
                        size="small"
                        icon={<FileAddOutlined />}
                        disabled={fileOpLoading}
                        onClick={() => {
                          newFileForm.resetFields();
                          setNewFileOpen(true);
                        }}
                      >
                        新建文件
                      </Button>
                      <Button
                        size="small"
                        disabled={!selectedPath || fileOpLoading}
                        onClick={handleOpenRenameFile}
                      >
                        重命名
                      </Button>
                      <Popconfirm
                        title="从工作区草稿删除该文件？"
                        description="删除后需「保存并发布」才会成为新版本；也可通过上方「放弃工作区」恢复。"
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        disabled={!selectedPath || fileOpLoading}
                        onConfirm={handleDeleteFile}
                      >
                        <Button
                          size="small"
                          danger
                          disabled={!selectedPath || fileOpLoading}
                        >
                          删除文件
                        </Button>
                      </Popconfirm>
                      <Button
                        size="small"
                        icon={<ReloadOutlined />}
                        loading={filesLoading}
                        onClick={() => loadFiles()}
                      >
                        刷新
                      </Button>
                    </Space>
                  ) : undefined
                }
              >
                {filesLoading ? (
                  <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin tip="加载文件列表…" />
                  </div>
                ) : codeFiles.length ? (
                  <List
                    size="small"
                    dataSource={codeFiles}
                    rowKey={(item) => item.path}
                    renderItem={(item) => {
                      const path = item.path;
                      const active = path === selectedPath;
                      return (
                        <List.Item
                          style={{
                            cursor: 'pointer',
                            background: active ? '#e6f4ff' : undefined,
                            borderRadius: 4,
                            paddingInline: 8,
                          }}
                          onClick={() => handleSelectFile(path)}
                        >
                          <List.Item.Meta
                            title={
                              <Typography.Text
                                ellipsis
                                style={{ maxWidth: '100%', fontSize: 13 }}
                              >
                                {item.fileName || item.name || path}
                              </Typography.Text>
                            }
                            description={
                              <span style={{ fontSize: 12, color: '#999' }}>
                                {formatBytes(item.sizeBytes ?? item.size)}
                              </span>
                            }
                          />
                        </List.Item>
                      );
                    }}
                  />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={
                      filesLoadError ||
                      '暂无可预览的代码文件（依赖 V2 目录树接口）'
                    }
                  />
                )}
              </Card>
            </Col>
            <Col xs={24} lg={16}>
              <Card
                title={
                  <Space>
                    <CodeOutlined />
                    代码预览
                    {previewFileName ? ` · ${previewFileName}` : ''}
                  </Space>
                }
              >
                {!selectedPath && !filesLoading && (
                  <Empty
                    description="请从左侧选择文件"
                    style={{ padding: 48 }}
                  />
                )}
                {selectedPath && previewLoading && (
                  <div style={{ textAlign: 'center', padding: 48 }}>
                    <Spin tip="加载代码内容…" />
                  </div>
                )}
                {selectedPath && !previewLoading && previewContent && (
                  <>
                    <Alert
                      type="info"
                      showIcon
                      message="可在此编辑源码。修改后使用上方「保存并发布」生成新版本；不想保留草稿时用「放弃工作区」。"
                      style={{ marginBottom: 12 }}
                    />
                    <CodeEditor
                      value={previewContent}
                      fileName={previewFileName}
                      onChange={setPreviewContent}
                      minHeight="360px"
                      maxHeight="520px"
                    />
                    <Space wrap style={{ marginTop: 12 }}>
                      <Button
                        size="small"
                        icon={<CopyOutlined />}
                        onClick={handleCopyPreviewContent}
                      >
                        复制
                      </Button>
                      <Button
                        size="small"
                        icon={<UndoOutlined />}
                        disabled={!previewDirty}
                        onClick={handleResetPreviewContent}
                      >
                        恢复原始
                      </Button>
                      <Button
                        size="small"
                        icon={<CodeOutlined />}
                        onClick={() => setCodePreviewVisible(true)}
                      >
                        弹窗查看
                      </Button>
                    </Space>
                  </>
                )}
                {selectedPath && !previewLoading && !previewContent && (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="该文件暂无文本预览内容（可能为二进制文件）"
                  />
                )}
              </Card>
            </Col>
          </Row>
        </>
      )}

      <Modal
        title="编辑代码名称"
        open={editNameOpen}
        confirmLoading={editNameSubmitting}
        okText="保存"
        cancelText="取消"
        onOk={handleEditNameSubmit}
        onCancel={() => setEditNameOpen(false)}
        destroyOnClose
      >
        <Form form={editNameForm} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="代码名称"
            rules={[{ required: true, message: '请输入代码名称' }]}
          >
            <Input placeholder="请输入代码名称" maxLength={128} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="新建文件"
        open={newFileOpen}
        confirmLoading={fileOpLoading}
        okText="创建"
        cancelText="取消"
        onOk={handleCreateFile}
        onCancel={() => setNewFileOpen(false)}
        destroyOnClose
      >
        <Form form={newFileForm} layout="vertical" preserve={false}>
          <Form.Item
            name="path"
            label="文件路径"
            rules={[{ required: true, message: '请输入文件路径' }]}
            extra="相对 zip 根目录的路径，例如 src/train.py"
          >
            <Input placeholder="例如 src/train.py" />
          </Form.Item>
          <Form.Item
            name="content"
            label="代码内容"
            extra="可选。填写该文件的源码正文；留空则创建空文件。"
          >
            <Input.TextArea
              rows={8}
              placeholder="在此粘贴或输入文件源码，例如 Python / Shell 脚本内容"
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="重命名文件"
        open={renameFileOpen}
        confirmLoading={fileOpLoading}
        okText="确定"
        cancelText="取消"
        onOk={handleRenameFile}
        onCancel={() => setRenameFileOpen(false)}
        destroyOnClose
      >
        <Form form={renameFileForm} layout="vertical" preserve={false}>
          <Form.Item label="原路径">
            <Typography.Text code>{selectedPath || '-'}</Typography.Text>
          </Form.Item>
          <Form.Item
            name="targetPath"
            label="新路径"
            rules={[{ required: true, message: '请输入新路径' }]}
          >
            <Input placeholder="请输入新文件路径" />
          </Form.Item>
        </Form>
      </Modal>

      {codePreviewVisible && previewContent && (
        <CodePreview
          visible={codePreviewVisible}
          codeText={previewContent}
          originalCodeText={originalPreviewContent}
          fileName={previewFileName}
          onContentChange={setPreviewContent}
          onSave={handleSaveAndPublish}
          saving={saving}
          onClose={() => setCodePreviewVisible(false)}
        />
      )}
    </PageContainer>
  );
};

export default TrainingCodeDetail;
