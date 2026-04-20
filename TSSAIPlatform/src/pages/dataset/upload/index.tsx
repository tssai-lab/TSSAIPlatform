import { UploadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history } from '@umijs/max';
import { Alert, Button, Form, Input, message, Progress, Radio, Select, Space, Upload } from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import React, { useEffect, useState } from 'react';
import {
  datasetUploadChunk,
  datasetUploadComplete,
  datasetUploadFolder,
  datasetUploadInit,
  datasetUploadProgress,
} from '@/services/ant-design-pro/dataset';

type TaskType = 'CV' | 'NLP';
type UploadMode = 'file' | 'folder';
type BrowserFile = File & { webkitRelativePath?: string };

type DatasetUploadFormValues = {
  name: string;
  type: TaskType;
  description?: string;
  version?: string;
  files: UploadFile[];
};

type DatasetUploadDraft = {
  uploadId: string;
  fileFingerprint: string;
  fileName: string;
  fileSize: number;
  datasetName: string;
  version: string;
  type: TaskType;
  remark?: string;
};

const DRAFT_KEY = 'tss.dataset.upload.draft';
const cvImageExtensions = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp', '.tif', '.tiff'];
const taskTypeOptions: { label: string; value: TaskType }[] = [
  { label: 'CV', value: 'CV' },
  { label: 'NLP', value: 'NLP' },
];

const isTaskType = (value?: string): value is TaskType => value === 'CV' || value === 'NLP';
const lowerName = (fileName: string) => fileName.trim().toLowerCase();
const isCvImageFile = (fileName: string) =>
  cvImageExtensions.some((extension) => lowerName(fileName).endsWith(extension));
const isSupportedDatasetFile = (type: TaskType, fileName: string) => {
  const name = lowerName(fileName);
  if (type === 'CV') return name.endsWith('.zip');
  return name.endsWith('.txt') || name.endsWith('.json') || name.endsWith('.jsonl') || name.endsWith('.zip');
};
const formatRuleText = (type?: TaskType, uploadMode: UploadMode = 'file') => {
  if (type === 'NLP') {
    return 'NLP 支持 .txt / .json / .jsonl，或包含这些文件的 zip 压缩包';
  }
  if (uploadMode === 'folder') {
    return 'CV 支持直接选择图片文件夹，目录内仅允许 jpg / jpeg / png / bmp / gif / webp / tif / tiff 图片';
  }
  return 'CV 支持 zip 压缩包，压缩包内需包含图片文件；也可切换为图片文件夹上传';
};

const getOriginFile = (file: UploadFile): BrowserFile | undefined =>
  file.originFileObj as BrowserFile | undefined;

const getRelativePath = (file: UploadFile) => {
  const origin = getOriginFile(file);
  return origin?.webkitRelativePath || file.name;
};

const buildFileFingerprint = (file: File, values: DatasetUploadFormValues, version: string) =>
  [file.name, file.size, file.lastModified, values.name.trim(), version, values.type].join('|');

const readDraft = (): DatasetUploadDraft | undefined => {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

const saveDraft = (draft: DatasetUploadDraft) => {
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
      return await datasetUploadChunk(uploadId, partIndex, chunk, { skipErrorHandler: true });
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 600));
    }
  }
  throw lastError;
};

