package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.dto.UpdateTrainingResultRequest;
import com.tss.platform.dto.UpdateHyperParamsRequest;
import com.tss.platform.entity.TrainingExperimentVersion;
import com.tss.platform.repository.CodeAssetRepository;
import com.tss.platform.repository.CodeVersionRepository;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.repository.TrainingExperimentVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.training.TrainingExecutorRouter;
import com.tss.platform.training.TrainingFailureDiagnosticService;
import com.tss.platform.training.plan.TrainingOutputValidator;
import com.tss.platform.training.plan.TrainingRunSpecFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TrainingExperimentServiceApplyResultTest {

    private TrainingExperimentVersionRepository repo;
    private TrainingExperimentService service;
    private AuthContext authContext;
    private TrainingFailureDiagnosticService failureDiagnosticService;

    @BeforeEach
    void setUp() {
        repo = mock(TrainingExperimentVersionRepository.class);
        authContext = mock(AuthContext.class);
        failureDiagnosticService = mock(TrainingFailureDiagnosticService.class);
        doNothing().when(authContext).requireOwnerAccess(anyInt(), anyString());
        service = new TrainingExperimentService(
                repo,
                mock(ModelVersionRepository.class),
                mock(ModelAssetRepository.class),
                mock(ModelArtifactAttestationService.class),
                mock(DatasetVersionRepository.class),
                mock(DatasetAssetRepository.class),
                mock(CodeVersionRepository.class),
                mock(CodeAssetRepository.class),
                mock(CodeVersionService.class),
                mock(TrainingRunSpecFactory.class),
                mock(TrainingOutputValidator.class),
                mock(TrainingExecutorRouter.class),
                mock(JobScheduler.class),
                new org.springframework.transaction.support.TransactionTemplate(
                        mock(org.springframework.transaction.PlatformTransactionManager.class)),
                new ObjectMapper(),
                authContext,
                mock(MlflowTrackingService.class),
                failureDiagnosticService
        );
    }

    @Test
    void updateResultInternalKeepsProgressMonotonic() {
        TrainingExperimentVersion version = runningVersion("train-1", 50);
        when(repo.findById("train-1")).thenReturn(Optional.of(version));
        when(repo.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        UpdateTrainingResultRequest req = new UpdateTrainingResultRequest();
        req.setStatus("running");
        req.setProgress(30);

        service.updateResultInternal("train-1", req);

        assertEquals(50, version.getProgress());
    }

    @Test
    void updateResultInternalSetsProgressTo100OnSuccess() {
        TrainingExperimentVersion version = runningVersion("train-2", 80);
        when(repo.findById("train-2")).thenReturn(Optional.of(version));
        when(repo.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        UpdateTrainingResultRequest req = new UpdateTrainingResultRequest();
        req.setStatus("success");
        req.setProgress(95);

        service.updateResultInternal("train-2", req);

        assertEquals(100, version.getProgress());
    }

    @Test
    void updateResultInternalDoesNotOverwriteUserRemark() {
        TrainingExperimentVersion version = runningVersion("train-remark", 80);
        version.setRemark("用户填写的验收说明");
        when(repo.findById("train-remark")).thenReturn(Optional.of(version));
        when(repo.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        UpdateTrainingResultRequest req = new UpdateTrainingResultRequest();
        req.setStatus("running");
        req.setRemark("trainingOutput=minio://internal/path.json");

        service.updateResultInternal("train-remark", req);

        assertEquals("用户填写的验收说明", version.getRemark());
    }

    @Test
    void submittedTaskAllowsRemarkUpdateWithoutChangingHyperParams() {
        TrainingExperimentVersion version = runningVersion("train-submitted", 100);
        version.setExperimentId("exp-submitted");
        version.setRunSpecJson("{}");
        version.setHyperParamsJson("{\"epochs\":1,\"batchSize\":4}");
        version.setRemark("旧备注");
        when(repo.findByExperimentIdAndVersionNo("exp-submitted", 1))
                .thenReturn(Optional.of(version));
        when(repo.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        UpdateHyperParamsRequest req = new UpdateHyperParamsRequest();
        req.setHyperParams(java.util.Map.of("batchSize", 4, "epochs", 1));
        req.setRemark("恢复后的用户备注");

        service.updateHyperParams("exp-submitted", 1, req);

        assertEquals("{\"epochs\":1,\"batchSize\":4}", version.getHyperParamsJson());
        assertEquals("恢复后的用户备注", version.getRemark());
    }

    @Test
    void submittedTaskStillRejectsHyperParamChanges() {
        TrainingExperimentVersion version = runningVersion("train-immutable", 100);
        version.setExperimentId("exp-immutable");
        version.setRunSpecJson("{}");
        version.setHyperParamsJson("{\"epochs\":1}");
        when(repo.findByExperimentIdAndVersionNo("exp-immutable", 1))
                .thenReturn(Optional.of(version));

        UpdateHyperParamsRequest req = new UpdateHyperParamsRequest();
        req.setHyperParams(java.util.Map.of("epochs", 2));
        req.setRemark("只想改备注");

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.updateHyperParams("exp-immutable", 1, req)
        );

        assertEquals("任务提交后参数快照不可修改，只能修改备注", error.getMessage());
        assertEquals("{\"epochs\":1}", version.getHyperParamsJson());
    }

    @Test
    void stopTrainingPreservesExistingProgress() {
        TrainingExperimentVersion version = runningVersion("train-3", 42);
        when(repo.findById("train-3")).thenReturn(Optional.of(version));
        when(repo.save(any())).thenAnswer(invocation -> invocation.getArgument(0));

        service.stopTraining("train-3");

        assertEquals("stopped", version.getStatus());
        assertEquals(42, version.getProgress());
    }

    @Test
    void deletingExperimentQueuesItsFailureDiagnostics() {
        TrainingExperimentVersion version = runningVersion("train-delete", 42);
        version.setOwnerUserId(7);
        version.setLogPath(
                "minio://users/7/training-failure-diagnostics/train-delete/failure.log"
        );
        when(repo.findById("train-delete")).thenReturn(Optional.of(version));
        when(repo.findByExperimentIdOrderByVersionNoAsc("exp-1")).thenReturn(java.util.List.of(version));

        service.deleteExperiment("train-delete");

        verify(failureDiagnosticService).enqueueDeletion(version);
        verify(repo).deleteByExperimentId("exp-1");
    }

    private static TrainingExperimentVersion runningVersion(String id, int progress) {
        TrainingExperimentVersion version = new TrainingExperimentVersion();
        version.setId(id);
        version.setExperimentId("exp-1");
        version.setVersionNo(1);
        version.setStatus("running");
        version.setProgress(progress);
        return version;
    }
}
