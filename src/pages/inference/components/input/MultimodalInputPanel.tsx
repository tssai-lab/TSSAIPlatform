import { InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Image, Input, Upload } from 'antd';
import React from 'react';
import { INFERENCE_CONFIG } from '@/constants/platform';
import type { MultimodalInputState } from '@/services/platform';
import InferenceParamsPanel from '../InferenceParamsPanel';

const { TextArea } = Input;

type MultimodalInputPanelProps = {
  input: MultimodalInputState;
  params: API.InferenceParams;
  onInputChange: (input: MultimodalInputState) => void;
  onParamsChange: (params: API.InferenceParams) => void;
};

const MultimodalInputPanel: React.FC<MultimodalInputPanelProps> = ({
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
      onInputChange({
        ...input,
        file,
        previewUrl,
      });
      return false;
    },
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        gap: 8,
      }}
    >
      {input.previewUrl ? (
        <Image
          src={input.previewUrl}
          alt="input"
          style={{ maxHeight: 160, objectFit: 'contain' }}
        />
      ) : (
        <Upload.Dragger {...uploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">上传图片</p>
        </Upload.Dragger>
      )}
      <TextArea
        placeholder="输入问题，例如：图中有什么物体？"
        value={input.prompt}
        onChange={(e) => onInputChange({ ...input, prompt: e.target.value })}
        maxLength={INFERENCE_CONFIG.NLP_TEXT_MAX_CHARS}
        showCount
        autoSize={{ minRows: 4, maxRows: 8 }}
      />
      <InferenceParamsPanel
        modality="MULTIMODAL"
        params={params}
        onChange={onParamsChange}
      />
    </div>
  );
};

export default MultimodalInputPanel;
