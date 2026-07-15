package com.tss.platform.service;

import com.tss.platform.dto.v2.V2CodeAssetCreateRequest;
import com.tss.platform.dto.v2.V2CodeAssetDto;
import com.tss.platform.dto.v2.V2CodeAssetPatchRequest;
import com.tss.platform.dto.v2.V2CodeWorkspaceDto;
import com.tss.platform.dto.v2.V2CodeWorkspaceOpenRequest;
import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeWorkspace;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.repository.CodeWorkspaceRepository;
import com.tss.platform.security.AuthContext;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;
import java.util.UUID;

/** Owner-scoped V2 facade for code assets and their single open workspace. */
@Service
public class V2CodeAssetService {

    private final CodeAssetRepository assetRepository;
    private final CodeVersionRepository versionRepository;
    private final CodeWorkspaceRepository workspaceRepository;
    private final CodeWorkspaceService workspaceService;
    private final CodeAssetReferenceChecker referenceChecker;
    private final CodeAssetAuditService auditService;
    private final CodePathPolicy pathPolicy;
    private final AuthContext authContext;

    public V2CodeAssetService(
            CodeAssetRepository assetRepository,
            CodeVersionRepository versionRepository,
            CodeWorkspaceRepository workspaceRepository,
            CodeWorkspaceService workspaceService,
            CodeAssetReferenceChecker referenceChecker,
            CodeAssetAuditService auditService,
            CodePathPolicy pathPolicy,
            AuthContext authContext
    ) {
        this.assetRepository = assetRepository;
        this.versionRepository = versionRepository;
        this.workspaceRepository = workspaceRepository;
        this.workspaceService = workspaceService;
        this.referenceChecker = referenceChecker;
        this.auditService = auditService;
        this.pathPolicy = pathPolicy;
        this.authContext = authContext;
    }

    @Transactional
    public V2CodeAssetDto create(V2CodeAssetCreateRequest request) {
        if (request == null) {
            throw invalid("INVALID_REQUEST", "Code asset request is required");
        }
        Integer ownerUserId = currentUserId();
        Instant now = Instant.now();
        CodeAsset asset = new CodeAsset();
        asset.setId("code-asset-" + compactUuid());
        asset.setName(required(request.name(), "name", 255));
        asset.setTrainingProfile(optional(request.trainingProfile(), "trainingProfile", 128));
        asset.setPurpose(optional(request.purpose(), "purpose", 1024));
        asset.setRuntime(optional(request.runtime(), "runtime", 128));
        asset.setEntryScript(optionalPath(request.entryScript()));
        asset.setTrainingType(optional(request.trainingType(), "trainingType", 128));
        asset.setRemark(optional(request.remark(), "remark", 1024));
        asset.setOwnerUserId(ownerUserId);
        asset.setCreatedAt(now);
        asset.setUpdatedAt(now);
        asset.setDeleted(false);
        CodeAsset saved = assetRepository.saveAndFlush(asset);
        auditService.assetCreated(saved.getId(), revision(saved));
        return toDto(saved, false);
    }

    @Transactional(readOnly = true)
    public List<V2CodeAssetDto> list() {
        Integer ownerUserId = currentUserId();
        return assetRepository.findByOwnerUserIdAndDeletedFalseOrderByCreatedAtDesc(ownerUserId)
                .stream()
                .filter(asset -> Objects.equals(ownerUserId, asset.getOwnerUserId()))
                .map(asset -> toDto(
                        asset,
                        workspaceRepository.findOpenByAssetId(asset.getId()).isPresent()
                ))
                .toList();
    }

    @Transactional(readOnly = true)
    public V2CodeAssetDto get(String assetId) {
        CodeAsset asset = requireOwnedAsset(assetId, false);
        return toDto(asset, workspaceRepository.findOpenByAssetId(asset.getId()).isPresent());
    }

