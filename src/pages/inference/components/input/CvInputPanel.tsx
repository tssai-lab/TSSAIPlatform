import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Image, Upload } from 'antd';
import React from 'react';
import { INFERENCE_CONFIG } from '@/constants/platform';
import type { CvInputState } from '@/services/platform';
import InferenceParamsPanel from '../InferenceParamsPanel';
import InputFileActions from './InputFileActions';

type CvInputPanelProps = {
  input: CvInputState;
  params: API.InferenceParams;
  onInputChange: (input: CvInputState) => void;
  onParamsChange: (params: API.InferenceParams) => void;
};

const CvInputPanel: React.FC<CvInputPanelProps> = ({
  input,
  params,
  onInputChange,
  onParamsChange,
}) => {
  const applyFile = (file: File) => {
    if (input.previewUrl) URL.revokeObjectURL(input.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    onInputChange({ file, previewUrl });
  };

  const clearFile = () => {
    if (input.previewUrl) URL.revokeObjectURL(input.previewUrl);
    onInputChange({});
  };

  const uploadProps: UploadProps = {
    accept: '.jpg,.jpeg,.png,.webp',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      const maxBytes = INFERENCE_CONFIG.CV_IMAGE_MAX_MB * 1024 * 1024;
      if (file.size > maxBytes) return Upload.LIST_IGNORE;
      applyFile(file);
      return false;
    },
  };

  const hasFile = !!input.previewUrl;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {hasFile ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <Image
              src={input.previewUrl}
              alt="input"
              style={{ maxHeight: 220, objectFit: 'contain' }}
            />
          </div>
          <InputFileActions
            label={
              input.file?.name
                ? `已选择：${input.file.name}`
                : '已选择 1 张图片'
            }
            onRemove={clearFile}
            reselectUploadProps={uploadProps}
          />
        </div>
      ) : (
        <Upload.Dragger {...uploadProps} style={{ marginBottom: 12 }}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽图片到此处</p>
          <p className="ant-upload-hint">
            支持 JPG/PNG/WebP，最大 {INFERENCE_CONFIG.CV_IMAGE_MAX_MB}MB
          </p>
        </Upload.Dragger>
      )}
      <InferenceParamsPanel
        modality="CV"
        params={params}
        onChange={onParamsChange}
      />
    </div>
  );
};

export default CvInputPanel;
