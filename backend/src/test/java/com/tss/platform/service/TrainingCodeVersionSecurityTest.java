package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.dto.CreateTrainingExperimentRequest;
import com.tss.platform.entity.CodeAsset;
import com.tss.platform.entity.CodeVersion;
import com.tss.platform.entity.ModelAsset;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.model.CodeApprovalStatus;
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
import io.minio.MinioClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class TrainingCodeVersionSecurityTest {

    private CodeVersionRepository codeVersionRepo;
    private CodeAssetRepository codeAssetRepo;
    private CodeVersionService codeVersionService;
    private AuthContext authContext;

    private TrainingExperimentService trainingExperimentService;
    private DatasetVersionRepository datasetVersionRepo;
    private DatasetAssetRepository datasetAssetRepo;
    private ModelVersionRepository modelVersionRepo;
    private ModelAssetRepository modelAssetRepo;

    @BeforeEach
    void setUp() {
        codeVersionRepo = mock(CodeVersionRepository.class);
        codeAssetRepo = mock(CodeAssetRepository.class);
        authContext = mock(AuthContext.class);
        MinioClient minioClient = mock(MinioClient.class);
        com.tss.platform.config.MinioConfig minioConfig = mock(com.tss.platform.config.MinioConfig.class);
        when(minioConfig.getBucket()).thenReturn("test-bucket");
        codeVersionService = new CodeVersionService(codeVersionRepo, codeAssetRepo, authContext, minioClient, minioConfig);

        datasetVersionRepo = mock(DatasetVersionRepository.class);
        datasetAssetRepo = mock(DatasetAssetRepository.class);
        modelVersionRepo = mock(ModelVersionRepository.class);
        modelAssetRepo = mock(ModelAssetRepository.class);
        trainingExperimentService = new TrainingExperimentService(
                mock(TrainingExperimentVersionRepository.class),
                modelVersionRepo,
                modelAssetRepo,
                datasetVersionRepo,
                datasetAssetRepo,
                codeVersionRepo,
                codeAssetRepo,
                codeVersionService,
                mock(TrainingExecutorRouter.class),
                new ObjectMapper(),
                authContext
        );

        doNothing().when(authContext).requireOwnerAccess(anyInt(), org.mockito.ArgumentMatchers.anyString());
        when(authContext.currentUserId()).thenReturn(1);
    }

    @Test
    void pendingCodeVersionRejectedForTraining() {
        CodeVersion pending = readyCodeVersion("code-ver-pending", CodeApprovalStatus.PENDING);
        when(codeVersionRepo.findByIdAndDeletedFalse(pending.getId())).thenReturn(Optional.of(pending));
        when(codeAssetRepo.findByIdAndDeletedFalse(pending.getAssetId())).thenReturn(Optional.of(codeAsset("asset-1")));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> codeVersionService.requireApprovedForTraining(pending.getId())
        );
        assertEquals("训练代码版本未通过准入校验，不能用于训练", error.getMessage());
    }

    @Test
    void approvedCodeVersionPassesApprovalCheck() {
        CodeVersion approved = readyCodeVersion("code-ver-approved", CodeApprovalStatus.APPROVED);
        when(codeVersionRepo.findByIdAndDeletedFalse(approved.getId())).thenReturn(Optional.of(approved));
        when(codeAssetRepo.findByIdAndDeletedFalse(approved.getAssetId())).thenReturn(Optional.of(codeAsset("asset-1")));

        assertDoesNotThrow(() -> codeVersionService.requireApprovedForTraining(approved.getId()));
    }

    @Test
    void missingCodeVersionRejectedForTraining() {
        when(codeVersionRepo.findByIdAndDeletedFalse("missing-code")).thenReturn(Optional.empty());

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> codeVersionService.requireApprovedForTraining("missing-code")
        );
        assertEquals("训练代码版本不存在: missing-code", error.getMessage());
    }

    @Test
    void missingBaseModelVersionRejectedOnCreateExperiment() {
        CodeVersion approved = readyCodeVersion("code-ver-approved", CodeApprovalStatus.APPROVED);
        CodeAsset asset = codeAsset("asset-1");
        asset.setTrainingProfile(TrainingProfileRegistry.IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG);
        when(codeVersionRepo.findByIdAndDeletedFalse(approved.getId())).thenReturn(Optional.of(approved));
        when(codeAssetRepo.findByIdAndDeletedFalse(approved.getAssetId())).thenReturn(Optional.of(asset));

        CreateTrainingExperimentRequest req = new CreateTrainingExperimentRequest();
        req.setCodeVersionId(approved.getId());
        req.setDatasetVersionId("dataset-ver-1");
        req.setTrainingProfile(TrainingProfileRegistry.IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG);
        req.setHyperParams(java.util.Map.of());

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> trainingExperimentService.createExperiment(req)
        );
        assertEquals("baseModelVersionId 不能为空", error.getMessage());
    }

    @Test
    void conflictingBaseAndLegacyModelVersionRejected() {
        CreateTrainingExperimentRequest req = new CreateTrainingExperimentRequest();
        req.setCodeVersionId("code-ver-approved");
        req.setDatasetVersionId("dataset-ver-1");
        req.setTrainingProfile(TrainingProfileRegistry.IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG);
        req.setBaseModelVersionId("model-ver-a");
        req.setModelVersionId("model-ver-b");
        req.setHyperParams(java.util.Map.of());

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> trainingExperimentService.createExperiment(req)
        );
        assertEquals("baseModelVersionId 与 modelVersionId 不一致", error.getMessage());
    }

    @Test
    void trainingProfileMismatchRejectedOnCreateExperiment() {
        CodeVersion approved = readyCodeVersion("code-ver-approved", CodeApprovalStatus.APPROVED);
        CodeAsset asset = codeAsset("asset-1");
        asset.setTrainingProfile("other_profile");
        ModelVersion modelVersion = readyModelVersion("model-ver-1");
        when(codeVersionRepo.findByIdAndDeletedFalse(approved.getId())).thenReturn(Optional.of(approved));
        when(codeAssetRepo.findByIdAndDeletedFalse(approved.getAssetId())).thenReturn(Optional.of(asset));
        when(modelVersionRepo.findByIdAndDeletedFalse(modelVersion.getId())).thenReturn(Optional.of(modelVersion));
        when(modelAssetRepo.findByIdAndDeletedFalse(modelVersion.getAssetId())).thenReturn(Optional.of(modelAsset()));

        CreateTrainingExperimentRequest req = new CreateTrainingExperimentRequest();
        req.setCodeVersionId(approved.getId());
        req.setDatasetVersionId("dataset-ver-1");
        req.setBaseModelVersionId(modelVersion.getId());
        req.setTrainingProfile(TrainingProfileRegistry.IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG);
        req.setHyperParams(java.util.Map.of());

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> trainingExperimentService.createExperiment(req)
        );
        assertEquals("trainingProfile 与代码资产不匹配", error.getMessage());
    }

    @Test
    void missingDatasetVersionRejectedOnCreateExperiment() {
        CodeVersion approved = readyCodeVersion("code-ver-approved", CodeApprovalStatus.APPROVED);
        CodeAsset asset = codeAsset("asset-1");
        asset.setTrainingProfile(TrainingProfileRegistry.IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG);
        ModelVersion modelVersion = readyModelVersion("model-ver-1");
        when(codeVersionRepo.findByIdAndDeletedFalse(approved.getId())).thenReturn(Optional.of(approved));
        when(codeAssetRepo.findByIdAndDeletedFalse(approved.getAssetId())).thenReturn(Optional.of(asset));
        when(modelVersionRepo.findByIdAndDeletedFalse(modelVersion.getId())).thenReturn(Optional.of(modelVersion));
        when(modelAssetRepo.findByIdAndDeletedFalse(modelVersion.getAssetId())).thenReturn(Optional.of(modelAsset()));
        when(datasetVersionRepo.findByIdAndDeletedFalse("missing-dataset")).thenReturn(Optional.empty());

        CreateTrainingExperimentRequest req = new CreateTrainingExperimentRequest();
        req.setCodeVersionId(approved.getId());
        req.setDatasetVersionId("missing-dataset");
        req.setBaseModelVersionId(modelVersion.getId());
        req.setTrainingProfile(TrainingProfileRegistry.IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG);
        req.setHyperParams(java.util.Map.of());

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> trainingExperimentService.createExperiment(req)
        );
        assertEquals("数据集版本不存在: missing-dataset", error.getMessage());
    }

    private static CodeVersion readyCodeVersion(String id, String approvalStatus) {
        CodeVersion version = new CodeVersion();
        version.setId(id);
        version.setAssetId("asset-1");
        version.setStatus("READY");
        version.setApprovalStatus(approvalStatus);
        version.setStoragePath("users/1/codes/asset-1/v1/code.zip");
        version.setOwnerUserId(1);
        version.setDeleted(false);
        return version;
    }

    private static CodeAsset codeAsset(String id) {
        CodeAsset asset = new CodeAsset();
        asset.setId(id);
        asset.setOwnerUserId(1);
        asset.setDeleted(false);
        return asset;
    }

    private static ModelVersion readyModelVersion(String id) {
        ModelVersion version = new ModelVersion();
        version.setId(id);
        version.setAssetId("model-asset-1");
        version.setStoragePath("users/1/models/model-asset-1/v1/weights.zip");
        version.setOwnerUserId(1);
        version.setDeleted(false);
        return version;
    }

    private static ModelAsset modelAsset() {
        ModelAsset asset = new ModelAsset();
        asset.setId("model-asset-1");
        asset.setOwnerUserId(1);
        asset.setDeleted(false);
        return asset;
    }
}
