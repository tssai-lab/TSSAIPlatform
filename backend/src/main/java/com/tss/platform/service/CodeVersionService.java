package com.tss.platform.service;

import com.tss.platform.dto.CodeVersionApprovalDto;
import com.tss.platform.dto.CodeVersionListItemDto;
import com.tss.platform.dto.CodeVersionTrainingCheckDto;
import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.model.CodeApprovalStatus;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.training.TrainingProfileRegistry;
import io.minio.GetObjectArgs;
import io.minio.MinioClient;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedInputStream;
import java.io.InputStream;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.zip.ZipInputStream;

@Service
public class CodeVersionService {

    private final CodeVersionRepository codeVersionRepo;
    private final CodeAssetRepository codeAssetRepo;
    private final AuthContext authContext;
    private final MinioClient minioClient;
    private final String bucket;

    public CodeVersionService(
            CodeVersionRepository codeVersionRepo,
            CodeAssetRepository codeAssetRepo,
            AuthContext authContext,
            MinioClient minioClient,
            com.tss.platform.config.MinioConfig minioConfig
    ) {
        this.codeVersionRepo = codeVersionRepo;
        this.codeAssetRepo = codeAssetRepo;
        this.authContext = authContext;
        this.minioClient = minioClient;
        this.bucket = minioConfig.getBucket();
    }

    @Transactional
    public CodeVersionApprovalDto approve(String codeVersionId) {
        CodeVersion codeVersion = codeVersionRepo.findByIdAndDeletedFalse(codeVersionId.trim())
                .orElseThrow(() -> new IllegalArgumentException("代码模型版本不存在: " + codeVersionId));
        if (!"READY".equals(codeVersion.getStatus())) {
            throw new IllegalArgumentException("代码模型版本必须为 READY 状态才能审核");
        }
        codeVersion.setApprovalStatus(CodeApprovalStatus.APPROVED);
        codeVersionRepo.save(codeVersion);
        return CodeVersionApprovalDto.builder()
                .codeVersionId(codeVersion.getId())
                .approvalStatus(codeVersion.getApprovalStatus())
                .build();
    }

