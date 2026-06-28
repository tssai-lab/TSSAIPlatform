package com.tss.platform.service;

import com.tss.platform.dto.CodeVersionApprovalDto;
import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.model.CodeApprovalStatus;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

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
            throw new IllegalArgumentException("仅管理员可审核代码版本");
        }
        CodeVersion codeVersion = codeVersionRepo.findByIdAndDeletedFalse(codeVersionId.trim())
                .orElseThrow(() -> new IllegalArgumentException("代码版本不存在: " + codeVersionId));
        if (!"READY".equals(codeVersion.getStatus())) {
            throw new IllegalArgumentException("代码版本必须为 READY 状态才能审核");
        }
        codeVersion.setApprovalStatus(CodeApprovalStatus.APPROVED);
        codeVersionRepo.save(codeVersion);
        return CodeVersionApprovalDto.builder()
                .codeVersionId(codeVersion.getId())
                .approvalStatus(codeVersion.getApprovalStatus())
                .build();
    }

    @Transactional(readOnly = true)
    public void requireApprovedForTraining(String codeVersionId) {
        CodeVersion codeVersion = codeVersionRepo.findByIdAndDeletedFalse(codeVersionId.trim())
                .orElseThrow(() -> new IllegalArgumentException("代码版本不存在: " + codeVersionId));
        if (!"READY".equals(codeVersion.getStatus())) {
            throw new IllegalArgumentException("代码版本必须为 READY 状态");
        }
        if (codeVersion.getStoragePath() == null || codeVersion.getStoragePath().isBlank()) {
            throw new IllegalArgumentException("代码版本缺少 storagePath");
        }
        if (!CodeApprovalStatus.isApproved(codeVersion.getApprovalStatus())) {
            throw new IllegalArgumentException("代码版本未审核通过，不能用于训练");
        }
        CodeAsset codeAsset = codeAssetRepo.findByIdAndDeletedFalse(codeVersion.getAssetId())
                .orElseThrow(() -> new IllegalArgumentException("代码资产不存在: " + codeVersion.getAssetId()));
        authContext.requireOwnerAccess(
                codeVersion.getOwnerUserId() != null ? codeVersion.getOwnerUserId() : codeAsset.getOwnerUserId(),
                "code version not found or no permission"
        );
    }
}
