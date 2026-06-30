package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.config.MinioConfig;
import com.tss.platform.config.TrainingKubernetesProperties;
import com.tss.platform.dto.CreateInferenceTaskRequest;
import com.tss.platform.dto.InferenceTaskDto;
import com.tss.platform.dto.UpdateInferenceResultRequest;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.InferenceScriptVersion;
import com.tss.platform.entity.InferenceTask;
import com.tss.platform.entity.ModelVersion;
import com.tss.platform.inference.InferenceExecutorRouter;
import com.tss.platform.inference.KubernetesInferenceExecutor;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.InferenceScriptAssetRepository;
import com.tss.platform.repository.InferenceScriptVersionRepository;
import com.tss.platform.repository.InferenceTaskRepository;
import com.tss.platform.repository.ModelAssetRepository;
import com.tss.platform.repository.ModelVersionRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.training.TrainingEnvironmentService;
import io.minio.StatObjectResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class InferenceTaskServiceTest {

    private FakeInferenceTaskRepository taskRepo;
    private FakeModelVersionRepository modelVersionRepo;
    private FakeDatasetVersionRepository datasetVersionRepo;
    private FakeScriptService scriptService;
    private FakeExecutorRouter executorRouter;
    private InferenceTaskService service;

    @BeforeEach
    void setUp() {
        taskRepo = new FakeInferenceTaskRepository();
        modelVersionRepo = new FakeModelVersionRepository();
        datasetVersionRepo = new FakeDatasetVersionRepository();
        scriptService = new FakeScriptService();
        executorRouter = new FakeExecutorRouter();

        service = new InferenceTaskService(
                taskRepo.proxy(),
                modelVersionRepo.proxy(),
                emptyProxy(ModelAssetRepository.class),
                datasetVersionRepo.proxy(),
                emptyProxy(DatasetAssetRepository.class),
                scriptService,
                executorRouter,
                new FakeMinioService(),
                new FakeAuthContext(),
                new ObjectMapper()
        );
    }

    @Test
    void createsDatasetInferenceTask() {
        modelVersionRepo.model = modelVersion();
        scriptService.version = scriptVersion();
        datasetVersionRepo.dataset = datasetVersion();

        CreateInferenceTaskRequest req = new CreateInferenceTaskRequest();
        req.setName("batch infer");
        req.setModelVersionId("model-ver-1");
        req.setScriptVersionId("script-ver-1");
        req.setInputMode(InferenceTaskService.INPUT_MODE_DATASET_VERSION);
        req.setDatasetVersionId("dataset-ver-1");
        req.setParams(Map.of("threshold", 0.5));

        InferenceTaskDto dto = service.createTask(req);

        assertEquals("batch infer", dto.getName());
        assertEquals(InferenceTaskService.INPUT_MODE_DATASET_VERSION, dto.getInputMode());
        assertEquals("dataset-ver-1", dto.getDatasetVersionId());
        assertEquals("pending", dto.getStatus());
        assertEquals(dto.getId(), executorRouter.startedTaskId);
    }

    @Test
    void singleObjectRequiresObjectName() {
        modelVersionRepo.model = modelVersion();
        scriptService.version = scriptVersion();

        CreateInferenceTaskRequest req = new CreateInferenceTaskRequest();
        req.setModelVersionId("model-ver-1");
        req.setScriptVersionId("script-ver-1");
        req.setInputMode(InferenceTaskService.INPUT_MODE_SINGLE_OBJECT);

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.createTask(req)
        );
        assertEquals("inputObjectName 不能为空", error.getMessage());
    }

    @Test
    void createsSingleObjectInferenceTask() {
        modelVersionRepo.model = modelVersion();
        scriptService.version = scriptVersion();

        CreateInferenceTaskRequest req = new CreateInferenceTaskRequest();
        req.setModelVersionId("model-ver-1");
        req.setScriptVersionId("script-ver-1");
        req.setInputMode(InferenceTaskService.INPUT_MODE_SINGLE_OBJECT);
        req.setInputObjectName("users/7/files/input.jpg");

        InferenceTaskDto dto = service.createTask(req);

        assertEquals(InferenceTaskService.INPUT_MODE_SINGLE_OBJECT, dto.getInputMode());
        assertEquals("users/7/files/input.jpg", dto.getInputObjectName());
        assertEquals(dto.getId(), executorRouter.startedTaskId);
    }

    @Test
    void internalCallbackUpdatesResult() {
        InferenceTask task = new InferenceTask();
        task.setId("infer-task-1");
        task.setStatus("running");
        task.setProgress(10);
        taskRepo.tasks.put(task.getId(), task);

        UpdateInferenceResultRequest req = new UpdateInferenceResultRequest();
        req.setStatus("success");
        req.setResult(Map.of("count", 3));
        req.setOutputPath("minio://inference-results/infer-task-1/outputs/");
        req.setLogPath("minio://inference-results/infer-task-1/infer.log");

        service.updateResultInternal("infer-task-1", req);

        InferenceTask saved = taskRepo.tasks.get("infer-task-1");
        assertEquals("success", saved.getStatus());
        assertEquals(100, saved.getProgress());
        assertEquals("{\"count\":3}", saved.getResultJson());
        assertEquals("minio://inference-results/infer-task-1/outputs/", saved.getOutputPath());
    }

    private static ModelVersion modelVersion() {
        ModelVersion version = new ModelVersion();
        version.setId("model-ver-1");
        version.setAssetId("model-asset-1");
        version.setStoragePath("users/7/models/model.zip");
        version.setOwnerUserId(7);
        version.setDeleted(false);
        return version;
    }

    private static InferenceScriptVersion scriptVersion() {
        InferenceScriptVersion version = new InferenceScriptVersion();
        version.setId("script-ver-1");
        version.setStoragePath("users/7/inference-scripts/script.zip");
        version.setEntryFile("infer.py");
        version.setRuntime("PYTHON3");
        version.setStatus("READY");
        version.setOwnerUserId(7);
        version.setDeleted(false);
        return version;
    }

    private static DatasetVersion datasetVersion() {
        DatasetVersion version = new DatasetVersion();
        version.setId("dataset-ver-1");
        version.setAssetId("dataset-asset-1");
        version.setStoragePath("users/7/datasets/data.zip");
        version.setStatus("READY");
        version.setOwnerUserId(7);
        version.setDeleted(false);
        return version;
    }

    @SuppressWarnings("unchecked")
    private static <T> T emptyProxy(Class<T> type) {
        return (T) Proxy.newProxyInstance(
                type.getClassLoader(),
                new Class<?>[]{type},
                (proxy, method, args) -> defaultValue(method.getReturnType())
        );
    }

    private static Object defaultValue(Class<?> returnType) {
        if (returnType.equals(boolean.class)) {
            return false;
        }
        if (returnType.equals(int.class) || returnType.equals(long.class)) {
            return 0;
        }
        if (returnType.equals(Optional.class)) {
            return Optional.empty();
        }
        return null;
    }

    private static class FakeInferenceTaskRepository {
        final Map<String, InferenceTask> tasks = new HashMap<>();

        InferenceTaskRepository proxy() {
            return (InferenceTaskRepository) Proxy.newProxyInstance(
                    InferenceTaskRepository.class.getClassLoader(),
                    new Class<?>[]{InferenceTaskRepository.class},
                    (proxy, method, args) -> switch (method.getName()) {
                        case "save" -> {
                            InferenceTask task = (InferenceTask) args[0];
                            tasks.put(task.getId(), task);
                            yield task;
                        }
                        case "findById" -> Optional.ofNullable(tasks.get((String) args[0]));
                        default -> defaultValue(method.getReturnType());
                    }
            );
        }
    }

    private static class FakeModelVersionRepository {
        ModelVersion model;

        ModelVersionRepository proxy() {
            return (ModelVersionRepository) Proxy.newProxyInstance(
                    ModelVersionRepository.class.getClassLoader(),
                    new Class<?>[]{ModelVersionRepository.class},
                    (proxy, method, args) -> {
                        if ("findByIdAndDeletedFalse".equals(method.getName()) && model != null && model.getId().equals(args[0])) {
                            return Optional.of(model);
                        }
                        return defaultValue(method.getReturnType());
                    }
            );
        }
    }

    private static class FakeDatasetVersionRepository {
        DatasetVersion dataset;

        DatasetVersionRepository proxy() {
            return (DatasetVersionRepository) Proxy.newProxyInstance(
                    DatasetVersionRepository.class.getClassLoader(),
                    new Class<?>[]{DatasetVersionRepository.class},
                    (proxy, method, args) -> {
                        if ("findByIdAndDeletedFalse".equals(method.getName()) && dataset != null && dataset.getId().equals(args[0])) {
                            return Optional.of(dataset);
                        }
                        return defaultValue(method.getReturnType());
                    }
            );
        }
    }

    private static class FakeScriptService extends InferenceScriptService {
        InferenceScriptVersion version;

        FakeScriptService() {
            super(
                    emptyProxy(InferenceScriptAssetRepository.class),
                    emptyProxy(InferenceScriptVersionRepository.class),
                    null,
                    null,
                    new FakeAuthContext(),
                    new ObjectMapper()
            );
        }

        @Override
        public InferenceScriptVersion requireAccessibleVersion(String versionId) {
            if (version != null && version.getId().equals(versionId)) {
                return version;
            }
            throw new IllegalArgumentException("推理脚本版本不存在");
        }
    }

    private static class FakeExecutorRouter extends InferenceExecutorRouter {
        String startedTaskId;

        FakeExecutorRouter() {
            super(
                    new TrainingKubernetesProperties(),
                    nullTrainingEnvironmentService(),
                    nullKubernetesInferenceExecutor(),
                    emptyProxy(InferenceTaskRepository.class),
                    null
            );
        }

        @Override
        public void start(String taskId) {
            this.startedTaskId = taskId;
        }
    }

    private static class FakeMinioService extends MinioService {
        FakeMinioService() {
            super(null, new MinioConfig());
        }

        @Override
        public StatObjectResponse stat(String objectName) {
            return null;
        }
    }

    private static class FakeAuthContext extends AuthContext {
        @Override
        public Integer currentUserId() {
            return 7;
        }

        @Override
        public boolean isAdmin() {
            return false;
        }

        @Override
        public void requireOwnerAccess(Integer ownerUserId, String message) {
            if (ownerUserId == null || !ownerUserId.equals(7)) {
                throw new IllegalArgumentException(message);
            }
        }

        @Override
        public String userPrefix(Integer ownerUserId) {
            return "users/" + ownerUserId + "/";
        }
    }

    private static TrainingEnvironmentService nullTrainingEnvironmentService() {
        return null;
    }

    private static KubernetesInferenceExecutor nullKubernetesInferenceExecutor() {
        return null;
    }
}