    @Transactional(readOnly = true)
    public List<CodeVersionListItemDto> listApprovedForTraining() {
        List<CodeVersionListItemDto> items = new ArrayList<>();
        for (CodeVersion codeVersion : codeVersionRepo.findByDeletedFalseOrderByCreatedAtDesc()) {
            if (!"READY".equals(codeVersion.getStatus())) {
                continue;
            }
            if (!CodeApprovalStatus.isApproved(codeVersion.getApprovalStatus())) {
                continue;
            }
            CodeAsset codeAsset = codeAssetRepo.findByIdAndDeletedFalse(codeVersion.getAssetId()).orElse(null);
            if (codeAsset == null) {
                continue;
            }
            Integer ownerUserId = codeVersion.getOwnerUserId() != null
                    ? codeVersion.getOwnerUserId()
                    : codeAsset.getOwnerUserId();
            if (!authContext.canAccessOwner(ownerUserId)) {
                continue;
            }
            items.add(CodeVersionListItemDto.builder()
                    .codeVersionId(codeVersion.getId())
                    .codeAssetId(codeAsset.getId())
                    .codeAssetName(codeAsset.getName())
                    .version(codeVersion.getVersion())
                    .fileName(codeVersion.getFileName())
                    .trainingProfile(codeAsset.getTrainingProfile())
                    .approvalStatus(codeVersion.getApprovalStatus())
                    .status(codeVersion.getStatus())
                    .build());
        }
        items.sort(Comparator.comparing(CodeVersionListItemDto::getCodeAssetName, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(CodeVersionListItemDto::getVersion, String.CASE_INSENSITIVE_ORDER));
        return items;
    }

    @Transactional(readOnly = true)
    public void requireApprovedForTraining(String codeVersionId) {
        CodeVersion codeVersion = codeVersionRepo.findByIdAndDeletedFalse(codeVersionId.trim())
                .orElseThrow(() -> new IllegalArgumentException("代码模型版本不存在: " + codeVersionId));
        if (!"READY".equals(codeVersion.getStatus())) {
            throw new IllegalArgumentException("代码模型版本必须为 READY 状态");
        }
        if (codeVersion.getStoragePath() == null || codeVersion.getStoragePath().isBlank()) {
            throw new IllegalArgumentException("代码模型版本缺少 storagePath");
        }
        if (!CodeApprovalStatus.isApproved(codeVersion.getApprovalStatus())) {
            throw new IllegalArgumentException("代码模型版本未通过准入校验，不能用于训练");
        }
        CodeAsset codeAsset = codeAssetRepo.findByIdAndDeletedFalse(codeVersion.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException("代码资产不存在: " + codeVersion.getAssetId()));
        authContext.requireOwnerAccess(
                codeVersion.getOwnerUserId() != null ? codeVersion.getOwnerUserId() : codeAsset.getOwnerUserId(),
                "code version not found or no permission"
        );
    }

    /**
     * 准入校验：检查 codeVersion 是否满足 profile 训练的固定入口与结构要求。
     * 通过则自动将 approval_status 置为 APPROVED。
     * 注意：自动 APPROVED 只代表结构、元数据、固定入口检查通过，不代表代码安全审计。
     */
    @Transactional
    public CodeVersionTrainingCheckDto trainingCheck(String codeVersionId, String trainingProfile) {
        String profile = trainingProfile == null ? "" : trainingProfile.trim();
        List<String> reasons = new ArrayList<>();
        Instant checkedAt = Instant.now();

        CodeVersion codeVersion = codeVersionRepo.findByIdAndDeletedFalse(codeVersionId.trim())
                .orElse(null);
        if (codeVersion == null) {
            reasons.add("代码模型版本不存在: " + codeVersionId);
            return buildCheckDto(codeVersionId, profile, false, null, reasons, checkedAt);
        }
        if (!"READY".equals(codeVersion.getStatus())) {
            reasons.add("代码模型版本必须为 READY 状态");
        }
        if (codeVersion.getStoragePath() == null || codeVersion.getStoragePath().isBlank()) {
            reasons.add("代码模型版本缺少 storagePath");
        }
        if (!TrainingProfileRegistry.isSupported(profile)) {
            reasons.add("不支持的训练方案: " + profile);
        }

        CodeAsset codeAsset = codeAssetRepo.findByIdAndDeletedFalse(codeVersion.getAssetId()).orElse(null);
        if (codeAsset == null) {
            reasons.add("代码资产不存在: " + codeVersion.getAssetId());
        } else if (TrainingProfileRegistry.isSupported(profile)
                && (codeAsset.getTrainingProfile() == null
                        || !codeAsset.getTrainingProfile().trim().equals(profile))) {
            reasons.add("训练方案与代码资产不匹配：资产 profile=" + codeAsset.getTrainingProfile());
        }

        boolean structureOk = reasons.isEmpty();
        if (structureOk) {
            try {
                List<String> zipEntries = readZipEntryNames(codeVersion.getStoragePath());
                CodeModelZipValidator.validateEntryNames(zipEntries);
                TrainingProfileRegistry.specOf(profile).ifPresent(spec -> {
                    String required = spec.requiredEntryScript();
                    if (required == null || required.isBlank()) {
                        return;
                    }
                    if (!zipEntries.contains(required)) {
                        reasons.add("代码模型包缺少固定入口脚本: " + required);
                    }
                });
            } catch (Exception e) {
                reasons.add(e.getMessage());
            }
        }

        boolean passed = reasons.isEmpty();
        String approvalStatus = codeVersion.getApprovalStatus();
        if (passed) {
            if (!CodeApprovalStatus.isApproved(codeVersion.getApprovalStatus())) {
                codeVersion.setApprovalStatus(CodeApprovalStatus.APPROVED);
                codeVersionRepo.save(codeVersion);
            }
            approvalStatus = CodeApprovalStatus.APPROVED;
        }
        return buildCheckDto(codeVersion.getId(), profile, passed, approvalStatus, reasons, checkedAt);
    }

    private CodeVersionTrainingCheckDto buildCheckDto(
            String codeVersionId,
            String profile,
            boolean passed,
            String approvalStatus,
            List<String> reasons,
            Instant checkedAt
    ) {
        return CodeVersionTrainingCheckDto.builder()
                .codeVersionId(codeVersionId)
                .trainingProfile(profile)
                .trainingProfileDisplayName(TrainingProfileRegistry.displayNameOf(profile))
                .passed(passed)
                .approvalStatus(approvalStatus)
                .reasons(reasons)
                .checkedAt(checkedAt)
                .build();
    }

    private List<String> readZipEntryNames(String objectName) throws Exception {
        List<String> names = new ArrayList<>();
        try (InputStream is = minioClient.getObject(
                GetObjectArgs.builder().bucket(bucket).object(objectName).build()
        );
             ZipInputStream zip = new ZipInputStream(new BufferedInputStream(is))) {
            java.util.zip.ZipEntry entry;
            while ((entry = zip.getNextEntry()) != null) {
                if (!entry.isDirectory()) {
                    names.add(CodeModelZipValidator.normalizeZipEntryName(entry.getName()));
                }
                zip.closeEntry();
            }
        }
        return names;
    }
}
