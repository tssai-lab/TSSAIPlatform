/**
 * V2 训练代码资产 / 版本接口
 * @see module2-api-doc.md §18.7、module2-external-contract.md §7.1
 *
 * 成功响应直接返回 DTO/流；失败为 V2ErrorResponse（不经 legacy ApiResponse 包装）。
 */
import { request } from '@umijs/max';
import { FILE_DOWNLOAD_REQUEST_TIMEOUT } from '@/constants/request';

/** @deprecated 请改用 FILE_DOWNLOAD_REQUEST_TIMEOUT */
export const CODE_DOWNLOAD_REQUEST_TIMEOUT = FILE_DOWNLOAD_REQUEST_TIMEOUT;

export type V2CodeLanguageId =
  | 'python'
  | 'json'
  | 'yaml'
  | 'markdown'
  | 'plaintext'
  | string;

export type V2CodeVersionStatus = 'READY' | 'DEPRECATED' | 'ARCHIVED' | string;
export type V2CodeValidationStatus = 'NOT_RUN' | 'PASSED' | 'FAILED' | string;
export type V2CodeApprovalStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVOKED'
  | string;

/** 归一化审批状态；决策动词也映射到状态枚举 */
export function normalizeV2ApprovalStatus(
  status?: string | null,
): V2CodeApprovalStatus | undefined {
  const value = String(status || '')
    .trim()
    .toUpperCase();
  if (!value) return undefined;
  if (value === 'APPROVE') return 'APPROVED';
  if (value === 'REJECT') return 'REJECTED';
  if (value === 'REVOKE') return 'REVOKED';
  if (
    value === 'PENDING' ||
    value === 'APPROVED' ||
    value === 'REJECTED' ||
    value === 'REVOKED'
  ) {
    return value;
  }
  return undefined;
}

export type V2CodeAsset = {
  id?: string;
  name?: string;
  trainingProfile?: string;
  purpose?: string;
  runtime?: string;
  entryScript?: string;
  trainingType?: string;
  remark?: string;
  assetRevision?: number;
  createdAt?: string;
  updatedAt?: string;
  hasOpenWorkspace?: boolean;
};

/** 后端自动生成的内部资产名，如 code-version-061ba3fad1774d8e8634b6cb303fed8c */
export function isInternalGeneratedCodeAssetName(name?: string): boolean {
  const value = name?.trim();
  if (!value) return false;
  return /^code-(?:version|asset)-[a-f0-9-]{8,}$/i.test(value);
}

export type V2CodeVersion = {
  versionId?: string;
  id?: string;
  codeVersionId?: string;
  assetId?: string;
  codeAssetId?: string;
  assetName?: string;
  codeAssetName?: string;
  codeName?: string;
  name?: string;
  version?: string;
  versionLabel?: string;
  fileName?: string;
  trainingProfile?: string;
  status?: V2CodeVersionStatus;
  approvalStatus?: V2CodeApprovalStatus;
  validationStatus?: V2CodeValidationStatus;
  validationPolicyVersion?: string;
  sizeBytes?: number;
  artifactSha256?: string;
  remark?: string;
  entryScript?: string;
  createdAt?: string;
  publishedAt?: string;
  updatedAt?: string;
  riskAssessmentId?: string;
  riskStatus?: string;
  riskLevel?: string;
  reviewDisposition?: string;
  riskPolicyVersion?: string;
};

export type V2CodeConsumerManifest = {
  assetId?: string;
  versionId?: string;
  purpose?: string;
  runtime?: string;
  entryScript?: string;
  trainingType?: string;
  trainingProfile?: string;
  artifactSha256?: string;
  validationRunId?: string;
  validationPolicyVersion?: string;
  approvalRecordId?: string;
  approvalSource?: string;
  riskAssessmentId?: string;
  riskLevel?: string;
  riskPolicyVersion?: string;
};

export type V2CodeRiskFinding = {
  ruleId?: string;
  severity?: string;
  category?: string;
  filePath?: string;
  lineStart?: number;
  lineEnd?: number;
  description?: string;
};

export type V2CodeRiskAssessmentDetail = {
  id?: string;
  versionId?: string;
  validationRunId?: string;
  artifactSha256?: string;
  riskPolicyVersion?: string;
  scannerVersion?: string;
  status?: string;
  riskLevel?: string;
  disposition?: string;
  findingCount?: number;
  reasonCode?: string;
  createdAt?: string;
  startedAt?: string;
  completedAt?: string;
  findings?: V2CodeRiskFinding[];
};

export type V2AdminCodeReviewTask = {
  versionId?: string;
  codeVersionId?: string;
  id?: string;
  assetId?: string;
  assetName?: string;
  codeAssetName?: string;
  codeName?: string;
  name?: string;
  ownerUserId?: number;
  version?: string;
  lifecycleStatus?: string;
  approvalStatus?: string;
  artifactSha256?: string;
  validationStatus?: string;
  validationPolicyVersion?: string;
  riskAssessmentId?: string;
  riskStatus?: string;
  riskLevel?: string;
  reviewDisposition?: string;
  riskPolicyVersion?: string;
  findingCount?: number;
  submittedAt?: string;
  fileName?: string;
  trainingProfile?: string;
};

export type V2AdminCodeReviewTaskDetail = V2AdminCodeReviewTask & {
  purpose?: string;
  runtime?: string;
  entryScript?: string;
  trainingType?: string;
  fileName?: string;
  sizeBytes?: number;
  submittedAt?: string;
  riskAssessment?: {
    id?: string;
    versionId?: string;
    validationRunId?: string;
    artifactSha256?: string;
    riskPolicyVersion?: string;
    scannerVersion?: string;
    status?: string;
    riskLevel?: string;
    disposition?: string;
    findingCount?: number;
    createdAt?: string;
    startedAt?: string;
    completedAt?: string;
  };
};

