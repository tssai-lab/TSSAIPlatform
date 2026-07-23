import { EditOutlined, PlusOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useParams, useSearchParams } from '@umijs/max';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Empty,
  Form,
  Input,
  Modal,
  message,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PointCloudPreviewPanel, {
  type PointCloudPreviewPanelRef,
} from '@/pages/dataset/components/point-cloud/PointCloudPreviewPanel';
import { resolveDatasetVersionId } from '@/services/dataset';
import {
  createDatasetVersion,
  createWorkspaceDraft,
  deleteDataset,
  deleteDatasetVersion,
  fetchDatasetDetail,
  getDownloadUrl,
  getOrCreateV2EditSession,
  switchDatasetCurrentVersion,
  updateDatasetVersion,
  updateDatasetVersionStatus,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  DATASET_VERSION_DESC_PLACEHOLDER,
  DATASET_VERSION_FORMAT_HINT,
  datasetVersionDescFormRules,
  datasetVersionFormRules,
  suggestNextDatasetVersion,
} from '@/utils/datasetVersion';
import {
  isZipBackedDatasetVersion,
  supportsDatasetWorkspaceEdit,
  type WorkspaceEditableDatasetType,
} from '@/utils/datasetWorkspace';
import { formatDisplayDateTime } from '@/utils/formatDateTime';
import DatasetPreviewPanel from '../components/DatasetPreviewPanel';
import MultimodalImportBanner from '../components/MultimodalImportBanner';
import MultimodalPreviewPanel from '../components/MultimodalPreviewPanel';
import MultimodalWorkspacePanel from '../components/MultimodalWorkspacePanel';
import TableEllipsisCell from '../components/TableEllipsisCell';

type DraftVersionContext = {
  assetId?: string;
  versions?: API.DatasetVersionDetail[];
  latestDraftVersionId?: string | null;
  importJobId?: string | null;
  importStatus?: string | null;
  editSessionId?: string | null;
};

function hasReadyDatasetVersions(
  versions?: API.DatasetVersionDetail[],
): boolean {
  return (versions ?? []).some((v) => v.status === 'READY');
}

function resolveDetailVersionId(
  version?: API.DatasetVersionDetail | null,
  assetId?: string,
): string | undefined {
  return resolveDatasetVersionId(version, assetId) ?? version?.id;
}

/** 首次上传后、ImportJob 尚未完成的 DRAFT */
function isImportDraftVersion(
  version?: API.DatasetVersionDetail | null,
  context?: DraftVersionContext,
): boolean {
  if (version?.status !== 'DRAFT') return false;
  if (version.parentVersionId) return false;

  const vid = resolveDetailVersionId(version, context?.assetId);
  const versions = context?.versions ?? [];
  const hasReady = hasReadyDatasetVersions(versions);

  if (hasReady) {
    const isLatestDraft = !!vid && vid === context?.latestDraftVersionId;
    const importing =
      !!context?.importJobId &&
      isLatestDraft &&
      ['PENDING', 'RUNNING', 'FAILED'].includes(context?.importStatus ?? '');
    return importing;
  }

  return true;
}

/** 基于 READY 创建的编辑工作区 DRAFT（可删/恢复样本） */
function isWorkspaceDraftVersion(
  version?: API.DatasetVersionDetail | null,
  context?: DraftVersionContext,
): boolean {
  if (version?.status !== 'DRAFT') return false;
  if (version.parentVersionId) return true;

  const vid = resolveDetailVersionId(version, context?.assetId);
  if (
    context?.editSessionId &&
    vid &&
    vid === context.editSessionId &&
    hasReadyDatasetVersions(context.versions)
  ) {
    return true;
  }

  if (isImportDraftVersion(version, context)) return false;
  return hasReadyDatasetVersions(context?.versions);
}

function buildDraftContext(
  datasetInfo?:
    | (API.DatasetDetail & {
        latestDraftVersionId?: string | null;
        importJobId?: string | null;
        importStatus?: string | null;
        editSessionId?: string | null;
      })
    | null,
): DraftVersionContext | undefined {
  if (!datasetInfo) return undefined;
  return {
    assetId: datasetInfo.id,
    versions: datasetInfo.versions,
    latestDraftVersionId: datasetInfo.latestDraftVersionId,
    importJobId: datasetInfo.importJobId,
    importStatus: datasetInfo.importStatus,
    editSessionId: datasetInfo.editSessionId,
  };
}

/** 资产级活动草稿 ID（版本表可能暂未带上 DRAFT 行） */
function resolveActiveDraftId(
  datasetInfo?:
    | (API.DatasetDetail & {
        latestDraftVersionId?: string | null;
        editSessionId?: string | null;
      })
    | null,
  draftContext?: DraftVersionContext,
): string | undefined {
  if (!datasetInfo) return undefined;
  const fromMeta =
    datasetInfo.editSessionId || datasetInfo.latestDraftVersionId || undefined;
  if (fromMeta) return fromMeta;
  const row = datasetInfo.versions.find((item) =>
    isWorkspaceDraftVersion(item, draftContext),
  );
  return row
    ? (resolveDatasetVersionId(row, datasetInfo.id) ?? row.id)
    : undefined;
}

function isVersionAlreadyExistsError(error: unknown): boolean {
  const msg = getApiErrorMessage(error, '');
  return /version already exists for asset/i.test(msg);
}

