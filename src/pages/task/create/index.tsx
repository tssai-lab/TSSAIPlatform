import { UploadOutlined } from '@ant-design/icons';
import { PageContainer } from '@ant-design/pro-components';
import { history, useSearchParams } from '@umijs/max';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  message,
  Radio,
  Select,
  Space,
  Steps,
  Tag,
  Tour,
  Typography,
  Upload,
} from 'antd';
import type { UploadFile } from 'antd/es/upload/interface';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { usePageTour } from '@/components/Guide/usePageTour';
import { isTrainingCodeAutoApproveEnabled } from '@/constants/trainingCode';
import type { DatasetType } from '@/services/dataset';
import {
  autoApproveCodeVersionIfEnabled,
  CONSISTENCY_TRAINING_PROFILE,
  checkCodeVersionForTraining,
  createExperimentVersion,
  createTask,
  fetchAllDatasetList,
  fetchAllModelList,
  fetchApprovedCodeVersions,
  fetchTaskDetail,
  fetchTrainingDatasetCandidates,
  fetchTrainingModelCandidates,
  fetchTrainingPlans,
  getCodeVersionDetail,
  getModelVersion,
  publishTaskModel,
  uploadCodeZip,
} from '@/services/platform';
import type { TrainingPlan } from '@/services/trainingPlans';
import { getApiErrorMessage } from '@/utils/apiError';
import {
  firstCpuTrainingResourceProfileId,
  isCpuTrainingResourceProfileIdAllowed,
  listCpuTrainingResourceProfiles,
} from './resourceProfilePresentation.mjs';
import {
  filterDatasetCandidates,
  filterModelCandidates,
  isSpecDrivenInput,
} from './trainingAssetCompatibility.mjs';
import { buildTrainingPlanHyperParams } from './trainingPlanDefaults.mjs';
import {
  formatTrainingMode,
  isSingleTrainingMode,
} from './trainingModePresentation.mjs';

const FUSION_HYPER_PARAMS_DEFAULT = {
  model: 'logreg',
  threshold: 0.5,
  outputDir: 'outputs/fusion_baseline_logreg',
};

type CheckState = {
  loading: boolean;
  passed?: boolean;
  reasons?: string[];
  approvalStatus?: string;
  validationStatus?: string;
};

const isCodeApproved = (status?: string) => status === 'APPROVED';

const FORMAT_LABELS: Record<string, string> = {
  FOLDER_CLASSIFICATION: '文件夹分类式（每个子目录一个类别）',
  HF_MODEL_ARCHIVE: 'HuggingFace 模型包',
  LEGACY_WEIGHT_ARCHIVE: '权重文件包（兼容）',
  OTHER: '其他',
  WEIGHT_ARCHIVE: '权重文件包',
  YOLO: 'YOLO 标注格式',
};

const friendlyFormat = (f: string) => FORMAT_LABELS[f] || f;

const PRE_STYLE: React.CSSProperties = {
  background: '#f6f8fa',
  padding: 12,
  borderRadius: 6,
  fontSize: 12,
  margin: 0,
  overflowX: 'auto',
  whiteSpace: 'pre-wrap',
};

const PlanFormatHint: React.FC<{ plan: TrainingPlan }> = ({ plan }) => {
  const dataset = plan.inputs?.dataset;
  const model = plan.inputs?.model;
  const code = plan.inputs?.code;
  const entrypoint = plan.execution?.entrypoint;
  const params = plan.parameters ?? [];

  return (
    <Alert
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
      message={
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          {plan.description ? (
            <Typography.Paragraph style={{ marginBottom: 0 }}>
              {plan.description}
            </Typography.Paragraph>
          ) : null}

          <div>
            <Typography.Text strong>数据集要求</Typography.Text>
            <div style={{ marginTop: 8 }}>
              {dataset?.acceptedSpecIds?.length ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Typography.Text>服务器验证规格：</Typography.Text>
                  <Space wrap>
                    {dataset.acceptedSpecIds.map((specId) => (
                      <Tag key={specId} color="blue">
                        {specId}
                      </Tag>
                    ))}
                  </Space>
                  {dataset.formatGuide ? (
                    <pre style={PRE_STYLE}>{dataset.formatGuide.trim()}</pre>
                  ) : null}
                </Space>
              ) : dataset?.requiredEntries?.length ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Typography.Text>压缩包内必须包含以下路径：</Typography.Text>
                  <Space wrap>
                    {dataset.requiredEntries.map((e) => (
                      <Tag key={e} color="blue">
                        {e}
                      </Tag>
                    ))}
                  </Space>
                  {dataset.annotationFormats?.length ? (
                    <Typography.Text type="secondary">
                      标注格式：
                      {dataset.annotationFormats.map(friendlyFormat).join('、')}
                    </Typography.Text>
                  ) : null}
                  {dataset.formatGuide ? (
                    <pre style={PRE_STYLE}>{dataset.formatGuide.trim()}</pre>
                  ) : null}
                </Space>
              ) : (
                <Typography.Text type="secondary">
                  无特殊目录要求
                </Typography.Text>
              )}
            </div>
          </div>

          <div>
            <Typography.Text strong>模型要求</Typography.Text>
            <div style={{ marginTop: 8 }}>
              {model?.acceptedSpecIds?.length ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Typography.Text>服务器验证规格：</Typography.Text>
                  <Space wrap>
                    {model.acceptedSpecIds.map((specId) => (
                      <Tag key={specId} color="purple">
                        {specId}
                      </Tag>
                    ))}
                  </Space>
                  {model.formatGuide ? (
                    <pre style={PRE_STYLE}>{model.formatGuide.trim()}</pre>
                  ) : null}
                </Space>
              ) : model?.requiredEntries?.length ? (
                <Space direction="vertical" size={6} style={{ width: '100%' }}>
                  <Typography.Text>压缩包内必须包含以下文件：</Typography.Text>
                  <Space wrap>
                    {model.requiredEntries.map((e) => (
                      <Tag key={e} color="purple">
                        {e}
                      </Tag>
                    ))}
                  </Space>
                  {model.formats?.length ? (
                    <Typography.Text type="secondary">
                      格式：{model.formats.map(friendlyFormat).join('、')}
                    </Typography.Text>
                  ) : null}
                  {model.formatGuide ? (
                    <pre style={PRE_STYLE}>{model.formatGuide.trim()}</pre>
                  ) : null}
                </Space>
              ) : (
                <Typography.Text type="secondary">
                  无特殊条目要求
                </Typography.Text>
              )}
            </div>
          </div>

          <div>
            <Typography.Text strong>训练代码要求</Typography.Text>
            <div style={{ marginTop: 8 }}>
              <Space direction="vertical" size={4}>
                <Space>
                  <Typography.Text>入口脚本必须为：</Typography.Text>
                  {entrypoint ? <Tag color="cyan">{entrypoint}</Tag> : null}
                </Space>
                {code?.runtime ? (
                  <Typography.Text type="secondary">
                    运行时：{code.runtime}
                  </Typography.Text>
                ) : null}
                {code?.approvalRequired ? (
                  <Typography.Text type="warning">
                    上传后需管理员审核通过方可使用
                  </Typography.Text>
                ) : null}
              </Space>
            </div>
          </div>

          {params.length ? (
            <div>
              <Typography.Text strong>训练参数</Typography.Text>
              <div style={{ marginTop: 8 }}>
                <Space direction="vertical" size={8} style={{ width: '100%' }}>
                  {params.map((p) => (
                    <div key={p.name}>
                      <Space wrap>
                        <Tag color="geekblue">{p.displayName || p.name}</Tag>
                        {p.defaultValue != null ? (
                          <Typography.Text type="secondary">
                            默认 {String(p.defaultValue)}
                          </Typography.Text>
                        ) : null}
                        {p.required ? (
                          <Typography.Text type="danger">必填</Typography.Text>
                        ) : null}
                      </Space>
                      {p.description ? (
                        <Typography.Paragraph
                          type="secondary"
                          style={{ margin: '2px 0 0', fontSize: 12 }}
                        >
                          {p.description}
                        </Typography.Paragraph>
                      ) : null}
                    </div>
                  ))}
                </Space>
              </div>
            </div>
          ) : null}
        </Space>
      }
    />
  );
};