export type V2AdminCodeReviewTaskPage = {
  items?: V2AdminCodeReviewTask[];
  page?: number;
  pageSize?: number;
  totalElements?: number;
  totalPages?: number;
};

export type V2CodeApprovalRequest = {
  decision: 'APPROVE' | 'REJECT' | 'REVOKE';
  reason?: string;
  expectedValidationRunId?: string;
  expectedRiskAssessmentId?: string;
  expectedArtifactSha256?: string;
  expectedPolicyVersion?: string;
};

export type V2CodeValidationResult = {
  policyVersion?: string;
  artifactSha256?: string;
  status?: string;
  reasonCode?: string;
  message?: string;
  fileCount?: number;
  reused?: boolean;
  validationStatus?: string;
  passed?: boolean;
  valid?: boolean;
  approvalStatus?: string;
  trainingProfileDisplayName?: string;
  checkedAt?: string;
};

export type V2CodeTreeNode = {
  path?: string;
  name?: string;
  fileName?: string;
  type?: string;
  nodeType?: string;
  directory?: boolean;
  isDirectory?: boolean;
  languageId?: V2CodeLanguageId;
  sizeBytes?: number;
  size?: number;
  contentHash?: string;
  children?: V2CodeTreeNode[];
};

export type V2CodeFileContent = {
  path?: string;
  name?: string;
  content?: string;
  text?: string;
  languageId?: V2CodeLanguageId;
  contentHash?: string;
  sizeBytes?: number;
  fileName?: string;
  workspaceRevision?: number;
  editable?: boolean;
  readOnly?: boolean;
  previewable?: boolean;
};

export type V2CodeFileMetadata = {
  path?: string;
  name?: string;
  nodeType?: string;
  extension?: string;
  languageId?: V2CodeLanguageId;
  contentType?: string;
  sizeBytes?: number;
  previewable?: boolean;
  editable?: boolean;
  downloadable?: boolean;
  reasonCode?: string;
  contentHash?: string;
  workspaceRevision?: number;
  readOnly?: boolean;
  deletable?: boolean;
};

export type V2CodeWorkspace = {
  id?: string;
  assetId?: string;
  baseVersionId?: string;
  closedVersionId?: string;
  status?: string;
  revision?: number;
  createdAt?: string;
  updatedAt?: string;
  closedAt?: string;
  readOnly?: boolean;
};

export type V2CodeFileUpsertRequest = {
  content: string;
  expectedWorkspaceRevision: number;
  expectedContentHash?: string;
};

export type V2CodeWorkspacePublishRequest = {
  expectedWorkspaceRevision: number;
  version?: string;
};

export type V2CodeErrorBody = {
  success?: boolean;
  errorCode?: string;
  errorMessage?: string;
  details?: Record<string, unknown>;
  traceId?: string;
};

function unwrapList(payload: unknown, depth = 0): V2CodeTreeNode[] {
  if (Array.isArray(payload)) {
    if (
      payload.length > 0 &&
      typeof payload[0] === 'string'
    ) {
      return (payload as string[]).map((path) => ({
        path,
        fileName: path.split('/').pop() || path,
      }));
    }
    return payload as V2CodeTreeNode[];
  }
  if (!payload || typeof payload !== 'object') return [];
  const obj = payload as Record<string, unknown>;

  if (depth < 3 && obj.data && typeof obj.data === 'object') {
    const nested = unwrapList(obj.data, depth + 1);
    if (nested.length) return nested;
  }

  for (const key of [
    'entries',
    'nodes',
    'items',
    'files',
    'children',
    'tree',
    'data',
  ]) {
    const value = obj[key];
    if (Array.isArray(value)) {
      return unwrapList(value, depth + 1);
    }
  }

  const root = obj.root;
  if (root && typeof root === 'object') {
    const rootNode = root as V2CodeTreeNode;
    if (Array.isArray(rootNode.children) && rootNode.children.length) {
      return rootNode.children;
    }
    return [rootNode];
  }

  if (typeof obj.path === 'string' || typeof obj.fileName === 'string') {
    return [obj as V2CodeTreeNode];
  }

  return [];
}

function isDirNode(node: V2CodeTreeNode): boolean {
  if (node.directory === true || node.isDirectory === true) return true;
  const t = String(
    (node as Record<string, unknown>).kind ||
      node.type ||
      node.nodeType ||
      '',
  ).toUpperCase();
  if (t === 'FILE' || t === 'FILE_LEAF') return false;
  if (t === 'DIR' || t === 'DIRECTORY' || t === 'FOLDER') return true;
  if (Array.isArray(node.children) && node.children.length > 0) return true;
  return false;
}

function resolveV2TreeNodePath(node: V2CodeTreeNode, parentPrefix = ''): string {
  const name = node.fileName || node.name || '';
  const rawPath = node.path || (parentPrefix ? `${parentPrefix}/${name}` : name);
  return String(rawPath).replace(/^\/+/, '').replace(/\\/g, '/');
}

/** 展平 V2 目录树为可预览文件列表（过滤目录） */
export function flattenV2CodeTree(
  payload: unknown,
  parentPath = '',
): Array<{
  path: string;
  fileName: string;
  sizeBytes?: number;
  languageId?: string;
}> {
  const nodes = unwrapList(payload);
  const out: Array<{
    path: string;
    fileName: string;
    sizeBytes?: number;
    languageId?: string;
  }> = [];

  const walk = (list: V2CodeTreeNode[], prefix: string) => {
    list.forEach((node) => {
      const name = node.fileName || node.name || '';
      const path = resolveV2TreeNodePath(node, prefix) || name;
      if (!path) return;
      if (isDirNode(node)) {
        if (Array.isArray(node.children) && node.children.length) {
          walk(node.children, path);
        }
        return;
      }
      out.push({
        path,
        fileName: name || path.split('/').pop() || path,
        sizeBytes: node.sizeBytes ?? node.size,
        languageId: node.languageId,
      });
      if (Array.isArray(node.children) && node.children.length) {
        walk(node.children, path);
      }
    });
  };

  walk(nodes, parentPath);
  return out.filter((item) => !!item.path);
}