/** 规范为 vN 或 vX.Y.Z；漏写 v 时补上 */
function normalizeDatasetVersionInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (/^v?\d+\.\d+\.\d+$/i.test(trimmed)) {
    return `v${trimmed.replace(/^v/i, '')}`;
  }
  if (/^v?\d+$/i.test(trimmed)) {
    return `v${trimmed.replace(/^v/i, '')}`;
  }
  return trimmed;
}

/**
 * 改名候选：用户填写号 + 其后若干递增。
 * 软删版本标签仍占唯一约束，页面列表看不到，故需自动跳号。
 */
function buildVersionLabelCandidates(
  preferred: string,
  existingVisible: string[],
  extraAttempts = 8,
): string[] {
  const preferredNorm = normalizeDatasetVersionInput(preferred);
  const occupied = new Set(
    existingVisible.map((item) => item.trim().toLowerCase()),
  );
  const out: string[] = [];
  const push = (label: string) => {
    const key = label.toLowerCase();
    if (
      !label ||
      occupied.has(key) ||
      out.some((x) => x.toLowerCase() === key)
    ) {
      return;
    }
    out.push(label);
  };
  push(preferredNorm);
  const semver = preferredNorm.match(/^v(\d+)\.(\d+)\.(\d+)$/i);
  const legacy = preferredNorm.match(/^v(\d+)$/i);
  if (semver) {
    const major = Number(semver[1]);
    const minor = Number(semver[2]);
    let patch = Number(semver[3]);
    for (let i = 0; i < extraAttempts; i += 1) {
      patch += 1;
      push(`v${major}.${minor}.${patch}`);
    }
  } else if (legacy) {
    let n = Number(legacy[1]);
    for (let i = 0; i < extraAttempts; i += 1) {
      n += 1;
      push(`v${n}`);
    }
  } else {
    push(suggestNextDatasetVersion(existingVisible));
  }
  return out;
}

async function applyDraftVersionLabel(params: {
  draftId: string;
  preferred: string;
  existingVisible: string[];
  remark?: string;
}): Promise<{ applied: string; fallbackFrom?: string }> {
  const candidates = buildVersionLabelCandidates(
    params.preferred,
    params.existingVisible,
  );
  let lastError: unknown;
  for (let i = 0; i < candidates.length; i += 1) {
    const label = candidates[i];
    try {
      await updateDatasetVersion(
        params.draftId,
        {
          version: label,
          versionLabel: label,
          remark: params.remark,
          description: params.remark,
        },
        { skipErrorHandler: true },
      );
      return {
        applied: label,
        fallbackFrom:
          i === 0 ? undefined : normalizeDatasetVersionInput(params.preferred),
      };
    } catch (error) {
      lastError = error;
      if (!isVersionAlreadyExistsError(error)) {
        throw error;
      }
    }
  }
  throw (
    lastError ||
    new Error(
      `版本号「${normalizeDatasetVersionInput(params.preferred)}」及后续候选均被占用（含已软删、页面不可见的历史标签）。请改用未占用标签，例如 v3 或 v1.0.10。`,
    )
  );
}

const DATASET_TYPE_LABEL: Record<string, string> = {
  CV: 'CV',
  NLP: 'NLP',
  POINT_CLOUD: '点云',
  MULTIMODAL: '多模态',
  ROBOT: '机器人',
};

const DATASET_TYPE_COLOR: Record<string, string> = {
  CV: 'blue',
  NLP: 'green',
  POINT_CLOUD: 'purple',
  MULTIMODAL: 'magenta',
  ROBOT: 'default',
};

const DatasetDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const previewSectionRef = useRef<HTMLDivElement>(null);
  const [datasetInfo, setDatasetInfo] = useState<
    | (API.DatasetDetail & {
        defaultVersionId?: string;
        latestDraftVersionId?: string | null;
        importJobId?: string | null;
        importStatus?: string | null;
        importProgress?: number | null;
        importErrorMessage?: string | null;
        currentVersionId?: string;
        editSessionId?: string | null;
      })
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [previewVersionId, setPreviewVersionId] = useState<string>();

  const [versionModalOpen, setVersionModalOpen] = useState(false);
  const [versionModalMode, setVersionModalMode] = useState<
    'create' | 'editRemark' | 'editWorkspace'
  >('create');
  const [versionModalLoading, setVersionModalLoading] = useState(false);
  const [editingVersion, setEditingVersion] =
    useState<API.DatasetVersionDetail | null>(null);
  /** 进入编辑草稿前的 READY 父版本 ID，用于取消增删后恢复预览 */
  const [workspaceEditSourceVersionId, setWorkspaceEditSourceVersionId] =
    useState<string>();
  const [versionForm] = Form.useForm();

  const existingVersionNames = useMemo(
    () => datasetInfo?.versions.map((v) => v.version).filter(Boolean) ?? [],
    [datasetInfo],
  );

  const loadDetail = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await fetchDatasetDetail(id, { skipErrorHandler: true });
      const detail =
        (res?.data as
          | (API.DatasetDetail & { defaultVersionId?: string })
          | undefined) ?? null;
      setDatasetInfo(detail);
      const assetId = detail?.id;
      const queryVersionId = searchParams.get('versionId') ?? undefined;
      const importDraftId = detail?.latestDraftVersionId ?? undefined;
      const defaultVersionId =
        (queryVersionId && queryVersionId !== assetId
          ? queryVersionId
          : undefined) ??
        detail?.defaultVersionId ??
        resolveDatasetVersionId(detail?.latestVersion, assetId) ??
        detail?.versions
          .map((v) => resolveDatasetVersionId(v, assetId))
          .find(Boolean) ??
        (detail?.type === 'MULTIMODAL' &&
        importDraftId &&
        ['PENDING', 'RUNNING', 'FAILED'].includes(detail?.importStatus ?? '')
          ? importDraftId
          : undefined);
      setPreviewVersionId((prev) => {
        if (
          prev &&
          detail?.versions.some(
            (v) => (resolveDatasetVersionId(v, assetId) ?? v.id) === prev,
          )
        ) {
          return prev;
        }
        return defaultVersionId;
      });
    } catch (error: any) {
      message.error(
        error?.info?.message || error?.message || '加载数据集详情失败',
      );
      setDatasetInfo(null);
      setPreviewVersionId(undefined);
    } finally {
      setLoading(false);
    }
  }, [id, searchParams]);

  const previewPanelRef = useRef<PointCloudPreviewPanelRef>(null);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleDelete = async () => {
    if (!id) {
      return;
    }
    try {
      await deleteDataset(id);
      message.success('删除成功');
      history.push('/dataset/list');
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const handleDownload = (storagePath?: string) => {
    if (!storagePath) {
      message.warning('当前版本没有可下载文件');
      return;
    }
    window.open(getDownloadUrl(storagePath), '_blank');
  };

  const handleUploadNewVersion = () => {
    if (!datasetInfo || !id) return;
    const params = new URLSearchParams({
      assetId: id,
      datasetName: datasetInfo.name,
      type: datasetInfo.type,
    });
    history.push(`/dataset/upload?${params.toString()}`);
  };

  const openCreateVersion = () => {
    setVersionModalMode('create');
    setEditingVersion(null);
    versionForm.setFieldsValue({
      version: suggestNextDatasetVersion(existingVersionNames),
      remark: '',
    });
    setVersionModalOpen(true);
  };

  const openEditRemark = (record: API.DatasetVersionDetail) => {
    setVersionModalMode('editRemark');
    setEditingVersion(record);
    versionForm.setFieldsValue({
      remark: record.remark ?? '',
    });
    setVersionModalOpen(true);
  };

  const scrollToWorkspace = () => {
    requestAnimationFrame(() => {
      previewSectionRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  };

  const draftContext = useMemo(
    () => buildDraftContext(datasetInfo),
    [datasetInfo],
  );

  const openEditWorkspaceModal = (record: API.DatasetVersionDetail) => {
    const sourceId =
      resolveDatasetVersionId(record, datasetInfo?.id) ?? record.id;
    setWorkspaceEditSourceVersionId(sourceId);
    setVersionModalMode('editWorkspace');
    setEditingVersion(record);
    versionForm.setFieldsValue({
      version: suggestNextDatasetVersion(existingVersionNames),
      remark: '',
    });
    setVersionModalOpen(true);
  };

  const handleEditCurrentVersion = async (record: API.DatasetVersionDetail) => {
    const versionId =
      resolveDatasetVersionId(record, datasetInfo?.id) ?? record.id;
    if (!versionId || !datasetInfo) return;

    if (!supportsDatasetWorkspaceEdit(datasetInfo.type)) {
      Modal.info({
        title: '编辑当前版本',
        content:
          '当前数据集类型暂不支持在版本内增删。如需更新数据，请使用「上传新版本」替换整包。',
      });
      return;
    }

    if (
      !isWorkspaceDraftVersion(record, draftContext) &&
      record.status === 'READY' &&
      !isZipBackedDatasetVersion(record)
    ) {
      Modal.info({
        title: '编辑当前版本',
        content:
          '当前版本为单文件数据集，无法创建编辑工作区。请先通过「上传新版本」上传为 zip 格式后再进行增删编辑。',
      });
      return;
    }

    if (isWorkspaceDraftVersion(record, draftContext)) {
      const parentId = record.parentVersionId
        ? (resolveDatasetVersionId(
            datasetInfo.versions.find(
              (v) =>
                v.id === record.parentVersionId ||
                resolveDatasetVersionId(v, datasetInfo.id) ===
                  record.parentVersionId,
            ),
            datasetInfo.id,
          ) ?? record.parentVersionId)
        : workspaceEditSourceVersionId;
      if (parentId) {
        setWorkspaceEditSourceVersionId(parentId);
      }
      setPreviewVersionId(versionId);
      scrollToWorkspace();
      return;
    }

    if (record.status && record.status !== 'READY') {
      message.warning('仅正式版本（READY）可创建编辑草稿');
      return;
    }

    const existingWorkspaceDraft = datasetInfo.versions.find((item) =>
      isWorkspaceDraftVersion(item, draftContext),
    );
    const activeDraftId =
      (existingWorkspaceDraft
        ? (resolveDatasetVersionId(existingWorkspaceDraft, datasetInfo.id) ??
          existingWorkspaceDraft.id)
        : undefined) || resolveActiveDraftId(datasetInfo, draftContext);
    if (activeDraftId) {
      const parentId = existingWorkspaceDraft?.parentVersionId
        ? (resolveDatasetVersionId(
            datasetInfo.versions.find(
              (v) =>
                v.id === existingWorkspaceDraft.parentVersionId ||
                resolveDatasetVersionId(v, datasetInfo.id) ===
                  existingWorkspaceDraft.parentVersionId,
            ),
            datasetInfo.id,
          ) ?? existingWorkspaceDraft.parentVersionId)
        : versionId;
      if (parentId) {
        setWorkspaceEditSourceVersionId(parentId);
      }
      message.info(
        '该数据集已有未发布的编辑草稿（同一资产只能有一个），已为您切入；可继续编辑或「取消增删」后重开。',
      );
      setPreviewVersionId(activeDraftId);
      scrollToWorkspace();
      return;
    }

    if (
      datasetInfo.type === 'MULTIMODAL' &&
      datasetInfo.latestDraftVersionId &&
      isImportDraftVersion(
        datasetInfo.versions.find(
          (item) => item.id === datasetInfo.latestDraftVersionId,
        ),
        draftContext,
      )
    ) {
      message.warning('当前有版本正在导入，请等待导入完成后再编辑');
      return;
    }

    openEditWorkspaceModal(record);
  };

  const handleCancelWorkspaceEdit = async () => {
    if (!previewVersionId || !datasetInfo) return;
    try {
      await deleteDatasetVersion(previewVersionId, { skipErrorHandler: true });
      message.success('已取消增删编辑，草稿版本已删除');
      const restoreId = workspaceEditSourceVersionId;
      setWorkspaceEditSourceVersionId(undefined);
      await loadDetail();
      if (restoreId) {
        setPreviewVersionId(restoreId);
      }
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '取消编辑失败');
    }
  };

  const submitVersionModal = async () => {
    if (!id) return;
    try {
      const values = await versionForm.validateFields();
      setVersionModalLoading(true);
      const remark = values.remark?.trim();
      if (versionModalMode === 'create') {
        const version = values.version.trim();
        await createDatasetVersion(
          { assetId: id, version, remark },
          { skipErrorHandler: true },
        );
        message.success('版本记录已创建，请通过「上传新版本」绑定数据文件');
      } else if (versionModalMode === 'editWorkspace') {
        const version = normalizeDatasetVersionInput(values.version.trim());
        const sourceId = workspaceEditSourceVersionId;
        if (!sourceId) {
          message.error('缺少源版本信息，请重新点击「编辑当前版本」');
          return;
        }
        if (!datasetInfo?.id) {
          message.error('数据集信息缺失');
          return;
        }
        const assetId = datasetInfo.id;
        // 资产级已有 DRAFT 时禁止再建；先切入（版本表可能尚未展示该行）
        const existingDraftId = resolveActiveDraftId(datasetInfo, draftContext);
        if (existingDraftId) {
          try {
            const renamed = await applyDraftVersionLabel({
              draftId: existingDraftId,
              preferred: version,
              existingVisible: existingVersionNames,
              remark,
            });
            if (renamed.fallbackFrom) {
              message.warning(
                `「${renamed.fallbackFrom}」已被占用（含软删历史，页面可能看不见）。已改用 ${renamed.applied} 并切入草稿。`,
              );
            } else {
              message.success(
                `已切入现有编辑草稿，版本号为 ${renamed.applied}`,
              );
            }
          } catch (renameExistingError) {
            message.warning(
              getApiErrorMessage(
                renameExistingError,
                '已切入现有草稿，但版本号未能更新。可继续编辑或取消草稿后换更大版本号再建。',
              ),
            );
          }
          setWorkspaceEditSourceVersionId(sourceId);
          setVersionModalOpen(false);
          await loadDetail();
          setPreviewVersionId(existingDraftId);
          scrollToWorkspace();
          return;
        }
        let draftId: string | undefined;
        const draftMeta = {
          versionLabel: version,
          version,
          remark,
          description: remark,
        };
        try {
          const v2Res = await getOrCreateV2EditSession(
            assetId,
            { skipErrorHandler: true },
            { ...draftMeta, baseVersionId: sourceId },
          );
          draftId = v2Res?.editSessionId;
        } catch (v2Error) {
          try {
            const res = await createWorkspaceDraft(
              sourceId,
              { skipErrorHandler: true },
              draftMeta,
            );
            draftId = res?.data?.draftVersionId;
          } catch (legacyError) {
            if (isVersionAlreadyExistsError(legacyError)) {
              const recovered =
                resolveActiveDraftId(datasetInfo, draftContext) ||
                (legacyError as any)?.info?.data?.draftVersionId ||
                (legacyError as any)?.response?.data?.data?.draftVersionId;
              if (recovered) {
                message.warning(
                  '已有未发布草稿，已为您切入。请先继续编辑或「取消增删」后再开新草稿。',
                );
                setWorkspaceEditSourceVersionId(sourceId);
                setVersionModalOpen(false);
                await loadDetail();
                setPreviewVersionId(recovered);
                scrollToWorkspace();
                return;
              }
              throw new Error(
                '该资产已有未发布草稿或版本号冲突。请刷新详情：若见「编辑草稿」请先切入编辑或取消；新版本号须与现有版本（含草稿）不同。',
              );
            }
            throw legacyError;
          }
          if (!draftId && isVersionAlreadyExistsError(v2Error)) {
            throw new Error(
              '该资产已有未发布草稿。请刷新后切入草稿继续编辑，或先取消草稿。',
            );
          }
        }
        if (!draftId) {
          throw new Error('创建编辑草稿失败');
        }
        // 后端默认 v{versionNo}；改成用户号。软删标签仍占唯一约束时自动跳号。
        try {
          const renamed = await applyDraftVersionLabel({
            draftId,
            preferred: version,
            existingVisible: existingVersionNames,
            remark,
          });
          if (renamed.fallbackFrom) {
            message.warning(
              `「${renamed.fallbackFrom}」已被占用（含页面不可见的软删历史标签）。已自动改用 ${renamed.applied}。`,
            );
          } else {
            message.success(
              `已创建编辑草稿 ${renamed.applied}，可在下方增删文件或样本`,
            );
          }
        } catch (renameError) {
          try {
            await deleteDatasetVersion(draftId, { skipErrorHandler: true });
          } catch {
            // ignore cleanup failure
          }
          throw new Error(
            getApiErrorMessage(
              renameError,
              `版本号「${version}」及后续候选均被占用（正式版/草稿/软删均算）。请改用未占用标签，如 v3 或 v1.0.10。`,
            ),
          );
        }
        setWorkspaceEditSourceVersionId(sourceId);
        setVersionModalOpen(false);
        await loadDetail();
        setPreviewVersionId(draftId);
        scrollToWorkspace();
        return;
      } else if (editingVersion) {
        const remark = values.remark?.trim();
        await updateDatasetVersion(
          editingVersion.id,
          {
            version: editingVersion.version,
            versionLabel: editingVersion.version,
            remark,
            description: remark,
          },
          { skipErrorHandler: true },
        );
        message.success('版本描述已更新');
      }
      setVersionModalOpen(false);
      await loadDetail();
    } catch (error: any) {
      if (error?.errorFields) return;
      message.error(getApiErrorMessage(error, '操作失败'));
    } finally {
      setVersionModalLoading(false);
    }
  };

  const handleDeleteVersion = async (versionId: string) => {
    try {
      await deleteDatasetVersion(versionId);
      message.success('版本已删除');
      if (previewVersionId === versionId) {
        setPreviewVersionId(undefined);
      }
      await loadDetail();
    } catch (error: any) {
      message.error(error?.info?.message || error?.message || '删除失败');
    }
  };

  const activeCurrentVersionId =
    datasetInfo?.currentVersionId ?? datasetInfo?.defaultVersionId;

  const handleSetCurrentVersion = async (record: API.DatasetVersionDetail) => {
    if (!id || !datasetInfo) return;
    const versionId =
      resolveDatasetVersionId(record, datasetInfo.id) ?? record.id;
    if (!versionId) return;
    try {
      await switchDatasetCurrentVersion(id, versionId, {
        skipErrorHandler: true,
      });
      message.success('已设为当前版本');
      await loadDetail();
    } catch (error: any) {
      message.error(
        error?.info?.message || error?.message || '切换当前版本失败',
      );
    }
  };

  const handleVersionStatusChange = async (
    record: API.DatasetVersionDetail,
    status: 'DEPRECATED' | 'ARCHIVED',
  ) => {
    const versionId =
      resolveDatasetVersionId(record, datasetInfo?.id) ?? record.id;
    if (!versionId) return;
    try {
      await updateDatasetVersionStatus(versionId, status, {
        skipErrorHandler: true,
      });
      message.success(
        status === 'DEPRECATED' ? '已标记为废弃版本' : '已归档该版本',
      );
      await loadDetail();
    } catch (error: any) {
      message.error(
        error?.info?.message || error?.message || '更新版本状态失败',
      );
    }
  };

  const handleSelectPreview = async (
    record: API.DatasetVersionDetail,
    scrollToPreview = true,
  ) => {
    const versionId =
      resolveDatasetVersionId(record, datasetInfo?.id) ?? record.id;
    if (!versionId || versionId === datasetInfo?.id) {
      message.warning('无法识别数据集版本 ID，请确认后端返回的版本 id 字段');
      return;
    }
    setPreviewVersionId(versionId);

    if (!scrollToPreview) return;

    if (datasetInfo?.type === 'POINT_CLOUD') {
      document
        .getElementById('point-cloud-preview')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      await previewPanelRef.current?.loadVersion(record);
      return;
    }

    if (
      datasetInfo?.type === 'CV' ||
      datasetInfo?.type === 'NLP' ||
      datasetInfo?.type === 'MULTIMODAL'
    ) {
      requestAnimationFrame(() => {
        previewSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      });
    }
  };

  const previewVersion = datasetInfo?.versions.find(
    (v) =>
      (resolveDatasetVersionId(v, datasetInfo.id) ?? v.id) === previewVersionId,
  );
  const isPointCloud = datasetInfo?.type === 'POINT_CLOUD';
  const isMultimodal = datasetInfo?.type === 'MULTIMODAL';
  const supportsWorkspaceEdit = supportsDatasetWorkspaceEdit(datasetInfo?.type);
  const workspaceDatasetType = supportsWorkspaceEdit
    ? (datasetInfo.type as WorkspaceEditableDatasetType)
    : undefined;
  const supportsInlinePreview =
    datasetInfo?.type === 'CV' || datasetInfo?.type === 'NLP';
  const previewIsWorkspaceDraft = isWorkspaceDraftVersion(
    previewVersion,
    draftContext,
  );
  const previewIsImportDraft = isImportDraftVersion(
    previewVersion,
    draftContext,
  );
  const workspaceParentVersion = previewVersion?.parentVersionId
    ? datasetInfo?.versions.find(
        (item) =>
          item.id === previewVersion.parentVersionId ||
          resolveDatasetVersionId(item, datasetInfo?.id) ===
            previewVersion.parentVersionId,
      )
    : undefined;
  const previewVersionReady =
    isMultimodal &&
    !previewIsWorkspaceDraft &&
    !previewIsImportDraft &&
    previewVersionId != null &&
    (previewVersion?.status === 'READY' || !previewVersion?.status);

  const importDraftVersionId = datasetInfo?.latestDraftVersionId ?? undefined;
  const showImportBanner =
    isMultimodal &&
    !!datasetInfo?.importJobId &&
    !!previewVersionId &&
    !!importDraftVersionId &&
    previewVersionId === importDraftVersionId &&
    previewIsImportDraft;

  const hasBackgroundImport =
    isMultimodal &&
    !!datasetInfo?.importJobId &&
    !!importDraftVersionId &&
    previewVersionId !== importDraftVersionId &&
    ['PENDING', 'RUNNING', 'FAILED'].includes(datasetInfo?.importStatus ?? '');

  const versionFormRules = useMemo(
    () => datasetVersionFormRules(existingVersionNames),
    [existingVersionNames],
  );

  if (loading) {
    return (
      <PageContainer
        title="数据集详情"
        onBack={() => history.push('/dataset/list')}
      >
        <div style={{ textAlign: 'center', padding: 80 }}>
          <Spin size="large" />
        </div>
      </PageContainer>
    );
  }

  if (!datasetInfo) {
    return (
      <PageContainer
        title="数据集详情"
        onBack={() => history.push('/dataset/list')}
      >
        <Empty description="未找到数据集详情" />
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="数据集详情"
      subTitle="数据集资产与版本管理；版本号可用 vN 或 vX.Y.Z，版本描述记录更新原因与内容"
      onBack={() => history.push('/dataset/list')}
      extra={
        <Space>
          <Button type="primary" onClick={handleUploadNewVersion}>
            上传新版本
          </Button>
          <Button
            onClick={() =>
              handleDownload(datasetInfo.latestVersion?.storagePath)
            }
          >
            下载最新版本
          </Button>
          <Popconfirm
            title="确认删除该数据集？删除后无法恢复。"
            onConfirm={handleDelete}
          >
            <Button danger>删除数据集</Button>
          </Popconfirm>
          <Button onClick={() => history.push('/dataset/list')}>
            返回列表
          </Button>
        </Space>
      }
    >
      <Card title="基本信息" style={{ marginBottom: 16 }}>
        <Descriptions column={2}>
          <Descriptions.Item label="数据集名称">
            <strong>{datasetInfo.name}</strong>
          </Descriptions.Item>
          <Descriptions.Item label="类型">
            <Tag color={DATASET_TYPE_COLOR[datasetInfo.type] ?? 'green'}>
              {DATASET_TYPE_LABEL[datasetInfo.type] ?? datasetInfo.type}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="最近上传时间">
            {formatDisplayDateTime(datasetInfo.uploadTime)}
          </Descriptions.Item>
          <Descriptions.Item label="版本数量">
            {datasetInfo.versions.length}
          </Descriptions.Item>
          <Descriptions.Item label="资产备注" span={2}>
            {datasetInfo.remark || '-'}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {supportsWorkspaceEdit && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="版本维护说明"
          description={
            <>
              <strong>上传新版本</strong>：替换整包数据，适合大批量更换。
              <br />
              <strong>编辑当前版本</strong>：基于 zip
              格式的当前正式版创建编辑草稿，可删除/恢复
              {isMultimodal ? '样本' : '文件'}、追加 zip
              {isMultimodal ? '新增样本' : '新增文件'}
              ，完成后「发布为新版本」才生效。
            </>
          }
        />
      )}

      {hasBackgroundImport && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="另有版本正在导入"
          description={
            <Space>
              <span>当前选中的是其他版本；最新 DRAFT 仍在后台导入样本。</span>
              <Button
                type="link"
                size="small"
                style={{ padding: 0 }}
                onClick={() => {
                  if (importDraftVersionId) {
                    setPreviewVersionId(importDraftVersionId);
                    previewSectionRef.current?.scrollIntoView({
                      behavior: 'smooth',
                      block: 'start',
                    });
                  }
                }}
              >
                查看导入中的版本
              </Button>
            </Space>
          }
        />
      )}

      {showImportBanner && (
        <MultimodalImportBanner
          importJobId={datasetInfo.importJobId}
          initialStatus={datasetInfo.importStatus}
          initialProgress={datasetInfo.importProgress}
          initialErrorMessage={datasetInfo.importErrorMessage}
          onImportFinished={loadDetail}
        />
      )}

      <Card
        title="版本列表"
        style={{ marginBottom: 16 }}
        extra={
          !isMultimodal ? (
            <Button
              type="dashed"
              icon={<PlusOutlined />}
              onClick={openCreateVersion}
            >
              新建版本记录
            </Button>
          ) : undefined
        }
      >
        <Table
          dataSource={datasetInfo.versions}
          rowKey="id"
          pagination={false}
          scroll={{ x: 1280 }}
          locale={{ emptyText: '暂无版本记录' }}
          onRow={(record) => ({
            onClick: () => handleSelectPreview(record),
            style: {
              cursor: 'pointer',
              background:
                (resolveDatasetVersionId(record, datasetInfo.id) ??
                  record.id) === previewVersionId
                  ? '#e6f4ff'
                  : undefined,
            },
          })}
          columns={[
            {
              title: '版本号',
              dataIndex: 'version',
              key: 'version',
              width: 120,
              render: (text: string, record: API.DatasetVersionDetail) => {
                const vid =
                  resolveDatasetVersionId(record, datasetInfo.id) ?? record.id;
                const isCurrent =
                  !!vid &&
                  !!activeCurrentVersionId &&
                  vid === activeCurrentVersionId;
                return (
                  <Space size={4}>
                    <span>{text}</span>
                    {isCurrent && <Tag color="blue">当前</Tag>}
                  </Space>
                );
              },
            },
            {
              title: '状态',
              dataIndex: 'status',
              key: 'status',
              width: 100,
              render: (status: string, record: API.DatasetVersionDetail) => {
                if (isWorkspaceDraftVersion(record, draftContext)) {
                  return <Tag color="processing">编辑草稿</Tag>;
                }
                if (isImportDraftVersion(record, draftContext)) {
                  return <Tag color="default">导入中</Tag>;
                }
                if (status === 'DEPRECATED') {
                  return <Tag color="warning">已废弃</Tag>;
                }
                if (status === 'ARCHIVED') {
                  return <Tag>已归档</Tag>;
                }
                return (
                  <Tag color={status === 'READY' ? 'success' : 'default'}>
                    {status || 'READY'}
                  </Tag>
                );
              },
            },
            {
              title: '文件名',
              dataIndex: 'fileName',
              key: 'fileName',
              width: 200,
              ellipsis: true,
              render: (text: string) => <TableEllipsisCell text={text} />,
            },
            { title: '大小', dataIndex: 'size', key: 'size', width: 100 },
            {
              title: '上传时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              width: 180,
              render: (value?: string) => formatDisplayDateTime(value),
            },
            {
              title: '版本描述',
              dataIndex: 'remark',
              key: 'remark',
              width: 160,
              ellipsis: true,
              render: (text: string) =>
                text ? (
                  <Tooltip title={text}>
                    <span>{text}</span>
                  </Tooltip>
                ) : (
                  <Typography.Text type="secondary">未填写</Typography.Text>
                ),
            },
            {
              title: '操作',
              key: 'action',
              width: 480,
              fixed: 'right',
              align: 'left',
              render: (_, record: API.DatasetVersionDetail) => {
                const vid =
                  resolveDatasetVersionId(record, datasetInfo.id) ?? record.id;
                const isCurrent =
                  !!vid &&
                  !!activeCurrentVersionId &&
                  vid === activeCurrentVersionId;
                const canSetCurrent =
                  record.status === 'READY' &&
                  !isCurrent &&
                  !isWorkspaceDraftVersion(record, draftContext);
                const canDeprecate =
                  record.status === 'READY' &&
                  !isCurrent &&
                  !isWorkspaceDraftVersion(record, draftContext) &&
                  !isImportDraftVersion(record, draftContext);
                const canArchive = record.status === 'DEPRECATED';
                const canEditVersionWorkspace =
                  supportsWorkspaceEdit &&
                  (isWorkspaceDraftVersion(record, draftContext) ||
                    (record.status === 'READY' &&
                      !isImportDraftVersion(record, draftContext) &&
                      isZipBackedDatasetVersion(record)));

                return (
                  <Space
                    size={0}
                    wrap
                    split={<span style={{ color: '#f0f0f0' }}>|</span>}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button
                      type="link"
                      style={{ paddingLeft: 0 }}
                      onClick={() => handleSelectPreview(record)}
                    >
                      选中预览
                    </Button>
                    {canEditVersionWorkspace && (
                      <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => handleEditCurrentVersion(record)}
                      >
                        编辑当前版本
                      </Button>
                    )}
                    <Button type="link" onClick={() => openEditRemark(record)}>
                      编辑描述
                    </Button>
                    {canSetCurrent && (
                      <Popconfirm
                        title="将此版本设为列表和训练的默认当前版本？"
                        onConfirm={() => handleSetCurrentVersion(record)}
                      >
                        <Button type="link">设为当前</Button>
                      </Popconfirm>
                    )}
                    {canDeprecate && (
                      <Popconfirm
                        title="标记为废弃后不可用于新训练，仍可预览（多模态除外）。"
                        onConfirm={() =>
                          handleVersionStatusChange(record, 'DEPRECATED')
                        }
                      >
                        <Button type="link">废弃</Button>
                      </Popconfirm>
                    )}
                    {canArchive && (
                      <Popconfirm
                        title="归档后不可预览或训练，确认归档？"
                        onConfirm={() =>
                          handleVersionStatusChange(record, 'ARCHIVED')
                        }
                      >
                        <Button type="link">归档</Button>
                      </Popconfirm>
                    )}
                    <Button
                      type="link"
                      onClick={() => handleDownload(record.storagePath)}
                    >
                      下载
                    </Button>
                    <Popconfirm
                      title="确认删除该版本？"
                      onConfirm={() => handleDeleteVersion(record.id)}
                    >
                      <Button type="link" danger>
                        删除
                      </Button>
                    </Popconfirm>
                  </Space>
                );
              },
            },
          ]}
        />
        <Typography.Text
          type="secondary"
          style={{ display: 'block', marginTop: 8 }}
        >
          版本号可用 vN 或 vX.Y.Z（如
          v2、v1.0.0），资产内须唯一；版本描述记录更新原因与内容。新建版本记录后请「上传新版本」绑定文件；点击行可切换下方预览。
        </Typography.Text>
      </Card>

      {!isPointCloud && (
        <div ref={previewSectionRef}>
          <Card
            title={
              previewIsWorkspaceDraft
                ? '版本编辑草稿'
                : isMultimodal
                  ? '多模态样本'
                  : '内容预览'
            }
            extra={
              previewVersion ? (
                <Typography.Text
                  type="secondary"
                  ellipsis={{ tooltip: previewVersion.fileName }}
                  style={{ maxWidth: 480 }}
                >
                  当前版本：{previewVersion.version}
                  {previewVersion.fileName
                    ? ` · ${previewVersion.fileName}`
                    : ''}
                </Typography.Text>
              ) : null
            }
          >
            {previewIsWorkspaceDraft &&
            previewVersionId &&
            workspaceDatasetType ? (
              <MultimodalWorkspacePanel
                key={previewVersionId}
                draftVersionId={previewVersionId}
                datasetType={workspaceDatasetType}
                draftVersionLabel={previewVersion?.version}
                parentVersionLabel={workspaceParentVersion?.version}
                onPublished={async () => {
                  const publishedId = previewVersionId;
                  setWorkspaceEditSourceVersionId(undefined);
                  await loadDetail();
                  if (publishedId) {
                    setPreviewVersionId(publishedId);
                  }
                }}
                onRefresh={loadDetail}
                onCancelEdit={handleCancelWorkspaceEdit}
              />
            ) : isMultimodal ? (
              previewVersionReady ? (
                <MultimodalPreviewPanel
                  key={previewVersionId}
                  versionId={previewVersionId}
                  compact
                />
              ) : (
                <Empty description="该版本正在后台导入样本，导入完成并变为 READY 后可浏览；导入期间无法编辑删除。" />
              )
            ) : supportsInlinePreview ? (
              <>
                {previewVersion?.parentVersionId ? (
                  <Alert
                    type="info"
                    showIcon
                    style={{ marginBottom: 12 }}
                    message="本版本来自工作区发布"
                    description="左侧优先展示本版本样本（含 APPEND 追加）。若样本接口不可用，会回退到主包 ZIP（主包不会自动合并追加包）。"
                  />
                ) : null}
                <DatasetPreviewPanel
                  key={previewVersionId}
                  versionId={previewVersionId}
                  compact
                  preferSamples={!!previewVersion?.parentVersionId}
                />
              </>
            ) : (
              <Empty description="当前类型不支持在线预览" />
            )}
          </Card>
        </div>
      )}

      {isPointCloud &&
        (previewIsWorkspaceDraft && previewVersionId && workspaceDatasetType ? (
          <Card title="版本编辑草稿" style={{ marginBottom: 16 }}>
            <MultimodalWorkspacePanel
              key={previewVersionId}
              draftVersionId={previewVersionId}
              datasetType={workspaceDatasetType}
              draftVersionLabel={previewVersion?.version}
              parentVersionLabel={workspaceParentVersion?.version}
              onPublished={async () => {
                const publishedId = previewVersionId;
                setWorkspaceEditSourceVersionId(undefined);
                await loadDetail();
                if (publishedId) {
                  setPreviewVersionId(publishedId);
                }
              }}
              onRefresh={loadDetail}
              onCancelEdit={handleCancelWorkspaceEdit}
            />
          </Card>
        ) : (
          <PointCloudPreviewPanel
            ref={previewPanelRef}
            onSelectionChange={setPreviewVersionId}
          />
        ))}

      <Modal
        title={
          versionModalMode === 'create'
            ? '新建版本记录'
            : versionModalMode === 'editWorkspace'
              ? '编辑当前版本'
              : '编辑版本描述'
        }
        open={versionModalOpen}
        onCancel={() => setVersionModalOpen(false)}
        onOk={submitVersionModal}
        confirmLoading={versionModalLoading}
        destroyOnClose
        width={560}
        okText={versionModalMode === 'editWorkspace' ? '开始编辑' : '确定'}
      >
        <Form form={versionForm} layout="vertical">
          {(versionModalMode === 'create' ||
            versionModalMode === 'editWorkspace') && (
            <Form.Item
              name="version"
              label="新版本号"
              rules={versionFormRules}
              extra={DATASET_VERSION_FORMAT_HINT}
            >
              <Input placeholder="例如 v1.0.1" />
            </Form.Item>
          )}
          <Form.Item
            name="remark"
            label="版本描述"
            rules={datasetVersionDescFormRules()}
            extra="说明本版本的更新原因与内容"
          >
            <Input.TextArea
              rows={4}
              placeholder={DATASET_VERSION_DESC_PLACEHOLDER}
              showCount
              maxLength={2000}
            />
          </Form.Item>
          {versionModalMode === 'create' && (
            <Alert
              type="info"
              showIcon
              message="创建版本记录后，请通过「上传新版本」上传数据文件完成绑定。"
            />
          )}
          {versionModalMode === 'editWorkspace' && (
            <Alert
              type="info"
              showIcon
              message="将基于当前正式版本创建新版本草稿"
              description={
                <>
                  版本号在资产内唯一，
                  <strong>已取消/软删的草稿标签仍占用</strong>
                  ，列表里可能看不到。若提示被占用，请改用 v3、v1.0.3
                  等更大号；前端也会自动尝试跳号。同一资产同时只能有一个未发布草稿。
                </>
              }
            />
          )}
        </Form>
      </Modal>
    </PageContainer>
  );
};

export default DatasetDetail;