const TaskCreate: React.FC = () => {
  // 引导段 S3：发起训练讲解（讲解 + 用户自点向导）
  const tourProps = usePageTour(3);
  const [searchParams] = useSearchParams();
  const experimentId = searchParams.get('experimentId')?.trim() || '';
  const fromVersionId = searchParams.get('fromVersionId')?.trim() || '';
  const presetCodeVersionId = searchParams.get('codeVersionId')?.trim() || '';
  const presetBaseModelVersionId =
    searchParams.get('baseModelVersionId')?.trim() ||
    searchParams.get('modelVersionId')?.trim() ||
    '';
  const fromSource = searchParams.get('from')?.trim() || '';
  const fromModelAssetId = searchParams.get('assetId')?.trim() || '';
  const isExperimentContinue = !!experimentId;
  const backFromModelDetail = fromSource === 'model' && !!fromModelAssetId;

  const [form] = Form.useForm();
  const selectedResourceProfileId = Form.useWatch('resourceProfileId', form);
  const [currentStep, setCurrentStep] = useState(0);

  const [modelOptions, setModelOptions] = useState<API.ModelItem[]>([]);
  const [datasetOptions, setDatasetOptions] = useState<API.DatasetItem[]>([]);
  const [codeOptions, setCodeOptions] = useState<any[]>([]);
  const [trainingPlans, setTrainingPlans] = useState<TrainingPlan[]>([]);
  const [selectedTrainingPlanId, setSelectedTrainingPlanId] =
    useState<string>();

  const [modelLoading, setModelLoading] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(false);
  const modelLoadSequence = useRef(0);
  const datasetLoadSequence = useRef(0);
  const [codeLoading, setCodeLoading] = useState(false);

  const [codeInputMode, setCodeInputMode] = useState<'select' | 'upload'>(
    'select',
  );

  const [selectedBaseModelVersionId, setSelectedBaseModelVersionId] =
    useState<string>();
  const [selectedDatasetVersionId, setSelectedDatasetVersionId] =
    useState<string>();
  const [selectedCodeVersionId, setSelectedCodeVersionId] = useState<string>();
  const [selectedCodeApprovalStatus, setSelectedCodeApprovalStatus] =
    useState<string>();

  const [codeUploading, setCodeUploading] = useState(false);

  const [codeCheck, setCodeCheck] = useState<CheckState>({ loading: false });

  const selectedModel = useMemo(
    () => modelOptions.find((item) => item.id === selectedBaseModelVersionId),
    [modelOptions, selectedBaseModelVersionId],
  );

  /** 确保已选结果模型始终出现在下拉选项中（避免列表刷新后选项被冲掉导致显示空白） */
  const modelSelectOptions = useMemo(() => {
    if (
      !selectedBaseModelVersionId ||
      modelOptions.some((item) => item.id === selectedBaseModelVersionId)
    ) {
      return modelOptions;
    }
    return [
      {
        id: selectedBaseModelVersionId,
        name: `结果模型 ${selectedBaseModelVersionId.slice(0, 8)}…`,
        version: '-',
        type: (selectedModel?.type || 'NLP') as API.ModelItem['type'],
      } as API.ModelItem,
      ...modelOptions,
    ];
  }, [modelOptions, selectedBaseModelVersionId, selectedModel?.type]);

  const selectedTrainingPlan = useMemo(
    () => trainingPlans.find((plan) => plan.id === selectedTrainingPlanId),
    [selectedTrainingPlanId, trainingPlans],
  );
  const specDrivenModel = isSpecDrivenInput(
    selectedTrainingPlan?.inputs?.model,
  );
  const acceptedModelSpecIds =
    selectedTrainingPlan?.inputs?.model?.acceptedSpecIds ?? [];

  const filteredModelSelectOptions = useMemo(() => {
    return filterModelCandidates(
      modelSelectOptions,
      selectedTrainingPlan?.inputs?.model,
    );
  }, [modelSelectOptions, selectedTrainingPlan]);

  /** v2 按规格筛选；旧方案继续沿用单一任务类型或模型类型约束。 */
  const planDatasetTypes =
    selectedTrainingPlan?.inputs?.dataset?.taskTypes ?? [];
  const specDrivenDataset = isSpecDrivenInput(
    selectedTrainingPlan?.inputs?.dataset,
  );
  const acceptedDatasetSpecIds =
    selectedTrainingPlan?.inputs?.dataset?.acceptedSpecIds ?? [];
  const requiredDatasetType = (
    specDrivenDataset
      ? undefined
      : planDatasetTypes.length === 1
        ? planDatasetTypes[0]
        : (
            selectedModel ||
            modelSelectOptions.find(
              (item) => item.id === selectedBaseModelVersionId,
            )
          )?.type
  ) as DatasetType | undefined;
  const datasetSelectionReady = Boolean(
    selectedTrainingPlan && selectedBaseModelVersionId,
  );

  const filteredDatasetOptions = useMemo(() => {
    const compatible = filterDatasetCandidates(
      datasetOptions,
      selectedTrainingPlan?.inputs?.dataset,
    );
    if (specDrivenDataset) return compatible;
    if (!requiredDatasetType) {
      return compatible.filter((dataset) => dataset.type !== 'MULTIMODAL');
    }
    return compatible.filter((dataset) => dataset.type === requiredDatasetType);
  }, [
    datasetOptions,
    requiredDatasetType,
    selectedTrainingPlan,
    specDrivenDataset,
  ]);

  const filteredCodeOptions = useMemo(
    () =>
      codeOptions.filter(
        (code) =>
          !selectedTrainingPlanId ||
          code.trainingProfile === selectedTrainingPlanId,
      ),
    [codeOptions, selectedTrainingPlanId],
  );

  const resourceProfiles = useMemo(
    () => listCpuTrainingResourceProfiles(selectedTrainingPlan),
    [selectedTrainingPlan],
  );
  const selectedResourceProfile = resourceProfiles.find(
    (profile) => profile.id === selectedResourceProfileId,
  );

  useEffect(() => {
    if (!selectedTrainingPlan || !selectedDatasetVersionId) return;
    const dataset = datasetOptions.find(
      (item) => item.versionId === selectedDatasetVersionId,
    );
    if (
      dataset &&
      !filteredDatasetOptions.some(
        (item) => item.versionId === selectedDatasetVersionId,
      )
    ) {
      setSelectedDatasetVersionId(undefined);
      form.setFieldValue('datasetVersionId', undefined);
    }
  }, [
    datasetOptions,
    filteredDatasetOptions,
    form,
    selectedDatasetVersionId,
    selectedTrainingPlan,
  ]);

  const reloadModelOptions = (artifactSpecIds?: string[]) => {
    const sequence = ++modelLoadSequence.current;
    setModelLoading(true);
    const request = artifactSpecIds
      ? fetchTrainingModelCandidates(artifactSpecIds)
      : fetchAllModelList();
    return request
      .then((res: any) => {
        if (sequence !== modelLoadSequence.current) return;
        const list = (res?.data ?? []).filter((item: API.ModelItem) => item.id);
        setModelOptions(list);
      })
      .catch((error: any) => {
        if (sequence !== modelLoadSequence.current) return;
        setModelOptions([]);
        message.error(error?.message || '基础模型权重列表加载失败');
      })
      .finally(() => {
        if (sequence === modelLoadSequence.current) setModelLoading(false);
      });
  };

  const reloadCodeOptions = () => {
    setCodeLoading(true);
    return fetchApprovedCodeVersions({ skipErrorHandler: true })
      .then((res: any) => {
        if (!res?.success) {
          message.error(res?.errorMessage || '训练代码版本列表加载失败');
          setCodeOptions([]);
          return;
        }
        setCodeOptions(res.data ?? []);
      })
      .catch((error: any) => {
        setCodeOptions([]);
        message.error(error?.message || '训练代码版本列表加载失败');
      })
      .finally(() => setCodeLoading(false));
  };

  const reloadDatasetOptions = (artifactSpecIds?: string[]) => {
    const sequence = ++datasetLoadSequence.current;
    setDatasetLoading(true);
    const request = artifactSpecIds
      ? fetchTrainingDatasetCandidates(artifactSpecIds)
      : fetchAllDatasetList();
    return request
      .then((res) => {
        if (sequence !== datasetLoadSequence.current) return;
        const list = (res?.data ?? []).filter(
          (item: API.DatasetItem) => item.versionId,
        );
        setDatasetOptions(list ?? []);
      })
      .catch((error: any) => {
        if (sequence !== datasetLoadSequence.current) return;
        setDatasetOptions([]);
        message.error(error?.message || '数据集版本列表加载失败');
      })
      .finally(() => {
        if (sequence === datasetLoadSequence.current) setDatasetLoading(false);
      });
  };

  useEffect(() => {
    reloadModelOptions();
    reloadCodeOptions();
    reloadDatasetOptions();
    fetchTrainingPlans({ skipErrorHandler: true })
      .then((res) => {
        const plans = (res?.data ?? []).filter((plan) => plan.enabled);
        setTrainingPlans(plans);
        if (!plans.length) {
          message.error('没有可用训练方案，请检查后端 training-plans 配置');
        }
      })
      .catch((error: any) =>
        message.error(error?.message || '训练方案加载失败'),
      );
  }, []);

  useEffect(() => {
    if (!selectedTrainingPlan) return;
    const modelSpecs = selectedTrainingPlan.inputs?.model?.acceptedSpecIds;
    const datasetSpecs = selectedTrainingPlan.inputs?.dataset?.acceptedSpecIds;
    void reloadModelOptions(Array.isArray(modelSpecs) ? modelSpecs : undefined);
    void reloadDatasetOptions(
      Array.isArray(datasetSpecs) ? datasetSpecs : undefined,
    );
  }, [selectedTrainingPlan]);

  useEffect(() => {
    if (!selectedTrainingPlan || isExperimentContinue) return;
    form.setFieldsValue({
      planId: selectedTrainingPlan.id,
      planVersion: selectedTrainingPlan.version,
      trainingMode: selectedTrainingPlan.trainingModes?.[0],
      resourceProfileId:
        firstCpuTrainingResourceProfileId(selectedTrainingPlan),
      hyperParams: buildTrainingPlanHyperParams(selectedTrainingPlan),
    });
  }, [form, isExperimentContinue, selectedTrainingPlan]);

  useEffect(() => {
    if (!isExperimentContinue) return;
    let cancelled = false;

    const ensureOption = (modelId: string, meta?: Partial<API.ModelItem>) => {
      setModelOptions((prev) => {
        if (prev.some((item) => item.id === modelId)) {
          if (!meta) return prev;
          return prev.map((item) =>
            item.id === modelId
              ? {
                  ...item,
                  ...meta,
                  id: item.id,
                  name: meta.name || item.name,
                  version: meta.version || item.version,
                  type: (meta.type as API.ModelItem['type']) || item.type,
                }
              : item,
          );
        }
        return [
          {
            name: meta?.name || `结果模型 ${modelId.slice(0, 8)}…`,
            version: meta?.version || '-',
            type: (meta?.type || 'NLP') as API.ModelItem['type'],
            ...meta,
            id: modelId,
          } as API.ModelItem,
          ...prev,
        ];
      });
    };

    const applyModelSelection = async (modelId: string) => {
      if (cancelled || !modelId) return;
      setSelectedBaseModelVersionId(modelId);
      form.setFieldsValue({ baseModelVersionId: modelId });
      ensureOption(modelId);
      try {
        const detailRes: any = await getModelVersion(modelId, {
          skipErrorHandler: true,
        });
        if (cancelled) return;
        const d = detailRes?.data;
        if (!d) return;
        ensureOption(modelId, {
          name: d.name || d.fileName || '结果模型',
          version: d.version || '-',
          type: d.type || 'NLP',
          status: d.status,
          artifactSpecId: d.artifactSpecId,
        });
      } catch {
        // keep placeholder option
      }
    };

    const resolveProducedModelId = async (
      data: API.TrainingExperimentVersion,
    ): Promise<string | undefined> => {
      if (data.producedModelVersionId) return data.producedModelVersionId;
      try {
        const raw = localStorage.getItem('taskCreatePrefill');
        const prefill = raw ? JSON.parse(raw) : null;
        if (
          prefill?.producedModelVersionId &&
          (!prefill.fromVersionId || prefill.fromVersionId === data.id)
        ) {
          return String(prefill.producedModelVersionId);
        }
      } catch {
        // ignore
      }
      if (data.status !== 'success') return undefined;
      try {
        const pub = await publishTaskModel(data.id, {
          skipErrorHandler: true,
        });
        const produced =
          pub?.data?.producedModelVersionId ||
          (pub as any)?.data?.produced_model_version_id;
        if (produced) return String(produced);
        if (pub && pub.success === false) {
          message.warning(
            pub.errorMessage || '该版本结果模型尚未发布，请手动选择权重',
          );
        }
      } catch (error: any) {
        message.warning(
          error?.message || '自动发布结果模型失败，请手动选择权重',
        );
      }
      return undefined;
    };

    const load = async () => {
      try {
        // 先同步读 prefill，尽快占住选择（避免列表刷新把 UI 冲空）
        try {
          const raw = localStorage.getItem('taskCreatePrefill');
          const prefill = raw ? JSON.parse(raw) : null;
          const earlyId = prefill?.producedModelVersionId as string | undefined;
          if (
            earlyId &&
            (!fromVersionId ||
              !prefill?.fromVersionId ||
              prefill.fromVersionId === fromVersionId)
          ) {
            await applyModelSelection(earlyId);
          }
        } catch {
          // ignore
        }

        const detailId = fromVersionId || experimentId;
        const res: any = await fetchTaskDetail(detailId, {
          skipErrorHandler: true,
        });
        if (cancelled) return;
        let data = res?.data as API.TrainingExperimentVersion | undefined;
        if (!data) {
          message.warning('无法加载继续训练的源版本详情');
          return;
        }

        // 若只传了 experimentId，尽量对齐到指定版本
        if (!fromVersionId && data.experimentId) {
          try {
            const raw = localStorage.getItem('taskCreatePrefill');
            const prefill = raw ? JSON.parse(raw) : null;
            const wantId = prefill?.fromVersionId as string | undefined;
            if (wantId && wantId !== data.id) {
              const alt = await fetchTaskDetail(wantId, {
                skipErrorHandler: true,
              });
              if (alt?.data) data = alt.data as API.TrainingExperimentVersion;
            }
          } catch {
            // ignore prefill parse
          }
        }
        if (cancelled) return;

        const producedId = await resolveProducedModelId(data);
        if (cancelled) return;
        if (producedId) {
          await applyModelSelection(producedId);
        } else {
          // 上面 early prefill 可能已选中；此处用 DOM/状态外的标记更稳，避免闭包陈旧
          const stillEmpty = !form.getFieldValue('baseModelVersionId');
          if (stillEmpty) {
            message.warning(
              '该版本暂无结果模型（producedModelVersionId），请先在详情页发布结果模型，或手动选择权重',
            );
          }
        }

        if (data.codeVersionId) {
          setSelectedCodeVersionId(data.codeVersionId);
          setSelectedCodeApprovalStatus('APPROVED');
          form.setFieldValue('codeVersionId', data.codeVersionId);
        }
        if (data.trainingPlanId) {
          setSelectedTrainingPlanId(data.trainingPlanId);
          form.setFieldsValue({
            trainingProfile: data.trainingPlanId,
            planId: data.trainingPlanId,
            planVersion: data.trainingPlanVersion,
            trainingMode: data.trainingMode,
            resourceProfileId: data.resourceProfileId,
          });
        }
        if (data.datasetVersionId) {
          setSelectedDatasetVersionId(data.datasetVersionId);
          form.setFieldValue('datasetVersionId', data.datasetVersionId);
        }
        if (data.name) {
          form.setFieldValue('name', `${data.name}-continue`);
        }
        if (data.hyperParams && typeof data.hyperParams === 'object') {
          form.setFieldValue(
            'hyperParams',
            JSON.stringify(data.hyperParams, null, 2),
          );
        }
        if (data.versionNo != null) {
          form.setFieldValue(
            'remark',
            `基于 v${data.versionNo} 结果模型继续训练`,
          );
        }
      } catch {
        // ignore prefill failure
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
    // selectedBaseModelVersionId 仅用于 else 分支提示，不纳入依赖以免重复拉取
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId, form, fromVersionId, isExperimentContinue]);

  useEffect(() => {
    if (!presetCodeVersionId) return;
    setCodeInputMode('select');
    setSelectedCodeVersionId(presetCodeVersionId);
    setSelectedCodeApprovalStatus('APPROVED');
    form.setFieldValue('codeVersionId', presetCodeVersionId);

    let cancelled = false;
    void getCodeVersionDetail(presetCodeVersionId, {
      skipErrorHandler: true,
    })
      .then((res) => {
        if (cancelled || !res?.data) return;
        const detail = res.data;
        const profile = detail.trainingProfile?.trim();
        if (profile) {
          setSelectedTrainingPlanId(profile);
          form.setFieldValue('trainingProfile', profile);
        }
        setCodeOptions((prev) => {
          if (prev.some((item) => item.codeVersionId === presetCodeVersionId)) {
            return prev.map((item) =>
              item.codeVersionId === presetCodeVersionId
                ? { ...item, ...detail }
                : item,
            );
          }
          return [
            {
              ...detail,
              codeVersionId: presetCodeVersionId,
              codeAssetName:
                detail.codeAssetName || detail.codeName || presetCodeVersionId,
              approvalStatus: detail.approvalStatus || 'APPROVED',
            },
            ...prev,
          ];
        });
        if (String(detail.approvalStatus || '').toUpperCase() === 'APPROVED') {
          setSelectedCodeApprovalStatus('APPROVED');
        }
      })
      .catch(() => {
        // 预填失败时仍保留 URL 中的 codeVersionId 选中态
      });

    return () => {
      cancelled = true;
    };
  }, [form, presetCodeVersionId]);

  useEffect(() => {
    if (!presetCodeVersionId || !codeOptions.length) return;
    const found = codeOptions.find(
      (item) => item.codeVersionId === presetCodeVersionId,
    );
    const profile = found?.trainingProfile?.trim();
    if (!profile) return;
    setSelectedTrainingPlanId((prev) => prev || profile);
    if (!form.getFieldValue('trainingProfile')) {
      form.setFieldValue('trainingProfile', profile);
    }
  }, [codeOptions, form, presetCodeVersionId]);

  useEffect(() => {
    if (!presetBaseModelVersionId || isExperimentContinue) return;
    let cancelled = false;

    const ensureOption = (modelId: string, meta?: Partial<API.ModelItem>) => {
      setModelOptions((prev) => {
        if (prev.some((item) => item.id === modelId)) {
          if (!meta) return prev;
          return prev.map((item) =>
            item.id === modelId
              ? {
                  ...item,
                  ...meta,
                  id: item.id,
                  name: meta.name || item.name,
                  version: meta.version || item.version,
                  type: (meta.type as API.ModelItem['type']) || item.type,
                }
              : item,
          );
        }
        return [
          {
            name: meta?.name || `模型 ${modelId.slice(0, 8)}…`,
            version: meta?.version || '-',
            type: (meta?.type || 'NLP') as API.ModelItem['type'],
            ...meta,
            id: modelId,
          } as API.ModelItem,
          ...prev,
        ];
      });
    };

    setSelectedBaseModelVersionId(presetBaseModelVersionId);
    form.setFieldsValue({ baseModelVersionId: presetBaseModelVersionId });
    ensureOption(presetBaseModelVersionId);

    void getModelVersion(presetBaseModelVersionId, { skipErrorHandler: true })
      .then((detailRes: any) => {
        if (cancelled) return;
        const d = detailRes?.data;
        if (!d) return;
        ensureOption(presetBaseModelVersionId, {
          name: d.name || d.fileName || '基础模型权重',
          version: d.version || '-',
          type: d.type || 'NLP',
          status: d.status,
          artifactSpecId: d.artifactSpecId,
        });
      })
      .catch(() => {
        // keep placeholder option
      });

    return () => {
      cancelled = true;
    };
  }, [form, isExperimentContinue, presetBaseModelVersionId]);

  useEffect(() => {
    if (!selectedCodeVersionId) {
      setCodeCheck({ loading: false });
      return;
    }
    if (selectedCodeApprovalStatus === 'APPROVED') {
      setCodeCheck({
        loading: false,
        passed: true,
        approvalStatus: 'APPROVED',
      });
      return;
    }
    setCodeCheck({ loading: true });
    checkCodeVersionForTraining(
      selectedCodeVersionId,
      selectedTrainingPlanId || CONSISTENCY_TRAINING_PROFILE,
      { skipErrorHandler: true },
    )
      .then((res: any) => {
        if (!res?.success) {
          setCodeCheck({
            loading: false,
            passed: false,
            reasons: [res?.errorMessage || '准入校验失败'],
          });
          return;
        }
        const d = res.data;
        setCodeCheck({
          loading: false,
          passed: d.passed,
          reasons: d.reasons || [],
          approvalStatus: d.approvalStatus,
          validationStatus: d.validationStatus,
        });
        if (d.approvalStatus) {
          setSelectedCodeApprovalStatus(d.approvalStatus);
        }
      })
      .catch((error: any) => {
        setCodeCheck({
          loading: false,
          passed: false,
          reasons: [error?.message || '准入校验请求失败'],
        });
      });
  }, [
    selectedCodeApprovalStatus,
    selectedCodeVersionId,
    selectedTrainingPlanId,
  ]);

  const selectedCode = useMemo(
    () =>
      codeOptions.find((item) => item.codeVersionId === selectedCodeVersionId),
    [codeOptions, selectedCodeVersionId],
  );

  const uploadTrainingCodeZip = async (values: {
    codeName: string;
    remark?: string;
    file: UploadFile[];
  }) => {
    const file = values.file?.[0]?.originFileObj as File | undefined;
    if (!file) {
      throw new Error('请选择训练代码 zip 文件');
    }
    setCodeUploading(true);
    try {
      const res = await uploadCodeZip(
        {
          file,
          codeName: values.codeName,
          trainingProfile:
            selectedTrainingPlanId || CONSISTENCY_TRAINING_PROFILE,
          remark: values.remark?.trim() || 'task/create 页面上传',
        },
        { skipErrorHandler: true },
      );
      if (res?.success === false) {
        throw new Error(res?.errorMessage || '训练代码上传失败');
      }
      const codeVersionId = res?.data?.codeVersionId;
      if (!codeVersionId) {
        throw new Error('训练代码上传成功，但未返回版本编号');
      }
      let approvalStatus = res?.data?.approvalStatus;
      if (approvalStatus === 'APPROVED') {
        message.success('训练代码已上传并审核通过');
      } else if (isTrainingCodeAutoApproveEnabled()) {
        try {
          const approved = await autoApproveCodeVersionIfEnabled(
            codeVersionId,
            {
              trainingProfile:
                selectedTrainingPlanId || CONSISTENCY_TRAINING_PROFILE,
              skipErrorHandler: true,
            },
          );
          approvalStatus = approved?.approvalStatus || 'APPROVED';
          message.success('训练代码已上传并自动审核通过');
        } catch (approveError: any) {
          message.warning(
            getApiErrorMessage(
              approveError,
              '上传成功，但审核状态未确认。请刷新训练代码列表查看；若仍不可用，请改选已审核版本或联系管理员。',
            ),
          );
        }
      } else {
        message.success('训练代码已上传，正在执行准入校验');
      }
      setSelectedCodeVersionId(codeVersionId);
      setSelectedCodeApprovalStatus(approvalStatus);
      form.setFieldValue('codeVersionId', codeVersionId);
      await reloadCodeOptions();
      setCodeInputMode('select');
    } finally {
      setCodeUploading(false);
    }
  };

  const renderCodeCheckAlert = () => {
    if (!selectedCodeVersionId) return null;
    if (codeCheck.loading) {
      return (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 12 }}
          message="正在执行训练代码准入校验…"
        />
      );
    }
    if (codeCheck.passed && isCodeApproved(codeCheck.approvalStatus)) {
      return (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 12 }}
          message="训练代码校验通过且已审核"
          description="训练代码已通过结构与固定入口校验，并已审核通过。"
        />
      );
    }
    if (codeCheck.passed && !isCodeApproved(codeCheck.approvalStatus)) {
      return (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 12 }}
          message={
            isTrainingCodeAutoApproveEnabled()
              ? '训练代码校验通过，但尚未审核通过'
              : '训练代码校验通过，等待管理员审批'
          }
          description={
            isTrainingCodeAutoApproveEnabled()
              ? '训练代码尚未通过审核。可刷新后重试，或到训练代码页处理。'
              : '训练代码结构校验和人工审核均通过后，才可以提交训练。'
          }
        />
      );
    }
    return (
      <Alert
        type="error"
        showIcon
        style={{ marginTop: 12 }}
        message="训练代码校验未通过"
        description={
          <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
            {(codeCheck.reasons || []).map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        }
      />
    );
  };

  const validateConfigSection = async () => {
    await form.validateFields([
      'trainingProfile',
      'trainingMode',
      'hyperParams',
    ]);
  };

  const validateResourceSection = async () => {
    await form.validateFields(['resourceProfileId']);
    // 提交确认页会卸载资源步骤，useWatch 此时可能返回 undefined；
    // 直接读取 Form 保留的字段值，确保“已显示并确认”的默认档位能够提交。
    const formResourceProfileId = form.getFieldValue('resourceProfileId');
    if (!resourceProfiles.length) {
      message.error('当前训练方案没有可用的 CPU 资源规格');
      throw new Error('missing CPU resource profile');
    }
    if (
      !isCpuTrainingResourceProfileIdAllowed(
        resourceProfiles,
        formResourceProfileId,
      )
    ) {
      message.error('请选择当前训练方案允许的 CPU 资源规格');
      throw new Error('invalid CPU resource profile');
    }
  };

  const validateCodeSection = async () => {
    if (!selectedCodeVersionId) {
      message.error('请选择或上传训练代码');
      throw new Error('missing code');
    }
    if (codeCheck.loading) {
      message.warning('正在执行准入校验，请稍候');
      throw new Error('check loading');
    }
    if (!codeCheck.passed) {
      Modal.error({
        title: '训练代码校验未通过',
        content: (
          <div>
            <p>不能进入下一步，原因：</p>
            <ul style={{ paddingLeft: 20 }}>
              {(codeCheck.reasons || []).map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
        ),
      });
      throw new Error('check failed');
    }
    if (
      !isCodeApproved(selectedCodeApprovalStatus || codeCheck.approvalStatus)
    ) {
      Modal.warning({
        title: '训练代码尚未审核通过',
        content: isTrainingCodeAutoApproveEnabled()
          ? '当前版本尚未审核通过。请刷新后重试，或到训练代码页处理。'
          : '当前版本尚未审核通过。请等待管理员审核，或改选已审核版本。',
      });
      throw new Error('approval pending');
    }
  };

  const validateCodeStep = async () => {
    await form.validateFields(['trainingProfile']);
    await validateConfigSection();
    await validateCodeSection();
  };

  const validateStep = async (step: number) => {
    if (step === 0) {
      await form.validateFields(['trainingProfile']);
      if (!selectedTrainingPlan) {
        message.error('请先选择训练方案');
        throw new Error('missing training plan');
      }
      return;
    }
    if (step === 1) {
      if (!selectedTrainingPlan) {
        message.error('请先选择训练方案');
        throw new Error('missing training plan');
      }
      if (!selectedBaseModelVersionId) {
        message.error('请选择或上传基础模型权重');
        throw new Error('missing model');
      }
      const model = modelSelectOptions.find(
        (item) => item.id === selectedBaseModelVersionId,
      );
      if (
        !model ||
        !filteredModelSelectOptions.some(
          (item) => item.id === selectedBaseModelVersionId,
        )
      ) {
        message.error('所选模型与当前训练方案不兼容，或尚未准备完成');
        throw new Error('model is incompatible with training plan');
      }
      return;
    }
    if (step === 2) {
      if (!datasetSelectionReady) {
        message.error('请先在第二步选择基础模型权重');
        throw new Error('missing model');
      }
      if (!selectedDatasetVersionId) {
        message.error('请选择或上传训练数据集');
        throw new Error('missing dataset');
      }
      const dataset = datasetOptions.find(
        (item) => item.versionId === selectedDatasetVersionId,
      );
      if (
        !dataset ||
        !filteredDatasetOptions.some(
          (item) => item.versionId === selectedDatasetVersionId,
        )
      ) {
        message.error('所选数据集与当前训练方案不兼容，或尚未准备完成');
        throw new Error('dataset is incompatible with training plan');
      }
      return;
    }
    if (step === 3) {
      await validateCodeStep();
      return;
    }
    if (step === 4) {
      await validateResourceSection();
    }
  };

  const handleNext = async () => {
    try {
      await validateStep(currentStep);
      setCurrentStep((s) => s + 1);
    } catch {
      // validated inside
    }
  };

  const handlePrev = () => {
    setCurrentStep((s) => Math.max(0, s - 1));
  };

  const handleSubmit = async () => {
    try {
      await validateResourceSection();
    } catch {
      setCurrentStep(4);
      return;
    }
    if (!codeCheck.passed) {
      Modal.error({
        title: '训练代码校验未通过',
        content: (codeCheck.reasons || ['未知原因']).join('；'),
      });
      setCurrentStep(3);
      return;
    }
    if (
      !isCodeApproved(selectedCodeApprovalStatus || codeCheck.approvalStatus)
    ) {
      Modal.warning({
        title: '训练代码尚未审核通过',
        content: isTrainingCodeAutoApproveEnabled()
          ? '请回到训练配置步骤刷新后重试，或改选已审核通过的版本。'
          : '请等待管理员审核通过后提交，或改选已审核通过的训练代码版本。',
      });
      setCurrentStep(3);
      return;
    }
    if (!selectedBaseModelVersionId || !selectedDatasetVersionId) {
      message.error('请完成基础模型权重与数据集选择');
      return;
    }
    if (!selectedCodeVersionId) {
      message.error('请选择或上传训练代码');
      setCurrentStep(3);
      return;
    }
    const values = form.getFieldsValue(true);
    let hyperParams: Record<string, unknown> = {};
    try {
      hyperParams = JSON.parse(values.hyperParams || '{}');
    } catch {
      message.error('hyperParams JSON 格式不正确');
      setCurrentStep(3);
      return;
    }

    try {
      let data: API.TrainingExperimentVersion | undefined;
      const payload = {
        name: values.name,
        baseModelVersionId: selectedBaseModelVersionId,
        datasetVersionId: selectedDatasetVersionId,
        remark: values.remark,
        hyperParams,
        codeVersionId: selectedCodeVersionId,
        planId: selectedTrainingPlanId || values.trainingProfile,
        planVersion: selectedTrainingPlan?.version || values.planVersion,
        trainingMode: values.trainingMode,
        resourceProfileId: values.resourceProfileId,
      };
      if (isExperimentContinue) {
        const res: any = await createExperimentVersion(experimentId, payload, {
          skipErrorHandler: true,
        });
        if (res?.success === false) {
          throw new Error(res?.errorMessage || '创建实验新版本失败');
        }
        data = res?.data;
        message.success(`已创建第 ${data?.versionNo ?? '?'} 版训练`);
      } else {
        const taskPayload = {
          ...payload,
          trainingProfile: selectedTrainingPlanId || values.trainingProfile,
        };
        const res: any = await createTask(taskPayload, {
          skipErrorHandler: true,
        });
        if (res?.success === false) {
          throw new Error(res?.errorMessage || '创建训练任务失败');
        }
        data = res?.data;
        message.success('K8s 训练任务已创建');
      }
      history.push(`/task/detail/${data?.id}`);
    } catch (error: any) {
      message.error(
        error?.errorMessage || error?.message || '创建失败，请重试',
      );
    }
  };

  const stepItems = [
    { title: '训练方案' },
    { title: '基础模型' },
    { title: '训练数据集' },
    { title: '训练配置与代码' },
    { title: '资源配置' },
    { title: '确认并提交' },
  ];

  return (
    <PageContainer
      title={isExperimentContinue ? '基于此版本继续训练' : '发起训练'}
      subTitle="选择训练方案、模型、数据集、训练代码和资源规格"
      onBack={() => {
        if (isExperimentContinue) {
          history.push(`/task/detail/${encodeURIComponent(experimentId)}`);
          return;
        }
        if (backFromModelDetail) {
          const q = presetBaseModelVersionId
            ? `?versionId=${encodeURIComponent(presetBaseModelVersionId)}`
            : '';
          history.push(
            `/model/detail/${encodeURIComponent(fromModelAssetId)}${q}`,
          );
          return;
        }
        history.push('/task/list');
      }}
    >
      {isExperimentContinue && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message="基于此版本继续训练"
          description="已带入该版本使用的模型、数据集、训练代码和参数；提交后会保留原版本并生成新版本。"
        />
      )}

      <Form
        form={form}
        preserve
        layout="vertical"
        initialValues={{
          hyperParams: JSON.stringify(FUSION_HYPER_PARAMS_DEFAULT, null, 2),
          modelVersion: 'v1.0.0',
          datasetVersion: 'v1.0.0',
        }}
      >
        <Steps
          current={currentStep}
          items={stepItems}
          style={{ marginBottom: 24 }}
          data-tour="train-steps"
        />

        <div
          style={{ minHeight: 280, marginBottom: 24 }}
          data-tour="train-panel"
        >
          {currentStep === 0 && (
            <>
              <Form.Item
                name="trainingProfile"
                label="训练方案"
                rules={[{ required: true, message: '请选择训练方案' }]}
                extra="训练方案决定可选择的模型、数据集、训练代码、运行镜像和资源规格"
              >
                <Select
                  loading={!trainingPlans.length}
                  placeholder="请先选择训练方案"
                  onChange={(value: string) => {
                    const plan = trainingPlans.find(
                      (item) => item.id === value,
                    );
                    const modelTypes = plan?.inputs?.model?.taskTypes ?? [];
                    setSelectedTrainingPlanId(value);
                    setSelectedBaseModelVersionId(undefined);
                    setSelectedDatasetVersionId(undefined);
                    setSelectedCodeVersionId(undefined);
                    setSelectedCodeApprovalStatus(undefined);
                    setCodeCheck({ loading: false });
                    form.setFieldsValue({
                      baseModelVersionId: undefined,
                      datasetVersionId: undefined,
                      codeVersionId: undefined,
                      planId: value,
                      planVersion: plan?.version,
                      trainingMode: plan?.trainingModes?.[0],
                      resourceProfileId:
                        firstCpuTrainingResourceProfileId(plan),
                      modelType:
                        modelTypes.length === 1 ? modelTypes[0] : undefined,
                      hyperParams: buildTrainingPlanHyperParams(plan),
                    });
                  }}
                  options={Object.values(
                    trainingPlans.reduce(
                      (acc, plan) => {
                        const cat =
                          plan.category ||
                          plan.inputs?.model?.taskTypes?.[0] ||
                          plan.inputs?.dataset?.taskTypes?.[0] ||
                          'OTHER';
                        const groupLabel =
                          cat === 'CV'
                            ? 'CV · 计算机视觉'
                            : cat === 'NLP'
                              ? 'NLP · 自然语言'
                              : '其他';
                        if (!acc[groupLabel]) {
                          acc[groupLabel] = { label: groupLabel, options: [] };
                        }
                        acc[groupLabel].options.push({
                          value: plan.id,
                          label: firstCpuTrainingResourceProfileId(plan)
                            ? `${plan.displayName} (${plan.id})`
                            : `${plan.displayName} (${plan.id}) · 当前无 CPU 档位`,
                          disabled: !firstCpuTrainingResourceProfileId(plan),
                        });
                        return acc;
                      },
                      {} as Record<
                        string,
                        {
                          label: string;
                          options: {
                            value: string;
                            label: string;
                            disabled: boolean;
                          }[];
                        }
                      >,
                    ),
                  )}
                />
              </Form.Item>
              {selectedTrainingPlan && (
                <PlanFormatHint plan={selectedTrainingPlan} />
              )}
            </>
          )}

          {currentStep === 1 && (
            <>
              <Form.Item
                label="基础模型权重版本"
                required={isExperimentContinue}
                extra={
                  isExperimentContinue
                    ? '继续训练默认选中该版本发布的结果模型（producedModelVersionId）'
                    : specDrivenModel
                      ? `只显示与当前方案兼容且准备完成的模型：${acceptedModelSpecIds.join('、')}`
                      : '这里只显示与当前训练方案兼容且准备完成的模型版本'
                }
              >
                <Select
                  placeholder="请选择基础模型权重版本"
                  showSearch
                  allowClear
                  loading={modelLoading}
                  disabled={!selectedTrainingPlanId}
                  notFoundContent={
                    selectedTrainingPlanId
                      ? '没有与该方案兼容且准备完成的模型'
                      : '请先选择训练方案'
                  }
                  optionFilterProp="label"
                  value={selectedBaseModelVersionId}
                  onChange={(value?: string) => {
                    setSelectedBaseModelVersionId(value);
                    form.setFieldsValue({ baseModelVersionId: value });
                  }}
                  options={filteredModelSelectOptions.map((item) => ({
                    value: item.id,
                    label: `${item.name} / ${item.version || 'v?'} / ${item.artifactSpecId || item.type} / ${item.id}`,
                  }))}
                />
              </Form.Item>
              <Space style={{ marginBottom: 16 }}>
                <Button
                  onClick={() =>
                    void reloadModelOptions(
                      specDrivenModel ? acceptedModelSpecIds : undefined,
                    )
                  }
                  loading={modelLoading}
                >
                  刷新模型列表
                </Button>
                <Button href="/model/upload" target="_blank">
                  去模型管理上传
                </Button>
              </Space>
              {selectedModel && (
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="baseModelVersionId">
                    <Typography.Text copyable code>
                      {selectedModel.id}
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="名称">
                    {selectedModel.name}
                  </Descriptions.Item>
                  <Descriptions.Item label="版本">
                    {selectedModel.version}
                  </Descriptions.Item>
                  <Descriptions.Item label="服务器验证规格">
                    {selectedModel.artifactSpecId ?? '无'}
                  </Descriptions.Item>
                </Descriptions>
              )}
            </>
          )}

          {currentStep === 2 && (
            <>
              {!datasetSelectionReady ? (
                <Alert
                  type="warning"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="请先选择基础模型权重"
                  description="请返回上一步完成选择，平台随后会筛选可用数据集。"
                />
              ) : specDrivenDataset ? (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="仅显示与当前方案兼容且可用的数据集"
                />
              ) : (
                <Alert
                  type="info"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={`仅显示与已选模型匹配的 ${requiredDatasetType} 数据集`}
                  description={`已选模型：${selectedModel?.name ?? '-'}`}
                />
              )}
              <Form.Item
                name="datasetVersionId"
                label="数据集版本"
                extra={
                  specDrivenDataset
                    ? '平台已按当前方案筛选'
                    : requiredDatasetType
                      ? `平台已按 ${requiredDatasetType} 类型筛选`
                      : '请先在第一步选择基础模型权重'
                }
              >
                <Select
                  placeholder={
                    specDrivenDataset
                      ? '请选择符合 YAML 规格的数据集版本'
                      : requiredDatasetType
                        ? `请选择 ${requiredDatasetType} 数据集版本`
                        : '请先选择基础模型权重'
                  }
                  showSearch
                  loading={datasetLoading}
                  optionFilterProp="label"
                  disabled={!datasetSelectionReady}
                  notFoundContent={
                    datasetSelectionReady
                      ? '没有兼容且可用的数据集'
                      : '请先选择基础模型权重'
                  }
                  value={selectedDatasetVersionId}
                  onChange={(value: string) => {
                    setSelectedDatasetVersionId(value);
                    form.setFieldValue('datasetVersionId', value);
                  }}
                  options={filteredDatasetOptions.flatMap(
                    (d: API.DatasetItem) => {
                      const versionId = d.versionId;
                      if (!versionId) return [];
                      return [
                        {
                          value: versionId,
                          label: `${d.name} / ${d.version || 'v?'} / ${d.type || '未分类'}`,
                        },
                      ];
                    },
                  )}
                />
              </Form.Item>
              <Space style={{ marginBottom: 16 }}>
                <Button
                  onClick={() =>
                    void reloadDatasetOptions(
                      specDrivenDataset ? acceptedDatasetSpecIds : undefined,
                    )
                  }
                  loading={datasetLoading}
                >
                  刷新数据集列表
                </Button>
                <Button href="/dataset/upload" target="_blank">
                  去数据集管理上传
                </Button>
              </Space>
            </>
          )}

          {currentStep === 3 && (
            <>
              <Form.Item name="name" label="任务名称（可选）">
                <Input placeholder="例如：fusion-k8s-train" />
              </Form.Item>
              {isSingleTrainingMode(selectedTrainingPlan?.trainingModes) ? (
                <>
                  <Form.Item name="trainingMode" hidden>
                    <Input />
                  </Form.Item>
                  <Form.Item label="训练类型">
                    <Typography.Text>
                      {formatTrainingMode(
                        selectedTrainingPlan?.trainingModes?.[0],
                      )}
                    </Typography.Text>
                  </Form.Item>
                </>
              ) : (
                <Form.Item
                  name="trainingMode"
                  label="训练类型"
                  rules={[{ required: true, message: '请选择训练类型' }]}
                >
                  <Select
                    options={(selectedTrainingPlan?.trainingModes ?? []).map(
                      (mode) => ({
                        value: mode,
                        label: formatTrainingMode(mode),
                      }),
                    )}
                  />
                </Form.Item>
              )}
              <Form.Item name="remark" label="备注（可选）">
                <Input placeholder="例如：create-page k8s test" />
              </Form.Item>

              <Form.Item
                name="hyperParams"
                label="训练参数（JSON）"
                extra="参数由训练方案校验后写入运行规格，并传入训练程序。"
                rules={[
                  { required: true, message: '请输入训练参数 JSON' },
                  {
                    validator: async (_: any, value: string) => {
                      try {
                        JSON.parse(value || '{}');
                        return Promise.resolve();
                      } catch {
                        return Promise.reject(new Error('JSON 格式不正确'));
                      }
                    },
                  },
                ]}
              >
                <Input.TextArea rows={6} />
              </Form.Item>
              <Radio.Group
                value={codeInputMode}
                onChange={(e) => setCodeInputMode(e.target.value)}
                style={{ marginBottom: 16 }}
              >
                <Radio.Button value="select">选择已有</Radio.Button>
                <Radio.Button value="upload">上传新包</Radio.Button>
              </Radio.Group>
              {codeInputMode === 'select' ? (
                <Form.Item
                  name="codeVersionId"
                  label="训练代码版本"
                  extra="仅展示已审核通过的训练代码版本"
                >
                  <Select
                    placeholder="请选择训练代码版本"
                    showSearch
                    loading={codeLoading}
                    optionFilterProp="label"
                    value={selectedCodeVersionId}
                    onChange={(value: string) => {
                      setSelectedCodeVersionId(value);
                      setSelectedCodeApprovalStatus('APPROVED');
                      form.setFieldValue('codeVersionId', value);
                    }}
                    options={filteredCodeOptions.map((item: any) => ({
                      value: item.codeVersionId,
                      label: `${item.codeAssetName} / ${item.version || item.codeVersionId}`,
                    }))}
                  />
                </Form.Item>
              ) : (
                <>
                  <Form.Item
                    name="codeName"
                    label="代码资产名称"
                    rules={[{ required: true, message: '请输入代码名称' }]}
                  >
                    <Input placeholder="例如：consistency-train-code" />
                  </Form.Item>
                  <Form.Item name="codeRemark" label="备注（可选）">
                    <Input.TextArea
                      rows={2}
                      placeholder="例如：fusion 基线训练代码"
                      maxLength={200}
                      showCount
                    />
                  </Form.Item>
                  <Form.Item
                    name="codeFile"
                    label="训练代码 ZIP"
                    valuePropName="fileList"
                    getValueFromEvent={(e) => e?.fileList ?? []}
                    rules={[
                      {
                        required: true,
                        validator: (_, value) => {
                          const list = Array.isArray(value) ? value : [];
                          if (
                            !list.length ||
                            !list.some((item: UploadFile) => item.originFileObj)
                          ) {
                            return Promise.reject(
                              new Error('请选择训练代码 zip 文件'),
                            );
                          }
                          return Promise.resolve();
                        },
                      },
                    ]}
                    extra="仅支持 .zip，须包含固定训练入口脚本"
                  >
                    <Upload
                      beforeUpload={() => false}
                      maxCount={1}
                      accept=".zip"
                      disabled={codeUploading}
                    >
                      <Button
                        icon={<UploadOutlined />}
                        disabled={codeUploading}
                      >
                        选择训练代码 zip
                      </Button>
                    </Upload>
                  </Form.Item>
                  <Button
                    type="primary"
                    loading={codeUploading}
                    onClick={async () => {
                      try {
                        const values = await form.validateFields([
                          'codeName',
                          'codeFile',
                        ]);
                        await uploadTrainingCodeZip({
                          codeName: values.codeName,
                          remark: values.codeRemark,
                          file: values.codeFile,
                        });
                      } catch (error: any) {
                        message.error(getApiErrorMessage(error));
                      }
                    }}
                  >
                    上传并选用
                  </Button>
                </>
              )}
              {selectedCode && (
                <Descriptions
                  size="small"
                  column={1}
                  bordered
                  style={{ marginTop: 16 }}
                >
                  <Descriptions.Item label="代码版本编号">
                    <Typography.Text copyable code>
                      {selectedCode.codeVersionId}
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="状态">
                    <Space>
                      <Tag
                        color={
                          selectedCode.status === 'READY'
                            ? 'success'
                            : 'default'
                        }
                      >
                        {selectedCode.status}
                      </Tag>
                      <Tag
                        color={
                          selectedCodeApprovalStatus === 'APPROVED'
                            ? 'success'
                            : 'warning'
                        }
                      >
                        {selectedCodeApprovalStatus || '-'}
                      </Tag>
                    </Space>
                  </Descriptions.Item>
                </Descriptions>
              )}
              {renderCodeCheckAlert()}
            </>
          )}

          {currentStep === 4 && (
            <>
              <Alert
                type="info"
                showIcon
                style={{ marginBottom: 16 }}
                message="为本次训练选择资源规格"
                description="当前只开放 CPU 训练，资源规格由平台预先配置。"
              />
              {!resourceProfiles.length && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message="当前训练方案没有可用的 CPU 资源规格"
                  description="该方案可能只配置了 GPU 运行时；当前阶段不能提交，请改选包含 CPU 运行时的训练方案。"
                />
              )}
              <Form.Item
                name="resourceProfileId"
                label="计算资源规格"
                extra="任务提交后会固化此规格；任务等待容器启动时显示为“调度中”。"
                rules={[{ required: true, message: '请选择计算资源规格' }]}
              >
                <Select
                  disabled={!resourceProfiles.length}
                  placeholder="请选择 CPU 资源规格"
                  options={resourceProfiles.map((profile) => ({
                    value: profile.id,
                    label: `${profile.id} / CPU ${profile.cpuRequest}~${profile.cpuLimit} / 内存 ${profile.memoryRequest}~${profile.memoryLimit}`,
                  }))}
                />
              </Form.Item>
              {selectedResourceProfile && (
                <Descriptions size="small" column={1} bordered>
                  <Descriptions.Item label="设备">CPU</Descriptions.Item>
                  <Descriptions.Item label="CPU（申请 / 上限）">
                    {selectedResourceProfile.cpuRequest} /{' '}
                    {selectedResourceProfile.cpuLimit}
                  </Descriptions.Item>
                  <Descriptions.Item label="内存（申请 / 上限）">
                    {selectedResourceProfile.memoryRequest} /{' '}
                    {selectedResourceProfile.memoryLimit}
                  </Descriptions.Item>
                  <Descriptions.Item label="临时磁盘上限">
                    {selectedResourceProfile.ephemeralStorageLimit}
                  </Descriptions.Item>
                  <Descriptions.Item label="GPU 数量">0</Descriptions.Item>
                </Descriptions>
              )}
            </>
          )}

          {currentStep === 5 && (
            <>
              {(!codeCheck.passed ||
                !isCodeApproved(
                  selectedCodeApprovalStatus || codeCheck.approvalStatus,
                )) && (
                <Alert
                  type="error"
                  showIcon
                  style={{ marginBottom: 16 }}
                  message={
                    !codeCheck.passed
                      ? '训练代码校验未通过，不能用于训练'
                      : '训练代码尚未审核通过，不能用于训练'
                  }
                  description={
                    !codeCheck.passed
                      ? (codeCheck.reasons || []).join('；')
                      : '请等待管理员审核通过，或改选其他训练代码。'
                  }
                />
              )}
              <Descriptions size="small" column={1} bordered>
                <Descriptions.Item label="配置方式">训练代码</Descriptions.Item>
                <Descriptions.Item label="训练方案">
                  {selectedTrainingPlan?.displayName ||
                    selectedTrainingPlanId ||
                    '-'}
                  <Typography.Text
                    type="secondary"
                    style={{ marginLeft: 8, fontSize: 12 }}
                  >
                    （{selectedTrainingPlanId || '-'}）
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="baseModelVersionId">
                  <Typography.Text copyable code>
                    {selectedBaseModelVersionId || '-'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="datasetVersionId">
                  <Typography.Text copyable code>
                    {selectedDatasetVersionId || '-'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="代码版本编号">
                  <Typography.Text copyable code>
                    {selectedCodeVersionId || '-'}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label="hyperParams">
                  <code>{form.getFieldValue('hyperParams') || '{}'}</code>
                </Descriptions.Item>
                <Descriptions.Item label="执行方式">
                  Kubernetes Job
                </Descriptions.Item>
                <Descriptions.Item label="运行规格">
                  {`${form.getFieldValue('trainingMode') || '-'} / ${form.getFieldValue('resourceProfileId') || '-'}`}
                </Descriptions.Item>
                <Descriptions.Item label="模型权重目录">
                  /workspace/job/model（是否加载由训练方案和训练代码决定）
                </Descriptions.Item>
              </Descriptions>
            </>
          )}
        </div>

        <Space data-tour="train-actions">
          {currentStep > 0 && (
            <Button htmlType="button" onClick={handlePrev}>
              上一步
            </Button>
          )}
          {currentStep < 5 ? (
            <Button type="primary" htmlType="button" onClick={handleNext}>
              下一步
            </Button>
          ) : (
            <Button
              type="primary"
              htmlType="button"
              disabled={
                !codeCheck.passed ||
                !isCodeApproved(
                  selectedCodeApprovalStatus || codeCheck.approvalStatus,
                )
              }
              onClick={handleSubmit}
            >
              {isExperimentContinue ? '提交并创建新版本' : '提交 K8s 训练'}
            </Button>
          )}
        </Space>
      </Form>
      <Tour {...tourProps} />
    </PageContainer>
  );
};

export default TaskCreate;
