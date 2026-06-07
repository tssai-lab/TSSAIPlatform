import { UploadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useSearchParams } from '@umijs/max';
import {
  Alert,
  Button,
  Form,
  Input,
  message,
  Progress,
  Select,
  Space,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import React, { useEffect, useMemo, useState } from 'react';
import { UPLOAD_CONFIG } from '@/constants/platform';
import {
  fetchModelAssetDetail,
  modelUploadChunk,
  modelUploadComplete,
  modelUploadInit,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  MODEL_VERSION_FORMAT_HINT,
  modelNewVersionFormRules,
  suggestNextModelVersion,
} from '@/utils/modelVersion';
import {
  buildModelFileFingerprint,
  LS_MODEL_UPLOAD_FP,
  LS_MODEL_UPLOAD_ID,
} from '@/utils/uploadResume';
import { formatAssetVersionLabel, getLatestAssetVersion } from '@/utils/datasetVersion';

const CHUNK_FALLBACK = 5 * 1024 * 1024;

const ModelUpload: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [form] = Form.useForm();
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [resumeHint, setResumeHint] = useState<string | null>(null);
  const [existingVersions, setExistingVersions] = useState<string[]>([]);
  const [prefillLoading, setPrefillLoading] = useState(false);

  const assetId = searchParams.get('assetId') ?? undefined;
  const isNewVersionUpload = !!assetId;

  useEffect(() => {
    const id = localStorage.getItem(LS_MODEL_UPLOAD_ID);
    const fp = localStorage.getItem(LS_MODEL_UPLOAD_FP);
    if (id && fp) {
      setResumeHint(
        '检测到未完成的上传会话，请重新选择同一个 zip 文件继续上传。',
      );
    }
  }, []);

  useEffect(() => {
    const modelName = searchParams.get('modelName');
    const type = searchParams.get('type');
    const version = searchParams.get('version');
    if (modelName || type || version) {
      form.setFieldsValue({
        ...(modelName ? { modelName } : {}),
        ...(type ? { type } : {}),
        ...(version ? { version } : {}),
      });
    }

    if (!assetId) {
      setExistingVersions([]);
      return;
    }

    setPrefillLoading(true);
    fetchModelAssetDetail(assetId, { skipErrorHandler: true })
      .then((res) => {
        const detail = res?.data;
        if (!detail) return;
        form.setFieldsValue({
          modelName: detail.name,
          type: detail.type,
        });
        const versions = detail.versions.map((v) => v.version).filter(Boolean);
        setExistingVersions(versions);
        form.setFieldValue('version', suggestNextModelVersion(versions));
      })
      .catch(() => {
        message.warning('未能加载已有版本信息，请手动填写版本号');
      })
      .finally(() => setPrefillLoading(false));
  }, [assetId, form, searchParams]);

  const versionRules = useMemo(
    () =>
      isNewVersionUpload
        ? modelNewVersionFormRules(existingVersions)
        : [{ required: true, message: '请输入版本号' }],
    [existingVersions, isNewVersionUpload],
  );

  const latestVersionLabel = useMemo(() => {
    const latest = getLatestAssetVersion(existingVersions);
    return latest ? formatAssetVersionLabel(latest) : undefined;
  }, [existingVersions]);

  const clearResumeStorage = () => {
    localStorage.removeItem(LS_MODEL_UPLOAD_ID);
    localStorage.removeItem(LS_MODEL_UPLOAD_FP);
    setResumeHint(null);
  };

  const handleSubmit = async (values: any) => {
    const fileList = (values.file ?? []) as UploadFile[];
    const file = fileList[0]?.originFileObj as File | undefined;
    if (!file) {
      message.error('请选择模型文件');
      return;
    }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      message.error('后端当前仅支持 zip 代码或预训练包');
      return;
    }
    if (file.size > UPLOAD_CONFIG.MODEL.MAX_SIZE) {
      message.error(
        `文件大小不能超过 ${UPLOAD_CONFIG.MODEL.MAX_SIZE / 1024 / 1024 / 1024}GB`,
      );
      return;
    }

    setUploading(true);
    setUploadPercent(0);
    const requestOpts = { skipErrorHandler: true } as const;

    try {
      const fileFingerprint = buildModelFileFingerprint(
        file,
        values.modelName,
        values.version,
        values.type,
      );
      const initRes = await modelUploadInit(
        {
          fileName: file.name,
          fileSize: file.size,
          fileFingerprint,
        },
        requestOpts,
      );
      const initData = initRes?.data as API.ModelUploadInitResult | undefined;
      const uploadId = initData?.uploadId;
      if (!uploadId) {
        throw new Error('初始化上传失败：缺少 uploadId');
      }

      localStorage.setItem(LS_MODEL_UPLOAD_ID, uploadId);
      localStorage.setItem(LS_MODEL_UPLOAD_FP, fileFingerprint);

      const chunkSize =
        initData?.chunkSize && initData.chunkSize > 0
          ? initData.chunkSize
          : CHUNK_FALLBACK;
      const totalChunks =
        initData?.totalChunks && initData.totalChunks > 0
          ? initData.totalChunks
          : Math.max(1, Math.ceil(file.size / chunkSize));

      const uploaded = new Set(initData?.uploadedPartIndexes ?? []);
      let finishedParts = uploaded.size;

      for (let partIndex = 0; partIndex < totalChunks; partIndex += 1) {
        if (uploaded.has(partIndex)) {
          setUploadPercent(
            Math.min(100, Math.round((finishedParts / totalChunks) * 100)),
          );
          continue;
        }
        const start = partIndex * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        await modelUploadChunk(
          uploadId,
          partIndex,
          file.slice(start, end),
          requestOpts,
        );
        finishedParts += 1;
        setUploadPercent(
          Math.min(100, Math.round((finishedParts / totalChunks) * 100)),
        );
      }

      await modelUploadComplete(
        {
          uploadId,
          modelName: values.modelName,
          version: values.version.trim(),
          type: values.type,
          remark: values.remark,
        },
        requestOpts,
      );

      clearResumeStorage();
      message.success('上传成功');
      if (assetId) {
        history.push(`/model/detail/${encodeURIComponent(assetId)}`);
      } else {
        history.push('/model/list');
      }
    } catch (error: any) {
      message.error(getApiErrorMessage(error));
    } finally {
      setUploading(false);
      setUploadPercent(0);
    }
  };

  const backPath = assetId
    ? `/model/detail/${encodeURIComponent(assetId)}`
    : '/model/list';

  return (
    <PageContainer
      title={isNewVersionUpload ? '上传模型新版本' : '上传模型'}
      onBack={() => history.push(backPath)}
    >
      {isNewVersionUpload && latestVersionLabel && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="版本号要求"
          description={`当前最新版本为 ${latestVersionLabel}，新版本号必须大于该版本（${MODEL_VERSION_FORMAT_HINT}）。`}
        />
      )}
      {resumeHint && (
        <Alert
          type="info"
          showIcon
          closable
          onClose={() => setResumeHint(null)}
          message="断点续传"
          description={resumeHint}
          style={{ marginBottom: 16 }}
        />
      )}
      <Form form={form} onFinish={handleSubmit} layout="vertical">
        <Form.Item
          name="modelName"
          label="模型名称"
          rules={[{ required: true, message: '请输入模型名称' }]}
        >
          <Input
            placeholder="请输入模型名称"
            disabled={isNewVersionUpload || prefillLoading}
          />
        </Form.Item>
        <Form.Item
          name="version"
          label="版本号"
          rules={versionRules}
          extra={
            isNewVersionUpload
              ? `须大于当前最新版本${latestVersionLabel ? `（${latestVersionLabel}）` : ''}`
              : MODEL_VERSION_FORMAT_HINT
          }
        >
          <Input placeholder="例如：v1.0.0 或 v2" />
        </Form.Item>
        <Form.Item
          name="type"
          label="类型"
          rules={[{ required: true, message: '请选择类型' }]}
        >
          <Select placeholder="请选择类型" disabled={isNewVersionUpload || prefillLoading}>
            <Select.Option value="CV">CV</Select.Option>
            <Select.Option value="NLP">NLP</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item
          name="remark"
          label="备注"
          rules={[
            { required: true, message: '请输入备注' },
            { max: 200, message: '备注不能超过 200 个字符' },
          ]}
        >
          <Input.TextArea
            rows={4}
            placeholder="请输入备注"
            maxLength={200}
            showCount
          />
        </Form.Item>
        <Form.Item
          name="file"
          label="代码或预训练包"
          valuePropName="fileList"
          getValueFromEvent={(event) => event?.fileList ?? []}
          rules={[
            {
              required: true,
              validator: (_, value) => {
                const list = Array.isArray(value)
                  ? value
                  : (value?.fileList ?? []);
                if (!list?.length || !list[0]?.originFileObj) {
                  return Promise.reject(new Error('请上传代码或预训练包'));
                }
                return Promise.resolve();
              },
            },
          ]}
        >
          <Upload
            beforeUpload={() => false}
            maxCount={1}
            accept={UPLOAD_CONFIG.MODEL.ACCEPT_TYPES.join(',')}
            disabled={uploading}
            onChange={(event) => {
              form.setFieldValue('file', event.fileList ?? []);
            }}
          >
            <Button icon={<UploadOutlined />}>选择文件</Button>
          </Upload>
        </Form.Item>
        {uploading && (
          <Form.Item label="上传进度">
            <Progress percent={uploadPercent} status="active" />
          </Form.Item>
        )}
        <Form.Item
          extra={`当前仅支持单个 zip 代码或预训练包，大小限制 ${UPLOAD_CONFIG.MODEL.MAX_SIZE / 1024 / 1024 / 1024}GB。`}
        >
          <Space>
            <Button onClick={() => history.push(backPath)} disabled={uploading}>
              取消
            </Button>
            <Button
              danger
              type="default"
              disabled={uploading}
              onClick={clearResumeStorage}
            >
              清除续传记录
            </Button>
            <Button type="primary" htmlType="submit" loading={uploading || prefillLoading}>
              提交
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </PageContainer>
  );
};

export default ModelUpload;