    @Transactional
    public V2CodeAssetDto patch(String assetId, V2CodeAssetPatchRequest request) {
        CodeAsset asset = requireOwnedAsset(assetId, true);
        if (request == null || request.getAssetRevision() == null
                || request.getAssetRevision() < 0) {
            throw invalid("ASSET_REVISION_REQUIRED", "assetRevision is required");
        }
        if (revision(asset) != request.getAssetRevision()) {
            throw conflict("ASSET_REVISION_CONFLICT", "Code asset revision is stale");
        }
        String normalizedTrainingProfile = asset.getTrainingProfile();
        boolean trainingProfileChanged = false;
        if (request.isTrainingProfilePresent()) {
            normalizedTrainingProfile = optional(
                    request.getTrainingProfile(), "trainingProfile", 128
            );
            trainingProfileChanged = !Objects.equals(
                    asset.getTrainingProfile(), normalizedTrainingProfile
            );
            if (trainingProfileChanged
                    && versionRepository.existsByAssetIdAndDeletedFalse(asset.getId())) {
                throw conflict(
                        "TRAINING_PROFILE_IMMUTABLE",
                        "Code asset training profile is immutable after the first version"
                );
            }
        }
        if (request.isNamePresent()) {
            asset.setName(required(request.getName(), "name", 255));
        }
        if (trainingProfileChanged) {
            asset.setTrainingProfile(normalizedTrainingProfile);
        }
        if (request.isPurposePresent()) {
            asset.setPurpose(optional(request.getPurpose(), "purpose", 1024));
        }
        if (request.isRuntimePresent()) {
            asset.setRuntime(optional(request.getRuntime(), "runtime", 128));
        }
        if (request.isEntryScriptPresent()) {
            asset.setEntryScript(optionalPath(request.getEntryScript()));
        }
        if (request.isTrainingTypePresent()) {
            asset.setTrainingType(optional(request.getTrainingType(), "trainingType", 128));
        }
        if (request.isRemarkPresent()) {
            asset.setRemark(optional(request.getRemark(), "remark", 1024));
        }
        if (trainingProfileChanged || hasNonProfileChanges(request)) {
            asset.setUpdatedAt(Instant.now());
            asset = assetRepository.saveAndFlush(asset);
            auditService.assetUpdated(asset.getId(), revision(asset));
        }
        return toDto(asset, workspaceRepository.findOpenByAssetId(asset.getId()).isPresent());
    }

    @Transactional
    public void delete(String assetId, long expectedAssetRevision) {
        CodeAsset asset = requireOwnedAsset(assetId, true);
        if (expectedAssetRevision < 0 || revision(asset) != expectedAssetRevision) {
            throw conflict("ASSET_REVISION_CONFLICT", "Code asset revision is stale");
        }
        if (workspaceRepository.findOpenByAssetId(asset.getId()).isPresent()) {
            throw conflict("OPEN_WORKSPACE_EXISTS", "Code asset has an open workspace");
        }
        if (referenceChecker.hasReferences(asset.getId())) {
            throw conflict("CODE_ASSET_IN_USE", "Code asset is referenced by another module");
        }

        Instant now = Instant.now();
        asset.setDeleted(true);
        asset.setDeletedAt(now);
        asset.setUpdatedAt(now);
        CodeAsset saved = assetRepository.saveAndFlush(asset);
        auditService.assetDeleted(saved.getId(), revision(saved));
    }

    @Transactional(readOnly = true)
    public List<V2CodeWorkspaceDto> openWorkspaces(String assetId) {
        CodeAsset asset = requireOwnedAsset(assetId, false);
        return workspaceRepository.findOpenByAssetId(asset.getId())
                .filter(workspace -> identityMatches(asset, workspace))
                .map(workspace -> List.of(toWorkspaceDto(workspace)))
                .orElseGet(List::of);
    }

    public V2CodeWorkspaceDto openWorkspace(
            String assetId,
            V2CodeWorkspaceOpenRequest request
    ) {
        requireOwnedAsset(assetId, false);
        String baseVersionId = request == null ? null : request.baseVersionId();
        return toWorkspaceDto(workspaceService.open(assetId, baseVersionId));
    }

    @Transactional(readOnly = true)
    public V2CodeWorkspaceDto requireOwnedWorkspace(String workspaceId) {
        String assetId = workspaceRepository.findAssetIdByIdAndDeletedFalse(workspaceId)
                .orElseThrow(CodeAssetAccessException::new);
        CodeAsset asset = requireOwnedAsset(assetId, false);
        CodeWorkspace workspace = workspaceRepository.findByIdAndDeletedFalse(workspaceId)
                .orElseThrow(CodeAssetAccessException::new);
        if (!identityMatches(asset, workspace)) {
            throw new CodeAssetAccessException();
        }
        return toWorkspaceDto(workspace);
    }

