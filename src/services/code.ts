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

/** 上传 code ZIP，创建 code_asset + code_version */
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

/** 管理员审核通过代码版本 */
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
