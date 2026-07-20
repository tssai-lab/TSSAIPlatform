/**
 * 代码资产上传 Service
 */
import { request } from '@umijs/max';
import { isTrainingCodeAutoApproveEnabled } from '@/constants/trainingCode';
import { upsertPendingCodeVersion } from '@/utils/pendingCodeVersions';
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
  downloadV2CodeVersionZip,
  deprecateV2CodeVersion,
  archiveV2CodeVersion,
  upgradeV2CodeArtifact,
  listAdminCodeReviewFindings,
  rescanAdminCodeReviewTask,
  hasV2ApprovalEvidence,
  isInternalGeneratedCodeAssetName,
  listAdminCodeReviewTasks,
  mapAdminReviewTaskToListItem,
  mapV2CodeVersionToLegacy,
  validateV2CodeVersion,
  errorMessageFromV2,
  errorMessageFromV2Blob,
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

  return request<{
    success: boolean;
    data: CodeUploadResult;
    errorMessage?: string;
  }>('/code/upload', {
    method: 'POST',
    params: query,
    data: formData,
    // 避免全局 application/json 破坏 multipart boundary
    headers: { 'Content-Type': undefined as unknown as string },
    timeout: 5 * 60 * 1000,
    ...(options || {}),
  });
}

export type CodeVersionApprovalResult = {
  codeVersionId: string;
  approvalStatus: string;
  decisionSource?: string;
};

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
  submittedAt?: string;
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

/** 管理员待审核队列：走 V2 `/api/v2/admin/code-review-tasks` */
export async function fetchPendingCodeReviewTasks(
  params?: {
    riskLevel?: string;
    keyword?: string;
    current?: number;
    pageSize?: number;
  },
  options?: { [key: string]: any },
) {
  const payload = await listAdminCodeReviewTasks(
    {
      approvalStatus: 'PENDING',
      riskLevel: params?.riskLevel,
      keyword: params?.keyword?.trim() || undefined,
      page: Math.max(0, (params?.current ?? 1) - 1),
      pageSize: params?.pageSize ?? 20,
    },
    options,
  );
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const mapped = items.map(mapAdminReviewTaskToListItem);
  // 审核列表 DTO 常不含 fileName / trainingProfile，用版本详情补全
  const enriched = await Promise.all(
    mapped.map(async (item) => {
      if (item.fileName?.trim() && item.trainingProfile?.trim()) {
        return item;
      }
      try {
        const detail = await getV2CodeVersion(item.codeVersionId, {
          skipErrorHandler: true,
          ...(options || {}),
        });
        const legacy = mapV2CodeVersionToLegacy(detail);
        return {
          ...item,
          fileName: item.fileName?.trim() || legacy.fileName || '',
          trainingProfile:
            item.trainingProfile?.trim() || legacy.trainingProfile || '',
          codeAssetName:
            item.codeAssetName?.trim() || legacy.codeAssetName || '',
          codeName: item.codeName || legacy.codeName,
        };
      } catch {
        return item;
      }
    }),
  );
  return {
    success: true,
    data: enriched,
    total: payload?.totalElements ?? enriched.length,
  };
}

