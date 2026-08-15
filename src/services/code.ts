/**
 * 代码资产上传 Service
 */
import { request } from '@umijs/max';
import { isTrainingCodeAutoApproveEnabled } from '@/constants/trainingCode';
import { downloadAuthFile } from '@/utils/authFileDownload';
import {
  listPendingCodeVersions,
  removePendingCodeVersion,
  upsertPendingCodeVersion,
} from '@/utils/pendingCodeVersions';
import {
  approveV2CodeVersion,
  buildV2ApprovalRequest,
  extractV2FileText,
  fetchAllV2CodeTreeFiles,
  flattenV2CodeTree,
  getAdminCodeReviewTaskDetail,
  getV2CodeConsumerManifest,
  getV2CodeRiskAssessment,
  getV2CodeVersion,
  getV2CodeVersionFileContent,
  getV2CodeVersionTree,
  getV2CodeAsset,
  deleteV2CodeAsset,
  patchV2CodeAsset,
  listV2CodeAssetVersions,
  listV2CodeWorkspaces,
  openV2CodeWorkspace,
  getV2CodeWorkspaceFileMetadata,
  getV2CodeWorkspaceFileContent,
  getV2CodeWorkspace,
  upsertV2CodeWorkspaceFile,
  deleteV2CodeWorkspaceFile,
  moveV2CodeWorkspaceFile,
  abandonV2CodeWorkspace,
  getV2CodeWorkspaceTree,
  publishV2CodeWorkspace,
  validateV2CodeWorkspace,
  downloadV2CodeWorkspaceFileBlob,
  downloadV2CodeVersionFileBlob,
  importV2CodeAssetZip,
  listV2CodeAssets,
  deprecateV2CodeVersion,
  archiveV2CodeVersion,
  upgradeV2CodeArtifact,
  listAdminCodeReviewFindings,
  rescanAdminCodeReviewTask,
  hasV2ApprovalEvidence,
  isInternalGeneratedCodeAssetName,
  getAdminCodeAsset,
  listAdminCodeAssets,
  listAdminCodeAssetVersions,
  listAdminCodeReviewTasks,
  mapAdminReviewTaskToListItem,
  mapAdminReviewTaskDetailToCodeVersionDetail,
  normalizeAdminCodeAssetPage,
  normalizeAdminReviewTaskPage,
  mapV2CodeVersionToLegacy,
  normalizeV2ApprovalStatus,
  validateV2CodeVersion,
  errorMessageFromV2,
  errorMessageFromV2Blob,
  getAdminCodeWorkspace,
  getAdminCodeWorkspaceFileMetadata,
  upsertAdminCodeWorkspaceFile,
  deleteAdminCodeWorkspaceFile,
  publishAdminCodeWorkspace,
  abandonAdminCodeWorkspace,
  moveAdminCodeWorkspaceFile,
  validateAdminCodeWorkspace,
  downloadAdminCodeWorkspaceFileBlob,
  listAdminCodeAssetWorkspaces,
  openAdminCodeAssetWorkspace,
  validateAdminCodeVersion,
  deprecateAdminCodeVersion,
  archiveAdminCodeVersion,
  downloadAdminCodeVersionFileBlob,
  getAdminCodeReviewTaskTree,
  getAdminCodeReviewTaskFileContent,
  type V2CodeWorkspace,
  type V2CodeValidationResult,
  type V2AdminCodeReviewTaskDetail,
} from './codeV2';

export const CONSISTENCY_TRAINING_PROFILE = 'image_text_consistency_fusion_logreg';

export type CodeUploadResult = {
  codeAssetId: string;
  codeVersionId: string;
  version: string;
  fileName: string;
  storagePath: string;
  sizeBytes: number;
  trainingProfile: string;
  status: string;
  approvalStatus: string;
};

/** 上传训练代码 ZIP，创建 code_asset + code_version
 * 现网 OpenAPI：metadata 为 query（codeName/trainingProfile 必填），body 仅 multipart file。
 */
export async function uploadCodeZip(
  params: {
    file: File;
    codeName: string;
    version?: string;
    trainingProfile?: string;
    remark?: string;
  },
  options?: { [key: string]: any },
) {
  const formData = new FormData();
  formData.append('file', params.file);

  const query: Record<string, string> = {
    codeName: params.codeName,
    version: params.version || 'v1',
    trainingProfile:
    params.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
  };
  if (params.remark?.trim()) {
    query.remark = params.remark.trim();
  }

  const legacyUpload = () =>
    request<{
      success: boolean;
      data: CodeUploadResult;
      errorMessage?: string;
    }>('/code/upload', {
      method: 'POST',
      params: query,
      data: formData,
      headers: { 'Content-Type': undefined as unknown as string },
      timeout: 5 * 60 * 1000,
      ...(options || {}),
    });

  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const imported = await importV2CodeAssetZip(
      {
        file: params.file,
        metadata: {
          name: params.codeName,
          version: params.version || 'v1',
          trainingProfile:
            params.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
          remark: params.remark?.trim(),
        },
      },
      opts,
    );
    const mapped = mapV2CodeVersionToLegacy(imported);
    const codeVersionId =
      imported.versionId ||
      imported.id ||
      imported.codeVersionId ||
      mapped.codeVersionId ||
      '';
    if (!codeVersionId) {
      throw new Error('V2 导入成功但未返回 codeVersionId');
    }
    return {
      success: true,
      data: {
        codeAssetId:
          imported.assetId ||
          imported.codeAssetId ||
          mapped.codeAssetId ||
          '',
        codeVersionId,
        version: mapped.version || params.version || 'v1',
        fileName: mapped.fileName || params.file.name,
        storagePath: mapped.storagePath || '',
        sizeBytes: mapped.sizeBytes ?? params.file.size,
        trainingProfile:
          mapped.trainingProfile ||
          params.trainingProfile ||
          CONSISTENCY_TRAINING_PROFILE,
        status: mapped.status || 'READY',
        approvalStatus: mapped.approvalStatus || 'PENDING',
      },
    };
  } catch {
    return legacyUpload();
  }
}

export type CodeVersionApprovalResult = {
  codeVersionId: string;
  approvalStatus: string;
  decisionSource?: string;
};

/** 归一化审批状态；决策动词 APPROVE/REJECT/REVOKE 也映射到状态枚举 */
export function normalizeCodeApprovalStatus(
  status?: string | null,
): string | undefined {
  return normalizeV2ApprovalStatus(status);
}

export type CodeVersionListItem = {
  codeVersionId: string;
  codeAssetId: string;
  /** 用户填写的代码名称（优先展示） */
  codeName?: string;
  codeAssetName: string;
  version: string;
  fileName: string;
  trainingProfile: string;
  approvalStatus: string;
  status: string;
  validationStatus?: string;
  validationPolicyVersion?: string;
  artifactSha256?: string;
  riskAssessmentId?: string;
  riskStatus?: string;
  riskLevel?: string;
  reviewDisposition?: string;
  riskPolicyVersion?: string;
  /** 上传/创建时间（优先展示） */
  createdAt?: string;
  /** 与 createdAt 同源，待审队列等场景沿用此字段名 */
  submittedAt?: string;
  /** 资产归属用户 ID（管理员跨用户视图） */
  ownerUserId?: number | string;
};

/** 训练代码版本列表（当前用户可见版本；现网 OpenAPI 无查询参数） */
export async function fetchCodeVersionList(
  params?: {
    approvalStatus?: string;
    codeName?: string;
    current?: number;
    pageSize?: number;
  },
  options?: { [key: string]: any },
) {
  // 不向现网 list 传空 codeName / 未声明分页参数，避免后端按空值过滤成 0 条
  const query: Record<string, string | number> = {};
  const codeName = params?.codeName?.trim();
  if (codeName) {
    query.codeName = codeName;
  }
  if (params?.approvalStatus) {
    query.approvalStatus = params.approvalStatus;
  }

  return request<{
    success: boolean;
    data: CodeVersionListItem[] | { data?: CodeVersionListItem[]; total?: number };
    total?: number;
    errorMessage?: string;
  }>('/code/version/list', {
    method: 'GET',
    params: Object.keys(query).length ? query : undefined,
    ...(options || {}),
  }).then(async (res) => {
    const raw = res?.data;
    let list: CodeVersionListItem[] = [];
    let total = 0;
    if (Array.isArray(raw)) {
      list = raw;
      total = res.total ?? raw.length;
    } else if (raw && typeof raw === 'object' && Array.isArray(raw.data)) {
      list = raw.data;
      total = raw.total ?? res.total ?? raw.data.length;
    } else {
      return { ...res, data: [] as CodeVersionListItem[], total: 0 };
    }
    // legacy list 不含 validationStatus/riskLevel；V2 版本常不含 trainingProfile
    const enriched = await Promise.all(
      list.map((item) =>
        enrichCodeVersionDisplayFields(item, {
          ...(options || {}),
          enrichRisk: true,
        }),
      ),
    );
    return { ...res, data: enriched, total };
  });
}

/** 已审核、可用于 K8s 训练的训练代码版本列表 */
export async function fetchApprovedCodeVersions(options?: { [key: string]: any }) {
  const res = await fetchCodeVersionList(undefined, options);
  if (!res?.data) {
    return res;
  }
  return {
    ...res,
    data: res.data.filter((item) => item.approvalStatus === 'APPROVED'),
  };
}

function unwrapAssetList(payload: unknown): import('./codeV2').V2CodeAsset[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      return obj.items as import('./codeV2').V2CodeAsset[];
    }
    if (Array.isArray(obj.data)) {
      return obj.data as import('./codeV2').V2CodeAsset[];
    }
    const nested = obj.data;
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const inner = nested as Record<string, unknown>;
      if (Array.isArray(inner.items)) {
        return inner.items as import('./codeV2').V2CodeAsset[];
      }
    }
  }
  return [];
}

/** 本地待审登记补进列表，避免 PENDING/REJECTED 被 legacy 列表滤掉后看不到记录。
 * 仅合并「当前用户上传/发布」类登记；管理员待审产生的空壳不得混进本人列表。
 */
function mergeLocalPendingRows(
  rows: CodeVersionListItem[],
): CodeVersionListItem[] {
  const remoteIds = new Set(rows.map((item) => item.codeVersionId));
  const ownerSources = new Set(['upload', 'publish', 'manual', 'api']);
  const extras: CodeVersionListItem[] = listPendingCodeVersions()
    .filter((item) => {
      const id = item.codeVersionId?.trim();
      if (!id || remoteIds.has(id)) return false;
      const source = item.source;
      if (source && !ownerSources.has(source)) return false;
      // 无名称/文件名/资产 ID 的空壳（常见于管理员拒绝时误写入）一律丢弃
      if (
        !item.codeAssetName?.trim() &&
        !item.fileName?.trim() &&
        !item.codeAssetId?.trim()
      ) {
        return false;
      }
      return true;
    })
    .map((item) => ({
      codeVersionId: item.codeVersionId,
      codeAssetId: item.codeAssetId?.trim() || '',
      codeName: item.codeAssetName,
      codeAssetName: item.codeAssetName || item.codeVersionId,
      version: '',
      fileName: item.fileName || '',
      trainingProfile: item.trainingProfile || '',
      approvalStatus: item.approvalStatus || 'PENDING',
      status: '',
      createdAt: item.uploadedAt,
      submittedAt: item.uploadedAt,
    }));
  return extras.length ? [...extras, ...rows] : rows;
}

