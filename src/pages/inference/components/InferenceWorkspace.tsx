import { Alert, Button, Card, Col, Empty, Row, Tooltip } from 'antd';
import React from 'react';
import type { InferenceInputMode } from '@/constants/inference';
import type {
  CustomScriptInputState,
  CvBatchInputState,
  CvInputState,
  InferenceModelItem,
  MultimodalInputState,
  NlpBatchInputState,
  NlpInputState,
} from '@/services/platform';
import InferenceMetricsBar from './InferenceMetricsBar';
import InferenceInputModeTabs from './input/InferenceInputModeTabs';
import CvOutputPanel from './output/CvOutputPanel';
import MultimodalOutputPanel from './output/MultimodalOutputPanel';
import NlpOutputPanel from './output/NlpOutputPanel';
import WorkspaceHeader from './WorkspaceHeader';

const PANEL_CARD_BODY_STYLE = {
  padding: 12,
  display: 'flex',
  flexDirection: 'column' as const,
  minHeight: 400,
};

type InferenceWorkspaceProps = {
  model: InferenceModelItem | null;
  inputMode: InferenceInputMode;
  params: API.InferenceParams;
  cvInput: CvInputState;
  nlpInput: NlpInputState;
  multimodalInput: MultimodalInputState;
  cvBatchInput: CvBatchInputState;
  nlpBatchInput: NlpBatchInputState;
  customScriptInput: CustomScriptInputState;
  result: API.InferencePredictResult | null;
  running: boolean;
  lastLatencyMs?: number;
  onInputModeChange: (mode: InferenceInputMode) => void;
  onParamsChange: (params: API.InferenceParams) => void;
  onCvInputChange: (input: CvInputState) => void;
  onNlpInputChange: (input: NlpInputState) => void;
  onMultimodalInputChange: (input: MultimodalInputState) => void;
  onCvBatchInputChange: (input: CvBatchInputState) => void;
  onNlpBatchInputChange: (input: NlpBatchInputState) => void;
  onCustomScriptInputChange: (input: CustomScriptInputState) => void;
  onRun: () => void;
  onReset: () => void;
};

const InferenceWorkspace: React.FC<InferenceWorkspaceProps> = ({
  model,
  inputMode,
  params,
  cvInput,
  nlpInput,
  multimodalInput,
  cvBatchInput,
  nlpBatchInput,
  customScriptInput,
  result,
  running,
  lastLatencyMs,
  onInputModeChange,
  onParamsChange,
  onCvInputChange,
  onNlpInputChange,
  onMultimodalInputChange,
  onCvBatchInputChange,
  onNlpBatchInputChange,
  onCustomScriptInputChange,
  onRun,
  onReset,
}) => {
  if (!model) {
    return (
      <Empty
        style={{ marginTop: 80 }}
        description="训练产出加载后，在此进行在线推理"
      />
    );
  }

  const runDisabled = inputMode !== 'single';
  const runTooltip =
    inputMode === 'batch'
      ? '批量推理接口开发中'
      : inputMode === 'custom'
        ? '自定义推理脚本接口开发中'
        : undefined;

  const renderOutput = () => {
    if (model.modality === 'CV') {
      return <CvOutputPanel result={result} running={running} />;
    }
    if (model.modality === 'NLP') {
      return <NlpOutputPanel result={result} running={running} />;
    }
    return <MultimodalOutputPanel result={result} running={running} />;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <WorkspaceHeader onReset={onReset} />
      <Row gutter={12} style={{ flex: 1, minHeight: 'calc(100vh - 320px)' }}>
        <Col xs={24} lg={12}>
          <Card
            title="输入"
            bordered
            size="small"
            style={{ height: '100%' }}
            styles={{ body: PANEL_CARD_BODY_STYLE }}
          >
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {runDisabled ? (
                <Alert
                  type="info"
                  showIcon
                  message={
                    inputMode === 'batch'
                      ? '批量推理功能开发中，当前可先配置输入。'
                      : '自定义推理脚本功能开发中，当前可先上传脚本与数据。'
                  }
                  style={{ marginBottom: 12 }}
                />
              ) : null}
              <InferenceInputModeTabs
                model={model}
                inputMode={inputMode}
                params={params}
                cvInput={cvInput}
                nlpInput={nlpInput}
                multimodalInput={multimodalInput}
                cvBatchInput={cvBatchInput}
                nlpBatchInput={nlpBatchInput}
                customScriptInput={customScriptInput}
                onInputModeChange={onInputModeChange}
                onParamsChange={onParamsChange}
                onCvInputChange={onCvInputChange}
                onNlpInputChange={onNlpInputChange}
                onMultimodalInputChange={onMultimodalInputChange}
                onCvBatchInputChange={onCvBatchInputChange}
                onNlpBatchInputChange={onNlpBatchInputChange}
                onCustomScriptInputChange={onCustomScriptInputChange}
              />
            </div>
            <Tooltip title={runDisabled ? runTooltip : undefined}>
              <span style={{ display: 'block' }}>
                <Button
                  type="primary"
                  block
                  loading={running}
                  disabled={runDisabled}
                  onClick={onRun}
                  style={{ flexShrink: 0, marginTop: 10 }}
                >
                  开始推理
                </Button>
              </span>
            </Tooltip>
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title="输出"
            bordered
            size="small"
            style={{ height: '100%' }}
            styles={{ body: PANEL_CARD_BODY_STYLE }}
          >
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {renderOutput()}
            </div>
            {result && !running ? (
              <InferenceMetricsBar
                result={result}
                model={model}
                latencyMs={lastLatencyMs}
              />
            ) : null}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default InferenceWorkspace;
