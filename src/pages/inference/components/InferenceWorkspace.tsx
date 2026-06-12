import { Button, Card, Col, Empty, Row } from 'antd';
import React from 'react';
import type {
  CvInputState,
  InferenceModelItem,
  MultimodalInputState,
  NlpInputState,
} from '@/services/platform';
import InferenceMetricsBar from './InferenceMetricsBar';
import CvInputPanel from './input/CvInputPanel';
import MultimodalInputPanel from './input/MultimodalInputPanel';
import NlpInputPanel from './input/NlpInputPanel';
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
  trainingContext?: API.InferenceTrainingContext | null;
  params: API.InferenceParams;
  cvInput: CvInputState;
  nlpInput: NlpInputState;
  multimodalInput: MultimodalInputState;
  result: API.InferencePredictResult | null;
  running: boolean;
  lastLatencyMs?: number;
  onParamsChange: (params: API.InferenceParams) => void;
  onCvInputChange: (input: CvInputState) => void;
  onNlpInputChange: (input: NlpInputState) => void;
  onMultimodalInputChange: (input: MultimodalInputState) => void;
  onRun: () => void;
  onReset: () => void;
};

const InferenceWorkspace: React.FC<InferenceWorkspaceProps> = ({
  model,
  trainingContext,
  params,
  cvInput,
  nlpInput,
  multimodalInput,
  result,
  running,
  lastLatencyMs,
  onParamsChange,
  onCvInputChange,
  onNlpInputChange,
  onMultimodalInputChange,
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

  const renderInput = () => {
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
      <WorkspaceHeader
        model={model}
        trainingContext={trainingContext}
        onReset={onReset}
      />
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
              {renderInput()}
            </div>
            <Button
              type="primary"
              block
              loading={running}
              onClick={onRun}
              style={{ flexShrink: 0, marginTop: 10 }}
            >
              开始推理
            </Button>
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
