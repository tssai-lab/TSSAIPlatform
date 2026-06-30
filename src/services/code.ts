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

/** 训练代码版本列表（含用户上传的全部版本） */
export async function fetchCodeVersionList(
  params?: {
    approvalStatus?: string;
    codeName?: string;
    current?: number;
    pageSize?: number;
  },
  options?: { [key: string]: any },
) {
  const { current, pageSize, ...rest } = params || {};
  return request<{
    success: boolean;
    data: CodeVersionListItem[];
    total?: number;
    errorMessage?: string;
  }>('/code/version/list', {
    method: 'GET',
    params: { current, pageSize, ...rest },
    ...(options || {}),
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

export type CodeVersionDetail = CodeVersionListItem & {
  storagePath?: string;
  sizeBytes?: number;
  remark?: string;
  createdAt?: string;
};

export type CodeVersionPreviewBundle = {
  codeFiles: API.ModelCodeFile[];
  codeContent?: string;
  codeFileName?: string;
  codeFilePath?: string;
};

/** 训练代码版本详情 */
export async function getCodeVersionDetail(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  return request<{
    success: boolean;
    data: CodeVersionDetail;
    errorMessage?: string;
  }>(`/code/version/${encodeURIComponent(codeVersionId)}`, {
    method: 'GET',
    ...(options || {}),
  });
}

/** 列出训练代码 zip 内可预览文件（与模型 code-files 对齐，id=codeVersionId） */
export async function listCodeVersionFiles(
  codeVersionId: string,
  options?: { [key: string]: any },
) {
  return request<{
    success?: boolean;
    data: API.ModelCodeFile[];
    errorMessage?: string;
  }>('/code/code-files', {
    method: 'GET',
    params: { id: codeVersionId },
    ...(options || {}),
  });
}

/** 预览训练代码 zip 内单个文件 */
export async function previewCodeVersionFile(
  codeVersionId: string,
  path: string,
  options?: { [key: string]: any },
) {
  return request<{
    success?: boolean;
    data: API.ModelCodePreview;
    errorMessage?: string;
  }>('/code/previewCode', {
    method: 'GET',
    params: { id: codeVersionId, path },
    ...(options || {}),
  });
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
  } catch {
    codeFiles = [];
  }

  return {
    data: {
      codeFiles,
      codeContent,
      codeFileName,
      codeFilePath,
    } as CodeVersionPreviewBundle,
  };
}

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
