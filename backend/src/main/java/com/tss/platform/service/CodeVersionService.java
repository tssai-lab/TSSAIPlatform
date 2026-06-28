package com.tss.platform.service;

import com.tss.platform.dto.CodeVersionApprovalDto;
import com.tss.platform.dto.CodeVersionListItemDto;
import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.model.CodeApprovalStatus;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@Service
public class CodeVersionService {

    private final CodeVersionRepository codeVersionRepo;
    private final CodeAssetRepository codeAssetRepo;
    private final AuthContext authContext;

    public CodeVersionService(
            CodeVersionRepository codeVersionRepo,
            CodeAssetRepository codeAssetRepo,
            AuthContext authContext
    ) {
        this.codeVersionRepo = codeVersionRepo;
        this.codeAssetRepo = codeAssetRepo;
        this.authContext = authContext;
    }

    @Transactional
    public CodeVersionApprovalDto approve(String codeVersionId) {
        if (!authContext.isAdmin()) {
            throw new IllegalArgumentException("仅管理员可审核代码模型版本");
        }
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
            throw new IllegalArgumentException("代码模型版本未审核通过，不能用于训练");
        }
        CodeAsset codeAsset = codeAssetRepo.findByIdAndDeletedFalse(codeVersion.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException("代码资产不存在: " + codeVersion.getAssetId()));
        authContext.requireOwnerAccess(
                codeVersion.getOwnerUserId() != null ? codeVersion.getOwnerUserId() : codeAsset.getOwnerUserId(),
                "code version not found or no permission"
        );
    }
}
