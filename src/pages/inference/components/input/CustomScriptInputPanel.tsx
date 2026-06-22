import { FileTextOutlined, InboxOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';
import { Typography, Upload } from 'antd';
import React from 'react';
import { INFERENCE_SCRIPT_ACCEPT } from '@/constants/inference';
import type { CustomScriptInputState } from '@/services/platform';
import InferenceParamsPanel from '../InferenceParamsPanel';
import BatchUploadSummary from './BatchUploadSummary';
import CustomScriptDataUpload from './CustomScriptDataUpload';

type CustomScriptInputPanelProps = {
  modality: API.InferenceModality;
  input: CustomScriptInputState;
  params: API.InferenceParams;
  onInputChange: (input: CustomScriptInputState) => void;
  onParamsChange: (params: API.InferenceParams) => void;
};

const SCRIPT_ACCEPT_HINT = INFERENCE_SCRIPT_ACCEPT.replace(/\./g, '')
  .replace(/,/g, ' / ')
  .trim();

const CustomScriptInputPanel: React.FC<CustomScriptInputPanelProps> = ({
  modality,
  input,
  params,
  onInputChange,
  onParamsChange,
}) => {
  const patch = (partial: Partial<CustomScriptInputState>) =>
    onInputChange({ ...input, ...partial });

  const scriptUploadProps: UploadProps = {
    accept: INFERENCE_SCRIPT_ACCEPT,
    maxCount: 1,
    showUploadList: false,
    beforeUpload: (file) => {
      patch({ scriptFile: file });
      return false;
    },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
          <FileTextOutlined style={{ marginRight: 6 }} />
          推理脚本
        </Typography.Text>
        <Upload.Dragger {...scriptUploadProps}>
          <p className="ant-upload-drag-icon">
            <InboxOutlined />
          </p>
          <p className="ant-upload-text">上传自定义推理脚本</p>
          <p className="ant-upload-hint">支持 {SCRIPT_ACCEPT_HINT}</p>
        </Upload.Dragger>
        {input.scriptFile ? (
          <BatchUploadSummary
            count={1}
            primaryName={input.scriptFile.name}
            onClear={() => patch({ scriptFile: undefined })}
            reselectUploadProps={scriptUploadProps}
          />
        ) : null}
      </div>

      <div>
        <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
          <InboxOutlined style={{ marginRight: 6 }} />
          数据文件
        </Typography.Text>
        <CustomScriptDataUpload
          modality={modality}
          files={input.dataFiles}
          onFilesChange={(dataFiles) => patch({ dataFiles })}
        />
      </div>

      <InferenceParamsPanel
        modality={modality === 'MULTIMODAL' ? 'MULTIMODAL' : modality}
        params={params}
        onChange={onParamsChange}
      />
    </div>
  );
};

export default CustomScriptInputPanel;