/**
 * 当前用户全部代码版本（含 PENDING / REJECTED / REVOKED），供训练代码列表看审核状态。
 * legacy /code/version/list 只返回 READY+APPROVED，不能用来展示待审/拒绝记录。
 */
export async function fetchOwnerCodeVersionInventory(options?: {
  [key: string]: any;
}) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const assets = unwrapAssetList(await listV2CodeAssets(opts));
    const rows: CodeVersionListItem[] = [];
    await Promise.all(
      assets.map(async (asset) => {
        const assetId = String(asset.id || '').trim();
        if (!assetId) return;
        try {
          const versions = unwrapVersionList(
            await listV2CodeAssetVersions(assetId, opts),
          );
          versions.forEach((version) => {
            const mapped = mapV2CodeVersionToLegacy(version);
            const displayName =
              (asset.name && !isInternalGeneratedCodeAssetName(asset.name)
                ? asset.name.trim()
                : undefined) ||
              mapped.codeName ||
              mapped.codeAssetName;
            if (!mapped.codeVersionId) return;
            rows.push({
              ...mapped,
              codeAssetId: mapped.codeAssetId || assetId,
              codeName: displayName || mapped.codeName,
              codeAssetName: displayName || mapped.codeAssetName,
              trainingProfile:
                mapped.trainingProfile || asset.trainingProfile || '',
            });
          });
        } catch {
          // 单个资产版本失败不影响其它资产
        }
      }),
    );
    const enriched = await Promise.all(
      rows.map((item) =>
        enrichCodeVersionDisplayFields(item, { ...opts, enrichRisk: true }),
      ),
    );
    const merged = mergeLocalPendingRows(enriched);
    return { success: true, data: merged, total: merged.length };
  } catch {
    const res = await fetchCodeVersionList(undefined, options);
    const list = Array.isArray(res?.data) ? res.data : [];
    const merged = mergeLocalPendingRows(list);
    return { ...res, data: merged, total: merged.length };
  }
}

/** 管理员待审核队列：走 V2 `/api/v2/admin/code-review-tasks` */
export async function fetchPendingCodeReviewTasks(
  params?: {
    approvalStatus?: string;
    riskLevel?: string;
    ownerUserId?: number;
    keyword?: string;
    submittedFrom?: string;
    submittedTo?: string;
    sortBy?: string;
    sortDirection?: 'ASC' | 'DESC';
    current?: number;
    pageSize?: number;
  },
  options?: { [key: string]: any },
) {
  const approvalStatus = params?.approvalStatus ?? 'PENDING';
  const keyword = params?.keyword?.trim() || undefined;
  const current = params?.current ?? 1;
  const pageSize = params?.pageSize ?? 20;
  const payload = await listAdminCodeReviewTasks(
    {
      approvalStatus,
      riskLevel: params?.riskLevel,
      ownerUserId: params?.ownerUserId,
      keyword,
      submittedFrom: params?.submittedFrom?.trim() || undefined,
      submittedTo: params?.submittedTo?.trim() || undefined,
      sortBy: params?.sortBy,
      sortDirection: params?.sortDirection,
      page: Math.max(0, current - 1),
      pageSize,
    },
    options,
  );
  const page = normalizeAdminReviewTaskPage(payload);
  const mapped = page.items
    .map(mapAdminReviewTaskToListItem)
    .filter((item) => item.codeVersionId?.trim());
  const enriched = await Promise.all(
    mapped.map((item) => enrichAdminReviewListItem(item, options)),
  );

  const remoteIds = new Set(enriched.map((item) => item.codeVersionId));
  const shouldFallback =
    current === 1 &&
    !params?.riskLevel &&
    !params?.submittedFrom &&
    !params?.submittedTo &&
    (enriched.length === 0 || Boolean(keyword));
  const extra = shouldFallback
    ? await fallbackPendingFromAdminAssets(
        {
          approvalStatus,
          keyword,
          ownerUserId: params?.ownerUserId,
        },
        remoteIds,
        options,
      )
    : [];

  return {
    success: true,
    data: [...extra, ...enriched],
    total: (page.totalElements ?? enriched.length) + extra.length,
  };
}

/** 审核队列条目补用户可见名称（避免只展示内部 code-asset-xxx） */
async function enrichAdminReviewListItem(
  item: CodeVersionListItem,
  options?: { [key: string]: any },
): Promise<CodeVersionListItem> {
  let next = { ...item };
  const needName = !pickDisplayCodeName(next);
  const needFile = !next.fileName?.trim();
  const needProfile = !next.trainingProfile?.trim();
  if (!needName && !needFile && !needProfile) return next;

  if (next.codeVersionId && (needFile || needProfile || needName)) {
    try {
      const detail = await getAdminCodeReviewTaskDetail(next.codeVersionId, {
        skipErrorHandler: true,
      ...(options || {}),
      });
      const legacy = mapAdminReviewTaskDetailToCodeVersionDetail(detail);
      next = {
        ...next,
        codeAssetId: next.codeAssetId || legacy.codeAssetId,
        fileName: next.fileName?.trim() || legacy.fileName || '',
        trainingProfile:
          next.trainingProfile?.trim() || legacy.trainingProfile || '',
        codeName: next.codeName || legacy.codeName,
        codeAssetName:
          pickDisplayCodeName(next) ||
          pickDisplayCodeName(legacy) ||
          next.codeAssetName ||
          legacy.codeAssetName,
      };
    } catch {
      // 详情失败时再尝试资产接口
    }
  }

  if (!pickDisplayCodeName(next) && next.codeAssetId) {
    try {
      const asset = await getAdminCodeAsset(next.codeAssetId, {
        skipErrorHandler: true,
        ...(options || {}),
      });
      const name = asset?.name?.trim();
      if (name) {
        next = {
          ...next,
          codeName: isInternalGeneratedCodeAssetName(name)
            ? next.codeName
            : name,
          codeAssetName: isInternalGeneratedCodeAssetName(name)
            ? next.codeAssetName || name
            : name,
          trainingProfile: next.trainingProfile || asset.trainingProfile || '',
        };
      }
    } catch {
      // 跨 owner 资产名拿不到时保持原值
    }
  }
  return next;
}

function unwrapVersionList(
  payload: unknown,
): import('./codeV2').V2CodeVersion[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      return obj.items as import('./codeV2').V2CodeVersion[];
    }
    if (Array.isArray(obj.data)) {
      return obj.data as import('./codeV2').V2CodeVersion[];
    }
  }
  return [];
}

/** 审核任务队列为空或按名称搜不到时，从管理员资产版本兜底 */
async function fallbackPendingFromAdminAssets(
  params: {
    approvalStatus?: string;
    keyword?: string;
    ownerUserId?: number;
  },
  existingIds: Set<string>,
  options?: { [key: string]: any },
): Promise<CodeVersionListItem[]> {
  const wanted = String(params.approvalStatus || 'PENDING').toUpperCase();
  try {
    const res = await listAdminCodeAssets(
      {
        page: 0,
        pageSize: 50,
        keyword: params.keyword,
        ownerUserId:
          params.ownerUserId != null ? String(params.ownerUserId) : undefined,
        sortBy: 'UPDATED_AT',
        sortDirection: 'DESC',
      },
      { skipErrorHandler: true, ...(options || {}) },
    );
    const assets = normalizeAdminCodeAssetPage(res).items;
    const extras: CodeVersionListItem[] = [];
    await Promise.all(
      assets.map(async (asset) => {
        const assetId = (asset.id || asset.assetId || '').trim();
        if (!assetId) return;
        try {
          const versions = unwrapVersionList(
            await listAdminCodeAssetVersions(assetId, {
              skipErrorHandler: true,
              ...(options || {}),
            }),
          );
          versions.forEach((version) => {
            const versionId = (
              version.versionId ||
              version.codeVersionId ||
              version.id ||
              ''
            ).trim();
            if (!versionId || existingIds.has(versionId)) return;
            if (String(version.approvalStatus || '').toUpperCase() !== wanted) {
              return;
            }
            const displayName =
              (asset.name && !isInternalGeneratedCodeAssetName(asset.name)
                ? asset.name
                : undefined) ||
              version.codeName ||
              version.codeAssetName ||
              version.assetName ||
              asset.name ||
              '';
            extras.push({
              codeVersionId: versionId,
              codeAssetId: assetId,
              codeName: displayName || undefined,
              codeAssetName: displayName,
              version: version.versionLabel || version.version || '',
              fileName: version.fileName || '',
              trainingProfile:
                version.trainingProfile || asset.trainingProfile || '',
              approvalStatus: version.approvalStatus || wanted,
              status: version.status || 'READY',
              validationStatus: version.validationStatus,
              riskLevel: version.riskLevel,
              riskStatus: version.riskStatus,
              submittedAt: version.publishedAt || version.createdAt,
              ownerUserId: asset.ownerUserId,
            });
            existingIds.add(versionId);
          });
        } catch {
          // 单个资产版本失败不影响其它兜底
        }
      }),
    );
    return extras;
  } catch {
    return [];
  }
}

/** 管理员审批训练代码版本（APPROVE / REJECT / REVOKE） */
export async function decideCodeVersion(
  codeVersionId: string,
  decision: 'APPROVE' | 'REJECT' | 'REVOKE',
  options?: { [key: string]: any } & { reason?: string },
) {
  const reason = options?.reason;
  if ((decision === 'REJECT' || decision === 'REVOKE') && !reason?.trim()) {
    throw new Error('拒绝或撤销时必须填写原因');
  }

  let detail: Awaited<ReturnType<typeof getAdminCodeReviewTaskDetail>> | undefined;
  let detailError: unknown;
  try {
    detail = await getAdminCodeReviewTaskDetail(codeVersionId, options);
  } catch (error) {
    detailError = error;
  }

  const mapApprovalResult = (data: Record<string, unknown>) => {
    const raw =
      (typeof data?.approvalStatus === 'string' && data.approvalStatus) ||
      (typeof data?.decision === 'string' && data.decision) ||
      '';
    const normalized = normalizeCodeApprovalStatus(raw) ||
      (decision === 'APPROVE'
        ? 'APPROVED'
        : decision === 'REJECT'
          ? 'REJECTED'
          : 'REVOKED');
    return {
      success: true as const,
      data: {
        codeVersionId,
        approvalStatus: normalized,
        decisionSource:
          typeof data?.decisionSource === 'string'
            ? data.decisionSource
            : undefined,
      } as CodeVersionApprovalResult,
    };
  };

  if (detail) {
    if (decision === 'REVOKE' || hasV2ApprovalEvidence(detail)) {
      const data = await approveV2CodeVersion(
        codeVersionId,
        buildV2ApprovalRequest(detail, decision, reason),
        options,
      );
      return mapApprovalResult(data as Record<string, unknown>);
    }
    if (decision === 'APPROVE' || decision === 'REJECT') {
      const risk = detail.riskAssessment;
      const riskHint = risk?.status
        ? `风险扫描状态：${risk.status}`
        : '风险证据尚未生成';
      throw new Error(
        `审批证据未就绪，无法${decision === 'APPROVE' ? '通过' : '拒绝'}。${riskHint}；请等待扫描 COMPLETED 或在「更多」中触发重扫。`,
      );
    }
  }

  if (decision === 'REJECT' || decision === 'REVOKE') {
    if (detailError) throw detailError;
    throw new Error('无法获取审核任务详情，请确认版本仍在待审队列中');
  }

  // APPROVE：管理员详情不可用时尝试 V2（无 expected*）再回退 legacy
  try {
    const body: { decision: 'APPROVE'; reason?: string } = { decision: 'APPROVE' };
    if (reason?.trim()) body.reason = reason.trim();
    const data = await approveV2CodeVersion(codeVersionId, body, options);
    return mapApprovalResult(data as Record<string, unknown>);
  } catch {
  return request<{
    success: boolean;
    data: CodeVersionApprovalResult;
    errorMessage?: string;
  }>(`/code/version/${encodeURIComponent(codeVersionId)}/approve`, {
    method: 'POST',
    ...(options || {}),
    });
  }
}

