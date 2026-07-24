package com.tss.platform.service;

import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;

@Service
public class ModelArtifactAttestationService {

    private static final String READY = "READY";
    private static final String DRAFT = "DRAFT";

    private final ModelVersionRepository versionRepo;
    private final ModelAssetRepository assetRepo;
    private final ModelArtifactIntegrityService integrityService;
    private final TransactionTemplate transactionTemplate;

    public ModelArtifactAttestationService(
            ModelVersionRepository versionRepo,
            ModelAssetRepository assetRepo,
            ModelArtifactIntegrityService integrityService,
            PlatformTransactionManager transactionManager
    ) {
        this.versionRepo = versionRepo;
        this.assetRepo = assetRepo;
        this.integrityService = integrityService;
        this.transactionTemplate = new TransactionTemplate(transactionManager);
    }

    public AttestedArtifact attestReady(String versionId) {
        ModelVersion snapshot = versionRepo.findByIdAndDeletedFalse(versionId)
                .orElseThrow(() -> new IllegalArgumentException("model version not found: " + versionId));
        if (!READY.equals(snapshot.getStatus())) {
            throw new IllegalArgumentException("model version is not READY: " + versionId);
        }
        ModelArtifactIntegrityService.Inspection inspection;
        try {
            inspection = integrityService.inspect(
                    snapshot.getStoragePath(),
                    snapshot.getSizeBytes()
            );
        } catch (ModelArtifactException exception) {
            if (!exception.isStorageUnavailable()) {
                invalidate(versionId);
            }
            throw exception;
        }

        AttestedArtifact result = transactionTemplate.execute(status -> {
            ModelVersion current = versionRepo.findByIdAndDeletedFalseForUpdate(versionId)
                    .orElseThrow(() -> new IllegalArgumentException(
                            "model version not found: " + versionId
                    ));
            ModelAsset asset = assetRepo.findByIdAndDeletedFalseForUpdate(current.getAssetId())
                    .orElseThrow(() -> new IllegalArgumentException(
                            "model asset not found: " + current.getAssetId()
                    ));
            if (!READY.equals(current.getStatus())) {
                return AttestedArtifact.failure("model version is not READY");
            }
            if (!snapshot.getStoragePath().equals(current.getStoragePath())
                    || !snapshot.getSizeBytes().equals(current.getSizeBytes())) {
                return AttestedArtifact.failure("model artifact metadata changed during verification");
            }
            if (current.getArtifactSha256() != null
                    && !current.getArtifactSha256().equals(inspection.sha256())) {
                demote(asset, current);
                return AttestedArtifact.failure("model artifact SHA-256 does not match metadata");
            }
            if (current.getArtifactSha256() == null) {
                current.setArtifactSha256(inspection.sha256());
                versionRepo.saveAndFlush(current);
            }
            return AttestedArtifact.success(current, asset, inspection);
        });
        if (result == null || !result.successful()) {
            throw new ModelArtifactException(
                    result == null ? "model artifact attestation failed" : result.error(),
                    false
            );
        }
        return result;
    }

    public void invalidate(String versionId) {
        transactionTemplate.executeWithoutResult(status -> {
            ModelVersion version = versionRepo.findByIdAndDeletedFalseForUpdate(versionId)
                    .orElse(null);
            if (version == null) {
                return;
            }
            ModelAsset asset = assetRepo.findByIdAndDeletedFalseForUpdate(version.getAssetId())
                    .orElse(null);
            if (asset != null) {
                demote(asset, version);
            }
        });
    }

    private void demote(ModelAsset asset, ModelVersion version) {
        version.setStatus(DRAFT);
        version.setPublishedAt(null);
        versionRepo.saveAndFlush(version);
        if (version.getId().equals(asset.getCurrentVersionId())) {
            asset.setCurrentVersionId(null);
            asset.setUpdatedAt(Instant.now());
            assetRepo.saveAndFlush(asset);
        }
    }

    public record AttestedArtifact(
            ModelVersion version,
            ModelAsset asset,
            long sizeBytes,
            String sha256,
            String error
    ) {
        static AttestedArtifact success(
                ModelVersion version,
                ModelAsset asset,
                ModelArtifactIntegrityService.Inspection inspection
        ) {
            return new AttestedArtifact(
                    version,
                    asset,
                    inspection.sizeBytes(),
                    inspection.sha256(),
                    null
            );
        }

        static AttestedArtifact failure(String error) {
            return new AttestedArtifact(null, null, 0, null, error);
        }

        public boolean successful() {
            return error == null;
        }
    }
}
