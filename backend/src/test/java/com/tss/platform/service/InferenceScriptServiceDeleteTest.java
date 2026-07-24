package com.tss.platform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tss.platform.config.MinioConfig;
import com.tss.platform.entity.InferenceScriptAsset;
import com.tss.platform.entity.InferenceScriptVersion;
import com.tss.platform.entity.MinioDeleteTask;
import com.tss.platform.repository.InferenceScriptAssetRepository;
import com.tss.platform.repository.InferenceScriptVersionRepository;
import com.tss.platform.repository.InferenceTaskRepository;
import com.tss.platform.repository.MinioDeleteTaskRepository;
import com.tss.platform.security.AuthContext;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.SimpleTransactionStatus;

import java.lang.reflect.Proxy;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InferenceScriptServiceDeleteTest {

    private FakeScriptAssetRepository assetRepo;
    private FakeScriptVersionRepository versionRepo;
    private FakeTaskRepository taskRepo;
    private FakeMinioDeleteTaskService minioDeleteTaskService;
    private InferenceScriptService service;

    @BeforeEach
    void setUp() {
        assetRepo = new FakeScriptAssetRepository();
        versionRepo = new FakeScriptVersionRepository();
        taskRepo = new FakeTaskRepository();
        minioDeleteTaskService = new FakeMinioDeleteTaskService();
        service = new InferenceScriptService(
                assetRepo.proxy(),
                versionRepo.proxy(),
                taskRepo.proxy(),
                new FakeMinioService(),
                minioDeleteTaskService,
                new FakeAuthContext(),
                new ObjectMapper()
        );
    }

    @Test
    void deleteRejectsReferencedScriptVersion() {
        InferenceScriptVersion version = scriptVersion("infer-script-ver-1", "infer-script-asset-1");
        versionRepo.versions.put(version.getId(), version);
        assetRepo.assets.put(version.getAssetId(), scriptAsset(version.getAssetId()));
        taskRepo.referenceCount = 1;

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> service.deleteScriptVersion(version.getId())
        );

        assertEquals("推理脚本版本已被推理任务引用，不能删除", error.getMessage());
        assertFalse(version.getDeleted());
        assertEquals(List.of(), minioDeleteTaskService.queuedObjectNames);
    }

    @Test
    void deleteSoftDeletesScriptVersionAndLastAssetThenQueuesZipCleanup() {
        InferenceScriptVersion version = scriptVersion("infer-script-ver-1", "infer-script-asset-1");
        InferenceScriptAsset asset = scriptAsset(version.getAssetId());
        versionRepo.versions.put(version.getId(), version);
        assetRepo.assets.put(asset.getId(), asset);

        Map<String, Object> result = service.deleteScriptVersion(version.getId());

        assertEquals(true, result.get("deleted"));
        assertEquals(true, result.get("assetDeleted"));
        assertTrue(version.getDeleted());
        assertTrue(asset.getDeleted());
        assertEquals(List.of("users/7/inference-scripts/infer-script-asset-1/v1/script.zip"), minioDeleteTaskService.queuedObjectNames);
    }

    private static InferenceScriptAsset scriptAsset(String id) {
        InferenceScriptAsset asset = new InferenceScriptAsset();
        asset.setId(id);
        asset.setName("script");
        asset.setOwnerUserId(7);
        asset.setCreatedAt(Instant.now());
        asset.setUpdatedAt(Instant.now());
        asset.setDeleted(false);
        return asset;
    }

    private static InferenceScriptVersion scriptVersion(String id, String assetId) {
        InferenceScriptVersion version = new InferenceScriptVersion();
        version.setId(id);
        version.setAssetId(assetId);
        version.setVersion("v1");
        version.setStoragePath("users/7/inference-scripts/" + assetId + "/v1/script.zip");
        version.setRuntime("PYTHON3");
        version.setEntryFile("infer.py");
        version.setStatus("READY");
        version.setOwnerUserId(7);
        version.setCreatedAt(Instant.now());
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
        if (returnType.equals(int.class)) {
            return 0;
        }
        if (returnType.equals(long.class)) {
            return 0L;
        }
        if (returnType.equals(Optional.class)) {
            return Optional.empty();
        }
        return null;
    }

    private static class FakeScriptAssetRepository {
        final Map<String, InferenceScriptAsset> assets = new HashMap<>();

        InferenceScriptAssetRepository proxy() {
            return (InferenceScriptAssetRepository) Proxy.newProxyInstance(
                    InferenceScriptAssetRepository.class.getClassLoader(),
                    new Class<?>[]{InferenceScriptAssetRepository.class},
                    (proxy, method, args) -> switch (method.getName()) {
                        case "findByIdAndDeletedFalse" -> Optional.ofNullable(assets.get((String) args[0]))
                                .filter(asset -> Boolean.FALSE.equals(asset.getDeleted()));
                        case "save" -> {
                            InferenceScriptAsset asset = (InferenceScriptAsset) args[0];
                            assets.put(asset.getId(), asset);
                            yield asset;
                        }
                        default -> defaultValue(method.getReturnType());
                    }
            );
        }
    }

    private static class FakeScriptVersionRepository {
        final Map<String, InferenceScriptVersion> versions = new HashMap<>();

        InferenceScriptVersionRepository proxy() {
            return (InferenceScriptVersionRepository) Proxy.newProxyInstance(
                    InferenceScriptVersionRepository.class.getClassLoader(),
                    new Class<?>[]{InferenceScriptVersionRepository.class},
                    (proxy, method, args) -> switch (method.getName()) {
                        case "findByIdAndDeletedFalse" -> Optional.ofNullable(versions.get((String) args[0]))
                                .filter(version -> Boolean.FALSE.equals(version.getDeleted()));
                        case "save" -> {
                            InferenceScriptVersion version = (InferenceScriptVersion) args[0];
                            versions.put(version.getId(), version);
                            yield version;
                        }
                        case "countByAssetIdAndDeletedFalse" -> versions.values()
                                .stream()
                                .filter(version -> args[0].equals(version.getAssetId()))
                                .filter(version -> Boolean.FALSE.equals(version.getDeleted()))
                                .count();
                        default -> defaultValue(method.getReturnType());
                    }
            );
        }
    }

    private static class FakeTaskRepository {
        long referenceCount;

        InferenceTaskRepository proxy() {
            return (InferenceTaskRepository) Proxy.newProxyInstance(
                    InferenceTaskRepository.class.getClassLoader(),
                    new Class<?>[]{InferenceTaskRepository.class},
                    (proxy, method, args) -> {
                        if ("countByScriptVersionId".equals(method.getName())) {
                            return referenceCount;
                        }
                        return defaultValue(method.getReturnType());
                    }
            );
        }
    }

    private static class FakeMinioService extends MinioService {
        FakeMinioService() {
            super(null, new MinioConfig());
        }
    }

    private static class FakeMinioDeleteTaskService extends MinioDeleteTaskService {
        final List<String> queuedObjectNames = new ArrayList<>();

        FakeMinioDeleteTaskService() {
            super(
                    emptyProxy(MinioDeleteTaskRepository.class),
                    new FakeMinioService(),
                    new MinioConfig(),
                    noopTransactionManager()
            );
        }

        @Override
        public MinioDeleteTask enqueueDefaultBucketDelete(
                String objectName,
                String sourceType,
                String sourceId,
                Integer ownerUserId
        ) {
            queuedObjectNames.add(objectName);
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
    }

    private static PlatformTransactionManager noopTransactionManager() {
        return new PlatformTransactionManager() {
            @Override
            public TransactionStatus getTransaction(TransactionDefinition definition) {
                return new SimpleTransactionStatus();
            }

            @Override
            public void commit(TransactionStatus status) {
            }

            @Override
            public void rollback(TransactionStatus status) {
            }
        };
    }
}
