import { InboxOutlined } from '@ant-design/icons';
import type { FormInstance, UploadFile } from 'antd';
import { Alert, Collapse, Form, Input, message, Switch, Upload } from 'antd';
import React, { useState } from 'react';
import { uploadInferenceScript } from '@/services/platform';

type Props = {
  form: FormInstance;
  taskType: API.InferenceTaskType;
};

const InferenceAdvancedForm: React.FC<Props> = ({ form, taskType }) => {
  const [uploading, setUploading] = useState(false);
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const useCustomScript = Form.useWatch('useCustomScript', form);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const res = await uploadInferenceScript(file, taskType, {
        skipErrorHandler: true,
      });
      const data = res?.data;
      if (!data?.customScriptId) throw new Error('上传失败');
      form.setFieldsValue({
        customScriptId: data.customScriptId,
        scriptFileName: data.fileName,
      });
      setFileList([
        { uid: data.customScriptId, name: data.fileName, status: 'done' },
      ]);
      message.success('推理脚本上传成功');
    } catch (error: unknown) {
      const err = error as { message?: string };
      message.error(err?.message || '脚本上传失败');
      setFileList([]);
      form.setFieldsValue({
        customScriptId: undefined,
        scriptFileName: undefined,
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Collapse
      style={{ marginBottom: 16 }}
      items={[
        {
          key: 'advanced',
          label: '高级选项',
          children: (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="自定义推理脚本"
                description="对齐 SageMaker inference.py / Azure ML scoring script：上传 Python handler 覆盖平台默认前后处理。默认使用平台内置 handler。"
              />
              <Form.Item
                name="useCustomScript"
                label="使用自定义推理脚本"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
              <Form.Item name="customScriptId" hidden>
                <input type="hidden" />
              </Form.Item>
              <Form.Item name="scriptFileName" hidden>
                <input type="hidden" />
              </Form.Item>
              {useCustomScript && (
                <>
                  <Form.Item
                    name="scriptEntryPoint"
                    label="入口函数名"
                    initialValue="inference_handler"
                    rules={[{ required: true, message: '请输入入口函数名' }]}
                    extra="脚本内需定义同名 callable，如 inference_handler(context) -> dict"
                  >
                    <Input placeholder="inference_handler" maxLength={128} />
                  </Form.Item>
                  <Form.Item label="推理脚本 (.py)" required>
                    <Upload.Dragger
                      accept=".py"
                      maxCount={1}
                      fileList={fileList}
                      beforeUpload={(file) => {
                        handleUpload(file);
                        return false;
                      }}
                      onRemove={() => {
                        form.setFieldsValue({
                          customScriptId: undefined,
                          scriptFileName: undefined,
                        });
                        setFileList([]);
                      }}
                      disabled={uploading}
                    >
                      <p className="ant-upload-drag-icon">
                        <InboxOutlined />
                      </p>
                      <p className="ant-upload-text">上传自定义推理脚本</p>
                      <p className="ant-upload-hint">仅 .py，最大 1MB</p>
                    </Upload.Dragger>
                  </Form.Item>
                </>
              )}
            </>
          ),
        },
      ]}
    />
  );
};

export default InferenceAdvancedForm;