/** 管理员审核通过训练代码版本（优先 V2 审批证据，失败回退 legacy approve） */
export async function approveCodeVersion(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  return decideCodeVersion(codeVersionId, 'APPROVE', options);
}

/** 读取版本当前审批状态（失败时返回 undefined，不抛错） */
async function peekCodeApprovalStatus(
  codeVersionId: string,
  options?: { [key: string]: any },
): Promise<string | undefined> {
  try {
    const detail = await getV2CodeVersion(codeVersionId, {
      skipErrorHandler: true,
      ...(options || {}),
    });
    return normalizeCodeApprovalStatus(detail?.approvalStatus) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 自动审核通过（管理员审核开关关闭时生效）。
 * 开启管理员审核后为 no-op，人工审核路径保持不变。
 *
 * 说明：现网上传侧常已直接 APPROVED；普通用户再调管理员审批接口会失败
 * （如「代码版本审批失败」）。此时若版本实际已是 APPROVED，视为成功，避免误入待审。
 */
export async function autoApproveCodeVersionIfEnabled(
  codeVersionId: string,
  options?: { [key: string]: any } & { trainingProfile?: string },
): Promise<CodeVersionApprovalResult | undefined> {
  if (!isTrainingCodeAutoApproveEnabled()) return undefined;
  const id = codeVersionId?.trim();
  if (!id) return undefined;

  const { trainingProfile, ...rest } = options || {};
  const opts = { skipErrorHandler: true, ...rest };

  const already = await peekCodeApprovalStatus(id, opts);
  if (already === 'APPROVED') {
    return {
      codeVersionId: id,
      approvalStatus: 'APPROVED',
      decisionSource: 'already-approved',
    };
  }

  const profile = trainingProfile?.trim();
  if (profile) {
    try {
      await checkCodeVersionForTraining(id, profile, opts);
    } catch {
      // 校验失败时仍尝试审批，由审批接口返回明确错误
    }
  }

  try {
    const res = await approveCodeVersion(id, opts);
    if (res?.success === false) {
      throw new Error(res?.errorMessage || '自动审核通过失败');
    }
    return (
      res?.data || {
        codeVersionId: id,
        approvalStatus: 'APPROVED',
      }
    );
  } catch (error) {
    const after = await peekCodeApprovalStatus(id, opts);
    if (after === 'APPROVED') {
      return {
        codeVersionId: id,
        approvalStatus: 'APPROVED',
        decisionSource: 'reconciled',
      };
    }
    throw error;
  }
}

/** 管理员拒绝训练代码版本（reason 必填） */
export async function rejectCodeVersion(
  codeVersionId: string,
  reason: string,
  options?: { [key: string]: any },
) {
  return decideCodeVersion(codeVersionId, 'REJECT', {
    ...(options || {}),
    reason,
  });
}

/** 管理员撤销已批准的训练代码版本（reason 必填） */
export async function revokeCodeVersion(
  codeVersionId: string,
  reason: string,
  options?: { [key: string]: any },
) {
  return decideCodeVersion(codeVersionId, 'REVOKE', {
    ...(options || {}),
    reason,
  });
}

export type CodeVersionTrainingCheckResult = {
  codeVersionId: string;
  trainingProfile: string;
  trainingProfileDisplayName?: string;
  passed: boolean;
  reused?: boolean;
  approvalStatus?: string;
  validationStatus?: string;
  validationPolicyVersion?: string;
  artifactSha256?: string;
  reasonCode?: string;
  reasons?: string[];
  checkedAt?: string;
};

export type CodeVersionDetail = CodeVersionListItem & {
  sizeBytes?: number;
  remark?: string;
  artifactSha256?: string;
  entryScript?: string;
  runtime?: string;
  purpose?: string;
  trainingType?: string;
  consumerManifest?: {
    validationRunId?: string;
    validationPolicyVersion?: string;
    approvalRecordId?: string;
    approvalSource?: string;
    riskAssessmentId?: string;
    riskLevel?: string;
    riskPolicyVersion?: string;
  };
  riskAssessment?: {
    id?: string;
    validationRunId?: string;
    artifactSha256?: string;
    riskPolicyVersion?: string;
    status?: string;
    riskLevel?: string;
    disposition?: string;
    findingCount?: number;
    reasonCode?: string;
    findings?: Array<{
      ruleId?: string;
      severity?: string;
      category?: string;
      filePath?: string;
      lineStart?: number;
      lineEnd?: number;
      description?: string;
    }>;
  };
};

/** 展示用户填写的训练代码名称，忽略后端自动生成的内部资产名 */
export function getCodeUserDisplayName(
  item?: Pick<CodeVersionListItem, 'codeName' | 'codeAssetName'>,
): string {
  const userName = item?.codeName?.trim();
  if (userName) return userName;
  const legacy = item?.codeAssetName?.trim();
  if (legacy && !isInternalGeneratedCodeAssetName(legacy)) return legacy;
  return '-';
}

async function fetchCodeAssetMeta(
  assetId: string | undefined,
  options?: { [key: string]: any },
): Promise<{ name?: string; trainingProfile?: string } | undefined> {
  const id = assetId?.trim();
  if (!id) return undefined;
  try {
    const asset = await getV2CodeAsset(id, {
      skipErrorHandler: true,
      ...(options || {}),
    });
    if (!asset) return undefined;
    return {
      name: asset.name?.trim() || undefined,
      trainingProfile: asset.trainingProfile?.trim() || undefined,
    };
  } catch {
    return undefined;
  }
}

function pickDisplayCodeName(item: CodeVersionListItem): string | undefined {
  const existing = item.codeName?.trim();
  if (existing && !isInternalGeneratedCodeAssetName(existing)) return existing;
  const legacy = item.codeAssetName?.trim();
  if (legacy && !isInternalGeneratedCodeAssetName(legacy)) return legacy;
  return undefined;
}

/**
 * 补全列表/详情展示字段：
 * - codeName：用户填写名称（V2 资产 name）
 * - trainingProfile：版本 DTO 常无此字段，需从资产/manifest 回填
 * - validationStatus / riskLevel：legacy list 不含，需从 V2 版本回填
 */
async function enrichCodeVersionDisplayFields<T extends CodeVersionListItem>(
  item: T,
  options?: { [key: string]: any } & { enrichRisk?: boolean },
): Promise<T> {
  const enrichRisk = options?.enrichRisk !== false;
  let next: T = { ...item };
  const needName = !pickDisplayCodeName(next);
  const needProfile = !next.trainingProfile?.trim();
  const needRisk =
    enrichRisk && (!next.validationStatus?.trim() || !next.riskLevel?.trim());

  const [assetMeta, v2Version] = await Promise.all([
    needName || needProfile
      ? fetchCodeAssetMeta(next.codeAssetId, options)
      : Promise.resolve(undefined),
    needRisk && next.codeVersionId
      ? getV2CodeVersion(next.codeVersionId, {
          skipErrorHandler: true,
          ...(options || {}),
        }).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);

  if (assetMeta) {
    if (needName) {
      const assetName = assetMeta.name;
      if (assetName && !isInternalGeneratedCodeAssetName(assetName)) {
        next = { ...next, codeName: assetName };
      } else if (assetName) {
        next = { ...next, codeName: assetName };
      }
    }
    if (needProfile && assetMeta.trainingProfile) {
      next = { ...next, trainingProfile: assetMeta.trainingProfile };
    }
  }

  if (v2Version) {
    const mapped = mapV2CodeVersionToLegacy(v2Version);
    next = {
      ...next,
      validationStatus: next.validationStatus || mapped.validationStatus,
      riskLevel: next.riskLevel || mapped.riskLevel,
      riskStatus: next.riskStatus || mapped.riskStatus,
      riskAssessmentId: next.riskAssessmentId || mapped.riskAssessmentId,
      reviewDisposition: next.reviewDisposition || mapped.reviewDisposition,
      riskPolicyVersion: next.riskPolicyVersion || mapped.riskPolicyVersion,
      validationPolicyVersion:
        next.validationPolicyVersion || mapped.validationPolicyVersion,
      artifactSha256: next.artifactSha256 || mapped.artifactSha256,
      trainingProfile: next.trainingProfile || mapped.trainingProfile,
    };
  }

  const displayName = pickDisplayCodeName(next);
  if (displayName && next.codeName !== displayName) {
    next = { ...next, codeName: displayName };
  }
  return next;
}

export type CodeVersionPreviewBundle = {
  codeFiles: API.ModelCodeFile[];
  codeContent?: string;
  codeFileName?: string;
  codeFilePath?: string;
  loadError?: string;
};

function collectValidationReasons(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;
  const reasons: string[] = [];
  for (const key of ['reasons', 'messages', 'errors']) {
    const value = obj[key];
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (typeof item === 'string') reasons.push(item);
        else if (item && typeof item === 'object') {
          const msg = (item as Record<string, unknown>).message;
          if (typeof msg === 'string') reasons.push(msg);
        }
      });
    }
  }
  const message = obj.message || obj.errorMessage;
  if (typeof message === 'string') reasons.push(message);
  return reasons;
}

