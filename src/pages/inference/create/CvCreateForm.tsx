import { InboxOutlined, LinkOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import type { FormInstance, UploadFile } from 'antd';
import { Button, Form, Image, message, Select, Spin, Upload } from 'antd';
import React, { useState } from 'react';
import { uploadInferenceInput } from '@/services/platform';

type Props = {
  form: FormInstance;
  datasetOptions: { label: string; value: string }[];
  datasetLoading: boolean;
};

const CvCreateForm: React.FC<Props> = ({
  form,
  datasetOptions,
  datasetLoading,
}) => {
  const inputMode = Form.useWatch('inputMode', form);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>();
  const [fileList, setFileList] = useState<UploadFile[]>([]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadInferenceInput(file, 'CV', {
        skipErrorHandler: true,
      });
      const data = res?.data;
      if (!data?.inferenceInputId) throw new Error('上传失败');
      form.setFieldsValue({ inferenceInputId: data.inferenceInputId });
      setPreviewUrl(data.previewUrl);
      setFileList([{ uid: '-1', name: data.fileName, status: 'done' }]);
      message.success('图片上传成功');
    } catch (error: unknown) {
      const err = error as { message?: string };
      message.error(err?.message || '上传失败');
      setFileList([]);
    } finally {
      setUploading(false);
    }
    return false;
  };

  if (inputMode === 'batch') {
    return (
      <Form.Item
        name="datasetVersionId"
        label="数据集"
        rules={[{ required: true, message: '请选择数据集' }]}
        extra={
          <Button
            type="link"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => history.push('/dataset/upload')}
            style={{ padding: 0 }}
          >
            前往数据集管理上传 zip
          </Button>
        }
      >
        <Select
          placeholder="选择已上传的数据集版本"
          options={datasetOptions}
          loading={datasetLoading}
          showSearch
          optionFilterProp="label"
        />
      </Form.Item>
    );
  }

  return (
    <>
      <Form.Item name="inferenceInputId" hidden>
        <input type="hidden" />
      </Form.Item>
      <Form.Item label="图片" required>
        <Upload.Dragger
          accept="image/*"
          maxCount={1}
          fileList={fileList}
          beforeUpload={(file) => {
            handleUpload(file);
            return false;
          }}
          onRemove={() => {
            form.setFieldsValue({ inferenceInputId: undefined });
            setPreviewUrl(undefined);
            setFileList([]);
          }}
          disabled={uploading}
        >
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">拖拽或点击上传单张图片</p>
          <p className="ant-upload-hint">推理专用上传，非 /files/upload</p>
        </Upload.Dragger>
        {uploading && <Spin style={{ marginTop: 8 }} />}
        {previewUrl && (
          <Image
            src={previewUrl}
            alt="preview"
            style={{ marginTop: 12, maxWidth: 320, borderRadius: 8 }}
          />
        )}
      </Form.Item>
    </>
  );
};

export default CvCreateForm;
