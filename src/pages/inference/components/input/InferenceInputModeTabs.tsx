import { Tabs } from 'antd';
import React from 'react';
import {
  INFERENCE_INPUT_MODE_TABS,
  type InferenceInputMode,
} from '@/constants/inference';
import type {
  CustomScriptInputState,
  CvBatchInputState,
  CvInputState,
  InferenceModelItem,
  MultimodalInputState,
  NlpBatchInputState,
  NlpInputState,
} from '@/services/platform';
import CustomScriptInputPanel from './CustomScriptInputPanel';
import CvBatchInputPanel from './CvBatchInputPanel';
import CvInputPanel from './CvInputPanel';
import MultimodalInputPanel from './MultimodalInputPanel';
import NlpBatchInputPanel from './NlpBatchInputPanel';
import NlpInputPanel from './NlpInputPanel';

type InferenceInputModeTabsProps = {
  model: InferenceModelItem;
  inputMode: InferenceInputMode;
  params: API.InferenceParams;
  cvInput: CvInputState;
  nlpInput: NlpInputState;
  multimodalInput: MultimodalInputState;
  cvBatchInput: CvBatchInputState;
  nlpBatchInput: NlpBatchInputState;
  customScriptInput: CustomScriptInputState;
  onInputModeChange: (mode: InferenceInputMode) => void;
  onParamsChange: (params: API.InferenceParams) => void;
  onCvInputChange: (input: CvInputState) => void;
  onNlpInputChange: (input: NlpInputState) => void;
  onMultimodalInputChange: (input: MultimodalInputState) => void;
  onCvBatchInputChange: (input: CvBatchInputState) => void;
  onNlpBatchInputChange: (input: NlpBatchInputState) => void;
  onCustomScriptInputChange: (input: CustomScriptInputState) => void;
};

const InferenceInputModeTabs: React.FC<InferenceInputModeTabsProps> = ({
  model,
  inputMode,
  params,
  cvInput,
  nlpInput,
  multimodalInput,
  cvBatchInput,
  nlpBatchInput,
  customScriptInput,
  onInputModeChange,
  onParamsChange,
  onCvInputChange,
  onNlpInputChange,
  onMultimodalInputChange,
  onCvBatchInputChange,
  onNlpBatchInputChange,
  onCustomScriptInputChange,
}) => {
  const renderSingleInput = () => {
    if (model.modality === 'CV') {
      return (
        <CvInputPanel
          input={cvInput}
          params={params}
          onInputChange={onCvInputChange}
          onParamsChange={onParamsChange}
        />
      );
    }
    if (model.modality === 'NLP') {
      return (
        <NlpInputPanel
          input={nlpInput}
          params={params}
          onInputChange={onNlpInputChange}
          onParamsChange={onParamsChange}
        />
      );
    }
    return (
      <MultimodalInputPanel
        input={multimodalInput}
        params={params}
        onInputChange={onMultimodalInputChange}
        onParamsChange={onParamsChange}
      />
    );
  };

  const renderBatchInput = () => {
    if (model.modality === 'NLP') {
      return (
        <NlpBatchInputPanel
          input={nlpBatchInput}
          params={params}
          onInputChange={onNlpBatchInputChange}
          onParamsChange={onParamsChange}
        />
      );
    }
    return (
      <CvBatchInputPanel
        input={cvBatchInput}
        params={params}
        onInputChange={onCvBatchInputChange}
        onParamsChange={onParamsChange}
      />
    );
  };

  const renderCustomInput = () => (
    <CustomScriptInputPanel
      modality={model.modality}
      input={customScriptInput}
      params={params}
      onInputChange={onCustomScriptInputChange}
      onParamsChange={onParamsChange}
    />
  );

  const items = INFERENCE_INPUT_MODE_TABS.map(({ key, label }) => ({
    key,
    label,
    children:
      key === 'single'
        ? renderSingleInput()
        : key === 'batch'
          ? renderBatchInput()
          : renderCustomInput(),
  }));

  return (
    <Tabs
      size="small"
      activeKey={inputMode}
      onChange={(key) => onInputModeChange(key as InferenceInputMode)}
      items={items}
    />
  );
};

export default InferenceInputModeTabs;