/** 训练代码版本详情（优先 V2） */
export async function getCodeVersionDetail(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  try {
    const detail = await getV2CodeVersion(codeVersionId, options);
    const assetId = detail.assetId || detail.codeAssetId;
    const [manifest, riskAssessment, assetMeta] = await Promise.all([
      getV2CodeConsumerManifest(codeVersionId, {
        ...(options || {}),
        skipErrorHandler: true,
      }).catch(() => undefined),
      getV2CodeRiskAssessment(codeVersionId, {
        ...(options || {}),
        skipErrorHandler: true,
      }).catch(() => undefined),
      fetchCodeAssetMeta(assetId, options),
    ]);
    const mapped = mapV2CodeVersionToLegacy(detail) as CodeVersionDetail;
    const trainingProfile =
      mapped.trainingProfile?.trim() ||
      manifest?.trainingProfile?.trim() ||
      assetMeta?.trainingProfile ||
      '';
    const codeName =
      mapped.codeName ||
      (assetMeta?.name && !isInternalGeneratedCodeAssetName(assetMeta.name)
        ? assetMeta.name
        : undefined) ||
      assetMeta?.name;
    return {
      success: true,
      data: {
        ...mapped,
        codeName,
        codeAssetName: codeName || mapped.codeAssetName,
        trainingProfile,
        entryScript: mapped.entryScript || manifest?.entryScript,
        validationStatus: mapped.validationStatus,
        riskLevel:
          mapped.riskLevel ||
          riskAssessment?.riskLevel ||
          manifest?.riskLevel,
        reviewDisposition:
          mapped.reviewDisposition ||
          riskAssessment?.disposition ||
          undefined,
        riskAssessmentId:
          mapped.riskAssessmentId ||
          riskAssessment?.id ||
          manifest?.riskAssessmentId,
        riskPolicyVersion:
          mapped.riskPolicyVersion ||
          riskAssessment?.riskPolicyVersion ||
          manifest?.riskPolicyVersion,
        runtime: manifest?.runtime,
        purpose: manifest?.purpose,
        trainingType: manifest?.trainingType,
        consumerManifest: manifest
          ? {
              validationRunId: manifest.validationRunId,
              validationPolicyVersion: manifest.validationPolicyVersion,
              approvalRecordId: manifest.approvalRecordId,
              approvalSource: manifest.approvalSource,
              riskAssessmentId: manifest.riskAssessmentId,
              riskLevel: manifest.riskLevel,
              riskPolicyVersion: manifest.riskPolicyVersion,
            }
          : undefined,
        riskAssessment: riskAssessment
          ? {
              id: riskAssessment.id,
              validationRunId: riskAssessment.validationRunId,
              artifactSha256: riskAssessment.artifactSha256,
              riskPolicyVersion: riskAssessment.riskPolicyVersion,
              status: riskAssessment.status,
              riskLevel: riskAssessment.riskLevel,
              disposition: riskAssessment.disposition,
              findingCount: riskAssessment.findingCount,
              reasonCode: riskAssessment.reasonCode,
              findings: riskAssessment.findings,
            }
          : undefined,
      },
    };
  } catch {
    const legacyRes = await request<{
      success: boolean;
      data: CodeVersionDetail;
      errorMessage?: string;
    }>(`/code/version/${encodeURIComponent(codeVersionId)}`, {
      method: 'GET',
      ...(options || {}),
    });
    if (legacyRes?.data) {
      return {
        ...legacyRes,
        data: await enrichCodeVersionDisplayFields(legacyRes.data, {
          ...(options || {}),
          enrichRisk: true,
        }),
      };
    }
    return legacyRes;
  }
}

function mapV2TreeFileEntries(
  files: Array<{
    path: string;
    fileName: string;
    sizeBytes?: number;
    languageId?: string;
  }>,
): API.ModelCodeFile[] {
  return files.map((item) => ({
    path: item.path,
    fileName: item.fileName,
    sizeBytes: item.sizeBytes,
    languageId: item.languageId,
  })) as API.ModelCodeFile[];
}

function mapV2TreeFiles(tree: unknown): API.ModelCodeFile[] {
  return mapV2TreeFileEntries(flattenV2CodeTree(tree));
}

async function fetchV2CodeFilesFromTree(
  fetchTree: (prefix?: string) => Promise<unknown>,
  options?: { [key: string]: any },
): Promise<API.ModelCodeFile[]> {
  const files = await fetchAllV2CodeTreeFiles(fetchTree, options);
  return mapV2TreeFileEntries(files);
}

function codePreviewErrorMessage(error: any, fallback: string): string {
  const status = error?.response?.status;
  const data = error?.response?.data;
  if (status === 404) {
    return (
      (typeof data?.errorMessage === 'string' && data.errorMessage) ||
      '当前后端未部署训练代码目录/预览接口（需 GET /api/v2/code-versions/{id}/tree 与 /files/content）'
    );
  }
  return (
    data?.errorMessage ||
    error?.info?.errorMessage ||
    error?.data?.errorMessage ||
    error?.message ||
    fallback
  );
}

/**
 * 列出训练代码 zip 内可预览文件。
 * 文档约定走 V2：GET /api/v2/code-versions/{id}/tree
 * 现网 Legacy 无 /api/code/code-files，勿回退。
 */
export async function listCodeVersionFiles(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  const data = await fetchV2CodeFilesFromTree(
    (prefix) => getV2CodeVersionTree(codeVersionId, prefix, options),
    options,
  );
  return { success: true, data };
}

/**
 * 预览训练代码 zip 内单个文件。
 * 文档约定走 V2：GET /api/v2/code-versions/{id}/files/content?path=
 * 现网 Legacy 无 /api/code/previewCode，勿回退。
 */
export async function previewCodeVersionFile(
  codeVersionId: string,
  path: string,
  options?: { [key: string]: any },
) {
  const payload = await getV2CodeVersionFileContent(
    codeVersionId,
    path,
    options,
  );
  const content = extractV2FileText(payload);
  const languageId =
    typeof payload === 'object' && payload && 'languageId' in payload
      ? String((payload as { languageId?: string }).languageId || '')
      : undefined;
  return {
    success: true,
    data: {
      content,
      path,
      fileName: path.split('/').pop() || path,
      languageId,
    } as API.ModelCodePreview,
  };
}

/** 加载训练代码默认预览（首个可预览文件） */
export async function fetchCodeVersionCodePreview(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  let codeFiles: API.ModelCodeFile[] = [];
  let codeContent: string | undefined;
  let codeFileName: string | undefined;
  let codeFilePath: string | undefined;
  let loadError: string | undefined;

  try {
    const codeFilesRes = await listCodeVersionFiles(codeVersionId, options);
    codeFiles = codeFilesRes?.data ?? [];
    if (codeFiles.length > 0 && codeFiles[0].path) {
      const previewRes = await previewCodeVersionFile(
        codeVersionId,
        codeFiles[0].path,
        options,
      );
      if (previewRes?.data?.content) {
        codeContent = previewRes.data.content;
        codeFileName =
          previewRes.data.fileName || codeFiles[0].fileName || codeFiles[0].path;
        codeFilePath = previewRes.data.path || codeFiles[0].path;
      }
    }
  } catch (error: any) {
    codeFiles = [];
    loadError = codePreviewErrorMessage(error, '代码文件列表加载失败');
  }

  return {
    data: {
      codeFiles,
      codeContent,
      codeFileName,
      codeFilePath,
      loadError,
    } as CodeVersionPreviewBundle,
  };
}

/**
 * 优先读取打开中的工作区草稿树；无草稿时回退到不可变版本树。
 * 用于详情页在新建/删除/重命名后能看到工作区变更。
 *
 * @param preferVersionSnapshot 为 true 时跳过工作区，直接读版本快照
 * （发布新版本后应使用，避免仍读到未关闭的草稿）
 */
export async function fetchCodeEditablePreview(
  params: {
    codeVersionId: string;
    codeAssetId?: string;
    preferVersionSnapshot?: boolean;
  },
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  const assetId = params.codeAssetId?.trim();
  if (assetId && !params.preferVersionSnapshot) {
    try {
      const listed = await listV2CodeWorkspaces(assetId, opts);
      const openWs = Array.isArray(listed)
        ? listed.find((ws) => isOpenWorkspace(ws) && ws.id)
        : undefined;
      if (openWs?.id) {
        const workspaceId = openWs.id;
        const codeFiles = await fetchV2CodeFilesFromTree(
          (prefix) => getV2CodeWorkspaceTree(workspaceId, prefix, opts),
          opts,
        );
        let codeContent: string | undefined;
        let codeFileName: string | undefined;
        let codeFilePath: string | undefined;
        if (codeFiles[0]?.path) {
          try {
            const payload = await getV2CodeWorkspaceFileContent(
              openWs.id,
              codeFiles[0].path,
              opts,
            );
            const content = extractV2FileText(payload);
            if (content) {
              codeContent = content;
              codeFilePath = codeFiles[0].path;
              codeFileName =
                codeFiles[0].fileName ||
                codeFiles[0].path.split('/').pop() ||
                codeFiles[0].path;
            }
          } catch {
            // 列表仍可用
          }
        }
        return {
          data: {
            codeFiles,
            codeContent,
            codeFileName,
            codeFilePath,
            workspaceId: openWs.id,
            fromWorkspace: true,
          } as CodeVersionPreviewBundle & {
            workspaceId?: string;
            fromWorkspace?: boolean;
          },
        };
      }
    } catch {
      // fall through to version snapshot
    }
  }
  const versionPreview = await fetchCodeVersionCodePreview(
    params.codeVersionId,
    opts,
  );
  return {
    data: {
      ...versionPreview.data,
      fromWorkspace: false,
    },
  };
}

/** 预览：优先工作区草稿内容，否则版本快照 */
export async function previewCodeEditableFile(
  params: {
    codeVersionId: string;
    codeAssetId?: string;
    path: string;
    preferVersionSnapshot?: boolean;
  },
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  const assetId = params.codeAssetId?.trim();
  if (assetId && !params.preferVersionSnapshot) {
    try {
      const listed = await listV2CodeWorkspaces(assetId, opts);
      const openWs = Array.isArray(listed)
        ? listed.find((ws) => isOpenWorkspace(ws) && ws.id)
        : undefined;
      if (openWs?.id) {
        const payload = await getV2CodeWorkspaceFileContent(
          openWs.id,
          params.path,
          opts,
        );
        const content = extractV2FileText(payload);
        return {
          success: true,
          data: {
            content,
            path: params.path,
            fileName: params.path.split('/').pop() || params.path,
            fromWorkspace: true,
            workspaceId: openWs.id,
          },
        };
      }
    } catch {
      // fall through
    }
  }
  const res = await previewCodeVersionFile(
    params.codeVersionId,
    params.path,
    opts,
  );
  return {
    ...res,
    data: res?.data
      ? { ...res.data, fromWorkspace: false }
      : res?.data,
  };
}

