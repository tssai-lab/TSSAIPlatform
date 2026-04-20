import { PageContainer } from '@ant-design/pro-components';
import { UploadOutlined } from '@ant-design/icons';
import { Alert, Button, Form, Input, message, Progress, Select, Space, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import React, { useEffect, useState } from 'react';
import { history } from '@umijs/max';
import {
  modelUploadChunk,
  modelUploadComplete,
  modelUploadInit,
  modelUploadProgress,
} from '@/services/ant-design-pro/model';

const CHUNK_SIZE = 5 * 1024 * 1024;
const DRAFT_KEY = 'tss.model.upload.draft';

type TaskType = 'CV' | 'NLP';

type ModelUploadFormValues = {
  modelName: string;
  version: string;
  type: TaskType;
  remark: string;
  file: UploadFile[];
};

type ModelUploadDraft = {
  uploadId: string;
  fileFingerprint: string;
  fileName: string;
  fileSize: number;
  modelName: string;
  version: string;
  type: TaskType;
  remark: string;
};

const taskTypeOptions: { label: string; value: TaskType }[] = [
  { label: 'CV', value: 'CV' },
  { label: 'NLP', value: 'NLP' },
];

const isTaskType = (value?: string): value is TaskType => value === 'CV' || value === 'NLP';

const buildFileFingerprint = (file: File, values: ModelUploadFormValues) =>
  [
    file.name,
    file.size,
    file.lastModified,
    values.modelName.trim(),
    values.version.trim(),
    values.type,
  ].join('|');

const readDraft = (): ModelUploadDraft | undefined => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

const saveDraft = (draft: ModelUploadDraft) => {
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
};

const clearDraft = () => {
  localStorage.removeItem(DRAFT_KEY);
};

const uploadChunkWithRetry = async (
  uploadId: string,
  partIndex: number,
  chunk: Blob,
  maxRetries = 3,
) => {
  let lastError: any;
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      return await modelUploadChunk(uploadId, partIndex, chunk, { skipErrorHandler: true });
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw lastError;
};

const ModelUpload: React.FC = () => {
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [resumeTip, setResumeTip] = useState<string>();

  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    form.setFieldsValue({
      modelName: draft.modelName,
      version: draft.version,
      type: draft.type,
      remark: draft.remark,
    });
    setResumeTip(`检测到未完成上传：${draft.fileName}。请重新选择同一个文件后继续上传。`);
  }, [form]);

  const handleSubmit = async (values: ModelUploadFormValues) => {
    if (!isTaskType(values.type)) {
      message.error('模型任务类型仅支持 CV 或 NLP');
      return;
    }
    const fileList = (values.file ?? []) as UploadFile[];
    const file = fileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.error('请选择模型文件');
      return;
    }

    setUploading(true);
    setUploadPercent(0);
    try {
      const fileFingerprint = buildFileFingerprint(file, values);
      const initRes = await modelUploadInit(
        { fileName: file.name, fileSize: file.size, fileFingerprint },
        { skipErrorHandler: true },
      );
      const progress = initRes?.data;
      if (!progress?.uploadId) {
        throw new Error((initRes as any)?.errorMessage ?? '初始化上传失败');
      }

      saveDraft({
        uploadId: progress.uploadId,
        fileFingerprint,
        fileName: file.name,
        fileSize: file.size,
        modelName: values.modelName,
        version: values.version,
        type: values.type,
        remark: values.remark,
      });

      const serverProgress = await modelUploadProgress(progress.uploadId, { skipErrorHandler: true });
      const latestProgress = serverProgress?.data ?? progress;
      const chunkSize = latestProgress.chunkSize ?? CHUNK_SIZE;
      const totalChunks = latestProgress.totalChunks || Math.ceil(file.size / chunkSize);
      const uploadedParts = new Set(latestProgress.uploadedPartIndexes ?? []);
      setUploadPercent(Math.round((uploadedParts.size / totalChunks) * 100));

      for (let partIndex = 0; partIndex < totalChunks; partIndex += 1) {
        if (uploadedParts.has(partIndex)) continue;
        const start = partIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);
        const chunkRes = await uploadChunkWithRetry(progress.uploadId, partIndex, chunk);
        const nextUploadedParts = new Set(chunkRes?.data?.uploadedPartIndexes ?? [...uploadedParts, partIndex]);
        uploadedParts.clear();
        nextUploadedParts.forEach((item) => {
          uploadedParts.add(item);
        });
        setUploadPercent(Math.round((uploadedParts.size / totalChunks) * 100));
      }

      await modelUploadComplete(
        {
          uploadId: progress.uploadId,
          modelName: values.modelName,
          version: values.version,
          type: values.type,
          remark: values.remark,
        },
        { skipErrorHandler: true },
      );
      clearDraft();
      setResumeTip(undefined);
      message.success('上传成功，模型已存储至 MinIO');
      history.push(`/model/list?refresh=${Date.now()}`);
    } catch (error: any) {
      const msg = error?.info?.errorMessage ?? error?.message ?? '上传失败，请重试';
      message.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <PageContainer title="上传模型" onBack={() => history.push('/model/list')}>
      {resumeTip && (
        <Alert
          type="info"
          showIcon
          message={resumeTip}
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Form.Item
          name="modelName"
          label="模型名称"
          rules={[{ required: true, message: '请输入模型名称' }]}
        >
          <Input placeholder="请输入模型名称" />
        </Form.Item>
        <Form.Item
          name="version"
          label="版本号"
          rules={[{ required: true, message: '请输入版本号' }]}
        >
          <Input placeholder="例如: v1.0.0" />
        </Form.Item>
        <Form.Item
          name="type"
          label="类型"
          rules={[{ required: true, message: '请选择类型' }]}
        >
          <Select placeholder="请选择类型" options={taskTypeOptions} />
        </Form.Item>
        <Form.Item
          name="remark"
          label="备注"
          rules={[
            { required: true, message: '请输入备注' },
            { max: 200, message: '备注不能超过200字' },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请输入备注（最多200字）"
            maxLength={200}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="file"
          label="模型文件"
          valuePropName="fileList"
          getValueFromEvent={(e) => e?.fileList ?? []}
          rules={[
            {
              required: true,
              validator: (_, value) => {
                const list = Array.isArray(value) ? value : value?.fileList ?? [];
                if (!list?.length || !list[0].originFileObj) {
                  return Promise.reject(new Error('请上传模型文件'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Upload
            beforeUpload={() => false}
            maxCount={1}
            accept=".zip"
            disabled={uploading}
            onChange={(e) => {
              form.setFieldValue('file', e.fileList ?? []);
            }}
          >
            <Button icon={<UploadOutlined />}>选择文件（支持拖拽）</Button>
          </Upload>
          <div style={{ marginTop: 8, color: '#999' }}>
            支持 Zip 包，按 5MB 分片上传；中断或刷新后可重新选择同一文件续传
          </div>
        </Form.Item>
        {uploading && (
          <Form.Item label="上传进度">
            <Progress percent={uploadPercent} status="active" />
          </Form.Item>
        )}
        <Form.Item>
          <Space>
            <Button onClick={() => history.push('/model/list')} disabled={uploading}>
              取消
            </Button>
            <Button type="primary" htmlType="submit" loading={uploading}>
              提交
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </PageContainer>
  );
};

export default ModelUpload;
