import { Input } from 'antd';
import React from 'react';
import { INFERENCE_CONFIG } from '@/constants/platform';
import type { NlpInputState } from '@/services/platform';
import InferenceParamsPanel from '../InferenceParamsPanel';

const { TextArea } = Input;

type NlpInputPanelProps = {
  input: NlpInputState;
  params: API.InferenceParams;
  onInputChange: (input: NlpInputState) => void;
  onParamsChange: (params: API.InferenceParams) => void;
};

const NlpInputPanel: React.FC<NlpInputPanelProps> = ({
  input,
  params,
  onInputChange,
  onParamsChange,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
    <TextArea
      placeholder="输入 Prompt 或待分析文本..."
      value={input.text}
      onChange={(e) => onInputChange({ text: e.target.value })}
      maxLength={INFERENCE_CONFIG.NLP_TEXT_MAX_CHARS}
      showCount
      autoSize={{ minRows: 10, maxRows: 16 }}
      style={{ marginBottom: 8, flex: 1 }}
    />
    <InferenceParamsPanel
      modality="NLP"
      params={params}
      onChange={onParamsChange}
    />
  </div>
);

export default NlpInputPanel;