const DatasetUpload: React.FC = () => {
  const [form] = Form.useForm();
  const selectedType = Form.useWatch('type', form) as TaskType | undefined;
  const [uploadMode, setUploadMode] = useState<UploadMode>('file');
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [resumeTip, setResumeTip] = useState<string>();

  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    form.setFieldsValue({
      name: draft.datasetName,
      type: draft.type,
      description: draft.remark,
      version: draft.version,
    });
    setResumeTip(`检测到未完成上传：${draft.fileName}。请重新选择同一个文件后继续上传。`);
  }, [form]);

  useEffect(() => {
    if (selectedType === 'NLP' && uploadMode === 'folder') {
      setUploadMode('file');
      form.setFieldsValue({ files: [] });
    }
  }, [form, selectedType, uploadMode]);

  const handleUploadModeChange = (mode: UploadMode) => {
    setUploadMode(mode);
    form.setFieldsValue({ files: [] });
  };

  const uploadFolder = async (values: DatasetUploadFormValues, fileList: UploadFile[]) => {
    if (values.type !== 'CV') {
      message.error('图片文件夹上传仅支持 CV 数据集');
      return;
    }
    const entries = fileList.reduce<{ file: BrowserFile; path: string }[]>((items, item) => {
      const origin = getOriginFile(item);
      if (origin) {
        items.push({ file: origin, path: getRelativePath(item) });
      }
      return items;
    }, []);
    if (entries.length === 0) {
      message.error('请选择图片文件夹');
      return;
    }
    const invalid = entries.find((entry) => !isCvImageFile(entry.path));
    if (invalid) {
      message.error(`图片文件夹中存在非图片文件：${invalid.path}`);
      return;
    }

    setUploading(true);
    setUploadPercent(10);
    const version = values.version || 'v1';
    await datasetUploadFolder(
      {
        datasetName: values.name,
        version,
        type: 'CV',
        remark: values.description,
        files: entries.map((entry) => entry.file),
        paths: entries.map((entry) => entry.path),
      },
      { skipErrorHandler: true },
    );
    clearDraft();
    setResumeTip(undefined);
    setUploadPercent(100);
    message.success('上传成功，图片文件夹已打包存储至 MinIO');
    history.push('/dataset/list');
  };

  const uploadSingleFile = async (values: DatasetUploadFormValues, fileList: UploadFile[]) => {
    const file = fileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.error('请选择数据集文件');
      return;
    }
    if (!isSupportedDatasetFile(values.type, file.name)) {
      message.error(formatRuleText(values.type));
      return;
    }

    setUploading(true);
    setUploadPercent(0);
    const version = values.version || 'v1';
    const fileFingerprint = buildFileFingerprint(file, values, version);
    const initRes = await datasetUploadInit(
      {
        fileName: file.name,
        fileSize: file.size,
        fileFingerprint,
        datasetName: values.name,
        version,
        type: values.type,
        remark: values.description,
      },
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
      datasetName: values.name,
      version,
      type: values.type,
      remark: values.description,
    });

    const serverProgress = await datasetUploadProgress(progress.uploadId, { skipErrorHandler: true });
    const latestProgress = serverProgress?.data ?? progress;
    const chunkSize = latestProgress.chunkSize;
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

    await datasetUploadComplete(progress.uploadId, { skipErrorHandler: true });
    clearDraft();
    setResumeTip(undefined);
    message.success('上传成功，数据集已存储至 MinIO');
    history.push('/dataset/list');
  };

  const handleSubmit = async (values: DatasetUploadFormValues) => {
    try {
      if (!isTaskType(values.type)) {
        message.error('数据集任务类型仅支持 CV 或 NLP');
        return;
      }
      const fileList = (values.files ?? []) as UploadFile[];
      if (uploadMode === 'folder') {
        await uploadFolder(values, fileList);
      } else {
        await uploadSingleFile(values, fileList);
      }
    } catch (error: any) {
      message.error(error?.info?.errorMessage ?? error?.message ?? '上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const uploadAccept =
    selectedType === 'NLP'
      ? '.txt,.json,.jsonl,.zip'
      : uploadMode === 'folder'
        ? cvImageExtensions.join(',')
        : '.zip';

  return (
    <PageContainer title="上传数据集" onBack={() => history.push('/dataset/list')}>
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
          name="name"
          label="数据集名称"
          rules={[{ required: true, message: '请输入数据集名称' }]}
        >
          <Input placeholder="请输入数据集名称" />
        </Form.Item>
        <Form.Item
          name="type"
          label="类型"
          rules={[{ required: true, message: '请选择类型' }]}
        >
          <Select placeholder="请选择类型" options={taskTypeOptions} />
        </Form.Item>
        {selectedType === 'CV' && (
          <Form.Item label="上传方式">
            <Radio.Group
              value={uploadMode}
              onChange={(event) => handleUploadModeChange(event.target.value)}
              disabled={uploading}
            >
              <Radio.Button value="file">zip 压缩包</Radio.Button>
              <Radio.Button value="folder">图片文件夹</Radio.Button>
            </Radio.Group>
          </Form.Item>
        )}
        <Form.Item name="description" label="描述">
          <Input.TextArea rows={4} placeholder="请输入描述（可选）" />
        </Form.Item>
        <Form.Item name="version" label="版本号" initialValue="v1">
          <Input placeholder="例如: v1" />
        </Form.Item>
        <Form.Item
          name="files"
          label={uploadMode === 'folder' ? '图片文件夹' : '文件'}
          valuePropName="fileList"
          getValueFromEvent={(event) => event?.fileList ?? []}
          rules={[
            {
              required: true,
              validator: (_, value) => {
                const list = (Array.isArray(value) ? value : value?.fileList ?? []) as UploadFile[];
                if (list.length === 0) {
                  return Promise.reject(new Error(uploadMode === 'folder' ? '请选择图片文件夹' : '请上传文件'));
                }
                const type = form.getFieldValue('type') as TaskType | undefined;
                if (!isTaskType(type)) {
                  return Promise.reject(new Error('请选择数据集类型'));
                }
                if (uploadMode === 'folder') {
                  if (type !== 'CV') {
                    return Promise.reject(new Error('图片文件夹上传仅支持 CV 数据集'));
                  }
                  const invalid = list.find((item) => !isCvImageFile(getRelativePath(item)));
                  if (invalid) {
                    return Promise.reject(new Error(`图片文件夹中存在非图片文件：${getRelativePath(invalid)}`));
                  }
                  return Promise.resolve();
                }
                const file = list[0]?.originFileObj as File | undefined;
                if (!file) {
                  return Promise.reject(new Error('请上传文件'));
                }
                if (!isSupportedDatasetFile(type, file.name)) {
                  return Promise.reject(new Error(formatRuleText(type)));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Upload
            beforeUpload={() => false}
            maxCount={uploadMode === 'file' ? 1 : undefined}
            multiple={uploadMode === 'folder'}
            directory={uploadMode === 'folder'}
            accept={uploadAccept}
            disabled={uploading}
          >
            <Button icon={<UploadOutlined />}>
              {uploadMode === 'folder' ? '选择图片文件夹' : '选择文件'}
            </Button>
          </Upload>
        </Form.Item>
        <div style={{ marginTop: -16, marginBottom: 24, color: '#999' }}>
          {formatRuleText(selectedType, uploadMode)}
          {uploadMode === 'file'
            ? '；按 5MB 分片上传，中断或刷新后可重新选择同一文件续传'
            : '；提交后后端会打包为 zip 并作为 CV 数据集版本保存'}
        </div>
        {uploading && (
          <Form.Item label="上传进度">
            <Progress percent={uploadPercent} status="active" />
          </Form.Item>
        )}
        <Form.Item>
          <Space>
            <Button onClick={() => history.push('/dataset/list')} disabled={uploading}>
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

export default DatasetUpload;
