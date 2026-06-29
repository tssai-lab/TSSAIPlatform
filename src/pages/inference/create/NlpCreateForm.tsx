import { InboxOutlined, LinkOutlined } from '@ant-design/icons';
import { history } from '@umijs/max';
import type { FormInstance, UploadFile } from 'antd';
import { Button, Form, Input, message, Select, Tabs, Upload } from 'antd';
import React, { useState } from 'react';
import { uploadInferenceInput } from '@/services/platform';

type Props = {
  form: FormInstance;
  datasetOptions: { label: string; value: string }[];
  datasetLoading: boolean;
};

const NlpCreateForm: React.FC<Props> = ({
  form,
  datasetOptions,
  datasetLoading,
}) => {
  const inputMode = Form.useWatch('inputMode', form);
  const [nlpTab, setNlpTab] = useState<'text' | 'file'>('text');
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadInferenceInput(file, 'NLP', {
        skipErrorHandler: true,
      });
      const data = res?.data;
      if (!data?.inferenceInputId) throw new Error('上传失败');
      form.setFieldsValue({
        inferenceInputId: data.inferenceInputId,
        text: undefined,
      });
      setFileList([{ uid: '-1', name: data.fileName, status: 'done' }]);
      message.success('文件上传成功');
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
            前往数据集管理上传文本集 zip / jsonl
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
    <Tabs
      activeKey={nlpTab}
      onChange={(key) => {
        setNlpTab(key as 'text' | 'file');
        form.setFieldsValue({ text: undefined, inferenceInputId: undefined });
        setFileList([]);
      }}
      items={[
        {
          key: 'text',
          label: '粘贴文本',
          children: (
            <Form.Item
              name="text"
              label="输入文本"
              rules={[{ required: nlpTab === 'text', message: '请输入文本' }]}
            >
              <Input.TextArea
                rows={6}
                placeholder="粘贴待推理的文本"
                showCount
                maxLength={8000}
              />
            </Form.Item>
          ),
        },
        {
          key: 'file',
          label: '上传文件',
          children: (
            <>
              <Form.Item name="inferenceInputId" hidden>
                <input type="hidden" />
              </Form.Item>
              <Form.Item label=".txt 等文本文件" required={nlpTab === 'file'}>
                <Upload.Dragger
                  accept=".txt,.json,.jsonl,.csv"
                  maxCount={1}
                  fileList={fileList}
                  beforeUpload={(file) => {
                    handleUpload(file);
                    return false;
                  }}
                  onRemove={() => {
                    form.setFieldsValue({ inferenceInputId: undefined });
                    setFileList([]);
                  }}
                  disabled={uploading}
                >
                  <p className="ant-upload-drag-icon">
                    <InboxOutlined />
                  </p>
                  <p className="ant-upload-text">上传单个文本文件</p>
                </Upload.Dragger>
              </Form.Item>
            </>
          ),
        },
      ]}
    />
  );
};

export default NlpCreateForm;
