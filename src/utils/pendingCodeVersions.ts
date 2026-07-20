/**
 * 待审核训练代码本地登记。
 *
 * 现网 GET /api/code/version/list 仅返回 APPROVED（listApproved），
 * 管理员无法从官方列表拿到 PENDING。上传成功后写入本机队列，
 * 并支持管理员手工录入 codeVersionId，方便在「待审核」页集中处理。
 *
 * 跨浏览器/跨机器仍需后端提供 PENDING 列表接口。
 */

export type PendingCodeVersionRecord = {
  codeVersionId: string;
  codeAssetName?: string;
  fileName?: string;
  trainingProfile?: string;
  approvalStatus?: string;
  storagePath?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  source?: 'upload' | 'manual' | 'api' | 'publish';
};

const STORAGE_KEY = 'tssai.pendingCodeVersions';

function readAll(): PendingCodeVersionRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingCodeVersionRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: PendingCodeVersionRecord[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export function listPendingCodeVersions(): PendingCodeVersionRecord[] {
  return readAll().sort((a, b) =>
    String(b.uploadedAt || '').localeCompare(String(a.uploadedAt || '')),
  );
}

export function upsertPendingCodeVersion(
  record: PendingCodeVersionRecord,
): PendingCodeVersionRecord[] {
  const id = record.codeVersionId?.trim();
  if (!id) return listPendingCodeVersions();
  const next = readAll().filter((item) => item.codeVersionId !== id);
  next.unshift({
    ...record,
    codeVersionId: id,
    uploadedAt: record.uploadedAt || new Date().toISOString(),
    approvalStatus: record.approvalStatus || 'PENDING',
  });
  writeAll(next);
  return listPendingCodeVersions();
}

export function removePendingCodeVersion(codeVersionId: string) {
  const id = codeVersionId?.trim();
  if (!id) return listPendingCodeVersions();
  writeAll(readAll().filter((item) => item.codeVersionId !== id));
  return listPendingCodeVersions();
}

export function markPendingCodeApproved(codeVersionId: string) {
  removePendingCodeVersion(codeVersionId);
}
