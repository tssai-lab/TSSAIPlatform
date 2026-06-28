package com.tss.platform.service;

import com.tss.platform.config.MinioConfig;
import com.tss.platform.dto.CodeUploadResultDto;
import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.model.CodeApprovalStatus;
import com.tss.platform.training.TrainingProfileRegistry;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import io.minio.PutObjectArgs;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.time.Instant;
import java.util.Locale;
import java.util.UUID;
import java.util.zip.ZipInputStream;

@Service
public class CodeUploadService {

    private final MinioClient minioClient;
    private final String bucket;
    private final CodeAssetRepository codeAssetRepo;
    private final CodeVersionRepository codeVersionRepo;
    private final AuthContext authContext;
    private final MinioDeleteTaskService minioDeleteTaskService;

    public CodeUploadService(
            MinioClient minioClient,
            MinioConfig minioConfig,
            CodeAssetRepository codeAssetRepo,
            CodeVersionRepository codeVersionRepo,
            AuthContext authContext,
            MinioDeleteTaskService minioDeleteTaskService
    ) {
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
        this.codeAssetRepo = codeAssetRepo;
        this.codeVersionRepo = codeVersionRepo;
        this.authContext = authContext;
        this.minioDeleteTaskService = minioDeleteTaskService;
    }

    @Transactional
    public CodeUploadResultDto upload(
            MultipartFile file,
            String codeName,
            String version,
            String trainingProfile,
            String remark
    ) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("请上传代码模型包 ZIP 文件");
        }
        String profile = normalizeRequired(trainingProfile, "trainingProfile 不能为空");
        TrainingProfileRegistry.requireSupported(profile);

        String fileName = file.getOriginalFilename();
        if (fileName == null || !fileName.toLowerCase(Locale.ROOT).endsWith(".zip")) {
            throw new IllegalArgumentException("代码模型包仅支持 .zip 格式");
        }

        String assetName = normalizeRequired(codeName, "codeName 不能为空");
        String versionLabel = normalizeText(version);
        if (versionLabel == null) {
            versionLabel = "v1";
        }

        Integer ownerUserId = authContext.currentUserId();
        String assetId = "code-asset-" + UUID.randomUUID().toString().replace("-", "");
        String versionId = "code-ver-" + UUID.randomUUID().toString().replace("-", "");
        String storagePath = "users/" + ownerUserId
                + "/codes/" + assetId
                + "/" + sanitizeSegment(versionLabel)
                + "/" + sanitizeSegment(fileName);

        try (InputStream inputStream = file.getInputStream()) {
            minioClient.putObject(
                    PutObjectArgs.builder()
                            .bucket(bucket)
                            .object(storagePath)
                            .stream(inputStream, file.getSize(), -1)
                            .contentType("application/zip")
                            .build()
            );
        } catch (Exception e) {
            throw new IllegalArgumentException("上传代码模型包失败: " + e.getMessage());
        }

        try {
            validateCodeZip(storagePath);
        } catch (Exception e) {
            removeObjectQuietly(storagePath);
            throw new IllegalArgumentException(e.getMessage());
        }

        Instant now = Instant.now();
        CodeAsset asset = new CodeAsset();
        asset.setId(assetId);
        asset.setName(assetName);
        asset.setTrainingProfile(profile);
        asset.setRemark(normalizeText(remark));
        asset.setOwnerUserId(ownerUserId);
        asset.setCreatedAt(now);
        asset.setUpdatedAt(now);
        asset.setDeleted(false);

        CodeVersion codeVersion = new CodeVersion();
        codeVersion.setId(versionId);
        codeVersion.setAssetId(assetId);
        codeVersion.setVersion(versionLabel);
        codeVersion.setFileName(fileName);
        codeVersion.setStoragePath(storagePath);
        codeVersion.setSizeBytes(file.getSize());
        codeVersion.setStatus("READY");
        codeVersion.setApprovalStatus(CodeApprovalStatus.PENDING);
        codeVersion.setOwnerUserId(ownerUserId);
        codeVersion.setCreatedAt(now);
        codeVersion.setDeleted(false);

        try {
            codeAssetRepo.saveAndFlush(asset);
            codeVersionRepo.saveAndFlush(codeVersion);
        } catch (RuntimeException e) {
            removeObjectQuietly(storagePath);
            throw new IllegalArgumentException("保存代码资产失败: " + e.getMessage());
        }

        return CodeUploadResultDto.builder()
                .codeAssetId(assetId)
                .codeVersionId(versionId)
                .version(versionLabel)
                .fileName(fileName)
                .storagePath(storagePath)
                .sizeBytes(file.getSize())
                .trainingProfile(profile)
                .status("READY")
                .approvalStatus(CodeApprovalStatus.PENDING)
                .build();
    }

    private void validateCodeZip(String objectName) throws Exception {
        try (InputStream is = minioClient.getObject(
                GetObjectArgs.builder().bucket(bucket).object(objectName).build()
        );
             ZipInputStream zip = new ZipInputStream(new BufferedInputStream(is))) {
            CodeModelZipValidator.validate(zip);
        }
    }

    private void removeObjectQuietly(String objectName) {
        if (objectName == null || objectName.isBlank()) {
            return;
        }
        try {
            minioDeleteTaskService.enqueueDefaultBucketDeleteImmediately(
                    objectName,
                    MinioDeleteTaskService.SOURCE_MODEL_UPLOAD_ROLLBACK,
                    objectName,
                    null
            );
        } catch (Exception ignored) {
            // 保留原始错误。
        }
    }

    private String sanitizeSegment(String value) {
        String normalized = value == null ? "" : value.trim();
        if (normalized.isEmpty()) {
            return "unnamed";
        }
        return normalized
                .replaceAll("[\\\\/:*?\"<>|]", "_")
                .toLowerCase(Locale.ROOT);
    }

    private String normalizeRequired(String value, String message) {
        String normalized = normalizeText(value);
        if (normalized == null) {
            throw new IllegalArgumentException(message);
        }
        return normalized;
    }

    private String normalizeText(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
