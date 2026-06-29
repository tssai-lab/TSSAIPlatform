/**
 * 代码资产上传 Service
 */
import { request } from '@umijs/max';

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

/** 上传训练代码 ZIP，创建 code_asset + code_version */
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
  formData.append('codeName', params.codeName);
  formData.append('version', params.version || 'v1');
  formData.append(
    'trainingProfile',
    params.trainingProfile || CONSISTENCY_TRAINING_PROFILE,
  );
  if (params.remark) {
    formData.append('remark', params.remark);
  }
  return request<{ success: boolean; data: CodeUploadResult; errorMessage?: string }>(
    '/code/upload',
    {
      method: 'POST',
      data: formData,
      requestType: 'form',
      ...(options || {}),
    },
  );
}

export type CodeVersionApprovalResult = {
  codeVersionId: string;
  approvalStatus: string;
};

export type CodeVersionListItem = {
  codeVersionId: string;
  codeAssetId: string;
  codeAssetName: string;
  version: string;
  fileName: string;
  trainingProfile: string;
  approvalStatus: string;
  status: string;
};

/** 已审核、可用于 K8s 训练的训练代码版本列表 */
export async function fetchApprovedCodeVersions(options?: { [key: string]: any }) {
  return request<{ success: boolean; data: CodeVersionListItem[]; errorMessage?: string }>(
    '/code/version/list',
    {
      method: 'GET',
      ...(options || {}),
    },
  );
}

/** 管理员审核通过训练代码版本 */
export async function approveCodeVersion(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  return request<{
    success: boolean;
    data: CodeVersionApprovalResult;
    errorMessage?: string;
  }>(`/code/version/${encodeURIComponent(codeVersionId)}/approve`, {
    method: 'POST',
    ...(options || {}),
  });
}

export type CodeVersionTrainingCheckResult = {
  codeVersionId: string;
  trainingProfile: string;
  trainingProfileDisplayName?: string;
  passed: boolean;
  approvalStatus?: string;
  reasons?: string[];
  checkedAt?: string;
};

/** 代码模型包准入校验（通过后后端自动 APPROVED） */
export async function checkCodeVersionForTraining(
  codeVersionId: string,
  trainingProfile: string,
  options?: { [key: string]: any },
) {
  return request<{
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
}
