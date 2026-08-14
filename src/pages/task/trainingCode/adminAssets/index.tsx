import { DownloadOutlined, FileAddOutlined } from '@ant-design/icons';
import type { ActionType, ProColumns } from '@ant-design/pro-components';
import { PageContainer, ProTable } from '@ant-design/pro-components';
import { history, useAccess } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Col,
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
import CodeEditor from '@/components/CodeEditor';
import { isTrainingCodeAutoApproveEnabled } from '@/constants/trainingCode';
import type { V2AdminCodeAsset, V2CodeVersion } from '@/services/platform';
import {
  abandonAdminCodeWorkspaceDraft,
  archiveAdminCodeVersionById,
  createAdminCodeWorkspaceFile,
  deleteAdminCodeAsset,
  deprecateAdminCodeVersionById,
  downloadAdminCodeVersionFile,
  downloadAdminCodeVersionZipById,
  downloadAdminCodeWorkspaceFile,
  ensureAdminCodeAssetWorkspace,
  extractV2FileText,
  fetchAllV2CodeTreeFiles,
  getAdminCodeAsset,
  getAdminCodeVersionFileContent,
  getAdminCodeVersionTree,
  getAdminCodeWorkspace,
  getAdminCodeWorkspaceFileContent,
  getAdminCodeWorkspaceFileMetadata,
  getAdminCodeWorkspaceTree,
  listAdminCodeAssets,
  listAdminCodeAssetVersions,
  moveAdminCodeWorkspaceFileByPath,
  normalizeAdminCodeAssetPage,
  patchAdminCodeAsset,
  publishAdminCodeWorkspaceDraft,
  removeAdminCodeWorkspaceFile,
  saveAdminCodeWorkspaceFile,
  validateAdminCodeVersionById,
  validateAdminCodeWorkspaceDraft,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  buildCodeFileTreeData,
  collectCodeFileTreeExpandedKeys,
} from '@/utils/codeFileTree';
import { showValidationResultModal } from '@/utils/codeValidationUi';
import { formatDisplayDateTime } from '@/utils/formatDateTime';

type BrowseMode = 'workspace' | 'version';

type BrowseState = {
  mode: BrowseMode;
  title: string;
  subtitle?: string;
  /** 工作区 id 或版本 id */
  targetId: string;
  assetId?: string;
  baseVersionId?: string;
  workspaceRevision?: number;
  workspaceReadOnly?: boolean;
  currentVersionLabel?: string;
  fileEditable?: boolean;
  contentHash?: string;
  codeAssetName?: string;
  trainingProfile?: string;
};

function buildPublishPendingMeta(state: BrowseState) {
  return {
    codeAssetName: state.codeAssetName,
    trainingProfile: state.trainingProfile,
    fileName: state.codeAssetName,
  };
}

/**
 * 管理员跨 owner 代码资产管理（/api/v2/admin/code-assets）
 * 支持服务端 sortBy/sortDirection；不授予训练消费权。
 */
