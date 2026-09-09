/** 审核决策及训练准入检查。仅整理职责；权限、版本 CAS、重试及兼容规则沿用原实现。 */
import { isTrainingCodeAutoApproveEnabled } from '@/constants/trainingCode';
import { isLegacyEndpointUnavailable } from '@/utils/apiCompatibility.mjs';
import { request } from '@umijs/max';
import {
  approveV2CodeVersion,
  buildV2ApprovalRequest,
  getAdminCodeReviewTaskDetail,
  getV2CodeVersion,
  hasV2ApprovalEvidence,
  validateV2CodeVersion,
} from '../codeV2';
import { normalizeCodeApprovalStatus } from './common';
import {
  type CodeVersionApprovalResult,
  type CodeVersionTrainingCheckResult,
} from './types';


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

  // 只有旧后端不提供详情接口时才走兼容路径；不能绕过权限、风险证据或服务故障。
  if (detailError && !isLegacyEndpointUnavailable(detailError)) throw detailError;
  if (!detailError) throw new Error('审批详情响应为空，请确认服务端状态后再操作');
  try {
    const body: { decision: 'APPROVE'; reason?: string } = { decision: 'APPROVE' };
    if (reason?.trim()) body.reason = reason.trim();
    const data = await approveV2CodeVersion(codeVersionId, body, options);
    return mapApprovalResult(data as Record<string, unknown>);
  } catch (error) {
    if (!isLegacyEndpointUnavailable(error)) throw error;
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

/** 管理员审核通过训练代码版本（优先 V2 审批证据，仅接口不支持时兼容旧审批）。 */
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