    public V2CodeWorkspaceDto abandonWorkspace(String workspaceId, long expectedRevision) {
        requireOwnedWorkspace(workspaceId);
        return toWorkspaceDto(workspaceService.abandon(workspaceId, expectedRevision));
    }

    private CodeAsset requireOwnedAsset(String assetId, boolean lock) {
        CodeAsset asset = (lock
                ? assetRepository.findByIdAndDeletedFalseForUpdate(assetId)
                : assetRepository.findByIdAndDeletedFalse(assetId))
                .orElseThrow(CodeAssetAccessException::new);
        Integer currentUserId = currentUserId();
        if (asset.getOwnerUserId() == null
                || !asset.getOwnerUserId().equals(currentUserId)) {
            throw new CodeAssetAccessException();
        }
        return asset;
    }

    private String optionalPath(String value) {
        String normalized = optional(value, "entryScript", 1024);
        return normalized == null ? null : pathPolicy.normalizeFilePath(normalized);
    }

    private static boolean hasNonProfileChanges(V2CodeAssetPatchRequest request) {
        return request.isNamePresent()
                || request.isPurposePresent()
                || request.isRuntimePresent()
                || request.isEntryScriptPresent()
                || request.isTrainingTypePresent()
                || request.isRemarkPresent();
    }

    private Integer currentUserId() {
        Integer currentUserId;
        try {
            currentUserId = authContext.currentUserId();
        } catch (RuntimeException exception) {
            throw new CodeAssetAccessException();
        }
        if (currentUserId == null) {
            throw new CodeAssetAccessException();
        }
        return currentUserId;
    }

    private static V2CodeAssetDto toDto(CodeAsset asset, boolean hasOpenWorkspace) {
        return new V2CodeAssetDto(
                asset.getId(),
                asset.getName(),
                asset.getTrainingProfile(),
                asset.getPurpose(),
                asset.getRuntime(),
                asset.getEntryScript(),
                asset.getTrainingType(),
                asset.getRemark(),
                revision(asset),
                asset.getCreatedAt(),
                asset.getUpdatedAt(),
                hasOpenWorkspace
        );
    }

    public static V2CodeWorkspaceDto toWorkspaceDto(CodeWorkspace workspace) {
        boolean readOnly = !CodeWorkspace.STATUS_OPEN.equals(workspace.getStatus());
        return new V2CodeWorkspaceDto(
                workspace.getId(),
                workspace.getAssetId(),
                workspace.getBaseVersionId(),
                workspace.getClosedVersionId(),
                workspace.getStatus(),
                workspace.getRevision() == null ? 0 : workspace.getRevision(),
                workspace.getCreatedAt(),
                workspace.getUpdatedAt(),
                workspace.getClosedAt(),
                readOnly
        );
    }

    private static boolean identityMatches(CodeAsset asset, CodeWorkspace workspace) {
        return Objects.equals(asset.getId(), workspace.getAssetId())
                && Objects.equals(asset.getOwnerUserId(), workspace.getOwnerUserId());
    }

    private static long revision(CodeAsset asset) {
        return asset.getRowVersion() == null ? 0L : asset.getRowVersion();
    }

    private static String required(String value, String field, int maxLength) {
        String normalized = optional(value, field, maxLength);
        if (normalized == null) {
            throw invalid("INVALID_" + field.toUpperCase(), field + " is required");
        }
        return normalized;
    }

    private static String optional(String value, String field, int maxLength) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            return null;
        }
        if (normalized.length() > maxLength) {
            throw invalid("INVALID_" + field.toUpperCase(), field + " is too long");
        }
        return normalized;
    }

    private static String compactUuid() {
        return UUID.randomUUID().toString().replace("-", "");
    }

    private static CodeValidationException invalid(String code, String message) {
        return new CodeValidationException(code, message);
    }

    private static CodeWorkspaceConflictException conflict(String code, String message) {
        return new CodeWorkspaceConflictException(code, message);
    }
}