const AdminCodeAssetsPage: React.FC = () => {
  const access = useAccess();
  const actionRef = useRef<ActionType | null>(null);
  const browseRef = useRef<BrowseState | null>(null);
  const activeAssetRef = useRef<V2AdminCodeAsset | null>(null);
  const [activeAsset, setActiveAsset] = useState<V2AdminCodeAsset | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editing, setEditing] = useState<V2AdminCodeAsset | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editProfileLocked, setEditProfileLocked] = useState(false);
  const [editOriginalProfile, setEditOriginalProfile] = useState<string>();
  const [form] = Form.useForm();
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [versionsAssetName, setVersionsAssetName] = useState('');
  const [versionsAssetId, setVersionsAssetId] = useState<string>();
  const [versions, setVersions] = useState<V2CodeVersion[]>([]);
  const [versionActionLoading, setVersionActionLoading] = useState<string>();

  const [newFileOpen, setNewFileOpen] = useState(false);
  const [renameFileOpen, setRenameFileOpen] = useState(false);
  const [fileOpLoading, setFileOpLoading] = useState(false);
  const [newFileForm] = Form.useForm();
  const [renameFileForm] = Form.useForm();

  const [browse, setBrowse] = useState<BrowseState | null>(null);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseFiles, setBrowseFiles] = useState<
    Array<{ path: string; fileName?: string; sizeBytes?: number }>
  >([]);
  const [selectedPath, setSelectedPath] = useState<string>();
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewContent, setPreviewContent] = useState('');
  const [originalPreviewContent, setOriginalPreviewContent] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    browseRef.current = browse;
  }, [browse]);

  useEffect(() => {
    activeAssetRef.current = activeAsset;
  }, [activeAsset]);

  useEffect(() => {
    if (!access.isAdmin) {
      history.replace('/403');
    }
  }, [access.isAdmin]);

  const treeData = useMemo(
    () => buildCodeFileTreeData(browseFiles),
    [browseFiles],
  );

  const previewDirty = previewContent !== originalPreviewContent;
  const workspaceEditable =
    browse?.mode === 'workspace' &&
    !browse.workspaceReadOnly &&
    browse.fileEditable !== false;

  const closeBrowse = () => {
    setBrowse(null);
    setBrowseFiles([]);
    setPreviewContent('');
    setOriginalPreviewContent('');
    setSelectedPath(undefined);
  };

  const patchBrowse = (patch: Partial<BrowseState>) => {
    setBrowse((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  const applyAssetMeta = (
    detail: V2AdminCodeAsset,
    versionList: V2CodeVersion[],
  ) => {
    const hasVersions = Array.isArray(versionList) && versionList.length > 0;
    const profile = detail.trainingProfile?.trim() || '';
    setEditProfileLocked(hasVersions);
    setEditOriginalProfile(profile);
    setEditing(detail);
    form.setFieldsValue({
      name: detail.name,
      trainingProfile: profile,
      purpose: detail.purpose,
      runtime: detail.runtime,
      entryScript: detail.entryScript,
      remark: detail.remark,
    });
  };

  const loadAssetMeta = async (assetId: string) => {
    const [detail, versionList] = await Promise.all([
      getAdminCodeAsset(assetId, { skipErrorHandler: true }),
      listAdminCodeAssetVersions(assetId, { skipErrorHandler: true }).catch(
        () => [],
      ),
    ]);
    const versionsNext = Array.isArray(versionList) ? versionList : [];
    applyAssetMeta(detail, versionsNext);
    setVersions(versionsNext);
    setVersionsAssetId(assetId);
    setVersionsAssetName(detail.name || assetId);
    return { detail, versionsNext };
  };

  const exitDetail = () => {
    closeBrowse();
    setActiveAsset(null);
    setEditing(null);
    setVersions([]);
    setVersionsAssetId(undefined);
    actionRef.current?.reload();
  };

  const submitEdit = async () => {
    if (!editing?.assetId && !editing?.id) return;
    const assetId = editing.assetId || editing.id;
    if (!assetId) return;
    const values = await form.validateFields();
    setEditLoading(true);
    try {
      const patch: Parameters<typeof patchAdminCodeAsset>[1] = {
        assetRevision: Number(editing.assetRevision ?? 0),
        name: values.name?.trim(),
        purpose: values.purpose?.trim(),
        runtime: values.runtime?.trim(),
        entryScript: values.entryScript?.trim(),
        remark: values.remark?.trim(),
      };
      // 首版产生后 trainingProfile 不可变；仅传原值或省略
      if (!editProfileLocked) {
        patch.trainingProfile = values.trainingProfile?.trim();
      }
      await patchAdminCodeAsset(assetId, patch, { skipErrorHandler: true });
      message.success('资产已更新');
      await loadAssetMeta(assetId);
      setActiveAsset((prev) =>
        prev
          ? {
              ...prev,
              name: values.name?.trim(),
              trainingProfile: editProfileLocked
                ? prev.trainingProfile
                : values.trainingProfile?.trim(),
              purpose: values.purpose?.trim(),
              runtime: values.runtime?.trim(),
              entryScript: values.entryScript?.trim(),
              remark: values.remark?.trim(),
            }
          : prev,
      );
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
    setOriginalPreviewContent('');
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
      if (state.mode === 'workspace') {
        const [contentRes, metadata] = await Promise.all([
          getAdminCodeWorkspaceFileContent(state.targetId, path, {
            skipErrorHandler: true,
          }),
          getAdminCodeWorkspaceFileMetadata(state.targetId, path, {
            skipErrorHandler: true,
          }).catch(() => undefined),
        ]);
        const text = extractV2FileText(contentRes as any) || '';
        setPreviewContent(text);
        setOriginalPreviewContent(text);
        patchBrowse({
          workspaceRevision:
            metadata?.workspaceRevision ?? state.workspaceRevision,
          fileEditable:
            metadata?.editable !== false && metadata?.readOnly !== true,
          contentHash: metadata?.contentHash,
        });
      } else {
        const res = await getAdminCodeVersionFileContent(state.targetId, path, {
          skipErrorHandler: true,
        });
        const text = extractV2FileText(res as any) || '';
        setPreviewContent(text);
        setOriginalPreviewContent(text);
      }
    } catch (e: unknown) {
      setPreviewContent('');
      setOriginalPreviewContent('');
      message.error(getApiErrorMessage(e, '读取文件失败'));
    } finally {
      setPreviewLoading(false);
    }
  };

  const openWorkspaceBrowse = async (
    record: V2AdminCodeAsset,
    openBaseVersionId?: string,
  ) => {
    const assetId = record.assetId || record.id;
    if (!assetId) return;
    try {
      const ws = await ensureAdminCodeAssetWorkspace(assetId, {
        skipErrorHandler: true,
        ...(openBaseVersionId?.trim()
          ? { baseVersionId: openBaseVersionId.trim() }
          : {}),
      });
      const workspaceId = ws?.id?.trim();
      if (!workspaceId) {
        message.error('工作区已创建，但未返回 workspace id');
        return;
      }
      const refreshed = await getAdminCodeWorkspace(workspaceId, {
        skipErrorHandler: true,
      }).catch(() => ws);
      const readOnly = Boolean(refreshed?.readOnly);
      const baseVersionId = refreshed?.baseVersionId || ws.baseVersionId;
      let currentVersionLabel: string | undefined;
      if (baseVersionId) {
        const versionList = await listAdminCodeAssetVersions(assetId, {
          skipErrorHandler: true,
        }).catch(() => []);
        const base = (Array.isArray(versionList) ? versionList : []).find(
          (item) =>
            (item.versionId || item.id || item.codeVersionId) === baseVersionId,
        );
        currentVersionLabel = base?.versionLabel || base?.version;
      }
      const state: BrowseState = {
        mode: 'workspace',
        title: `工作区 · ${record.name || assetId}`,
        subtitle: `workspaceId=${workspaceId} · revision=${refreshed?.revision ?? ws.revision ?? '-'} · base=${baseVersionId || '-'} · owner=${record.ownerUserId ?? '-'}（${readOnly ? '只读' : '可编辑'}，不授予训练消费权）`,
        targetId: workspaceId,
        assetId,
        baseVersionId,
        workspaceRevision: refreshed?.revision ?? ws.revision,
        workspaceReadOnly: readOnly,
        currentVersionLabel,
        codeAssetName: record.name || assetId,
        trainingProfile: record.trainingProfile,
      };
      setBrowse(state);
      await loadBrowseTree(state);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '打开工作区失败'));
    }
  };

  const enterAsset = async (record: V2AdminCodeAsset) => {
    const assetId = record.assetId || record.id;
    if (!assetId) return;
    setActiveAsset(record);
    setDetailLoading(true);
    closeBrowse();
    try {
      const { detail } = await loadAssetMeta(assetId);
      const merged: V2AdminCodeAsset = {
        ...record,
        ...detail,
        assetId: detail.assetId || detail.id || assetId,
        ownerUserId: detail.ownerUserId ?? record.ownerUserId,
      };
      setActiveAsset(merged);
      await openWorkspaceBrowse(merged);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '加载资产失败'));
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveDraft = async () => {
    const current = browseRef.current;
    if (!current || current.mode !== 'workspace' || !selectedPath) return;
    setActionLoading(true);
    try {
      const res = await saveAdminCodeWorkspaceFile(
        {
          workspaceId: current.targetId,
          path: selectedPath,
          content: previewContent,
        },
        { skipErrorHandler: true },
      );
      setOriginalPreviewContent(previewContent);
      patchBrowse({ workspaceRevision: res.data.workspaceRevision });
      message.success('已保存到工作区草稿');
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '保存草稿失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveAndPublish = () => {
    const current = browseRef.current;
    if (!current || current.mode !== 'workspace') return;
    Modal.confirm({
      title: '保存并发布新版本？',
      content: (
        <div>
          <p>
            将把当前工作区修改发布为该 owner 代码资产下的<strong>新版本</strong>
            。 资产仍归原用户所有；你本人不能直接用它发起训练。
          </p>
          {selectedPath && previewDirty ? (
            <p style={{ color: '#8c8c8c', marginBottom: 0 }}>
              将先写入文件：{selectedPath}
            </p>
          ) : null}
        </div>
      ),
      okText: '保存并发布',
      onOk: async () => {
        setActionLoading(true);
        try {
          const res = await publishAdminCodeWorkspaceDraft(
            {
              workspaceId: current.targetId,
              path: selectedPath && previewDirty ? selectedPath : undefined,
              content:
                selectedPath && previewDirty ? previewContent : undefined,
              currentVersionLabel: current.currentVersionLabel,
              pendingMeta: buildPublishPendingMeta(current),
            },
            { skipErrorHandler: true },
          );
          message.success(
            `已发布新版本 ${res.data.publishedVersion || ''}（${res.data.publishedVersionId}）${
              !isTrainingCodeAutoApproveEnabled() ? '，已进入待审队列' : ''
            }`,
          );
          closeBrowse();
          const asset = activeAssetRef.current;
          if (asset) {
            const assetId = asset.assetId || asset.id;
            if (assetId) await loadAssetMeta(assetId);
            await openWorkspaceBrowse(asset);
          }
        } catch (e: unknown) {
          message.error(getApiErrorMessage(e, '发布失败'));
          throw e;
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handlePublishDraftOnly = () => {
    const current = browseRef.current;
    if (!current || current.mode !== 'workspace') return;
    Modal.confirm({
      title: '发布工作区草稿？',
      content:
        '将当前工作区全部修改发布为新版本（不额外写入当前编辑器未保存内容）。',
      okText: '发布',
      onOk: async () => {
        setActionLoading(true);
        try {
          const res = await publishAdminCodeWorkspaceDraft(
            {
              workspaceId: current.targetId,
              currentVersionLabel: current.currentVersionLabel,
              pendingMeta: buildPublishPendingMeta(current),
            },
            { skipErrorHandler: true },
          );
          message.success(
            `已发布新版本 ${res.data.publishedVersion || ''}（${res.data.publishedVersionId}）${
              !isTrainingCodeAutoApproveEnabled() ? '，已进入待审队列' : ''
            }`,
          );
          closeBrowse();
          const asset = activeAssetRef.current;
          if (asset) {
            const assetId = asset.assetId || asset.id;
            if (assetId) await loadAssetMeta(assetId);
            await openWorkspaceBrowse(asset);
          }
        } catch (e: unknown) {
          message.error(getApiErrorMessage(e, '发布失败'));
          throw e;
        } finally {
          setActionLoading(false);
        }
      },
    });
  };

  const handleAbandonWorkspace = async () => {
    const current = browseRef.current;
    if (!current || current.mode !== 'workspace') return;
    setActionLoading(true);
    try {
      await abandonAdminCodeWorkspaceDraft(current.targetId, {
        skipErrorHandler: true,
      });
      message.success('已放弃工作区草稿');
      const asset = activeAssetRef.current;
      if (asset) {
        await openWorkspaceBrowse(asset);
      } else {
        closeBrowse();
      }
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '放弃工作区失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDeleteFile = async () => {
    const current = browseRef.current;
    if (!current || current.mode !== 'workspace' || !selectedPath) return;
    setActionLoading(true);
    try {
      const res = await removeAdminCodeWorkspaceFile(
        {
          workspaceId: current.targetId,
          path: selectedPath,
          expectedContentHash: current.contentHash,
        },
        { skipErrorHandler: true },
      );
      patchBrowse({ workspaceRevision: res.workspaceRevision });
      message.success('已从工作区草稿删除该文件');
      if (current) {
        await loadBrowseTree(current);
      }
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '删除文件失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateFile = async () => {
    const current = browseRef.current;
    if (!current || current.mode !== 'workspace') return;
    try {
      const values = await newFileForm.validateFields();
      const path = values.path.trim();
      setFileOpLoading(true);
      const res = await createAdminCodeWorkspaceFile(
        {
          workspaceId: current.targetId,
          path,
          content: values.content,
        },
        { skipErrorHandler: true },
      );
      patchBrowse({ workspaceRevision: res.workspaceRevision });
      message.success('文件已写入工作区草稿，需发布才会成为新版本');
      setNewFileOpen(false);
      newFileForm.resetFields();
      await loadBrowseTree(current);
      await loadBrowseFile(current, path);
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error(getApiErrorMessage(e, '新建文件失败'));
    } finally {
      setFileOpLoading(false);
    }
  };

  const handleMoveFile = async () => {
    const current = browseRef.current;
    if (!current || current.mode !== 'workspace' || !selectedPath) return;
    try {
      const values = await renameFileForm.validateFields();
      const targetPath = values.targetPath.trim();
      setFileOpLoading(true);
      const res = await moveAdminCodeWorkspaceFileByPath(
        {
          workspaceId: current.targetId,
          sourcePath: selectedPath,
          targetPath,
        },
        { skipErrorHandler: true },
      );
      patchBrowse({ workspaceRevision: res.workspaceRevision });
      message.success('文件已移动/重命名，需发布才会成为新版本');
      setRenameFileOpen(false);
      renameFileForm.resetFields();
      await loadBrowseTree(current);
      await loadBrowseFile(current, targetPath);
    } catch (e: unknown) {
      if ((e as { errorFields?: unknown })?.errorFields) return;
      message.error(getApiErrorMessage(e, '移动文件失败'));
    } finally {
      setFileOpLoading(false);
    }
  };

  const handleValidateWorkspace = async () => {
    const current = browseRef.current;
    if (!current || current.mode !== 'workspace') return;
    setActionLoading(true);
    try {
      const res = await validateAdminCodeWorkspaceDraft(current.targetId, {
        skipErrorHandler: true,
      });
      showValidationResultModal(res.data);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '工作区校验失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDownloadCurrentFile = async () => {
    const current = browseRef.current;
    if (!current || !selectedPath) return;
    setActionLoading(true);
    try {
      if (current.mode === 'workspace') {
        await downloadAdminCodeWorkspaceFile(
          current.targetId,
          selectedPath,
          selectedPath.split('/').pop(),
          { skipErrorHandler: true },
        );
      } else {
        await downloadAdminCodeVersionFile(
          current.targetId,
          selectedPath,
          selectedPath.split('/').pop(),
          { skipErrorHandler: true },
        );
      }
      message.success('已开始下载');
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '下载失败'));
    } finally {
      setActionLoading(false);
    }
  };

  const reloadVersions = async (assetId: string) => {
    setVersionsLoading(true);
    try {
      const list = await listAdminCodeAssetVersions(assetId, {
        skipErrorHandler: true,
      });
      setVersions(Array.isArray(list) ? list : []);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '刷新版本失败'));
    } finally {
      setVersionsLoading(false);
    }
  };

  const handleValidateVersion = async (version: V2CodeVersion) => {
    const versionId = version.versionId || version.id || version.codeVersionId;
    if (!versionId) return;
    setVersionActionLoading(versionId);
    try {
      const res = await validateAdminCodeVersionById(versionId, {
        skipErrorHandler: true,
      });
      showValidationResultModal(res.data);
      if (versionsAssetId) await reloadVersions(versionsAssetId);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '版本校验失败'));
    } finally {
      setVersionActionLoading(undefined);
    }
  };

  const handleDeprecateVersion = async (version: V2CodeVersion) => {
    const versionId = version.versionId || version.id || version.codeVersionId;
    if (!versionId) return;
    setVersionActionLoading(versionId);
    try {
      await deprecateAdminCodeVersionById(versionId, {
        skipErrorHandler: true,
      });
      message.success('已弃用该版本');
      if (versionsAssetId) await reloadVersions(versionsAssetId);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '弃用失败'));
    } finally {
      setVersionActionLoading(undefined);
    }
  };

  const handleArchiveVersion = async (version: V2CodeVersion) => {
    const versionId = version.versionId || version.id || version.codeVersionId;
    if (!versionId) return;
    setVersionActionLoading(versionId);
    try {
      await archiveAdminCodeVersionById(versionId, { skipErrorHandler: true });
      message.success('已归档该版本');
      if (versionsAssetId) await reloadVersions(versionsAssetId);
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, '归档失败'));
    } finally {
      setVersionActionLoading(undefined);
    }
  };

  const handleDownloadVersionZip = async (version: V2CodeVersion) => {
    const versionId = version.versionId || version.id || version.codeVersionId;
    if (!versionId) return;
    setVersionActionLoading(versionId);
    try {
      await downloadAdminCodeVersionZipById(
        versionId,
        version.fileName || `${versionId}.zip`,
        { skipErrorHandler: true },
      );
      message.success('已开始下载');
    } catch (e: unknown) {
      message.error(getApiErrorMessage(e, 'ZIP 下载失败'));
    } finally {
      setVersionActionLoading(undefined);
    }
  };

  const handleOpenWorkspaceFromVersion = async (version: V2CodeVersion) => {
    const asset = activeAssetRef.current;
    const assetId = versionsAssetId || asset?.assetId || asset?.id;
    const versionId = version.versionId || version.id || version.codeVersionId;
    if (!assetId || !versionId) {
      message.error('缺少 assetId / versionId');
      return;
    }
    await openWorkspaceBrowse(
      asset ||
        ({
          assetId,
          id: assetId,
          name: versionsAssetName,
        } as V2AdminCodeAsset),
      versionId,
    );
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
      width: 100,
      render: (_, record) => {
        const assetId = record.assetId || record.id;
        if (!assetId) return null;
        return (
          <Button type="link" onClick={() => void enterAsset(record)}>
            管理
          </Button>
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
      width: 380,
      render: (_: unknown, r: V2CodeVersion) => {
        const versionId = r.versionId || r.id || r.codeVersionId || '';
        const loading = versionActionLoading === versionId;
        return (
          <Space size={0} wrap>
            <Button type="link" onClick={() => void openVersionBrowse(r)}>
              查看文件
            </Button>
            <Button
              type="link"
              loading={loading}
              onClick={() => void handleValidateVersion(r)}
            >
              校验
            </Button>
            <Button
              type="link"
              loading={loading}
              onClick={() => void handleDownloadVersionZip(r)}
            >
              ZIP
            </Button>
            <Button
              type="link"
              loading={loading}
              onClick={() => void handleOpenWorkspaceFromVersion(r)}
            >
              编辑
            </Button>
            <Popconfirm
              title="弃用该代码版本？"
              description="弃用后不可再用于新训练。"
              onConfirm={() => void handleDeprecateVersion(r)}
            >
              <Button type="link" danger loading={loading}>
                弃用
              </Button>
            </Popconfirm>
            <Popconfirm
              title="归档该代码版本？"
              onConfirm={() => void handleArchiveVersion(r)}
            >
              <Button type="link" loading={loading}>
                归档
              </Button>
            </Popconfirm>
          </Space>
        );
      },
    },
  ];

  const activeAssetId = activeAsset?.assetId || activeAsset?.id;

  return (
    <PageContainer
      title={
        activeAsset
          ? activeAsset.name || versionsAssetName || '代码资产'
          : '代码资产管理（管理员）'
      }
      subTitle={
        activeAsset
          ? `跨 owner 维护 · owner=${activeAsset.ownerUserId ?? '-'}（不授予训练消费权）`
          : '跨 owner 维护；不授予训练消费权。点「管理」进入详情，在同一页改元数据、版本与文件。'
      }
      onBack={activeAsset ? exitDetail : undefined}
      extra={
        activeAsset && activeAssetId ? (
          <Space wrap>
            {browse?.mode !== 'workspace' ? (
              <Button
                loading={browseLoading}
                onClick={() => void openWorkspaceBrowse(activeAsset)}
              >
                打开工作区
              </Button>
            ) : null}
            <Popconfirm
              title="确认软删除该代码资产？"
              description="将软删除整个代码资产。若已被训练引用或存在打开工作区，删除会失败。"
              onConfirm={async () => {
                try {
                  await deleteAdminCodeAsset(activeAssetId, {
                    skipErrorHandler: true,
                  });
                  message.success('已删除');
                  exitDetail();
                } catch (e: unknown) {
                  message.error(getApiErrorMessage(e, '删除失败'));
                }
              }}
            >
              <Button danger>删除资产</Button>
            </Popconfirm>
          </Space>
        ) : undefined
      }
    >
      {activeAsset ? (
        <Spin spinning={detailLoading}>
          <Card
            title="资产信息"
            extra={
              <Button
                type="primary"
                loading={editLoading}
                onClick={() => void submitEdit()}
              >
                保存元数据
              </Button>
            }
            style={{ marginBottom: 16 }}
          >
            {editProfileLocked ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 16 }}
                message="trainingProfile 已锁定"
                description={`该资产已有不可变代码版本，训练方案不可再修改（当前：${editOriginalProfile || '-'}）。如需更换方案请新建代码资产。`}
              />
            ) : null}
            <Form form={form} layout="vertical">
              <Row gutter={16}>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="name"
                    label="名称"
                    rules={[{ required: true }]}
                  >
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={12}>
                  <Form.Item
                    name="trainingProfile"
                    label="trainingProfile"
                    extra={
                      editProfileLocked
                        ? '首版发布后由版本快照固化，此处只读'
                        : '仅可在尚无代码版本时设置或修改'
                    }
                  >
                    <Input disabled={editProfileLocked} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="purpose" label="purpose">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="runtime" label="runtime">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name="entryScript" label="entryScript">
                    <Input />
                  </Form.Item>
                </Col>
                <Col span={24}>
                  <Form.Item
                    name="remark"
                    label="备注"
                    style={{ marginBottom: 0 }}
                  >
                    <Input.TextArea rows={2} />
                  </Form.Item>
                </Col>
              </Row>
            </Form>
          </Card>

          <Card title="资产版本" style={{ marginBottom: 16 }}>
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
              scroll={{ x: 900 }}
              rowClassName={(r) => {
                const id = r.versionId || r.id || r.codeVersionId;
                if (browse?.mode === 'version' && browse.targetId === id) {
                  return 'ant-table-row-selected';
                }
                if (
                  browse?.mode === 'workspace' &&
                  browse.baseVersionId &&
                  id === browse.baseVersionId
                ) {
                  return 'ant-table-row-selected';
                }
                return '';
              }}
            />
          </Card>

          {workspaceEditable ? (
            <div style={{ marginBottom: 12 }}>
              <Space wrap>
                <Button
                  loading={actionLoading}
                  disabled={!selectedPath || !previewDirty}
                  onClick={() => void handleSaveDraft()}
                >
                  保存草稿
                </Button>
                <Button
                  type="primary"
                  loading={actionLoading}
                  onClick={handleSaveAndPublish}
                >
                  保存并发布
                </Button>
                <Button
                  loading={actionLoading}
                  onClick={() => void handleValidateWorkspace()}
                >
                  校验工作区
                </Button>
                <Button
                  loading={actionLoading}
                  onClick={handlePublishDraftOnly}
                >
                  发布草稿
                </Button>
                <Popconfirm
                  title="放弃整个工作区草稿？"
                  onConfirm={() => void handleAbandonWorkspace()}
                >
                  <Button loading={actionLoading} danger>
                    放弃工作区
                  </Button>
                </Popconfirm>
              </Space>
              {browse?.subtitle ? (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 12,
                    color: '#8c8c8c',
                    lineHeight: 1.5,
                  }}
                >
                  {browse.subtitle}
                </div>
              ) : null}
              <Alert
                type="info"
                showIcon
                style={{ marginTop: 8 }}
                message="管理员工作区编辑"
                description="修改写入 owner 的 OPEN 工作区；发布后会生成新版本并由原用户选用训练。此处编辑不会给你本人训练消费权。"
              />
            </div>
          ) : browse?.mode === 'version' ? (
            <Typography.Paragraph type="secondary">
              当前为版本快照（只读）。可在上方版本表点「编辑」基于该版本打开工作区，或点右上角「打开工作区」。
            </Typography.Paragraph>
          ) : null}

          <Row gutter={16}>
            <Col xs={24} lg={8}>
              <Card
                title={browse?.mode === 'workspace' ? '工作区目录' : '代码目录'}
                style={{ marginBottom: 16 }}
                extra={
                  workspaceEditable ? (
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
                        onClick={() => {
                          renameFileForm.setFieldsValue({
                            targetPath: selectedPath,
                          });
                          setRenameFileOpen(true);
                        }}
                      >
                        重命名
                      </Button>
                    </Space>
                  ) : undefined
                }
              >
                <Spin spinning={browseLoading}>
                  {browseFiles.length === 0 && !browseLoading ? (
                    <Empty description="暂无文件。可打开工作区或选择一个版本查看。" />
                  ) : (
                    <div
                      style={{
                        maxHeight: 560,
                        overflow: 'auto',
                        paddingRight: 4,
                      }}
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
                  )}
                </Spin>
              </Card>
            </Col>
            <Col xs={24} lg={16}>
              <Card
                title={
                  <>
                    {workspaceEditable ? '编辑' : '预览'}
                    {selectedPath ? ` · ${selectedPath}` : ''}
                  </>
                }
                extra={
                  selectedPath ? (
                    <Space size={8}>
                      <Button
                        size="small"
                        icon={<DownloadOutlined />}
                        loading={actionLoading}
                        onClick={() => void handleDownloadCurrentFile()}
                      >
                        下载
                      </Button>
                      {workspaceEditable ? (
                        <>
                          <Button
                            size="small"
                            disabled={!previewDirty}
                            onClick={() =>
                              setPreviewContent(originalPreviewContent)
                            }
                          >
                            恢复
                          </Button>
                          <Popconfirm
                            title="从工作区草稿删除该文件？"
                            onConfirm={() => void handleDeleteFile()}
                          >
                            <Button size="small" danger loading={actionLoading}>
                              删除文件
                            </Button>
                          </Popconfirm>
                        </>
                      ) : null}
                    </Space>
                  ) : undefined
                }
                style={{ marginBottom: 16 }}
              >
                <Spin spinning={previewLoading || browseLoading}>
                  {workspaceEditable ? (
                    <CodeEditor
                      value={previewContent}
                      fileName={selectedPath}
                      onChange={setPreviewContent}
                      readOnly={false}
                      minHeight="420px"
                      maxHeight="70vh"
                    />
                  ) : (
                    <pre
                      style={{
                        marginTop: 0,
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
                  )}
                </Spin>
              </Card>
            </Col>
          </Row>
        </Spin>
      ) : (
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
      )}

      <Modal
        title="新建文件"
        open={newFileOpen}
        confirmLoading={fileOpLoading}
        okText="创建"
        cancelText="取消"
        onOk={() => void handleCreateFile()}
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
            extra="可选。留空则创建空文件。"
          >
            <Input.TextArea
              rows={8}
              placeholder="在此粘贴或输入文件源码"
              style={{ fontFamily: 'monospace', fontSize: 13 }}
            />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="移动/重命名文件"
        open={renameFileOpen}
        confirmLoading={fileOpLoading}
        okText="确定"
        cancelText="取消"
        onOk={() => void handleMoveFile()}
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
    </PageContainer>
  );
};

export default AdminCodeAssetsPage;