/** 代码包准入校验（现网优先 legacy training-check；失败再试 V2 validate） */
export async function checkCodeVersionForTraining(
  codeVersionId: string,
  trainingProfile: string,
  options?: { [key: string]: any },
) {
  const legacyCheck = () =>
    request<{
    success: boolean;
    data: CodeVersionTrainingCheckResult;
    errorMessage?: string;
  }>(
    `/code/version/${encodeURIComponent(
      codeVersionId,
    )}/training-check?trainingProfile=${encodeURIComponent(trainingProfile)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );

  try {
    return await legacyCheck();
  } catch {
    try {
      const data = await validateV2CodeVersion(
        codeVersionId,
        { trainingProfile },
        options,
      );
      const validationStatus = String(
        data?.validationStatus || data?.status || '',
      ).toUpperCase();
      const passed =
        data?.passed === true ||
        validationStatus === 'PASSED' ||
        (data?.valid === true && validationStatus !== 'FAILED');
      const approvalStatus = String(
        data?.approvalStatus || '',
      ).toUpperCase();
      return {
        success: true,
        data: {
          codeVersionId,
          trainingProfile,
          trainingProfileDisplayName: data?.trainingProfileDisplayName as
            | string
            | undefined,
          passed,
          reused: data?.reused === true,
          approvalStatus: approvalStatus || undefined,
          validationStatus: validationStatus || undefined,
          validationPolicyVersion:
            typeof data?.policyVersion === 'string'
              ? data.policyVersion
              : undefined,
          artifactSha256:
            typeof data?.artifactSha256 === 'string'
              ? data.artifactSha256
              : undefined,
          reasonCode:
            typeof data?.reasonCode === 'string'
              ? data.reasonCode
              : undefined,
          reasons: collectValidationReasons(data),
          checkedAt: data?.checkedAt as string | undefined,
        } as CodeVersionTrainingCheckResult,
      };
    } catch {
      return legacyCheck();
    }
  }
}

/**
 * 软删除训练代码资产（V2）。
 * 需先读取 assetRevision 做 CAS；存在打开工作区或被训练引用时后端会 409。
 * 若缺 codeAssetId，可传 codeVersionId，由版本详情回填资产 ID。
 */
export async function deleteCodeAsset(
  codeAssetId: string | undefined | null,
  options?: { [key: string]: any } & { codeVersionId?: string },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  const versionId =
    typeof options?.codeVersionId === 'string'
      ? options.codeVersionId.trim()
      : '';
  let assetId = (codeAssetId || '').trim();

  if (!assetId && versionId) {
    try {
      const detail = await getV2CodeVersion(versionId, opts);
      assetId = String(detail.assetId || detail.codeAssetId || '').trim();
    } catch (error: any) {
      const status = error?.response?.status ?? error?.info?.status;
      const msg = await errorMessageFromV2(error).catch(() => undefined);
      // 服务端已无该版本：清掉本地待审幽灵，避免一直删不掉
      if (
        status === 404 ||
        /not found|不存在|无权限|CODE_ASSET_NOT_FOUND/i.test(String(msg || ''))
      ) {
        removePendingCodeVersion(versionId);
        return {
          success: true,
          data: {
            codeAssetId: '',
            codeVersionId: versionId,
            deleted: true,
            localOnly: true,
          },
        };
      }
      const tip = msg || '无法解析代码资产，删除失败';
      const err = new Error(tip);
      (err as any).cause = error;
      throw err;
    }
  }

  if (!assetId) {
    if (versionId) {
      removePendingCodeVersion(versionId);
      return {
        success: true,
        data: {
          codeAssetId: '',
          codeVersionId: versionId,
          deleted: true,
          localOnly: true,
        },
      };
    }
    throw new Error('缺少代码资产标识，无法删除');
  }

  try {
    const asset = await getV2CodeAsset(assetId, opts);
    const revision = asset?.assetRevision;
    if (revision == null) {
      throw new Error('缺少 assetRevision，无法删除');
    }
    await deleteV2CodeAsset(assetId, revision, opts);
    if (versionId) {
      removePendingCodeVersion(versionId);
    }
    return {
      success: true,
      data: {
        codeAssetId: assetId,
        deleted: true,
        assetRevision: revision,
      },
    };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    const details = error?.response?.data?.details;
    const reasonCode =
      details && typeof details === 'object'
        ? (details as Record<string, unknown>).reasonCode
        : undefined;
    let tip = msg || '删除训练代码失败';
    if (reasonCode === 'OPEN_WORKSPACE_EXISTS') {
      tip = '该代码资产仍有打开的编辑工作区，请先放弃或发布工作区后再删除';
    } else if (reasonCode === 'CODE_ASSET_IN_USE') {
      tip = '该代码资产已被训练任务引用，无法删除';
    } else if (reasonCode === 'ASSET_REVISION_CONFLICT') {
      tip = '资产已被他人更新，请刷新后重试删除';
    }
    const err = new Error(tip);
    (err as any).cause = error;
    throw err;
  }
}

function suggestNextCodeVersionLabel(current?: string): string {
  const v = (current || 'v1').trim();
  const plain = v.match(/^v?(\d+)$/i);
  if (plain) return `v${Number(plain[1]) + 1}`;
  const sem = v.match(/^v?(\d+)\.(\d+)\.(\d+)$/i);
  if (sem) return `v${sem[1]}.${sem[2]}.${Number(sem[3]) + 1}`;
  return `${v}-edit`;
}

function isOpenWorkspace(ws?: {
  status?: string;
  readOnly?: boolean;
  closedAt?: string;
  closedVersionId?: string;
}) {
  if (!ws) return false;
  if (ws.readOnly) return false;
  // 已关闭 / 已发布的工作区不应再当作草稿
  if (ws.closedAt || ws.closedVersionId) return false;
  const status = String(ws.status || '').toUpperCase();
  if (
    status === 'CLOSED' ||
    status === 'ABANDONED' ||
    status === 'PUBLISHED' ||
    status === 'COMMITTED'
  ) {
    return false;
  }
  // 无 status 时保守视为打开（兼容旧接口）；有 status 则仅 OPEN/ACTIVE
  if (!status) return true;
  return status === 'OPEN' || status === 'ACTIVE';
}

async function ensureEditableCodeWorkspace(
  assetId: string,
  baseVersionId: string,
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  const pickMatchingOpen = (
    listed: Awaited<ReturnType<typeof listV2CodeWorkspaces>> | undefined,
  ) => {
    const openList = Array.isArray(listed)
      ? listed.filter((ws) => isOpenWorkspace(ws) && ws.id)
      : [];
    const matched = openList.find((ws) => ws.baseVersionId === baseVersionId);
    if (matched?.id) {
      return { matched, openList };
    }
    return { matched: undefined, openList };
  };

  try {
    const listed = await listV2CodeWorkspaces(assetId, opts);
    const { matched, openList } = pickMatchingOpen(listed);
    if (matched) {
      return matched;
    }
    // 不可复用「其它基线版本」的打开工作区，否则从旧版再发易触发资产/revision 冲突
    if (openList.length > 0) {
      const otherLabel =
        openList[0]?.baseVersionId || openList[0]?.id || '未知版本';
      throw new Error(
        `该代码资产已有基于其他版本的编辑工作区（${otherLabel}）。请先在该工作区发布或放弃后，再从当前版本编辑；或打开对应版本继续编辑。`,
      );
    }
  } catch (error: any) {
    if (
      typeof error?.message === 'string' &&
      error.message.includes('已有基于其他版本的编辑工作区')
    ) {
      throw error;
    }
    // 列表失败时继续尝试新建
  }

  try {
    return await openV2CodeWorkspace(
      assetId,
      { baseVersionId },
      opts,
    );
  } catch (error: any) {
    // 已有打开工作区时，仅复用「同一 baseVersionId」的工作区
    const listed = await listV2CodeWorkspaces(assetId, opts).catch(
      () => undefined,
    );
    const { matched, openList } = pickMatchingOpen(listed);
    if (matched?.id) {
      return matched;
    }
    if (openList.length > 0) {
      const otherLabel =
        openList[0]?.baseVersionId || openList[0]?.id || '未知版本';
      throw new Error(
        `该代码资产已有基于其他版本的编辑工作区（${otherLabel}）。请先在该工作区发布或放弃后，再从当前版本编辑；或打开对应版本继续编辑。`,
      );
    }
    throw error;
  }
}

function mapCodeWorkspaceConflictMessage(raw?: string): string | undefined {
  if (!raw) return undefined;
  if (/ASSET_REVISION_CONFLICT|资产已变更|已被.*更新/i.test(raw)) {
    return '代码资产版本已变化。请刷新页面后从最新版本打开工作区再发布；勿在过期的旧版详情上继续提交。';
  }
  if (/WORKSPACE_REVISION_CONFLICT|workspaceRevision/i.test(raw)) {
    return '工作区内容已被更新，请刷新后重试，或放弃当前工作区后重新打开。';
  }
  return undefined;
}

export type SaveCodeVersionFileResult = {
  workspaceId: string;
  publishedVersionId: string;
  publishedVersion?: string;
  path: string;
};

/**
 * 编辑不可变 code version：打开/复用工作区 → 写入文件 → 发布为新版本。
 * @see module2-api-doc §18.7
 */
export async function saveCodeVersionFileAndPublish(
  params: {
    codeAssetId: string;
    baseVersionId: string;
    path: string;
    content: string;
    currentVersionLabel?: string;
    nextVersionLabel?: string;
  },
  options?: { [key: string]: any },
): Promise<{ success: true; data: SaveCodeVersionFileResult }> {
  const assetId = params.codeAssetId?.trim();
  const baseVersionId = params.baseVersionId?.trim();
  const path = params.path?.trim();
  if (!assetId || !baseVersionId || !path) {
    throw new Error('缺少 codeAssetId / baseVersionId / path，无法保存');
  }

  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const workspace = await ensureEditableCodeWorkspace(
      assetId,
      baseVersionId,
      opts,
    );
    const workspaceId = workspace.id;
    if (!workspaceId) {
      throw new Error('未能打开代码编辑工作区');
    }

    const metadata = await getV2CodeWorkspaceFileMetadata(
      workspaceId,
      path,
      opts,
    );
    if (metadata?.editable === false || metadata?.readOnly === true) {
      throw new Error(
        metadata.reasonCode
          ? `该文件不可编辑（${metadata.reasonCode}）`
          : '该文件不可在线编辑（可能超过 1MB 限制）',
      );
    }

    const expectedWorkspaceRevision =
      metadata?.workspaceRevision ?? workspace.revision;
    if (expectedWorkspaceRevision == null) {
      throw new Error('缺少 workspaceRevision，无法保存');
    }

    const upsertBody: {
      content: string;
      expectedWorkspaceRevision: number;
      expectedContentHash?: string;
    } = {
      content: params.content,
      expectedWorkspaceRevision,
    };
    if (metadata?.contentHash) {
      upsertBody.expectedContentHash = metadata.contentHash;
    }

    const upserted = await upsertV2CodeWorkspaceFile(
      workspaceId,
      path,
      upsertBody,
      opts,
    );

    let publishRevision = upserted?.workspaceRevision;
    if (publishRevision == null) {
      const refreshed = await getV2CodeWorkspace(workspaceId, opts).catch(
        () => undefined,
      );
      publishRevision =
        refreshed?.revision ??
        (await getV2CodeWorkspaceFileMetadata(workspaceId, path, opts).catch(
          () => undefined,
        ))?.workspaceRevision;
    }
    if (publishRevision == null) {
      publishRevision = expectedWorkspaceRevision + 1;
    }

    const nextVersion =
      params.nextVersionLabel?.trim() ||
      suggestNextCodeVersionLabel(params.currentVersionLabel);

    const published = await publishV2CodeWorkspace(
      workspaceId,
      {
        expectedWorkspaceRevision: publishRevision,
        version: nextVersion,
      },
      opts,
    );

    const publishedVersionId =
      published?.versionId ||
      published?.codeVersionId ||
      published?.id ||
      '';
    if (!publishedVersionId) {
      throw new Error('发布成功但未返回新版本 ID');
    }

    try {
      await autoApproveCodeVersionIfEnabled(publishedVersionId, opts);
    } catch {
      // 发布已成功；自动审核失败时保留 PENDING，可走人工待审
    }

    if (!isTrainingCodeAutoApproveEnabled()) {
      // 人工审核模式：立刻写入待审本地队列，避免管理员只能等后端审核任务延迟出现
      upsertPendingCodeVersion({
        codeVersionId: publishedVersionId,
        codeAssetId: assetId,
        approvalStatus: 'PENDING',
        source: 'publish',
      });
    }

    return {
      success: true,
      data: {
        workspaceId,
        publishedVersionId,
        publishedVersion: published?.versionLabel || published?.version || nextVersion,
        path,
      },
    };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    const tip =
      mapCodeWorkspaceConflictMessage(msg) || msg || '保存训练代码失败';
    const err = new Error(tip);
    (err as any).cause = error;
    throw err;
  }
}

/**
 * 将已有工作区草稿直接发布为新版本（用于仅增删改文件、未改当前预览内容的场景）。
 */
export async function publishCodeWorkspaceDraft(
  params: {
    codeAssetId: string;
    baseVersionId: string;
    currentVersionLabel?: string;
    nextVersionLabel?: string;
  },
  options?: { [key: string]: any },
): Promise<{ success: true; data: SaveCodeVersionFileResult }> {
  const assetId = params.codeAssetId?.trim();
  const baseVersionId = params.baseVersionId?.trim();
  if (!assetId || !baseVersionId) {
    throw new Error('缺少 codeAssetId / baseVersionId，无法发布');
  }
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const workspace = await ensureEditableCodeWorkspace(
      assetId,
      baseVersionId,
      opts,
    );
    const workspaceId = workspace.id;
    if (!workspaceId) {
      throw new Error('未能打开代码编辑工作区');
    }
    const refreshed = await getV2CodeWorkspace(workspaceId, opts).catch(
      () => undefined,
    );
    const publishRevision = refreshed?.revision ?? workspace.revision;
    if (publishRevision == null) {
      throw new Error('缺少 workspaceRevision，无法发布');
    }
    const nextVersion =
      params.nextVersionLabel?.trim() ||
      suggestNextCodeVersionLabel(params.currentVersionLabel);
    const published = await publishV2CodeWorkspace(
      workspaceId,
      {
        expectedWorkspaceRevision: publishRevision,
        version: nextVersion,
      },
      opts,
    );
    const publishedVersionId =
      published?.versionId ||
      published?.codeVersionId ||
      published?.id ||
      '';
    if (!publishedVersionId) {
      throw new Error('发布成功但未返回新版本 ID');
    }
    try {
      await autoApproveCodeVersionIfEnabled(publishedVersionId, opts);
    } catch {
      // 发布已成功；自动审核失败时保留 PENDING，可走人工待审
    }
    if (!isTrainingCodeAutoApproveEnabled()) {
      upsertPendingCodeVersion({
        codeVersionId: publishedVersionId,
        codeAssetId: assetId,
        approvalStatus: 'PENDING',
        source: 'publish',
      });
    }
    return {
      success: true,
      data: {
        workspaceId,
        publishedVersionId,
        publishedVersion:
          published?.versionLabel || published?.version || nextVersion,
        path: '',
      },
    };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    const tip =
      mapCodeWorkspaceConflictMessage(msg) || msg || '发布工作区草稿失败';
    const err = new Error(tip);
    (err as any).cause = error;
    throw err;
  }
}

function triggerBrowserDownload(blob: Blob, fileName: string) {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

/** 下载训练代码完整 ZIP */
export async function downloadCodeVersionZip(
  codeVersionId: string,
  fileName?: string,
  options?: {
    onProgress?: (ratio: number | null) => void;
    [key: string]: any;
  },
) {
  try {
    await downloadAuthFile({
      url: `/v2/code-versions/${encodeURIComponent(codeVersionId)}/download`,
      fileName: fileName?.trim() || `${codeVersionId}.zip`,
      onProgress: options?.onProgress,
    });
    return { success: true };
  } catch (error: any) {
    const msg =
      (await errorMessageFromV2(error).catch(() => undefined)) ||
      error?.message ||
      '下载失败';
    throw new Error(msg);
  }
}

/** 更新代码资产元数据（改名等） */
export async function updateCodeAssetMeta(
  codeAssetId: string,
  patch: {
    name?: string;
    remark?: string;
    purpose?: string;
    runtime?: string;
    entryScript?: string;
  },
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const asset = await getV2CodeAsset(codeAssetId, opts);
    if (asset?.assetRevision == null) {
      throw new Error('缺少 assetRevision，无法更新');
    }
    const updated = await patchV2CodeAsset(
      codeAssetId,
      {
        assetRevision: asset.assetRevision,
        ...patch,
      },
      opts,
    );
    return { success: true, data: updated };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '更新代码资产失败');
  }
}

/** 列出同一资产下的代码版本 */
export async function listCodeAssetVersions(
  codeAssetId: string,
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const list = await listV2CodeAssetVersions(codeAssetId, opts);
    const rows = Array.isArray(list) ? list : [];
    return {
      success: true,
      data: rows.map((item) => mapV2CodeVersionToLegacy(item)),
    };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '版本列表加载失败');
  }
}

export async function deprecateCodeVersion(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  try {
    const data = await deprecateV2CodeVersion(codeVersionId, {
      skipErrorHandler: true,
      ...(options || {}),
    });
    return { success: true, data: mapV2CodeVersionToLegacy(data) };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '弃用失败');
  }
}

export async function archiveCodeVersion(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  try {
    const data = await archiveV2CodeVersion(codeVersionId, {
      skipErrorHandler: true,
      ...(options || {}),
    });
    return { success: true, data: mapV2CodeVersionToLegacy(data) };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '归档失败');
  }
}

export async function upgradeCodeArtifact(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  try {
    const data = await upgradeV2CodeArtifact(codeVersionId, {
      skipErrorHandler: true,
      ...(options || {}),
    });
    return { success: true, data };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '制品升级失败');
  }
}

export async function fetchAdminCodeFindings(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  try {
    const data = await listAdminCodeReviewFindings(codeVersionId, {
      skipErrorHandler: true,
      ...(options || {}),
    });
    return { success: true, data: Array.isArray(data) ? data : [] };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || 'Findings 加载失败');
  }
}

export async function rescanCodeReviewTask(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  try {
    const data = await rescanAdminCodeReviewTask(codeVersionId, {
      skipErrorHandler: true,
      ...(options || {}),
    });
    return { success: true, data };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '重扫失败');
  }
}

/** 工作区：新建文件（无 expectedContentHash） */
export async function createCodeWorkspaceFile(
  params: {
    codeAssetId: string;
    baseVersionId: string;
    path: string;
    content?: string;
  },
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const workspace = await ensureEditableCodeWorkspace(
      params.codeAssetId,
      params.baseVersionId,
      opts,
    );
    const workspaceId = workspace.id!;
    const revision = workspace.revision;
    if (revision == null) throw new Error('缺少 workspaceRevision');
    await upsertV2CodeWorkspaceFile(
      workspaceId,
      params.path,
      {
        content: params.content ?? '',
        expectedWorkspaceRevision: revision,
      },
      opts,
    );
    return { success: true, data: { workspaceId } };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '新建文件失败');
  }
}

/** 工作区：删除文件 */
export async function deleteCodeWorkspaceFile(
  params: {
    codeAssetId: string;
    baseVersionId: string;
    path: string;
  },
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const workspace = await ensureEditableCodeWorkspace(
      params.codeAssetId,
      params.baseVersionId,
      opts,
    );
    const workspaceId = workspace.id!;
    const metadata = await getV2CodeWorkspaceFileMetadata(
      workspaceId,
      params.path,
      opts,
    );
    const revision = metadata?.workspaceRevision ?? workspace.revision;
    if (revision == null) throw new Error('缺少 workspaceRevision');
    await deleteV2CodeWorkspaceFile(
      workspaceId,
      params.path,
      {
        expectedWorkspaceRevision: revision,
        ...(metadata?.contentHash
          ? { expectedContentHash: metadata.contentHash }
          : {}),
      },
      opts,
    );
    return { success: true, data: { workspaceId } };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '删除文件失败');
  }
}

/** 工作区：重命名/移动文件 */
export async function moveCodeWorkspaceFile(
  params: {
    codeAssetId: string;
    baseVersionId: string;
    sourcePath: string;
    targetPath: string;
  },
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const workspace = await ensureEditableCodeWorkspace(
      params.codeAssetId,
      params.baseVersionId,
      opts,
    );
    const workspaceId = workspace.id!;
    const metadata = await getV2CodeWorkspaceFileMetadata(
      workspaceId,
      params.sourcePath,
      opts,
    );
    const revision = metadata?.workspaceRevision ?? workspace.revision;
    if (revision == null) throw new Error('缺少 workspaceRevision');
    await moveV2CodeWorkspaceFile(
      workspaceId,
      {
        sourcePath: params.sourcePath,
        targetPath: params.targetPath,
        expectedWorkspaceRevision: revision,
        ...(metadata?.contentHash
          ? { expectedContentHash: metadata.contentHash }
          : {}),
      },
      opts,
    );
    return { success: true, data: { workspaceId } };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '移动文件失败');
  }
}

/** 放弃打开的代码工作区草稿 */
export async function abandonCodeWorkspace(
  codeAssetId: string,
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const listed = await listV2CodeWorkspaces(codeAssetId, opts);
    const openList = Array.isArray(listed)
      ? listed.filter((ws) => isOpenWorkspace(ws) && ws.id)
      : [];
    if (!openList.length) {
      return { success: true, data: { abandoned: false } };
    }
    for (const ws of openList) {
      if (ws.id == null || ws.revision == null) continue;
      await abandonV2CodeWorkspace(
        ws.id,
        { expectedWorkspaceRevision: ws.revision },
        opts,
      );
    }
    return { success: true, data: { abandoned: true, count: openList.length } };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '放弃工作区失败');
  }
}

export type AdminCodeWorkspaceSaveResult = {
  workspaceId: string;
  workspaceRevision: number;
  path: string;
};

export type AdminCodeWorkspacePublishResult = {
  workspaceId: string;
  publishedVersionId: string;
  publishedVersion?: string;
  path: string;
};

/** 管理员写入工作区文件（不发布） */
export async function saveAdminCodeWorkspaceFile(
  params: { workspaceId: string; path: string; content: string },
  options?: { [key: string]: any },
): Promise<{ success: true; data: AdminCodeWorkspaceSaveResult }> {
  const workspaceId = params.workspaceId?.trim();
  const path = params.path?.trim();
  if (!workspaceId || !path) {
    throw new Error('缺少 workspaceId / path，无法保存');
  }
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const metadata = await getAdminCodeWorkspaceFileMetadata(
      workspaceId,
      path,
      opts,
    );
    if (metadata?.editable === false || metadata?.readOnly === true) {
      throw new Error(
        metadata.reasonCode
          ? `该文件不可编辑（${metadata.reasonCode}）`
          : '该文件不可在线编辑（可能超过 1MB 限制）',
      );
    }
    const expectedWorkspaceRevision =
      metadata?.workspaceRevision ??
      (await getAdminCodeWorkspace(workspaceId, opts).catch(() => undefined))
        ?.revision;
    if (expectedWorkspaceRevision == null) {
      throw new Error('缺少 workspaceRevision，无法保存');
    }
    const body: {
      content: string;
      expectedWorkspaceRevision: number;
      expectedContentHash?: string;
    } = {
      content: params.content,
      expectedWorkspaceRevision,
    };
    if (metadata?.contentHash) {
      body.expectedContentHash = metadata.contentHash;
    }
    const upserted = await upsertAdminCodeWorkspaceFile(
      workspaceId,
      path,
      body,
      opts,
    );
    let workspaceRevision = upserted?.workspaceRevision;
    if (workspaceRevision == null) {
      workspaceRevision =
        (await getAdminCodeWorkspace(workspaceId, opts).catch(() => undefined))
          ?.revision ?? expectedWorkspaceRevision + 1;
    }
    return {
      success: true,
      data: { workspaceId, workspaceRevision, path },
    };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    const tip =
      mapCodeWorkspaceConflictMessage(msg) || msg || '保存工作区文件失败';
    throw new Error(tip);
  }
}

/** 管理员发布工作区草稿为新版本（可选先写入当前文件） */
export async function publishAdminCodeWorkspaceDraft(
  params: {
    workspaceId: string;
    path?: string;
    content?: string;
    currentVersionLabel?: string;
    nextVersionLabel?: string;
    pendingMeta?: {
      codeAssetName?: string;
      fileName?: string;
      trainingProfile?: string;
    };
  },
  options?: { [key: string]: any },
): Promise<{ success: true; data: AdminCodeWorkspacePublishResult }> {
  const workspaceId = params.workspaceId?.trim();
  if (!workspaceId) {
    throw new Error('缺少 workspaceId，无法发布');
  }
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const path = params.path?.trim();
    if (path && params.content != null) {
      await saveAdminCodeWorkspaceFile(
        { workspaceId, path, content: params.content },
        opts,
      );
    }
    const refreshed = await getAdminCodeWorkspace(workspaceId, opts);
    const publishRevision = refreshed?.revision;
    if (publishRevision == null) {
      throw new Error('缺少 workspaceRevision，无法发布');
    }
    const nextVersion =
      params.nextVersionLabel?.trim() ||
      suggestNextCodeVersionLabel(params.currentVersionLabel);
    const published = await publishAdminCodeWorkspace(
      workspaceId,
      {
        expectedWorkspaceRevision: publishRevision,
        version: nextVersion,
      },
      opts,
    );
    const publishedVersionId =
      published?.versionId ||
      published?.codeVersionId ||
      published?.id ||
      '';
    if (!publishedVersionId) {
      throw new Error('发布成功但未返回新版本 ID');
    }
    await reconcileAdminPublishedVersion(publishedVersionId, {
      trainingProfile: params.pendingMeta?.trainingProfile,
      codeAssetName: params.pendingMeta?.codeAssetName,
      fileName: params.pendingMeta?.fileName,
      ...(options || {}),
    });
    return {
      success: true,
      data: {
        workspaceId,
        publishedVersionId,
        publishedVersion:
          published?.versionLabel || published?.version || nextVersion,
        path: path || '',
      },
    };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    const tip =
      mapCodeWorkspaceConflictMessage(msg) || msg || '发布工作区草稿失败';
    throw new Error(tip);
  }
}

/** 管理员放弃工作区草稿 */
export async function abandonAdminCodeWorkspaceDraft(
  workspaceId: string,
  options?: { [key: string]: any },
): Promise<{ success: true }> {
  const id = workspaceId?.trim();
  if (!id) throw new Error('缺少 workspaceId');
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const ws = await getAdminCodeWorkspace(id, opts);
    if (ws?.revision == null) {
      throw new Error('缺少 workspaceRevision，无法放弃');
    }
    await abandonAdminCodeWorkspace(
      id,
      { expectedWorkspaceRevision: ws.revision },
      opts,
    );
    return { success: true };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    const tip =
      mapCodeWorkspaceConflictMessage(msg) || msg || '放弃工作区失败';
    throw new Error(tip);
  }
}

/** 管理员从工作区删除文件 */
export async function removeAdminCodeWorkspaceFile(
  params: {
    workspaceId: string;
    path: string;
    expectedContentHash?: string;
  },
  options?: { [key: string]: any },
): Promise<{ success: true; workspaceRevision: number }> {
  const workspaceId = params.workspaceId?.trim();
  const path = params.path?.trim();
  if (!workspaceId || !path) {
    throw new Error('缺少 workspaceId / path');
  }
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const metadata = await getAdminCodeWorkspaceFileMetadata(
      workspaceId,
      path,
      opts,
    );
    const expectedWorkspaceRevision =
      metadata?.workspaceRevision ??
      (await getAdminCodeWorkspace(workspaceId, opts).catch(() => undefined))
        ?.revision;
    if (expectedWorkspaceRevision == null) {
      throw new Error('缺少 workspaceRevision，无法删除');
    }
    const body: {
      expectedWorkspaceRevision: number;
      expectedContentHash?: string;
    } = { expectedWorkspaceRevision };
    const hash = params.expectedContentHash || metadata?.contentHash;
    if (hash) body.expectedContentHash = hash;
    const res = await deleteAdminCodeWorkspaceFile(
      workspaceId,
      path,
      body,
      opts,
    );
    const workspaceRevision =
      res?.workspaceRevision ??
      (await getAdminCodeWorkspace(workspaceId, opts).catch(() => undefined))
        ?.revision ??
      expectedWorkspaceRevision + 1;
    return { success: true, workspaceRevision };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    const tip =
      mapCodeWorkspaceConflictMessage(msg) || msg || '删除工作区文件失败';
    throw new Error(tip);
  }
}

async function reconcileAdminPublishedVersion(
  publishedVersionId: string,
  options?: { [key: string]: any } & {
    codeAssetId?: string;
    codeAssetName?: string;
    fileName?: string;
    trainingProfile?: string;
  },
) {
  const id = publishedVersionId?.trim();
  if (!id) return;
  const {
    codeAssetId,
    codeAssetName,
    fileName,
    trainingProfile,
    ...rest
  } = options || {};
  const opts = { skipErrorHandler: true, ...rest, trainingProfile };
  try {
    await autoApproveCodeVersionIfEnabled(id, opts);
  } catch {
    // 发布已成功；自动审核失败时保留 PENDING
  }
  if (!isTrainingCodeAutoApproveEnabled()) {
    upsertPendingCodeVersion({
      codeVersionId: id,
      codeAssetId,
      codeAssetName,
      fileName,
      trainingProfile,
      approvalStatus: 'PENDING',
      source: 'publish',
    });
  }
}

function isAdminOpenWorkspace(ws?: V2CodeWorkspace): boolean {
  if (!ws?.id) return false;
  if (ws.readOnly) return false;
  if (ws.closedAt || ws.closedVersionId) return false;
  const status = String(ws.status || '').toUpperCase();
  if (
    status === 'CLOSED' ||
    status === 'ABANDONED' ||
    status === 'PUBLISHED' ||
    status === 'COMMITTED'
  ) {
    return false;
  }
  if (!status) return true;
  return status === 'OPEN' || status === 'ACTIVE';
}

/** 优先复用 OPEN 工作区，否则 POST 打开；指定 baseVersionId 时不复用其它基线 */
export async function ensureAdminCodeAssetWorkspace(
  assetId: string,
  options?: { [key: string]: any } & { baseVersionId?: string },
): Promise<V2CodeWorkspace> {
  const id = assetId?.trim();
  if (!id) throw new Error('缺少 assetId');
  const { baseVersionId, ...rest } = options || {};
  const opts = { skipErrorHandler: true, ...rest };
  const wanted = baseVersionId?.trim();

  const pickOpen = (
    listed: Awaited<ReturnType<typeof listAdminCodeAssetWorkspaces>> | undefined,
  ) => {
    const openList = (Array.isArray(listed) ? listed : []).filter(
      (ws) => isAdminOpenWorkspace(ws) && ws.id,
    );
    if (!wanted) {
      return { matched: openList[0], openList };
    }
    const matched = openList.find((ws) => ws.baseVersionId === wanted);
    return { matched, openList };
  };

  const conflictError = (openList: V2CodeWorkspace[]) => {
    const other = openList[0];
    const label = other?.baseVersionId || other?.id || '未知版本';
    const err = new Error(
      `该代码资产已有基于其他版本的编辑工作区（基线 ${label}）。请先打开该工作区并「发布」或「放弃」后，再从当前版本编辑。`,
    ) as Error & {
      reasonCode: string;
      existingWorkspace?: V2CodeWorkspace;
    };
    err.reasonCode = 'WORKSPACE_BASE_CONFLICT';
    err.existingWorkspace = other;
    return err;
  };

  try {
    const listed = await listAdminCodeAssetWorkspaces(id, opts);
    const { matched, openList } = pickOpen(listed);
    if (matched?.id) return matched;
    // 不可复用其它基线的 OPEN 工作区（否则 POST 会 409 WORKSPACE_BASE_CONFLICT）
    if (wanted && openList.length > 0) {
      throw conflictError(openList);
    }
  } catch (error: any) {
    if (
      error?.reasonCode === 'WORKSPACE_BASE_CONFLICT' ||
      (typeof error?.message === 'string' &&
        error.message.includes('已有基于其他版本的编辑工作区'))
    ) {
      throw error;
    }
    // 列表失败时继续尝试打开
  }

  try {
    return await openAdminCodeAssetWorkspace(
      id,
      wanted ? { baseVersionId: wanted } : undefined,
      opts,
    );
  } catch (error: any) {
    const listed = await listAdminCodeAssetWorkspaces(id, opts).catch(
      () => undefined,
    );
    const { matched, openList } = pickOpen(listed);
    if (matched?.id) return matched;
    if (wanted && openList.length > 0) {
      throw conflictError(openList);
    }
    throw error;
  }
}

/** 管理员在工作区新建包内文件（新 path 不传 contentHash） */
export async function createAdminCodeWorkspaceFile(
  params: { workspaceId: string; path: string; content?: string },
  options?: { [key: string]: any },
): Promise<{ success: true; workspaceRevision: number }> {
  const workspaceId = params.workspaceId?.trim();
  const path = params.path?.trim();
  if (!workspaceId || !path) {
    throw new Error('缺少 workspaceId / path');
  }
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const existing = await getAdminCodeWorkspaceFileMetadata(
      workspaceId,
      path,
      opts,
    ).catch(() => undefined);
    if (existing?.contentHash) {
      throw new Error('该路径已存在，请直接编辑或使用「移动文件」');
    }
    const ws = await getAdminCodeWorkspace(workspaceId, opts);
    if (ws?.revision == null) throw new Error('缺少 workspaceRevision');
    const upserted = await upsertAdminCodeWorkspaceFile(
      workspaceId,
      path,
      {
        content: params.content ?? '',
        expectedWorkspaceRevision: ws.revision,
      },
      opts,
    );
    const workspaceRevision =
      upserted?.workspaceRevision ??
      (await getAdminCodeWorkspace(workspaceId, opts).catch(() => undefined))
        ?.revision ??
      ws.revision + 1;
    return { success: true, workspaceRevision };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    throw new Error(
      mapCodeWorkspaceConflictMessage(msg) || msg || '新建文件失败',
    );
  }
}

/** 管理员移动/重命名工作区文件 */
export async function moveAdminCodeWorkspaceFileByPath(
  params: {
    workspaceId: string;
    sourcePath: string;
    targetPath: string;
  },
  options?: { [key: string]: any },
): Promise<{ success: true; workspaceRevision: number }> {
  const workspaceId = params.workspaceId?.trim();
  const sourcePath = params.sourcePath?.trim();
  const targetPath = params.targetPath?.trim();
  if (!workspaceId || !sourcePath || !targetPath) {
    throw new Error('缺少 workspaceId / sourcePath / targetPath');
  }
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const metadata = await getAdminCodeWorkspaceFileMetadata(
      workspaceId,
      sourcePath,
      opts,
    );
    const revision =
      metadata?.workspaceRevision ??
      (await getAdminCodeWorkspace(workspaceId, opts).catch(() => undefined))
        ?.revision;
    if (revision == null) throw new Error('缺少 workspaceRevision');
    const moved = await moveAdminCodeWorkspaceFile(
      workspaceId,
      {
        sourcePath,
        targetPath,
        expectedWorkspaceRevision: revision,
        ...(metadata?.contentHash
          ? { expectedContentHash: metadata.contentHash }
          : {}),
      },
      opts,
    );
    const workspaceRevision =
      moved?.workspaceRevision ??
      (await getAdminCodeWorkspace(workspaceId, opts).catch(() => undefined))
        ?.revision ??
      revision + 1;
    return { success: true, workspaceRevision };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    throw new Error(
      mapCodeWorkspaceConflictMessage(msg) || msg || '移动文件失败',
    );
  }
}

/** 管理员校验当前工作区 */
export async function validateAdminCodeWorkspaceDraft(
  workspaceId: string,
  options?: { [key: string]: any },
): Promise<{ success: true; data: V2CodeValidationResult }> {
  const id = workspaceId?.trim();
  if (!id) throw new Error('缺少 workspaceId');
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const ws = await getAdminCodeWorkspace(id, opts);
    if (ws?.revision == null) throw new Error('缺少 workspaceRevision');
    const data = await validateAdminCodeWorkspace(
      id,
      { expectedWorkspaceRevision: ws.revision },
      opts,
    );
    return { success: true, data };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    throw new Error(
      mapCodeWorkspaceConflictMessage(msg) || msg || '工作区校验失败',
    );
  }
}

/** 管理员下载工作区单文件 */
export async function downloadAdminCodeWorkspaceFile(
  workspaceId: string,
  path: string,
  fileName?: string,
  options?: { [key: string]: any },
): Promise<{ success: true }> {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const blob = await downloadAdminCodeWorkspaceFileBlob(
      workspaceId,
      path,
      opts,
    );
    if (!(blob instanceof Blob)) throw new Error('下载响应不是文件流');
    triggerBrowserDownload(
      blob,
      fileName?.trim() || path.split('/').pop() || 'file',
    );
    return { success: true };
  } catch (error: any) {
    const msg =
      (await errorMessageFromV2Blob(error).catch(() => undefined)) ||
      (await errorMessageFromV2(error).catch(() => undefined)) ||
      error?.message ||
      '下载失败';
    throw new Error(msg);
  }
}

/** 管理员下载版本快照单文件 */
export async function downloadAdminCodeVersionFile(
  versionId: string,
  path: string,
  fileName?: string,
  options?: { [key: string]: any },
): Promise<{ success: true }> {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const blob = await downloadAdminCodeVersionFileBlob(versionId, path, opts);
    if (!(blob instanceof Blob)) throw new Error('下载响应不是文件流');
    triggerBrowserDownload(
      blob,
      fileName?.trim() || path.split('/').pop() || 'file',
    );
    return { success: true };
  } catch (error: any) {
    const msg =
      (await errorMessageFromV2Blob(error).catch(() => undefined)) ||
      (await errorMessageFromV2(error).catch(() => undefined)) ||
      error?.message ||
      '下载失败';
    throw new Error(msg);
  }
}

/** 管理员校验代码版本 */
export async function validateAdminCodeVersionById(
  versionId: string,
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const data = await validateAdminCodeVersion(versionId, opts);
    return { success: true, data };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '版本校验失败');
  }
}

/** 管理员弃用代码版本 */
export async function deprecateAdminCodeVersionById(
  versionId: string,
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const data = await deprecateAdminCodeVersion(versionId, opts);
    return { success: true, data: mapV2CodeVersionToLegacy(data) };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '弃用失败');
  }
}

/** 管理员归档代码版本 */
export async function archiveAdminCodeVersionById(
  versionId: string,
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const data = await archiveAdminCodeVersion(versionId, opts);
    return { success: true, data: mapV2CodeVersionToLegacy(data) };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '归档失败');
  }
}

/** 列出当前用户的 V2 代码资产 */
export async function listCodeAssets(options?: { [key: string]: any }) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const list = await listV2CodeAssets(opts);
    return { success: true, data: Array.isArray(list) ? list : [] };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '资产列表加载失败');
  }
}

/** 管理员审核详情（跨 owner） */
export async function getAdminCodeReviewDetail(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  const detail = await getAdminCodeReviewTaskDetail(codeVersionId, options);
  return {
    success: true,
    data: mapAdminReviewTaskDetailToCodeVersionDetail(detail),
    raw: detail as V2AdminCodeReviewTaskDetail,
  };
}

/** 管理员审核用只读目录树 */
export async function listAdminCodeReviewFiles(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  const data = await fetchAllV2CodeTreeFiles(
    (prefix) =>
      getAdminCodeReviewTaskTree(codeVersionId, prefix, {
        skipErrorHandler: true,
        ...(options || {}),
      }),
    options,
  );
  return { success: true, data };
}

/** 管理员审核用只读文件预览 */
export async function previewAdminCodeReviewFile(
  codeVersionId: string,
  path: string,
  options?: { [key: string]: any },
) {
  const payload = await getAdminCodeReviewTaskFileContent(
    codeVersionId,
    path,
    { skipErrorHandler: true, ...(options || {}) },
  );
  const content = extractV2FileText(payload);
  return {
    success: true,
    data: {
      content,
      path,
      fileName: path.split('/').pop() || path,
    },
  };
}

/** 用户校验当前工作区草稿 */
export async function validateCodeWorkspaceDraft(
  workspaceId: string,
  options?: { [key: string]: any },
): Promise<{ success: true; data: V2CodeValidationResult }> {
  const id = workspaceId?.trim();
  if (!id) throw new Error('缺少 workspaceId');
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const ws = await getV2CodeWorkspace(id, opts);
    if (ws?.revision == null) throw new Error('缺少 workspaceRevision');
    const data = await validateV2CodeWorkspace(
      id,
      { expectedWorkspaceRevision: ws.revision },
      opts,
    );
    return { success: true, data };
  } catch (error: any) {
    const msg = await errorMessageFromV2(error);
    throw new Error(
      mapCodeWorkspaceConflictMessage(msg) || msg || '工作区校验失败',
    );
  }
}

/** 用户下载工作区单文件 */
export async function downloadCodeWorkspaceFile(
  workspaceId: string,
  path: string,
  fileName?: string,
  options?: { [key: string]: any },
): Promise<{ success: true }> {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const blob = await downloadV2CodeWorkspaceFileBlob(workspaceId, path, opts);
    if (!(blob instanceof Blob)) throw new Error('下载响应不是文件流');
    triggerBrowserDownload(
      blob,
      fileName?.trim() || path.split('/').pop() || 'file',
    );
    return { success: true };
  } catch (error: any) {
    const msg =
      (await errorMessageFromV2Blob(error).catch(() => undefined)) ||
      (await errorMessageFromV2(error).catch(() => undefined)) ||
      error?.message ||
      '下载失败';
    throw new Error(msg);
  }
}

/** 用户下载版本快照单文件 */
export async function downloadCodeVersionSingleFile(
  versionId: string,
  path: string,
  fileName?: string,
  options?: { [key: string]: any },
): Promise<{ success: true }> {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const blob = await downloadV2CodeVersionFileBlob(versionId, path, opts);
    if (!(blob instanceof Blob)) throw new Error('下载响应不是文件流');
    triggerBrowserDownload(
      blob,
      fileName?.trim() || path.split('/').pop() || 'file',
    );
    return { success: true };
  } catch (error: any) {
    const msg =
      (await errorMessageFromV2Blob(error).catch(() => undefined)) ||
      (await errorMessageFromV2(error).catch(() => undefined)) ||
      error?.message ||
      '下载失败';
    throw new Error(msg);
  }
}

/** 显式校验代码版本（POST validate，非 training-check） */
export async function validateCodeVersionExplicit(
  codeVersionId: string,
  options?: { [key: string]: any } & { trainingProfile?: string },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const data = await validateV2CodeVersion(
      codeVersionId,
      options?.trainingProfile
        ? { trainingProfile: options.trainingProfile }
        : undefined,
      opts,
    );
    return { success: true, data };
  } catch (error: any) {
    throw new Error((await errorMessageFromV2(error)) || '版本校验失败');
  }
}

/** 管理员下载版本完整 ZIP */
export async function downloadAdminCodeVersionZipById(
  versionId: string,
  fileName?: string,
  options?: {
    onProgress?: (ratio: number | null) => void;
    [key: string]: any;
  },
): Promise<{ success: true }> {
  try {
    await downloadAuthFile({
      url: `/v2/admin/code-versions/${encodeURIComponent(versionId)}/download`,
      fileName: fileName?.trim() || `${versionId}.zip`,
      onProgress: options?.onProgress,
    });
    return { success: true };
  } catch (error: any) {
    const msg =
      (await errorMessageFromV2(error).catch(() => undefined)) ||
      error?.message ||
      '下载失败';
    throw new Error(msg);
  }
}