export type V2CodeTreeFileEntry = {
  path: string;
  fileName: string;
  sizeBytes?: number;
  languageId?: string;
};

/**
 * 递归拉取完整文件列表。
 * 兼容后端 /tree 仅返回单层、目录节点无 children 的情况（通过 prefix 逐层请求）。
 */
export async function fetchAllV2CodeTreeFiles(
  fetchTree: (prefix?: string) => Promise<unknown>,
  options?: { maxDepth?: number },
): Promise<V2CodeTreeFileEntry[]> {
  const maxDepth = options?.maxDepth ?? 24;
  const visitedPrefixes = new Set<string>();
  const filesByPath = new Map<string, V2CodeTreeFileEntry>();

  const addFiles = (entries: V2CodeTreeFileEntry[]) => {
    entries.forEach((entry) => {
      if (entry.path) filesByPath.set(entry.path, entry);
    });
  };

  const loadPrefix = async (prefix: string, depth: number) => {
    const normPrefix = prefix.replace(/^\/+/, '').replace(/\\/g, '/').replace(/\/+$/, '');
    const visitKey = normPrefix || '__root__';
    if (visitedPrefixes.has(visitKey) || depth > maxDepth) return;
    visitedPrefixes.add(visitKey);

    let payload: unknown;
    try {
      payload = await fetchTree(normPrefix || undefined);
    } catch {
      return;
    }

    if (
      Array.isArray(payload) &&
      payload.length > 0 &&
      typeof payload[0] === 'string'
    ) {
      addFiles(flattenV2CodeTree(payload));
      return;
    }

    const nodes = unwrapList(payload);
    for (const node of nodes) {
      const path = resolveV2TreeNodePath(node, normPrefix);
      if (!path) continue;

      if (isDirNode(node)) {
        if (Array.isArray(node.children) && node.children.length > 0) {
          addFiles(flattenV2CodeTree({ children: node.children }));
          for (const child of node.children) {
            const childPath = resolveV2TreeNodePath(child, path);
            if (
              childPath &&
              isDirNode(child) &&
              (!child.children || child.children.length === 0)
            ) {
              await loadPrefix(childPath, depth + 1);
            }
          }
        } else {
          await loadPrefix(path, depth + 1);
        }
        continue;
      }

      const fileName = node.fileName || node.name || path.split('/').pop() || path;
      filesByPath.set(path, {
        path,
        fileName,
        sizeBytes: node.sizeBytes ?? node.size,
        languageId: node.languageId,
      });
    }
  };

  await loadPrefix('', 0);
  return Array.from(filesByPath.values()).sort((a, b) =>
    a.path.localeCompare(b.path, 'zh-CN'),
  );
}

function pickUserCodeName(detail: V2CodeVersion): string | undefined {
  const candidates = [detail.codeName, detail.name, detail.codeAssetName];
  for (const candidate of candidates) {
    const value = candidate?.trim();
    if (value && !isInternalGeneratedCodeAssetName(value)) {
      return value;
    }
  }
  return undefined;
}

export function mapV2CodeVersionToLegacy(detail: V2CodeVersion) {
  const versionId =
    detail.versionId || detail.codeVersionId || detail.id || '';
  const userCodeName = pickUserCodeName(detail);
  const fallbackAssetName =
    detail.codeAssetName || detail.assetName || detail.name || '';
  return {
    codeVersionId: versionId,
    codeAssetId: detail.assetId || detail.codeAssetId || '',
    codeName: userCodeName,
    codeAssetName: userCodeName || fallbackAssetName,
    version: detail.versionLabel || detail.version || '',
    fileName: detail.fileName || '',
    trainingProfile: detail.trainingProfile || '',
    approvalStatus: normalizeV2ApprovalStatus(detail.approvalStatus) || '',
    status: detail.status || '',
    sizeBytes: detail.sizeBytes,
    remark: detail.remark,
    createdAt: detail.createdAt || detail.publishedAt,
    submittedAt: detail.createdAt || detail.publishedAt,
    artifactSha256: detail.artifactSha256,
    entryScript: detail.entryScript,
    validationStatus: detail.validationStatus,
    riskAssessmentId: detail.riskAssessmentId,
    riskStatus: detail.riskStatus,
    riskLevel: detail.riskLevel,
    reviewDisposition: detail.reviewDisposition,
    riskPolicyVersion: detail.riskPolicyVersion,
    validationPolicyVersion: detail.validationPolicyVersion,
  };
}

function firstNonEmptyName(...values: Array<string | undefined>): string {
  for (const value of values) {
    const text = value?.trim();
    if (text && !isInternalGeneratedCodeAssetName(text)) return text;
  }
  for (const value of values) {
    const text = value?.trim();
    if (text) return text;
  }
  return '';
}

function pickReviewTaskVersionId(task: V2AdminCodeReviewTask): string {
  return (
    task.versionId?.trim() ||
    task.codeVersionId?.trim() ||
    task.id?.trim() ||
    ''
  );
}