/** 管理员审批训练代码版本（APPROVE / REJECT / REVOKE） */
export async function decideCodeVersion(
  codeVersionId: string,
  decision: 'APPROVE' | 'REJECT' | 'REVOKE',
  options?: { [key: string]: any } & { reason?: string },
) {
  const reason = options?.reason;
  try {
    const detail = await getAdminCodeReviewTaskDetail(codeVersionId, options);
    if (hasV2ApprovalEvidence(detail) || decision === 'REVOKE') {
      const data = await approveV2CodeVersion(
        codeVersionId,
        buildV2ApprovalRequest(detail, decision, reason),
        options,
      );
      return {
        success: true,
        data: {
          codeVersionId,
          approvalStatus:
            (data?.decision as string) ||
            (data?.approvalStatus as string) ||
            (decision === 'APPROVE'
              ? 'APPROVED'
              : decision === 'REJECT'
                ? 'REJECTED'
                : 'REVOKED'),
          decisionSource:
            typeof data?.decisionSource === 'string'
              ? data.decisionSource
              : undefined,
        } as CodeVersionApprovalResult,
      };
    }
  } catch {
    // fallback below
  }
  try {
    const body: { decision: typeof decision; reason?: string } = { decision };
    if (reason?.trim()) body.reason = reason.trim();
    const data = await approveV2CodeVersion(codeVersionId, body, options);
    return {
      success: true,
      data: {
        codeVersionId,
        approvalStatus:
          (data?.decision as string) ||
          (data?.approvalStatus as string) ||
          (decision === 'APPROVE'
            ? 'APPROVED'
            : decision === 'REJECT'
              ? 'REJECTED'
              : 'REVOKED'),
        decisionSource:
          typeof data?.decisionSource === 'string'
            ? data.decisionSource
            : undefined,
      } as CodeVersionApprovalResult,
    };
  } catch (error) {
    if (decision !== 'APPROVE') {
      throw error;
    }
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

/**
 * 自动审核通过（管理员审核开关关闭时生效）。
 * 开启管理员审核后为 no-op，人工审核路径保持不变。
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
  const profile = trainingProfile?.trim();
  if (profile) {
    try {
      await checkCodeVersionForTraining(id, profile, opts);
    } catch {
      // 校验失败时仍尝试审批，由审批接口返回明确错误
    }
  }

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
  createdAt?: string;
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
 */
export async function fetchCodeEditablePreview(
  params: { codeVersionId: string; codeAssetId?: string },
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  const assetId = params.codeAssetId?.trim();
  if (assetId) {
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
  },
  options?: { [key: string]: any },
) {
  const opts = { skipErrorHandler: true, ...(options || {}) };
  const assetId = params.codeAssetId?.trim();
  if (assetId) {
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
 */
export async function deleteCodeAsset(
  codeAssetId: string,
  options?: { [key: string]: any },
) {
  const assetId = codeAssetId?.trim();
  if (!assetId) {
    throw new Error('缺少 codeAssetId');
  }
  const opts = { skipErrorHandler: true, ...(options || {}) };
  try {
    const asset = await getV2CodeAsset(assetId, opts);
    const revision = asset?.assetRevision;
    if (revision == null) {
      throw new Error('缺少 assetRevision，无法删除');
    }
    await deleteV2CodeAsset(assetId, revision, opts);
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
  try {
    const listed = await listV2CodeWorkspaces(assetId, opts);
    const openList = Array.isArray(listed)
      ? listed.filter((ws) => isOpenWorkspace(ws) && ws.id)
      : [];
    const matched =
      openList.find((ws) => ws.baseVersionId === baseVersionId) ||
      openList[0];
    if (matched?.id) {
      return matched;
    }
  } catch {
    // 继续尝试新建
  }

  try {
    return await openV2CodeWorkspace(
      assetId,
      { baseVersionId },
      opts,
    );
  } catch (error: any) {
    // 已有打开工作区时，复用列表中的工作区
    const listed = await listV2CodeWorkspaces(assetId, opts).catch(
      () => undefined,
    );
    const openList = Array.isArray(listed)
      ? listed.filter((ws) => isOpenWorkspace(ws) && ws.id)
      : [];
    const matched =
      openList.find((ws) => ws.baseVersionId === baseVersionId) ||
      openList[0];
    if (matched?.id) {
      return matched;
    }
    throw error;
  }
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
    const err = new Error(msg || '保存训练代码失败');
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
    const err = new Error(msg || '发布工作区草稿失败');
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
  options?: { [key: string]: any },
) {
  try {
    const blob = await downloadV2CodeVersionZip(codeVersionId, {
      skipErrorHandler: true,
      ...(options || {}),
    });
    if (!(blob instanceof Blob)) {
      throw new Error('下载响应不是文件流');
    }
    // 错误时后端可能返回 JSON blob
    if (blob.type && blob.type.includes('application/json')) {
      const text = await blob.text();
      try {
        const json = JSON.parse(text) as { errorMessage?: string };
        throw new Error(json.errorMessage || '下载失败');
      } catch (e: any) {
        if (e?.message && e.message !== '下载失败') throw e;
        throw new Error(text || '下载失败');
      }
    }
    triggerBrowserDownload(
      blob,
      fileName?.trim() || `${codeVersionId}.zip`,
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
