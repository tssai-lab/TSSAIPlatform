package com.tss.platform.service;

import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.training.TrainingProfileRegistry;
import io.minio.StatObjectResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

@Service
public class TrainingModelPublishService {

    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_PUBLISHING = "PUBLISHING";
    public static final String STATUS_PUBLISHED = "PUBLISHED";
    public static final String STATUS_FAILED = "FAILED";

    private static final Logger LOG = LoggerFactory.getLogger(TrainingModelPublishService.class);
    private static final long MAX_MODEL_BYTES = 2L * 1024 * 1024 * 1024;
    private static final Duration STALE_PUBLISH_AFTER = Duration.ofMinutes(10);

    private final TrainingExperimentVersionRepository trainingRepo;
    private final ModelAssetRepository modelAssetRepo;
    private final ModelVersionRepository modelVersionRepo;
    private final MinioService minioService;
    private final TransactionTemplate transactionTemplate;

    public TrainingModelPublishService(
            TrainingExperimentVersionRepository trainingRepo,
            ModelAssetRepository modelAssetRepo,
            ModelVersionRepository modelVersionRepo,
            MinioService minioService,
            PlatformTransactionManager transactionManager
    ) {
        this.trainingRepo = trainingRepo;
        this.modelAssetRepo = modelAssetRepo;
        this.modelVersionRepo = modelVersionRepo;
        this.minioService = minioService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public List<String> pendingTrainingIds() {
        return trainingRepo.findTop20ByModelPublishStatusOrderByUpdatedAtAsc(STATUS_PENDING)
                .stream()
                .map(TrainingExperimentVersion::getId)
                .toList();
    }

    public void recoverStalePublishes() {
        Instant now = Instant.now();
        Integer reset = transactionTemplate.execute(status -> trainingRepo.resetStaleModelPublishes(
                now.minus(STALE_PUBLISH_AFTER),
                "服务重启或发布超时，已重新排队",
                now
        ));
        if (reset != null && reset > 0) {
            LOG.warn("重置超时的训练模型发布任务: count={}", reset);
        }
    }

    public void publishIfPending(String trainingId) {
        if (!claim(trainingId)) {
            return;
        }
        try {
            publishClaimed(trainingId);
        } catch (Exception e) {
            markFailed(trainingId, rootMessage(e));
            LOG.error("训练模型发布失败: trainingId={}, error={}", trainingId, rootMessage(e), e);
        }
    }

    private boolean claim(String trainingId) {
        Integer updated = transactionTemplate.execute(status -> trainingRepo.claimModelPublish(
                trainingId,
                List.of(STATUS_PENDING),
                Instant.now()
        ));
        return updated != null && updated > 0;
    }

    private void publishClaimed(String trainingId) throws Exception {
        TrainingExperimentVersion snapshot = transactionTemplate.execute(status ->
                trainingRepo.findById(trainingId)
                        .orElseThrow(() -> new IllegalArgumentException("训练任务不存在: " + trainingId))
        );
        if (snapshot == null || !STATUS_PUBLISHING.equals(snapshot.getModelPublishStatus())) {
            return;
        }
        TrainingProfileRegistry.ProfileSpec spec = TrainingProfileRegistry.specOf(snapshot.getTrainingProfile())
                .orElseThrow(() -> new IllegalArgumentException(
                        "训练方案不支持自动发布模型: " + snapshot.getTrainingProfile()
                ));
        if (snapshot.getOwnerUserId() == null) {
            throw new IllegalArgumentException("训练任务缺少 ownerUserId");
        }

        PublishedArtifact artifact = ensureTrainingArchive(snapshot, spec);
        String assetId = deterministicId("model-asset-train-", snapshot.getExperimentId());
        String modelVersionId = deterministicId("model-ver-train-", snapshot.getId());
        String versionName = "v" + snapshot.getVersionNo();
        String targetPath = "users/" + snapshot.getOwnerUserId()
                + "/models/" + assetId
                + "/" + versionName
                + "/" + spec.producedModelArchiveName();

        if (minioService.objectExists(targetPath)) {
            PublishedArtifact existing = validateArchive(targetPath, spec.producedModelFileName(), artifact.sha256());
            if (!existing.sha256().equals(artifact.sha256())) {
                throw new IllegalStateException("目标模型文件已存在，但摘要与训练产物不一致");
            }
        } else {
            minioService.copyObject(artifact.objectName(), targetPath);
            validateArchive(targetPath, spec.producedModelFileName(), artifact.sha256());
        }
        StatObjectResponse targetStat = minioService.stat(targetPath);

        transactionTemplate.executeWithoutResult(status -> persistPublishedModel(
                trainingId,
                spec,
                artifact,
                assetId,
                modelVersionId,
                versionName,
                targetPath,
                targetStat.size()
        ));
        LOG.info(
                "训练模型发布成功: trainingId={}, modelVersionId={}, target={}",
                trainingId,
                modelVersionId,
                targetPath
        );
    }

    private PublishedArtifact ensureTrainingArchive(
            TrainingExperimentVersion training,
            TrainingProfileRegistry.ProfileSpec spec
    ) throws Exception {
        String expectedArchive = artifactPrefix(training.getId()) + spec.producedModelArchiveName();
        String callbackPath = normalizeObjectName(training.getModelArtifactPath());
        if (callbackPath != null && !expectedArchive.equals(callbackPath)) {
            throw new IllegalArgumentException("模型产物路径与训练任务不匹配");
        }

        PublishedArtifact artifact;
        if (minioService.objectExists(expectedArchive)) {
            artifact = validateArchive(
                    expectedArchive,
                    spec.producedModelFileName(),
                    normalizeSha256(training.getModelArtifactSha256())
            );
        } else {
            String legacyModelPath = artifactPrefix(training.getId()) + spec.producedModelFileName();
            if (!minioService.objectExists(legacyModelPath)) {
                throw new IllegalArgumentException("训练模型产物不存在: " + expectedArchive);
            }
            artifact = packageLegacyModel(legacyModelPath, expectedArchive, spec.producedModelFileName());
        }

        transactionTemplate.executeWithoutResult(status -> trainingRepo.findById(training.getId()).ifPresent(current -> {
            if (!STATUS_PUBLISHING.equals(current.getModelPublishStatus())) {
                return;
            }
            current.setModelArtifactPath(artifact.objectName());
            current.setModelArtifactSha256(artifact.sha256());
            current.setModelArtifactSizeBytes(artifact.archiveSize());
            current.setUpdatedAt(Instant.now());
            trainingRepo.save(current);
        }));
        return artifact;
    }

    private PublishedArtifact packageLegacyModel(
            String sourceModelPath,
            String archivePath,
            String modelFileName
    ) throws Exception {
        Path temp = Files.createTempFile("tss-training-model-", ".zip");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long modelBytes = 0;
        try {
            try (InputStream source = new BufferedInputStream(minioService.downloadStream(sourceModelPath));
                 OutputStream fileOut = new BufferedOutputStream(Files.newOutputStream(temp));
                 ZipOutputStream zip = new ZipOutputStream(fileOut)) {
                zip.putNextEntry(new ZipEntry(modelFileName));
                byte[] buffer = new byte[8192];
                int read;
                while ((read = source.read(buffer)) != -1) {
                    modelBytes += read;
                    if (modelBytes > MAX_MODEL_BYTES) {
                        throw new IllegalArgumentException("训练模型文件超过 2GB，无法自动发布");
                    }
                    digest.update(buffer, 0, read);
                    zip.write(buffer, 0, read);
                }
                zip.closeEntry();
            }
            long archiveSize = Files.size(temp);
            try (InputStream input = new BufferedInputStream(Files.newInputStream(temp))) {
                minioService.uploadStream(archivePath, input, archiveSize, "application/zip");
            }
            return new PublishedArtifact(
                    archivePath,
                    archiveSize,
                    modelBytes,
                    HexFormat.of().formatHex(digest.digest())
            );
        } finally {
            Files.deleteIfExists(temp);
        }
    }

    private PublishedArtifact validateArchive(
            String objectName,
            String requiredModelFileName,
            String expectedSha256
    ) throws Exception {
        StatObjectResponse stat = minioService.stat(objectName);
        if (stat.size() <= 0) {
            throw new IllegalArgumentException("训练模型 ZIP 为空");
        }
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        long modelBytes = 0;
        int fileCount = 0;
        try (InputStream source = new BufferedInputStream(minioService.downloadStream(objectName));
             ZipInputStream zip = new ZipInputStream(source)) {
            ZipEntry entry;
            byte[] buffer = new byte[8192];
            while ((entry = zip.getNextEntry()) != null) {
                if (entry.isDirectory()) {
                    zip.closeEntry();
                    continue;
                }
                fileCount += 1;
                if (!requiredModelFileName.equals(entry.getName())) {
                    throw new IllegalArgumentException("训练模型 ZIP 只能包含 " + requiredModelFileName);
                }
                int read;
                while ((read = zip.read(buffer)) != -1) {
                    modelBytes += read;
                    if (modelBytes > MAX_MODEL_BYTES) {
                        throw new IllegalArgumentException("训练模型文件超过 2GB，无法自动发布");
                    }
                    digest.update(buffer, 0, read);
                }
                zip.closeEntry();
            }
        }
        if (fileCount != 1 || modelBytes <= 0) {
            throw new IllegalArgumentException("训练模型 ZIP 必须且只能包含一个非空的 " + requiredModelFileName);
        }
        String sha256 = HexFormat.of().formatHex(digest.digest());
        String normalizedExpected = normalizeSha256(expectedSha256);
        if (normalizedExpected != null && !normalizedExpected.equals(sha256)) {
            throw new IllegalArgumentException("训练模型摘要校验失败");
        }
        return new PublishedArtifact(objectName, stat.size(), modelBytes, sha256);
    }

    private void persistPublishedModel(
            String trainingId,
            TrainingProfileRegistry.ProfileSpec spec,
            PublishedArtifact artifact,
            String assetId,
            String modelVersionId,
            String versionName,
            String targetPath,
            long targetSize
    ) {
        TrainingExperimentVersion training = trainingRepo.findById(trainingId)
                .orElseThrow(() -> new IllegalArgumentException("训练任务不存在: " + trainingId));
        if (training.getProducedModelVersionId() != null) {
            return;
        }
        if (!STATUS_PUBLISHING.equals(training.getModelPublishStatus())) {
            throw new IllegalStateException("训练模型发布状态已变化");
        }

        Instant now = Instant.now();
        ModelAsset asset = modelAssetRepo.findById(assetId).orElse(null);
        if (asset == null) {
            asset = new ModelAsset();
            asset.setId(assetId);
            asset.setName(limit(defaultModelName(training), 255));
            asset.setType(spec.outputTaskType());
            asset.setRemark(limit("由训练实验 " + training.getExperimentId() + " 自动产生", 1024));
            asset.setOwnerUserId(training.getOwnerUserId());
            asset.setCreatedAt(now);
            asset.setUpdatedAt(now);
            asset.setDeleted(false);
            modelAssetRepo.saveAndFlush(asset);
        } else {
            if (Boolean.TRUE.equals(asset.getDeleted())) {
                throw new IllegalStateException("训练模型资产已被删除");
            }
            if (!Objects.equals(asset.getOwnerUserId(), training.getOwnerUserId())) {
                throw new IllegalStateException("训练模型资产所有者不一致");
            }
        }

        ModelVersion modelVersion = modelVersionRepo.findById(modelVersionId).orElse(null);
        if (modelVersion == null) {
            if (modelVersionRepo.existsByAssetIdAndVersion(assetId, versionName)) {
                throw new IllegalStateException("训练模型版本号已存在: " + versionName);
            }
            modelVersion = new ModelVersion();
            modelVersion.setId(modelVersionId);
            modelVersion.setAssetId(assetId);
            modelVersion.setVersion(versionName);
            modelVersion.setFileName(spec.producedModelArchiveName());
            modelVersion.setStoragePath(targetPath);
            modelVersion.setSizeBytes(targetSize);
            modelVersion.setDescription(limit(
                    "由训练任务 " + trainingId + " 自动发布，格式 " + spec.producedModelFormat(),
                    2048
            ));
            modelVersion.setChangeLog("trainingProfile=" + training.getTrainingProfile()
                    + ", datasetVersionId=" + training.getDatasetVersionId()
                    + ", codeVersionId=" + training.getCodeVersionId()
                    + ", sha256=" + artifact.sha256());
            modelVersion.setStatus("READY");
            modelVersion.setPublishedAt(now);
            modelVersion.setCreatedBy(training.getOwnerUserId());
            modelVersion.setOwnerUserId(training.getOwnerUserId());
            modelVersion.setCreatedAt(now);
            modelVersion.setDeleted(false);
            modelVersionRepo.saveAndFlush(modelVersion);
        } else {
            if (Boolean.TRUE.equals(modelVersion.getDeleted())
                    || !Objects.equals(modelVersion.getAssetId(), assetId)
                    || !Objects.equals(modelVersion.getStoragePath(), targetPath)
                    || !Objects.equals(modelVersion.getOwnerUserId(), training.getOwnerUserId())) {
                throw new IllegalStateException("已有训练模型版本与当前任务不一致");
            }
        }

        training.setProducedModelVersionId(modelVersionId);
        training.setModelPublishStatus(STATUS_PUBLISHED);
        training.setModelPublishError(null);
        training.setModelPublishedAt(now);
        training.setModelArtifactPath(artifact.objectName());
        training.setModelArtifactSha256(artifact.sha256());
        training.setModelArtifactSizeBytes(artifact.archiveSize());
        training.setUpdatedAt(now);
        trainingRepo.saveAndFlush(training);
    }

    private void markFailed(String trainingId, String message) {
        transactionTemplate.executeWithoutResult(status -> trainingRepo.findById(trainingId).ifPresent(training -> {
            if (training.getProducedModelVersionId() != null) {
                training.setModelPublishStatus(STATUS_PUBLISHED);
                training.setModelPublishError(null);
                return;
            }
            if (!STATUS_PUBLISHING.equals(training.getModelPublishStatus())) {
                return;
            }
            training.setModelPublishStatus(STATUS_FAILED);
            training.setModelPublishError(limit(message, 4000));
            training.setUpdatedAt(Instant.now());
            trainingRepo.save(training);
        }));
    }

    private String artifactPrefix(String trainingId) {
        return "training-results/" + trainingId + "/artifacts/";
    }

    private String defaultModelName(TrainingExperimentVersion training) {
        String name = training.getName() == null || training.getName().isBlank()
                ? training.getExperimentId()
                : training.getName().trim();
        return name + "-训练模型";
    }

    private String deterministicId(String prefix, String value) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            String hash = HexFormat.of().formatHex(digest.digest(value.getBytes(StandardCharsets.UTF_8)));
            return prefix + hash.substring(0, 32);
        } catch (Exception e) {
            throw new IllegalStateException("无法生成训练模型 ID", e);
        }
    }

    private String normalizeObjectName(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().replace('\\', '/');
        if (normalized.startsWith("minio://")) {
            normalized = normalized.substring("minio://".length());
        }
        normalized = normalized.replaceFirst("^/+", "");
        if (normalized.startsWith("models/")) {
            normalized = normalized.substring("models/".length());
        }
        return normalized;
    }

    private String normalizeSha256(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        String normalized = value.trim().toLowerCase();
        if (!normalized.matches("[0-9a-f]{64}")) {
            throw new IllegalArgumentException("模型产物 sha256 格式不正确");
        }
        return normalized;
    }

    private String rootMessage(Throwable throwable) {
        Throwable current = throwable;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        String message = current.getMessage();
        return message == null || message.isBlank() ? current.getClass().getSimpleName() : message;
    }

    private String limit(String value, int maxLength) {
        if (value == null || value.length() <= maxLength) {
            return value;
        }
        return value.substring(0, maxLength);
    }

    private record PublishedArtifact(
            String objectName,
            long archiveSize,
            long modelSize,
            String sha256
    ) {
    }
}