/** 归一化审核队列分页（兼容 {items} / {data:{items}} / 数组） */
export function normalizeAdminReviewTaskPage(payload?: unknown): {
  items: V2AdminCodeReviewTask[];
  totalElements: number;
} {
  const visit = (raw: unknown, depth = 0): V2AdminCodeReviewTaskPage | null => {
    if (Array.isArray(raw)) {
      return { items: raw as V2AdminCodeReviewTask[], totalElements: raw.length };
    }
    if (!raw || typeof raw !== 'object' || depth > 3) return null;
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      return {
        items: obj.items as V2AdminCodeReviewTask[],
        totalElements: Number(obj.totalElements ?? obj.items.length) || obj.items.length,
      };
    }
    if (obj.data != null) return visit(obj.data, depth + 1);
    return null;
  };
  const page = visit(payload);
  const items = page?.items ?? [];
  return {
    items,
    totalElements: page?.totalElements ?? items.length,
  };
}

export function mapAdminReviewTaskToListItem(
  task: V2AdminCodeReviewTask,
): import('./code').CodeVersionListItem {
  const displayName = firstNonEmptyName(
    task.codeName,
    task.codeAssetName,
    task.name,
    task.assetName,
  );
  return {
    codeVersionId: pickReviewTaskVersionId(task),
    codeAssetId: task.assetId || '',
    codeName: displayName || undefined,
    codeAssetName: displayName,
    version: task.version || '',
    fileName: task.fileName || '',
    trainingProfile: task.trainingProfile || '',
    approvalStatus: task.approvalStatus || 'PENDING',
    status: task.lifecycleStatus || 'READY',
    validationStatus: task.validationStatus,
    riskLevel: task.riskLevel,
    riskStatus: task.riskStatus,
    reviewDisposition: task.reviewDisposition,
    submittedAt: task.submittedAt,
    ownerUserId: task.ownerUserId,
  };
}

/** 管理员审核详情 → 详情页 DTO */
export function mapAdminReviewTaskDetailToCodeVersionDetail(
  detail: V2AdminCodeReviewTaskDetail,
): import('./code').CodeVersionDetail {
  const displayName = firstNonEmptyName(
    detail.codeName,
    detail.codeAssetName,
    detail.name,
    detail.assetName,
  );
  return {
    codeVersionId: pickReviewTaskVersionId(detail),
    codeAssetId: detail.assetId || '',
    codeName: displayName || undefined,
    codeAssetName: displayName,
    version: detail.version || '',
    fileName: detail.fileName || '',
    trainingProfile: detail.trainingProfile || '',
    approvalStatus: detail.approvalStatus || 'PENDING',
    status: detail.lifecycleStatus || 'READY',
    validationStatus: detail.validationStatus,
    validationPolicyVersion: detail.validationPolicyVersion,
    artifactSha256: detail.artifactSha256,
    riskAssessmentId: detail.riskAssessmentId,
    riskStatus: detail.riskStatus,
    riskLevel: detail.riskLevel,
    reviewDisposition: detail.reviewDisposition,
    riskPolicyVersion: detail.riskPolicyVersion,
    submittedAt: detail.submittedAt,
    sizeBytes: detail.sizeBytes,
    ownerUserId: detail.ownerUserId,
    entryScript: detail.entryScript,
    runtime: detail.runtime,
    purpose: detail.purpose,
    trainingType: detail.trainingType,
    riskAssessment: detail.riskAssessment
      ? {
          id: detail.riskAssessment.id,
          validationRunId: detail.riskAssessment.validationRunId,
          artifactSha256: detail.riskAssessment.artifactSha256,
          riskPolicyVersion: detail.riskAssessment.riskPolicyVersion,
          status: detail.riskAssessment.status,
          riskLevel: detail.riskAssessment.riskLevel,
          disposition: detail.riskAssessment.disposition,
          findingCount: detail.riskAssessment.findingCount,
        }
      : undefined,
  };
}

/** 从管理员审核详情构建 V2 审批请求体（文档 §18.7） */
export function buildV2ApprovalRequest(
  detail: V2AdminCodeReviewTaskDetail,
  decision: V2CodeApprovalRequest['decision'],
  reason?: string,
): V2CodeApprovalRequest {
  const risk = detail.riskAssessment;
  const body: V2CodeApprovalRequest = { decision };
  if (reason?.trim()) {
    body.reason = reason.trim();
  }
  if (decision === 'APPROVE' || decision === 'REJECT') {
    body.expectedValidationRunId = risk?.validationRunId;
    body.expectedRiskAssessmentId = risk?.id;
    body.expectedArtifactSha256 = detail.artifactSha256 || risk?.artifactSha256;
    body.expectedPolicyVersion =
      risk?.riskPolicyVersion || detail.riskPolicyVersion;
  }
  return body;
}

export function hasV2ApprovalEvidence(detail: V2AdminCodeReviewTaskDetail) {
  const risk = detail.riskAssessment;
  return Boolean(
    risk?.validationRunId &&
      risk?.id &&
      (detail.artifactSha256 || risk.artifactSha256) &&
      (risk.riskPolicyVersion || detail.riskPolicyVersion),
  );
}

/** GET /api/v2/code-assets */
export async function listV2CodeAssets(options?: { [key: string]: unknown }) {
  return request<V2CodeAsset[]>('/v2/code-assets', {
    method: 'GET',
    ...(options || {}),
  });
}

/** POST /api/v2/code-assets */
export async function createV2CodeAsset(
  body: {
    name: string;
    trainingProfile?: string;
    purpose?: string;
    runtime?: string;
    entryScript?: string;
    remark?: string;
  },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeAsset>('/v2/code-assets', {
    method: 'POST',
    data: body,
    ...(options || {}),
  });
}

