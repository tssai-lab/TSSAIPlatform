import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Image, Upload } from 'antd';
import React from 'react';
import { INFERENCE_CONFIG } from '@/constants/platform';
import type { CvInputState } from '@/services/platform';
import InferenceParamsPanel from '../InferenceParamsPanel';

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
  const uploadProps: UploadProps = {
    accept: '.jpg,.jpeg,.png,.webp',
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      const maxBytes = INFERENCE_CONFIG.CV_IMAGE_MAX_MB * 1024 * 1024;
      if (file.size > maxBytes) return Upload.LIST_IGNORE;
      if (input.previewUrl) URL.revokeObjectURL(input.previewUrl);
      const previewUrl = URL.createObjectURL(file);
      onInputChange({ file, previewUrl });
      return false;
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {input.previewUrl ? (
        <div style={{ marginBottom: 12, textAlign: 'center' }}>
          <Image
            src={input.previewUrl}
            alt="input"
            style={{ maxHeight: 220, objectFit: 'contain' }}
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
