import { history } from '@umijs/max';
import { Card, Col, message, Row, Spin, Typography } from 'antd';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  INFERENCE_CANDIDATES_PAGE_SIZE,
  INFERENCE_DEFAULT_PARAMS,
} from '@/constants/inference';
import {
  type CvInputState,
  fetchInferenceTrainingCandidates,
  fetchTrainingInferenceContext,
  type InferenceModelItem,
  type MultimodalInputState,
  type NlpInputState,
  runInference,
} from '@/services/platform';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  countTrainingCandidatesByModality,
  filterTrainingCandidates,
  trainingContextToModelItem,
} from '@/utils/inferenceModality';
import InferenceTargetBanner from './InferenceTargetBanner';
import InferenceWorkspace from './InferenceWorkspace';
import ModalityCards from './ModalityCards';
import TrainingRunGrid from './TrainingRunGrid';
import TrainingSourcePanel from './TrainingSourcePanel';

type InferenceWorkbenchProps = {
  experimentId?: string | null;
  versionNo?: number | null;
};

type InferenceTarget = {
  experimentId: string;
  versionNo: number;
};

const InferenceWorkbench: React.FC<InferenceWorkbenchProps> = ({
  experimentId: urlExperimentId,
  versionNo: urlVersionNo,
}) => {
  const urlTarget: InferenceTarget | null =
    urlExperimentId && urlVersionNo != null && urlVersionNo > 0
      ? { experimentId: urlExperimentId, versionNo: urlVersionNo }
      : null;

  const [activeTarget, setActiveTarget] = useState<InferenceTarget | null>(
    urlTarget,
  );
  const [trainingContext, setTrainingContext] =
    useState<API.InferenceTrainingContext | null>(null);
  const [contextLoading, setContextLoading] = useState(!!urlTarget);

  const [candidates, setCandidates] = useState<
    API.InferenceTrainingCandidate[]
  >([]);
  const [candidatesLoading, setCandidatesLoading] = useState(true);
  const [candidatesKeyword, setCandidatesKeyword] = useState('');
  const [candidatesPage, setCandidatesPage] = useState(1);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<API.InferencePredictResult | null>(null);
  const [lastLatencyMs, setLastLatencyMs] = useState<number>();

  const [activeModality, setActiveModality] =
    useState<API.InferenceModality>('CV');
  const [selectedModel, setSelectedModel] = useState<InferenceModelItem | null>(
    null,
  );
  const [params, setParams] = useState<API.InferenceParams>(
    INFERENCE_DEFAULT_PARAMS,
  );
  const [cvInput, setCvInput] = useState<CvInputState>({});
  const [nlpInput, setNlpInput] = useState<NlpInputState>({ text: '' });
  const [multimodalInput, setMultimodalInput] = useState<MultimodalInputState>({
    prompt: '',
  });

  const hasTarget = !!activeTarget;
  const inferReady =
    hasTarget && !!trainingContext && !!selectedModel && !contextLoading;
  const pickMode = !hasTarget;

  useEffect(() => {
    if (urlExperimentId && urlVersionNo != null && urlVersionNo > 0) {
      setActiveTarget({
        experimentId: urlExperimentId,
        versionNo: urlVersionNo,
      });
    }
  }, [urlExperimentId, urlVersionNo]);

  const loadCandidates = useCallback(async () => {
    setCandidatesLoading(true);
    try {
      const list = await fetchInferenceTrainingCandidates({
        skipErrorHandler: true,
      });
      setCandidates(list);
    } catch (error: unknown) {
      setCandidates([]);
      message.error(getApiErrorMessage(error) || '训练产出列表加载失败');
    } finally {
      setCandidatesLoading(false);
    }
  }, []);

  const loadTrainingContext = useCallback(async (target: InferenceTarget) => {
    setContextLoading(true);
    try {
      const ctx = await fetchTrainingInferenceContext(
        target.experimentId,
        target.versionNo,
        { skipErrorHandler: true },
      );
      setTrainingContext(ctx);
      if (ctx.status !== 'success') {
        message.warning('该训练版本尚未成功完成，暂无法推理');
        setSelectedModel(null);
        return;
      }
      setActiveModality(ctx.modality);
      setSelectedModel(trainingContextToModelItem(ctx));
    } catch (error: unknown) {
      setTrainingContext(null);
      setSelectedModel(null);
      message.error(
        getApiErrorMessage(error) ||
          '训练产出加载失败，请检查 experimentId 与 versionNo',
      );
    } finally {
      setContextLoading(false);
    }
  }, []);

  useEffect(() => {
    if (pickMode) {
      loadCandidates();
    }
  }, [pickMode, loadCandidates]);

  useEffect(() => {
    if (!activeTarget) {
      setTrainingContext(null);
      setSelectedModel(null);
      setContextLoading(false);
      return;
    }
    loadTrainingContext(activeTarget);
  }, [activeTarget, loadTrainingContext]);

  const countByModality = useMemo(
    () => countTrainingCandidatesByModality(candidates),
    [candidates],
  );

  const filteredCandidates = useMemo(
    () =>
      filterTrainingCandidates(candidates, activeModality, candidatesKeyword),
    [candidates, activeModality, candidatesKeyword],
  );

  const pagedCandidates = useMemo(() => {
    const start = (candidatesPage - 1) * INFERENCE_CANDIDATES_PAGE_SIZE;
    return filteredCandidates.slice(
      start,
      start + INFERENCE_CANDIDATES_PAGE_SIZE,
    );
  }, [filteredCandidates, candidatesPage]);

  useEffect(() => {
    setCandidatesPage(1);
  }, [activeModality, candidatesKeyword]);

  const clearWorkspace = useCallback(() => {
    setCvInput((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return {};
    });
    setNlpInput({ text: '' });
    setMultimodalInput((prev) => {
      if (prev.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { prompt: '' };
    });
    setParams(INFERENCE_DEFAULT_PARAMS);
    setResult(null);
    setLastLatencyMs(undefined);
  }, []);

  const syncUrl = (target: InferenceTarget | null) => {
    if (target) {
      history.replace(
        `/inference/playground?experimentId=${encodeURIComponent(target.experimentId)}&versionNo=${target.versionNo}`,
      );
    } else {
      history.replace('/inference/playground');
    }
  };

  const handleSelectTrainingRun = (
    candidate: API.InferenceTrainingCandidate,
  ) => {
    const target = {
      experimentId: candidate.experimentId,
      versionNo: candidate.versionNo,
    };
    setActiveTarget(target);
    syncUrl(target);
    clearWorkspace();
  };

  const handleChangeTarget = () => {
    setActiveTarget(null);
    syncUrl(null);
    clearWorkspace();
  };

  const handleModalityChange = (modality: API.InferenceModality) => {
    if (!pickMode) return;
    setActiveModality(modality);
  };

  const handleCandidatesKeywordChange = (keyword: string) => {
    setCandidatesKeyword(keyword);
  };

  const handleCandidatesPageChange = (page: number) => {
    setCandidatesPage(page);
  };

  const handleRun = async () => {
    if (!selectedModel || !trainingContext) return;
    if (trainingContext.status !== 'success') {
      message.warning('训练尚未成功完成，无法推理');
      return;
    }
    setRunning(true);
    setResult(null);
    try {
      const data = await runInference({
        model: selectedModel,
        params,
        cvInput,
        nlpInput,
        multimodalInput,
      });
      setResult(data);
      if (data.latencyMs != null) {
        setLastLatencyMs(data.latencyMs);
      }
    } catch (error: unknown) {
      const msg = getApiErrorMessage(error) || (error as Error)?.message;
      if (msg) {
        message.error(msg);
      }
    } finally {
      setRunning(false);
    }
  };

  if (pickMode) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          minHeight: 'calc(100vh - 220px)',
        }}
      >
        <ModalityCards
          activeModality={activeModality}
          counts={countByModality}
          onChange={handleModalityChange}
          countLabel="次训练"
        />

        <Card bordered size="small">
          <TrainingRunGrid
            modality={activeModality}
            items={pagedCandidates}
            total={filteredCandidates.length}
            page={candidatesPage}
            pageSize={INFERENCE_CANDIDATES_PAGE_SIZE}
            keyword={candidatesKeyword}
            loading={candidatesLoading}
            onKeywordChange={handleCandidatesKeywordChange}
            onPageChange={handleCandidatesPageChange}
            onSelect={handleSelectTrainingRun}
          />
        </Card>
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        minHeight: 'calc(100vh - 220px)',
      }}
    >
      {inferReady && trainingContext ? (
        <InferenceTargetBanner
          context={trainingContext}
          onChangeTarget={handleChangeTarget}
        />
      ) : null}

      <Row gutter={16} align="stretch">
        <Col xs={24} lg={7} xl={6} style={{ maxWidth: 300 }}>
          <Card bordered size="small" style={{ height: '100%' }}>
            <TrainingSourcePanel
              context={trainingContext}
              loading={contextLoading}
            />
          </Card>
        </Col>
        <Col xs={24} lg={17} xl={18} flex="auto">
          <Card bordered size="small" style={{ height: '100%', minWidth: 0 }}>
            {contextLoading ? (
              <div style={{ textAlign: 'center', padding: 80 }}>
                <Spin tip="加载训练产出…" />
              </div>
            ) : !trainingContext ? (
              <Typography.Text type="secondary">
                训练产出加载失败，请更换选择或从任务详情重新进入
              </Typography.Text>
            ) : (
              <InferenceWorkspace
                model={selectedModel}
                trainingContext={trainingContext}
                params={params}
                cvInput={cvInput}
                nlpInput={nlpInput}
                multimodalInput={multimodalInput}
                result={result}
                running={running}
                lastLatencyMs={lastLatencyMs}
                onParamsChange={setParams}
                onCvInputChange={setCvInput}
                onNlpInputChange={setNlpInput}
                onMultimodalInputChange={setMultimodalInput}
                onRun={handleRun}
                onReset={clearWorkspace}
              />
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};

export default InferenceWorkbench;