/** POST /api/v2/code-assets/import — multipart metadata + file */
export async function importV2CodeAssetZip(
  params: {
    file: File;
    metadata: {
      name: string;
      version?: string;
      trainingProfile?: string;
      remark?: string;
    };
  },
  options?: { [key: string]: unknown },
) {
  const formData = new FormData();
  formData.append('file', params.file);
  formData.append(
    'metadata',
    new Blob([JSON.stringify(params.metadata)], { type: 'application/json' }),
  );
  return request<V2CodeVersion>(
    '/v2/code-assets/import',
    {
      method: 'POST',
      data: formData,
      headers: { 'Content-Type': undefined as unknown as string },
      timeout: 5 * 60 * 1000,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-assets/{assetId} */
export async function getV2CodeAsset(
  assetId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeAsset>(
    `/v2/code-assets/${encodeURIComponent(assetId)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** DELETE /api/v2/code-assets/{assetId}?expectedAssetRevision=... */
export async function deleteV2CodeAsset(
  assetId: string,
  expectedAssetRevision: number,
  options?: { [key: string]: unknown },
) {
  return request<void>(
    `/v2/code-assets/${encodeURIComponent(assetId)}`,
    {
      method: 'DELETE',
      params: { expectedAssetRevision },
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-assets/{assetId}/workspaces */
export async function listV2CodeWorkspaces(
  assetId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace[]>(
    `/v2/code-assets/${encodeURIComponent(assetId)}/workspaces`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-assets/{assetId}/workspaces */
export async function openV2CodeWorkspace(
  assetId: string,
  body?: { baseVersionId?: string },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace>(
    `/v2/code-assets/${encodeURIComponent(assetId)}/workspaces`,
    {
      method: 'POST',
      data: body || {},
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-workspaces/{workspaceId} */
export async function getV2CodeWorkspace(
  workspaceId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-workspaces/{workspaceId}/files/metadata?path=... */
export async function getV2CodeWorkspaceFileMetadata(
  workspaceId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileMetadata>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/files/metadata`,
    {
      method: 'GET',
      params: { path },
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-workspaces/{workspaceId}/files/content?path=... */
export async function getV2CodeWorkspaceFileContent(
  workspaceId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileContent | string>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/files/content`,
    {
      method: 'GET',
      params: { path },
      ...(options || {}),
    },
  );
}

/** PUT /api/v2/code-workspaces/{workspaceId}/files?path=... */
export async function upsertV2CodeWorkspaceFile(
  workspaceId: string,
  path: string,
  body: V2CodeFileUpsertRequest,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileContent>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/files`,
    {
      method: 'PUT',
      params: { path },
      data: body,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-workspaces/{workspaceId}/validate */
export async function validateV2CodeWorkspace(
  workspaceId: string,
  body: { expectedWorkspaceRevision: number },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeValidationResult>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/validate`,
    {
      method: 'POST',
      data: body,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-workspaces/{workspaceId}/files/download */
export async function downloadV2CodeWorkspaceFileBlob(
  workspaceId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/files/download`,
    {
      method: 'GET',
      params: { path },
      responseType: 'blob',
      skipErrorHandler: true,
      timeout: FILE_DOWNLOAD_REQUEST_TIMEOUT,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-workspaces/{workspaceId}/publish */
export async function publishV2CodeWorkspace(
  workspaceId: string,
  body: V2CodeWorkspacePublishRequest,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/publish`,
    {
      method: 'POST',
      data: body,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-versions/{versionId} */
export async function getV2CodeVersion(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion>(
    `/v2/code-versions/${encodeURIComponent(versionId)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-versions/{versionId}/tree */
export async function getV2CodeVersionTree(
  versionId: string,
  prefix?: string,
  options?: { [key: string]: unknown },
) {
  return request<unknown>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/tree`,
    {
      method: 'GET',
      params: prefix ? { prefix } : undefined,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-versions/{versionId}/files/content?path=... */
export async function getV2CodeVersionFileContent(
  versionId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileContent | string>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/files/content`,
    {
      method: 'GET',
      params: { path },
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-versions/{versionId}/files/download */
export async function downloadV2CodeVersionFileBlob(
  versionId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/files/download`,
    {
      method: 'GET',
      params: { path },
      responseType: 'blob',
      skipErrorHandler: true,
      timeout: FILE_DOWNLOAD_REQUEST_TIMEOUT,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-versions/{versionId}/download — 完整 ZIP 流 */
export async function downloadV2CodeVersionZip(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/download`,
    {
      method: 'GET',
      responseType: 'blob',
      skipErrorHandler: true,
      timeout: FILE_DOWNLOAD_REQUEST_TIMEOUT,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-versions/{versionId}/validate */
export async function validateV2CodeVersion(
  versionId: string,
  body?: Record<string, unknown>,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeValidationResult>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/validate`,
    {
      method: 'POST',
      data: body || {},
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-versions/{versionId}/consumer-manifest */
export async function getV2CodeConsumerManifest(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeConsumerManifest>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/consumer-manifest`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-versions/{versionId}/risk-assessment */
export async function getV2CodeRiskAssessment(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeRiskAssessmentDetail>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/risk-assessment`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-review-tasks */
export async function listAdminCodeReviewTasks(
  params?: {
    approvalStatus?: string;
    riskLevel?: string;
    ownerUserId?: number;
    keyword?: string;
    submittedFrom?: string;
    submittedTo?: string;
    sortBy?: string;
    sortDirection?: string;
    page?: number;
    pageSize?: number;
  },
  options?: { [key: string]: unknown },
) {
  return request<V2AdminCodeReviewTaskPage>('/v2/admin/code-review-tasks', {
    method: 'GET',
    params: {
      approvalStatus: params?.approvalStatus ?? 'PENDING',
      page: params?.page ?? 0,
      pageSize: params?.pageSize ?? 20,
      ...params,
    },
    ...(options || {}),
  });
}

/** GET /api/v2/admin/code-review-tasks/{versionId} */
export async function getAdminCodeReviewTaskDetail(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2AdminCodeReviewTaskDetail>(
    `/v2/admin/code-review-tasks/${encodeURIComponent(versionId)}`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-review-tasks/{versionId}/tree */
export async function getAdminCodeReviewTaskTree(
  versionId: string,
  prefix?: string,
  options?: { [key: string]: unknown },
) {
  return request<unknown>(
    `/v2/admin/code-review-tasks/${encodeURIComponent(versionId)}/tree`,
    {
      method: 'GET',
      params: prefix ? { prefix } : undefined,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-review-tasks/{versionId}/files/content */
export async function getAdminCodeReviewTaskFileContent(
  versionId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileContent | string>(
    `/v2/admin/code-review-tasks/${encodeURIComponent(versionId)}/files/content`,
    {
      method: 'GET',
      params: { path },
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-versions/{versionId}/approval */
export async function approveV2CodeVersion(
  versionId: string,
  body: V2CodeApprovalRequest,
  options?: { [key: string]: unknown },
) {
  return request<{
    versionId?: string;
    approvalStatus?: string;
    decisionSource?: string;
    [key: string]: unknown;
  }>(`/v2/code-versions/${encodeURIComponent(versionId)}/approval`, {
    method: 'POST',
    data: body,
    ...(options || {}),
  });
}

/** PATCH /api/v2/code-assets/{assetId} */
export async function patchV2CodeAsset(
  assetId: string,
  body: {
    assetRevision: number;
    name?: string;
    trainingProfile?: string;
    purpose?: string;
    runtime?: string;
    entryScript?: string;
    trainingType?: string;
    remark?: string;
  },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeAsset>(
    `/v2/code-assets/${encodeURIComponent(assetId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: body,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-assets/{assetId}/versions */
export async function listV2CodeAssetVersions(
  assetId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion[]>(
    `/v2/code-assets/${encodeURIComponent(assetId)}/versions`,
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** DELETE /api/v2/code-workspaces/{workspaceId}/files?path=... */
export async function deleteV2CodeWorkspaceFile(
  workspaceId: string,
  path: string,
  body: {
    expectedWorkspaceRevision: number;
    expectedContentHash?: string;
  },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace | void>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/files`,
    {
      method: 'DELETE',
      params: { path },
      data: body,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-workspaces/{workspaceId}/files/move */
export async function moveV2CodeWorkspaceFile(
  workspaceId: string,
  body: {
    sourcePath: string;
    targetPath: string;
    expectedWorkspaceRevision: number;
    expectedContentHash?: string;
  },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileContent | V2CodeWorkspace>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/files/move`,
    {
      method: 'POST',
      data: body,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-workspaces/{workspaceId}/abandon */
export async function abandonV2CodeWorkspace(
  workspaceId: string,
  body: { expectedWorkspaceRevision: number },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace | void>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/abandon`,
    {
      method: 'POST',
      data: body,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/code-workspaces/{workspaceId}/tree */
export async function getV2CodeWorkspaceTree(
  workspaceId: string,
  prefix?: string,
  options?: { [key: string]: unknown },
) {
  return request<unknown>(
    `/v2/code-workspaces/${encodeURIComponent(workspaceId)}/tree`,
    {
      method: 'GET',
      params: prefix ? { prefix } : undefined,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-versions/{versionId}/deprecate */
export async function deprecateV2CodeVersion(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/deprecate`,
    {
      method: 'POST',
      data: {},
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-versions/{versionId}/archive */
export async function archiveV2CodeVersion(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion>(
    `/v2/code-versions/${encodeURIComponent(versionId)}/archive`,
    {
      method: 'POST',
      data: {},
      ...(options || {}),
    },
  );
}

/** POST /api/v2/code-versions/{versionId}/artifact-upgrade */
export async function upgradeV2CodeArtifact(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<{
    versionId?: string;
    artifactSha256?: string;
    sizeBytes?: number;
    approvalStatus?: string;
    upgraded?: boolean;
    validation?: V2CodeValidationResult;
  }>(`/v2/code-versions/${encodeURIComponent(versionId)}/artifact-upgrade`, {
    method: 'POST',
    data: {},
    ...(options || {}),
  });
}

/** —— 管理员跨 owner 代码资产 —— */

export type V2AdminCodeAsset = V2CodeAsset & {
  assetId?: string;
  ownerUserId?: string;
};

export type V2AdminCodeAssetPage = {
  items?: V2AdminCodeAsset[];
  page?: number;
  pageSize?: number;
  totalElements?: number;
  totalPages?: number;
};

/** 归一化管理员代码资产分页（后端字段 items/totalElements） */
export function normalizeAdminCodeAssetPage(
  payload?: V2AdminCodeAssetPage | null,
): {
  items: V2AdminCodeAsset[];
  total: number;
  page: number;
  pageSize: number;
} {
  const visit = (
    raw: unknown,
    depth = 0,
  ): V2AdminCodeAssetPage | null => {
    if (Array.isArray(raw)) {
      return { items: raw as V2AdminCodeAsset[], totalElements: raw.length };
    }
    if (!raw || typeof raw !== 'object' || depth > 3) return null;
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      return obj as V2AdminCodeAssetPage;
    }
    if (obj.data != null) return visit(obj.data, depth + 1);
    return null;
  };
  const page = visit(payload);
  const items = Array.isArray(page?.items) ? page.items : [];
  return {
    items,
    total: page?.totalElements ?? items.length,
    page: page?.page ?? 0,
    pageSize: page?.pageSize ?? items.length,
  };
}

/** GET /api/v2/admin/code-assets — page 从 0 开始 */
export async function listAdminCodeAssets(
  params?: {
    page?: number;
    pageSize?: number;
    keyword?: string;
    ownerUserId?: string;
    trainingProfile?: string;
    sortBy?: 'UPDATED_AT' | 'CREATED_AT' | 'NAME' | 'OWNER_USER_ID' | string;
    sortDirection?: 'ASC' | 'DESC';
  },
  options?: { [key: string]: unknown },
) {
  return request<V2AdminCodeAssetPage>('/v2/admin/code-assets', {
    method: 'GET',
    params: {
      page: params?.page ?? 0,
      pageSize: params?.pageSize ?? 20,
      sortBy: params?.sortBy ?? 'UPDATED_AT',
      sortDirection: params?.sortDirection ?? 'DESC',
      ...(params?.keyword ? { keyword: params.keyword } : {}),
      ...(params?.ownerUserId ? { ownerUserId: params.ownerUserId } : {}),
      ...(params?.trainingProfile
        ? { trainingProfile: params.trainingProfile }
        : {}),
    },
    ...(options || {}),
  });
}

/** GET /api/v2/admin/code-assets/{assetId} */
export async function getAdminCodeAsset(
  assetId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2AdminCodeAsset>(
    `/v2/admin/code-assets/${encodeURIComponent(assetId)}`,
    { method: 'GET', ...(options || {}) },
  );
}

/** PATCH /api/v2/admin/code-assets/{assetId} */
export async function patchAdminCodeAsset(
  assetId: string,
  body: {
    assetRevision: number;
    name?: string;
    trainingProfile?: string;
    purpose?: string;
    runtime?: string;
    entryScript?: string;
    trainingType?: string;
    remark?: string;
  },
  options?: { [key: string]: unknown },
) {
  return request<V2AdminCodeAsset>(
    `/v2/admin/code-assets/${encodeURIComponent(assetId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/merge-patch+json' },
      data: body,
      ...(options || {}),
    },
  );
}

/** DELETE /api/v2/admin/code-assets/{assetId} */
export async function deleteAdminCodeAsset(
  assetId: string,
  options?: { [key: string]: unknown },
) {
  return request<unknown>(
    `/v2/admin/code-assets/${encodeURIComponent(assetId)}`,
    { method: 'DELETE', ...(options || {}) },
  );
}

/** GET /api/v2/admin/code-assets/{assetId}/versions */
export async function listAdminCodeAssetVersions(
  assetId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion[]>(
    `/v2/admin/code-assets/${encodeURIComponent(assetId)}/versions`,
    { method: 'GET', ...(options || {}) },
  );
}

/** GET /api/v2/admin/code-assets/{assetId}/workspaces */
export async function listAdminCodeAssetWorkspaces(
  assetId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace[]>(
    `/v2/admin/code-assets/${encodeURIComponent(assetId)}/workspaces`,
    { method: 'GET', ...(options || {}) },
  );
}

/** POST /api/v2/admin/code-assets/{assetId}/workspaces */
export async function openAdminCodeAssetWorkspace(
  assetId: string,
  body?: { baseVersionId?: string },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace>(
    `/v2/admin/code-assets/${encodeURIComponent(assetId)}/workspaces`,
    { method: 'POST', data: body || {}, ...(options || {}) },
  );
}

/** GET /api/v2/admin/code-workspaces/{workspaceId}/tree */
export async function getAdminCodeWorkspaceTree(
  workspaceId: string,
  prefix?: string,
  options?: { [key: string]: unknown },
) {
  return request<unknown>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/tree`,
    {
      method: 'GET',
      params: prefix ? { prefix } : undefined,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-workspaces/{workspaceId}/files/content */
export async function getAdminCodeWorkspaceFileContent(
  workspaceId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<{
    path?: string;
    content?: string;
    text?: string;
    encoding?: string;
    [key: string]: unknown;
  }>(`/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/files/content`, {
    method: 'GET',
    params: { path },
    ...(options || {}),
  });
}

/** GET /api/v2/admin/code-workspaces/{workspaceId} */
export async function getAdminCodeWorkspace(
  workspaceId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}`,
    { method: 'GET', ...(options || {}) },
  );
}

/** GET /api/v2/admin/code-workspaces/{workspaceId}/files/metadata */
export async function getAdminCodeWorkspaceFileMetadata(
  workspaceId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileMetadata>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/files/metadata`,
    {
      method: 'GET',
      params: { path },
      ...(options || {}),
    },
  );
}

/** PUT /api/v2/admin/code-workspaces/{workspaceId}/files */
export async function upsertAdminCodeWorkspaceFile(
  workspaceId: string,
  path: string,
  body: V2CodeFileUpsertRequest,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileContent>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/files`,
    {
      method: 'PUT',
      params: { path },
      data: body,
      ...(options || {}),
    },
  );
}

/** DELETE /api/v2/admin/code-workspaces/{workspaceId}/files */
export async function deleteAdminCodeWorkspaceFile(
  workspaceId: string,
  path: string,
  body: {
    expectedWorkspaceRevision: number;
    expectedContentHash?: string;
  },
  options?: { [key: string]: unknown },
) {
  return request<{ workspaceId?: string; workspaceRevision?: number }>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/files`,
    {
      method: 'DELETE',
      params: { path },
      data: body,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/admin/code-workspaces/{workspaceId}/publish */
export async function publishAdminCodeWorkspace(
  workspaceId: string,
  body: V2CodeWorkspacePublishRequest,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/publish`,
    {
      method: 'POST',
      data: body,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/admin/code-workspaces/{workspaceId}/abandon */
export async function abandonAdminCodeWorkspace(
  workspaceId: string,
  body: { expectedWorkspaceRevision: number },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeWorkspace>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/abandon`,
    {
      method: 'POST',
      data: body,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/admin/code-workspaces/{workspaceId}/files/move */
export async function moveAdminCodeWorkspaceFile(
  workspaceId: string,
  body: {
    sourcePath: string;
    targetPath: string;
    expectedWorkspaceRevision: number;
    expectedContentHash?: string;
  },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeFileContent>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/files/move`,
    {
      method: 'POST',
      data: body,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/admin/code-workspaces/{workspaceId}/validate */
export async function validateAdminCodeWorkspace(
  workspaceId: string,
  body: { expectedWorkspaceRevision: number },
  options?: { [key: string]: unknown },
) {
  return request<V2CodeValidationResult>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/validate`,
    {
      method: 'POST',
      data: body,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-workspaces/{workspaceId}/files/download */
export async function downloadAdminCodeWorkspaceFileBlob(
  workspaceId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/v2/admin/code-workspaces/${encodeURIComponent(workspaceId)}/files/download`,
    {
      method: 'GET',
      params: { path },
      responseType: 'blob',
      skipErrorHandler: true,
      timeout: FILE_DOWNLOAD_REQUEST_TIMEOUT,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-versions/{versionId} */
export async function getAdminCodeVersion(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion>(
    `/v2/admin/code-versions/${encodeURIComponent(versionId)}`,
    { method: 'GET', ...(options || {}) },
  );
}

/** GET /api/v2/admin/code-versions/{versionId}/tree */
export async function getAdminCodeVersionTree(
  versionId: string,
  prefix?: string,
  options?: { [key: string]: unknown },
) {
  return request<unknown>(
    `/v2/admin/code-versions/${encodeURIComponent(versionId)}/tree`,
    {
      method: 'GET',
      params: prefix ? { prefix } : undefined,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-versions/{versionId}/files/content */
export async function getAdminCodeVersionFileContent(
  versionId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<{
    path?: string;
    content?: string;
    text?: string;
    encoding?: string;
    [key: string]: unknown;
  }>(`/v2/admin/code-versions/${encodeURIComponent(versionId)}/files/content`, {
    method: 'GET',
    params: { path },
    ...(options || {}),
  });
}

/** GET /api/v2/admin/code-versions/{versionId}/files/download */
export async function downloadAdminCodeVersionFileBlob(
  versionId: string,
  path: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/v2/admin/code-versions/${encodeURIComponent(versionId)}/files/download`,
    {
      method: 'GET',
      params: { path },
      responseType: 'blob',
      skipErrorHandler: true,
      timeout: FILE_DOWNLOAD_REQUEST_TIMEOUT,
      ...(options || {}),
    },
  );
}

/** POST /api/v2/admin/code-versions/{versionId}/validate */
export async function validateAdminCodeVersion(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeValidationResult>(
    `/v2/admin/code-versions/${encodeURIComponent(versionId)}/validate`,
    {
      method: 'POST',
      data: {},
      ...(options || {}),
    },
  );
}

/** POST /api/v2/admin/code-versions/{versionId}/deprecate */
export async function deprecateAdminCodeVersion(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion>(
    `/v2/admin/code-versions/${encodeURIComponent(versionId)}/deprecate`,
    {
      method: 'POST',
      data: {},
      ...(options || {}),
    },
  );
}

/** POST /api/v2/admin/code-versions/{versionId}/archive */
export async function archiveAdminCodeVersion(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeVersion>(
    `/v2/admin/code-versions/${encodeURIComponent(versionId)}/archive`,
    {
      method: 'POST',
      data: {},
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-versions/{versionId}/download — 完整 ZIP */
export async function downloadAdminCodeVersionZip(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<Blob>(
    `/v2/admin/code-versions/${encodeURIComponent(versionId)}/download`,
    {
      method: 'GET',
      responseType: 'blob',
      skipErrorHandler: true,
      timeout: FILE_DOWNLOAD_REQUEST_TIMEOUT,
      ...(options || {}),
    },
  );
}

/** GET /api/v2/admin/code-review-tasks/{versionId}/findings */
export async function listAdminCodeReviewFindings(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<
    Array<{
      id?: string;
      riskAssessmentId?: string;
      ruleId?: string;
      severity?: string;
      category?: string;
      filePath?: string;
      lineStart?: number;
      lineEnd?: number;
      description?: string;
    }>
  >(`/v2/admin/code-review-tasks/${encodeURIComponent(versionId)}/findings`, {
    method: 'GET',
    ...(options || {}),
  });
}

/** POST /api/v2/admin/code-review-tasks/{versionId}/rescan */
export async function rescanAdminCodeReviewTask(
  versionId: string,
  options?: { [key: string]: unknown },
) {
  return request<V2CodeRiskAssessmentDetail | Record<string, unknown>>(
    `/v2/admin/code-review-tasks/${encodeURIComponent(versionId)}/rescan`,
    {
      method: 'POST',
      data: {},
      ...(options || {}),
    },
  );
}

export function extractV2FileText(payload: V2CodeFileContent | string): string {
  if (typeof payload === 'string') return payload;
  return payload?.content || payload?.text || '';
}

export async function errorMessageFromV2(error: any): Promise<string> {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    return errorMessageFromV2Blob(error);
  }
  if (data && typeof data === 'object') {
    const body = data as V2CodeErrorBody;
    const reason =
      body.details && typeof body.details === 'object'
        ? (body.details as Record<string, unknown>).reasonCode
        : undefined;
    return (
      body.errorMessage ||
      (typeof reason === 'string' ? reason : undefined) ||
      body.errorCode ||
      error?.message ||
      '请求失败'
    );
  }
  return (
    error?.info?.errorMessage ||
    error?.data?.errorMessage ||
    error?.message ||
    '请求失败'
  );
}

export async function errorMessageFromV2Blob(error: any): Promise<string> {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try {
      const text = await data.text();
      const json = JSON.parse(text) as V2CodeErrorBody;
      return json?.errorMessage || json?.errorCode || text || '下载失败';
    } catch {
      return '下载失败或文件不存在';
    }
  }
  return (
    error?.info?.errorMessage ||
    error?.data?.errorMessage ||
    error?.message ||
    '请求失败'
  );
}
