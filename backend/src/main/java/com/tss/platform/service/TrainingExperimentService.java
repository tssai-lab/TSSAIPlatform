package com.tss.platform.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.tss.platform.dto.CreateExperimentVersionRequest;
import com.tss.platform.dto.CreateTrainingExperimentRequest;
import com.tss.platform.dto.TrainingExperimentVersionDto;
import com.tss.platform.dto.UpdateHyperParamsRequest;
import com.tss.platform.dto.UpdateTrainingResultRequest;
import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.model.TaskType;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.training.TrainingExecutorRouter;
import com.tss.platform.training.TrainingProfileRegistry;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class TrainingExperimentService {

    private static final String STATUS_PENDING = "pending";
    private static final Set<String> ALLOWED_STATUSES = Set.of(
            "pending",
            "queued",
            "running",
            "success",
            "failed",
            "stopped"
    );

    private final TrainingExperimentVersionRepository repo;
    private final ModelVersionRepository modelVersionRepo;
    private final ModelAssetRepository modelAssetRepo;
    private final DatasetVersionRepository datasetVersionRepo;
    private final DatasetAssetRepository datasetAssetRepo;
    private final CodeVersionRepository codeVersionRepo;
    private final CodeAssetRepository codeAssetRepo;
    private final CodeVersionService codeVersionService;
    private final TrainingExecutorRouter trainingExecutorRouter;
    private final ObjectMapper objectMapper;
    private final AuthContext authContext;

    public TrainingExperimentService(
            TrainingExperimentVersionRepository repo,
            ModelVersionRepository modelVersionRepo,
            ModelAssetRepository modelAssetRepo,
            DatasetVersionRepository datasetVersionRepo,
            DatasetAssetRepository datasetAssetRepo,
            CodeVersionRepository codeVersionRepo,
            CodeAssetRepository codeAssetRepo,
            CodeVersionService codeVersionService,
            TrainingExecutorRouter trainingExecutorRouter,
            ObjectMapper objectMapper,
            AuthContext authContext
    ) {
        this.repo = repo;
        this.modelVersionRepo = modelVersionRepo;
        this.modelAssetRepo = modelAssetRepo;
        this.datasetVersionRepo = datasetVersionRepo;
        this.datasetAssetRepo = datasetAssetRepo;
        this.codeVersionRepo = codeVersionRepo;
        this.codeAssetRepo = codeAssetRepo;
        this.codeVersionService = codeVersionService;
        this.trainingExecutorRouter = trainingExecutorRouter;
        this.objectMapper = objectMapper;
        this.authContext = authContext;
    }

    @Transactional
    public TrainingExperimentVersionDto createExperiment(CreateTrainingExperimentRequest req) {
        requireText(req.getCodeVersionId(), "codeVersionId 不能为空");
        requireText(req.getDatasetVersionId(), "datasetVersionId 不能为空");
        String trainingProfile = blankToNull(req.getTrainingProfile());
        Object initialParams = req.getHyperParams() != null ? req.getHyperParams() : req.getParams();

        if (trainingProfile != null) {
            codeVersionService.requireApprovedForTraining(req.getCodeVersionId().trim());
            TrainingProfileRegistry.requireSupported(trainingProfile);
            validateProfileTraining(req.getCodeVersionId(), req.getDatasetVersionId(), trainingProfile);
            if (initialParams == null) {
                initialParams = Map.of();
            }
        } else {
            requireText(req.getModelVersionId(), "modelVersionId 不能为空");
            validateModelDatasetMatch(req.getModelVersionId(), req.getDatasetVersionId());
            if (initialParams == null) {
                throw new IllegalArgumentException("hyperParams 不能为空");
            }
        }

        String experimentId = "exp-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        TrainingExperimentVersion version = new TrainingExperimentVersion();
        version.setId(newVersionId());
        version.setExperimentId(experimentId);
        version.setVersionNo(1);
        version.setName(defaultName(req.getName(), experimentId));
        version.setModelVersionId(blankToNull(req.getModelVersionId()));
        version.setCodeVersionId(req.getCodeVersionId().trim());
        version.setTrainingProfile(trainingProfile);
        version.setDatasetVersionId(req.getDatasetVersionId().trim());
        version.setHyperParamsJson(toJson(initialParams));
        version.setStatus(STATUS_PENDING);
        version.setProgress(progressOf(STATUS_PENDING));
        version.setRemark(req.getRemark());
        version.setOwnerUserId(authContext.currentUserId());
        Instant now = Instant.now();
        version.setCreatedAt(now);
        version.setUpdatedAt(now);
        TrainingExperimentVersion saved = repo.save(version);
        startTrainingAfterCommit(saved.getId());
        return toDto(saved);
    }

    @Transactional
    public TrainingExperimentVersionDto createVersion(String experimentId, CreateExperimentVersionRequest req) {
        TrainingExperimentVersion latest = repo.findTopByExperimentIdOrderByVersionNoDesc(experimentId)
                .orElseThrow(() -> new IllegalArgumentException("experimentId 不存在"));
        requireExperimentAccess(latest);

        TrainingExperimentVersion version = new TrainingExperimentVersion();
        version.setId(newVersionId());
        version.setExperimentId(experimentId);
        version.setVersionNo(latest.getVersionNo() + 1);
        version.setName(defaultName(req.getName(), latest.getName()));
        version.setModelVersionId(firstText(req.getModelVersionId(), latest.getModelVersionId()));
        version.setCodeVersionId(firstRequiredText(req.getCodeVersionId(), latest.getCodeVersionId(), "codeVersionId 不能为空"));
        version.setDatasetVersionId(firstRequiredText(req.getDatasetVersionId(), latest.getDatasetVersionId(), "datasetVersionId 不能为空"));
        version.setTrainingProfile(latest.getTrainingProfile());
        if (latest.getTrainingProfile() != null && !latest.getTrainingProfile().isBlank()) {
            codeVersionService.requireApprovedForTraining(version.getCodeVersionId());
            validateProfileTraining(version.getCodeVersionId(), version.getDatasetVersionId(), latest.getTrainingProfile());
        } else {
            validateModelDatasetMatch(version.getModelVersionId(), version.getDatasetVersionId());
        }
        Object params = req.getHyperParams() != null ? req.getHyperParams() : req.getParams();
        version.setHyperParamsJson(params != null ? toJson(params) : latest.getHyperParamsJson());
        version.setStatus(STATUS_PENDING);
        version.setProgress(progressOf(STATUS_PENDING));
        version.setRemark(req.getRemark() != null ? req.getRemark() : latest.getRemark());
        version.setOwnerUserId(latest.getOwnerUserId());
        Instant now = Instant.now();
        version.setCreatedAt(now);
        version.setUpdatedAt(now);
        TrainingExperimentVersion saved = repo.save(version);
        startTrainingAfterCommit(saved.getId());
        return toDto(saved);
    }

    @Transactional(readOnly = true)
    public List<TrainingExperimentVersionDto> listVersions(String experimentId) {
        return repo.findByExperimentIdOrderByVersionNoAsc(experimentId)
                .stream()
                .filter(this::canAccessExperiment)
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public TrainingExperimentVersionDto getVersion(String experimentId, Integer versionNo) {
        TrainingExperimentVersion version = repo.findByExperimentIdAndVersionNo(experimentId, versionNo)
                .orElseThrow(() -> new IllegalArgumentException("指定实验版本不存在"));
        requireExperimentAccess(version);
        return toDto(version);
    }

    @Transactional(readOnly = true)
    public TrainingExperimentVersionDto getLatestByExperimentId(String experimentId) {
        TrainingExperimentVersion version = repo.findTopByExperimentIdOrderByVersionNoDesc(experimentId)
                .orElseThrow(() -> new IllegalArgumentException("experimentId 不存在"));
        requireExperimentAccess(version);
        return toDto(version);
    }

    @Transactional(readOnly = true)
    public TrainingExperimentVersionDto getByIdOrExperimentId(String id) {
        TrainingExperimentVersion byId = repo.findById(id).orElse(null);
        if (byId != null) {
            requireExperimentAccess(byId);
            return toDto(byId);
        }
        return getLatestByExperimentId(id);
    }

    @Transactional(readOnly = true)
    public List<TrainingExperimentVersionDto> listLatestExperiments() {
        Map<String, TrainingExperimentVersion> latestByExperiment = new LinkedHashMap<>();
        List<TrainingExperimentVersion> source = authContext.isAdmin()
                ? repo.findAllByOrderByCreatedAtDesc()
                : repo.findAllByOwnerUserIdOrderByCreatedAtDesc(authContext.currentUserId());
        for (TrainingExperimentVersion item : source) {
            TrainingExperimentVersion current = latestByExperiment.get(item.getExperimentId());
            if (current == null || item.getVersionNo() > current.getVersionNo()) {
                latestByExperiment.put(item.getExperimentId(), item);
            }
        }
        return latestByExperiment.values()
                .stream()
                .map(this::toDto)
                .collect(Collectors.toList());
    }

    @Transactional
    public TrainingExperimentVersionDto updateHyperParams(
            String experimentId,
            Integer versionNo,
            UpdateHyperParamsRequest req
    ) {
        TrainingExperimentVersion version = repo.findByExperimentIdAndVersionNo(experimentId, versionNo)
                .orElseThrow(() -> new IllegalArgumentException("指定实验版本不存在"));
        requireExperimentAccess(version);
        Object params = req.getHyperParams() != null ? req.getHyperParams() : req.getParams();
        if (params == null) {
            throw new IllegalArgumentException("hyperParams 不能为空");
        }
        version.setHyperParamsJson(toJson(params));
        if (req.getRemark() != null) {
            version.setRemark(req.getRemark());
        }
        version.setUpdatedAt(Instant.now());
        return toDto(repo.save(version));
    }

    @Transactional
    public TrainingExperimentVersionDto stopTraining(String idOrExperimentId) {
        TrainingExperimentVersion version = repo.findById(idOrExperimentId)
                .orElseGet(() -> repo.findTopByExperimentIdOrderByVersionNoDesc(idOrExperimentId)
                        .orElseThrow(() -> new IllegalArgumentException("训练任务不存在")));
        requireExperimentAccess(version);
        trainingExecutorRouter.stop(version.getId());
        version.setStatus("stopped");
        version.setProgress(progressOf("stopped"));
        version.setFinishedAt(Instant.now());
        version.setUpdatedAt(Instant.now());
        return toDto(repo.save(version));
    }

    @Transactional
    public TrainingExperimentVersionDto updateStatus(String idOrExperimentId, String status) {
        TrainingExperimentVersion version = repo.findById(idOrExperimentId)
                .orElseGet(() -> repo.findTopByExperimentIdOrderByVersionNoDesc(idOrExperimentId)
                        .orElseThrow(() -> new IllegalArgumentException("训练任务不存在")));
        requireExperimentAccess(version);
        String normalizedStatus = normalizeStatus(status);
        version.setStatus(normalizedStatus);
        version.setProgress(progressOf(normalizedStatus));
        version.setUpdatedAt(Instant.now());
        return toDto(repo.save(version));
    }

    @Transactional
    public TrainingExperimentVersionDto updateResult(
            String experimentId,
            Integer versionNo,
            UpdateTrainingResultRequest req
    ) {
        TrainingExperimentVersion version = repo.findByExperimentIdAndVersionNo(experimentId, versionNo)
                .orElseThrow(() -> new IllegalArgumentException("指定实验版本不存在"));
        requireExperimentAccess(version);
        applyResult(version, req);
        return toDto(repo.save(version));
    }

    @Transactional
    public TrainingExperimentVersionDto updateResultByIdOrExperimentId(
            String idOrExperimentId,
            UpdateTrainingResultRequest req
    ) {
        TrainingExperimentVersion version = repo.findById(idOrExperimentId)
                .orElseGet(() -> repo.findTopByExperimentIdOrderByVersionNoDesc(idOrExperimentId)
                        .orElseThrow(() -> new IllegalArgumentException("训练任务不存在")));
        requireExperimentAccess(version);
        applyResult(version, req);
        return toDto(repo.save(version));
    }

    /** Worker 内部回调，跳过用户权限校验（由 InternalTrainingCallbackController 校验 token） */
    @Transactional
    public TrainingExperimentVersionDto updateResultInternal(
            String trainingId,
            UpdateTrainingResultRequest req
    ) {
        TrainingExperimentVersion version = repo.findById(trainingId)
                .orElseThrow(() -> new IllegalArgumentException("训练任务不存在: " + trainingId));
        applyResult(version, req);
        return toDto(repo.save(version));
    }

    @Transactional
    public void deleteExperiment(String idOrExperimentId) {
        TrainingExperimentVersion byId = repo.findById(idOrExperimentId).orElse(null);
        if (byId != null) {
            requireExperimentAccess(byId);
            repo.deleteByExperimentId(byId.getExperimentId());
            return;
        }
        List<TrainingExperimentVersion> versions = repo.findByExperimentIdOrderByVersionNoAsc(idOrExperimentId);
        if (versions.isEmpty()) {
            throw new IllegalArgumentException("训练任务不存在");
        }
        requireExperimentAccess(versions.get(0));
        repo.deleteByExperimentId(idOrExperimentId);
    }

    public TrainingExperimentVersionDto toDto(TrainingExperimentVersion version) {
        TrainingExperimentVersionDto dto = new TrainingExperimentVersionDto();
        dto.setId(version.getId());
        dto.setExperimentId(version.getExperimentId());
        dto.setVersionNo(version.getVersionNo());
        dto.setName(version.getName());
        dto.setModelVersionId(version.getModelVersionId());
        dto.setCodeVersionId(version.getCodeVersionId());
        dto.setTrainingProfile(version.getTrainingProfile());
        dto.setDatasetVersionId(version.getDatasetVersionId());
        dto.setHyperParams(fromJson(version.getHyperParamsJson()));
        dto.setStatus(version.getStatus());
        dto.setProgress(version.getProgress() != null ? version.getProgress() : progressOf(version.getStatus()));
        dto.setMetrics(fromJson(version.getMetricsJson()));
        dto.setRunId(version.getRunId());
        dto.setMlflowExperimentId(version.getMlflowExperimentId());
        dto.setMlflowTrackingUri(version.getMlflowTrackingUri());
        dto.setLogPath(version.getLogPath());
        dto.setOutputPath(version.getOutputPath());
        dto.setErrorMessage(version.getErrorMessage());
        dto.setStartedAt(version.getStartedAt());
        dto.setFinishedAt(version.getFinishedAt());
        dto.setRemark(version.getRemark());
        dto.setOwnerUserId(version.getOwnerUserId());
        dto.setCreatedAt(version.getCreatedAt());
        dto.setUpdatedAt(version.getUpdatedAt());
        return dto;
    }

    private String toJson(Object value) {
        try {
            JsonNode node = toJsonNode(value);
            return objectMapper.writeValueAsString(node);
        } catch (Exception e) {
            throw new IllegalArgumentException("hyperParams 必须是合法 JSON");
        }
    }

    private JsonNode toJsonNode(Object value) throws Exception {
        if (value == null) {
            return objectMapper.createObjectNode();
        }
        if (value instanceof String) {
            String text = ((String) value).trim();
            if (text.isEmpty()) {
                return objectMapper.createObjectNode();
            }
            return objectMapper.readTree(text);
        }
        return objectMapper.valueToTree(value);
    }

    private JsonNode fromJson(String json) {
        if (json == null || json.isBlank()) {
            return objectMapper.createObjectNode();
        }
        try {
            return objectMapper.readTree(json);
        } catch (Exception e) {
            ObjectNode fallback = objectMapper.createObjectNode();
            fallback.put("raw", json);
            return fallback;
        }
    }

    private void applyResult(TrainingExperimentVersion version, UpdateTrainingResultRequest req) {
        if (req == null) {
            throw new IllegalArgumentException("request body cannot be empty");
        }
        String nextStatus = req.getStatus() == null || req.getStatus().isBlank()
                ? version.getStatus()
                : normalizeStatus(req.getStatus());
        if (nextStatus != null) {
            version.setStatus(nextStatus);
        }
        if (req.getProgress() != null) {
            version.setProgress(validateProgress(req.getProgress()));
        } else if (req.getStatus() != null && !req.getStatus().isBlank()) {
            version.setProgress(progressOf(nextStatus));
        }
        if (req.getMetrics() != null) {
            version.setMetricsJson(toResultJson(req.getMetrics(), "metrics must be valid JSON"));
        }
        if (req.getRunId() != null) {
            version.setRunId(blankToNull(req.getRunId()));
        }
        if (req.getMlflowExperimentId() != null) {
            version.setMlflowExperimentId(blankToNull(req.getMlflowExperimentId()));
        }
        if (req.getMlflowTrackingUri() != null) {
            version.setMlflowTrackingUri(blankToNull(req.getMlflowTrackingUri()));
        }
        if (req.getLogPath() != null) {
            version.setLogPath(blankToNull(req.getLogPath()));
        }
        if (req.getOutputPath() != null) {
            version.setOutputPath(blankToNull(req.getOutputPath()));
        }
        if (req.getErrorMessage() != null) {
            version.setErrorMessage(blankToNull(req.getErrorMessage()));
        }
        if (req.getStartedAt() != null) {
            version.setStartedAt(req.getStartedAt());
        }
        if (req.getFinishedAt() != null) {
            version.setFinishedAt(req.getFinishedAt());
        }
        if (req.getRemark() != null) {
            version.setRemark(req.getRemark());
        }
        version.setUpdatedAt(Instant.now());
    }

    private String toResultJson(Object value, String errorMessage) {
        try {
            JsonNode node = toJsonNode(value);
            return objectMapper.writeValueAsString(node);
        } catch (Exception e) {
            throw new IllegalArgumentException(errorMessage);
        }
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            throw new IllegalArgumentException("status cannot be empty");
        }
        String normalized = status.trim().toLowerCase(Locale.ROOT);
        if (!ALLOWED_STATUSES.contains(normalized)) {
            throw new IllegalArgumentException("status only supports pending, queued, running, success, failed, stopped");
        }
        return normalized;
    }

    private Integer validateProgress(Integer progress) {
        if (progress < 0 || progress > 100) {
            throw new IllegalArgumentException("progress must be between 0 and 100");
        }
        return progress;
    }

    private Integer progressOf(String status) {
        if ("success".equals(status)) {
            return 100;
        }
        if ("running".equals(status)) {
            return 50;
        }
        if ("failed".equals(status) || "stopped".equals(status)) {
            return 0;
        }
        return 0;
    }

    private void startTrainingAfterCommit(String trainingId) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    trainingExecutorRouter.start(trainingId);
                }
            });
            return;
        }
        trainingExecutorRouter.start(trainingId);
    }

    private String newVersionId() {
        return "train-ver-" + UUID.randomUUID().toString().replace("-", "");
    }

    private void requireText(String value, String message) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException(message);
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private String defaultName(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String firstText(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private String firstRequiredText(String value, String fallback, String message) {
        String result = firstText(value, fallback);
        requireText(result, message);
        return result;
    }

    private void validateProfileTraining(String codeVersionId, String datasetVersionId, String trainingProfile) {
        TrainingProfileRegistry.requireSupported(trainingProfile);
        CodeVersion codeVersion = codeVersionRepo.findByIdAndDeletedFalse(codeVersionId.trim())
                .orElseThrow(() -> new IllegalArgumentException("代码模型版本不存在: " + codeVersionId));
        CodeAsset codeAsset = codeAssetRepo.findByIdAndDeletedFalse(codeVersion.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException("代码资产不存在: " + codeVersion.getAssetId()));
        if (codeAsset.getTrainingProfile() == null
                || !codeAsset.getTrainingProfile().equals(trainingProfile)) {
            throw new IllegalArgumentException("trainingProfile 与代码资产不匹配");
        }

        TrainingProfileRegistry.ProfileSpec spec = TrainingProfileRegistry.specOf(trainingProfile)
                .orElseThrow(() -> new IllegalArgumentException("不支持的 trainingProfile: " + trainingProfile));
        String datasetType = resolveDatasetTaskType(datasetVersionId.trim());
        if (!spec.requiredDatasetType().equals(datasetType)) {
            throw new IllegalArgumentException(
                    "数据集类型与 trainingProfile 不匹配：需要 " + spec.requiredDatasetType() + "，实际 " + datasetType);
        }
    }

    private void validateModelDatasetMatch(String modelVersionId, String datasetVersionId) {
        requireText(modelVersionId, "modelVersionId 不能为空");
        requireText(datasetVersionId, "datasetVersionId 不能为空");
        String modelType = resolveModelTaskType(modelVersionId.trim());
        String datasetType = resolveDatasetTaskType(datasetVersionId.trim());
        if (!modelType.equals(datasetType)) {
            throw new IllegalArgumentException(
                    "模型类型与数据集类型不匹配：模型为 " + modelType + "，数据集为 " + datasetType);
        }
    }

    private String resolveModelTaskType(String modelVersionId) {
        ModelVersion version = modelVersionRepo.findByIdAndDeletedFalse(modelVersionId)
                .orElseThrow(() -> new IllegalArgumentException("模型版本不存在: " + modelVersionId));
        ModelAsset asset = modelAssetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException("模型资产不存在: " + version.getAssetId()));
        Integer ownerUserId = version.getOwnerUserId() != null ? version.getOwnerUserId() : asset.getOwnerUserId();
        authContext.requireOwnerAccess(ownerUserId, "model version not found or no permission");
        return TaskType.normalize(asset.getType());
    }

    private String resolveDatasetTaskType(String datasetVersionId) {
        DatasetVersion version = datasetVersionRepo.findByIdAndDeletedFalse(datasetVersionId)
                .orElseThrow(() -> new IllegalArgumentException("数据集版本不存在: " + datasetVersionId));
        DatasetAsset asset = datasetAssetRepo.findByIdAndDeletedFalse(version.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException("数据集资产不存在: " + version.getAssetId()));
        Integer ownerUserId = version.getOwnerUserId() != null ? version.getOwnerUserId() : asset.getOwnerUserId();
        authContext.requireOwnerAccess(ownerUserId, "dataset version not found or no permission");
        if (!"READY".equals(version.getStatus())) {
            throw new IllegalArgumentException("dataset version must be READY for training");
        }
        if (version.getStoragePath() == null || version.getStoragePath().isBlank()) {
            throw new IllegalArgumentException("dataset version storage path is required for training");
        }
        return TaskType.normalize(asset.getType());
    }

    private boolean canAccessExperiment(TrainingExperimentVersion version) {
        return authContext.canAccessOwner(version.getOwnerUserId());
    }

    private void requireExperimentAccess(TrainingExperimentVersion version) {
        authContext.requireOwnerAccess(version.getOwnerUserId(), "experiment not found or no permission");
    }
}
