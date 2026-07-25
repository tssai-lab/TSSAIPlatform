package com.tss.platform.integration;

import com.tss.platform.TssPlatformApplication;
import com.tss.platform.controller.v2.V2BusinessException;
import com.tss.platform.dto.v2.V2DatasetUploadCompleteRequest;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetSample;
import com.tss.platform.entity.DatasetSampleData;
import com.tss.platform.entity.DatasetUploadChunk;
import com.tss.platform.entity.DatasetUploadSession;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.entity.MinioDeleteTask;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetSampleDataRepository;
import com.tss.platform.repository.DatasetSampleRepository;
import com.tss.platform.repository.DatasetUploadChunkRepository;
import com.tss.platform.repository.DatasetUploadSessionRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.MinioDeleteTaskRepository;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.DatasetUploadService;
import com.tss.platform.service.DatasetWorkspaceFileUploadService;
import com.tss.platform.service.MinioDeleteTaskScheduler;
import com.tss.platform.service.MinioDeleteTaskService;
import com.tss.platform.service.MinioService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.io.InputStream;
import java.security.MessageDigest;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Random;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Testcontainers(disabledWithoutDocker = true)
@Execution(ExecutionMode.SAME_THREAD)
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@Timeout(value = 5, unit = TimeUnit.MINUTES)
@SpringBootTest(
        classes = {
                TssPlatformApplication.class,
                DatasetWorkspaceUploadIntegrationTest.TestAuthConfiguration.class
        },
        webEnvironment = SpringBootTest.WebEnvironment.NONE,
        properties = {
                "spring.profiles.active=test",
                "spring.main.banner-mode=off",
                "training.kubernetes.enabled=false",
                "training.mlflow.enabled=false",
                "minio.init.max-attempts=10",
                "minio.init.initial-backoff-ms=100"
        }
)
class DatasetWorkspaceUploadIntegrationTest {

    private static final int OWNER_USER_ID = 48_001;
    private static final int MINIO_API_PORT = 9000;
    private static final int CHUNK_SIZE = 5 * 1024 * 1024;
    private static final long LARGE_FILE_SIZE = 128L * 1024 * 1024 + 137L;
    private static final String MINIO_ACCESS_KEY = "dataset-upload-it-access";
    private static final String MINIO_SECRET_KEY =
            "dataset-upload-it-secret-2026";
    private static final String MINIO_BUCKET = "dataset-workspace-upload-it";
    private static final String AUDIT_FAILURE_TRIGGER =
            "trg_it_fail_workspace_upload_audit";
    private static final String AUDIT_FAILURE_FUNCTION =
            "fn_it_fail_workspace_upload_audit";

    @Container
    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(
                    DockerImageName.parse("postgres:16.6-alpine")
            )
                    .withDatabaseName("dataset_workspace_upload_it")
                    .withUsername("dataset_upload_it")
                    .withPassword("dataset_upload_it_password");

    @Container
    private static final GenericContainer<?> MINIO =
            new GenericContainer<>(
                    DockerImageName.parse(
                            "minio/minio:RELEASE.2025-09-07T16-13-09Z"
                    )
            )
                    .withEnv("MINIO_ROOT_USER", MINIO_ACCESS_KEY)
                    .withEnv("MINIO_ROOT_PASSWORD", MINIO_SECRET_KEY)
                    .withCommand(
                            "server",
                            "/data",
                            "--console-address",
                            ":9001"
                    )
                    .withExposedPorts(MINIO_API_PORT)
                    .waitingFor(Wait.forHttp("/minio/health/ready")
                            .forPort(MINIO_API_PORT)
                            .forStatusCode(200)
                            .withStartupTimeout(Duration.ofMinutes(2)));

    @DynamicPropertySource
    static void registerContainerProperties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add(
                "minio.endpoint",
                DatasetWorkspaceUploadIntegrationTest::mappedMinioEndpoint
        );
        registry.add("minio.access-key", () -> MINIO_ACCESS_KEY);
        registry.add("minio.secret-key", () -> MINIO_SECRET_KEY);
        registry.add("minio.bucket", () -> MINIO_BUCKET);
    }

    @Autowired
    private DatasetUploadService uploadService;

    @Autowired
    private DatasetWorkspaceFileUploadService workspaceFileUploadService;

    @Autowired
    private DatasetAssetRepository assetRepository;

    @Autowired
    private DatasetVersionRepository versionRepository;

    @Autowired
    private DatasetSampleRepository sampleRepository;

    @Autowired
    private DatasetSampleDataRepository dataRepository;

    @Autowired
    private DatasetUploadSessionRepository sessionRepository;

    @Autowired
    private DatasetUploadChunkRepository chunkRepository;

    @Autowired
    private MinioDeleteTaskRepository deleteTaskRepository;

    @Autowired
    private MinioService minioService;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @MockitoBean
    private MinioDeleteTaskScheduler minioDeleteTaskScheduler;

    @AfterEach
    void removeForcedPersistenceFailure() {
        jdbcTemplate.execute(
                "DROP TRIGGER IF EXISTS "
                        + AUDIT_FAILURE_TRIGGER
                        + " ON dataset_workspace_audit_log"
        );
        jdbcTemplate.execute(
                "DROP FUNCTION IF EXISTS "
                        + AUDIT_FAILURE_FUNCTION
                        + "()"
        );
    }

    @Test
    void fourWorkersUploadLargeFileOutOfOrderRetryAndComplete()
            throws Exception {
        UploadFixture fixture = persistFixture(
                LARGE_FILE_SIZE,
                "large-pressure.bin"
        );
        List<Integer> partIndexes = IntStream
                .range(0, fixture.totalChunks())
                .boxed()
                .collect(ArrayList::new, ArrayList::add, ArrayList::addAll);
        Collections.shuffle(partIndexes, new Random(20_260_725L));
        ExecutorService workers = Executors.newFixedThreadPool(4);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<?>> uploads = new ArrayList<>();
        try {
            for (Integer partIndex : partIndexes) {
                uploads.add(workers.submit(() -> {
                    start.await();
                    uploadPart(fixture, partIndex);
                    return null;
                }));
            }
            start.countDown();
            for (Future<?> upload : uploads) {
                upload.get(3, TimeUnit.MINUTES);
            }
        } finally {
            workers.shutdownNow();
            assertTrue(workers.awaitTermination(30, TimeUnit.SECONDS));
        }

        List<DatasetUploadChunk> firstPass = chunkRepository
                .findByUploadIdOrderByPartIndexAsc(fixture.uploadId());
        assertEquals(fixture.totalChunks(), firstPass.size());
        assertEquals(
                IntStream.range(0, fixture.totalChunks()).boxed().toList(),
                firstPass.stream().map(DatasetUploadChunk::getPartIndex).toList()
        );

        String originalPartZero = firstPass.get(0).getObjectName();
        uploadPart(fixture, 0);
        String replacementPartZero = chunkRepository
                .findByUploadIdAndPartIndex(fixture.uploadId(), 0)
                .orElseThrow()
                .getObjectName();
        assertNotEquals(originalPartZero, replacementPartZero);
        assertTrue(deleteTaskRepository.findAll().stream().anyMatch(task ->
                MinioDeleteTaskService.SOURCE_DATASET_UPLOAD_CHUNK.equals(
                        task.getSourceType()
                )
                        && originalPartZero.equals(task.getObjectName())
        ));

        DatasetUploadSession completed = workspaceFileUploadService.complete(
                fixture.uploadId(),
                new V2DatasetUploadCompleteRequest(fixture.workspaceRevision())
        );
        DatasetUploadSession persisted = sessionRepository
                .findById(fixture.uploadId())
                .orElseThrow();
        List<DatasetSampleData> data = dataRepository.findByDatasetVersionId(
                fixture.workspaceId()
        );
        String actualSha256;
        try (InputStream input = minioService.downloadStream(
                persisted.getStoragePath()
        )) {
            actualSha256 = sha256(input);
        }
        long cleanupTaskCount = deleteTaskRepository.findAll().stream()
                .filter(task -> fixture.uploadId().equals(task.getSourceId()))
                .filter(task -> MinioDeleteTaskService
                        .SOURCE_DATASET_UPLOAD_CHUNK
                        .equals(task.getSourceType()))
                .count();

        assertAll(
                () -> assertEquals("COMPLETED", completed.getStatus()),
                () -> assertEquals("COMPLETED", persisted.getStatus()),
                () -> assertNotNull(persisted.getStoragePath()),
                () -> assertEquals(fixture.expectedSha256(), actualSha256),
                () -> assertEquals(
                        LARGE_FILE_SIZE,
                        minioService.stat(persisted.getStoragePath()).size()
                ),
                () -> assertEquals(1, data.size()),
                () -> assertEquals(
                        fixture.expectedSha256(),
                        data.get(0).getChecksum()
                ),
                () -> assertEquals(
                        LARGE_FILE_SIZE,
                        data.get(0).getSizeBytes()
                ),
                () -> assertEquals(
                        fixture.totalChunks() + 1L,
                        cleanupTaskCount
                ),
                () -> assertEquals(
                        0L,
                        chunkRepository.countByUploadId(fixture.uploadId())
                )
        );
    }

    @Test
    void auditCommitFailureRollsBackMetadataAndQueuesExactObjectCleanup()
            throws Exception {
        UploadFixture fixture = persistFixture(
                1024L * 1024,
                "rollback-failure.bin"
        );
        uploadPart(fixture, 0);
        installForcedAuditFailure(fixture.workspaceId());

        V2BusinessException failure = assertThrows(
                V2BusinessException.class,
                () -> workspaceFileUploadService.complete(
                        fixture.uploadId(),
                        new V2DatasetUploadCompleteRequest(
                                fixture.workspaceRevision()
                        )
                )
        );

        DatasetUploadSession persisted = sessionRepository
                .findById(fixture.uploadId())
                .orElseThrow();
        DatasetVersion workspace = versionRepository
                .findById(fixture.workspaceId())
                .orElseThrow();
        String finalPrefix = "users/" + OWNER_USER_ID
                + "/datasets/" + fixture.assetId()
                + "/workspaces/" + fixture.workspaceId()
                + "/overlays/";
        List<String> finalObjects = minioService.listObjectNames(finalPrefix);
        List<MinioDeleteTask> compensationTasks = deleteTaskRepository
                .findAll()
                .stream()
                .filter(task -> MinioDeleteTaskService
                        .SOURCE_DATASET_UPLOAD_ROLLBACK
                        .equals(task.getSourceType()))
                .filter(task -> task.getObjectName().startsWith(finalPrefix))
                .toList();

        assertAll(
                () -> assertEquals(
                        "DATASET_STORAGE_UNAVAILABLE",
                        failure.getErrorCode()
                ),
                () -> assertEquals("UPLOADING", persisted.getStatus()),
                () -> assertNull(persisted.getStoragePath()),
                () -> assertNull(persisted.getTargetResourceId()),
                () -> assertEquals(
                        fixture.workspaceRevision(),
                        workspace.getWorkspaceRevision()
                ),
                () -> assertEquals(
                        0L,
                        count(
                                "select count(*) from dataset_package "
                                        + "where dataset_asset_id = ?",
                                fixture.assetId()
                        )
                ),
                () -> assertEquals(
                        0L,
                        count(
                                "select count(*) from dataset_version_package "
                                        + "where dataset_version_id = ?",
                                fixture.workspaceId()
                        )
                ),
                () -> assertEquals(
                        0L,
                        count(
                                "select count(*) from dataset_sample_data "
                                        + "where dataset_version_id = ?",
                                fixture.workspaceId()
                        )
                ),
                () -> assertEquals(
                        0L,
                        count(
                                "select count(*) from dataset_workspace_audit_log "
                                        + "where dataset_version_id = ?",
                                fixture.workspaceId()
                        )
                ),
                () -> assertEquals(
                        1L,
                        chunkRepository.countByUploadId(fixture.uploadId())
                ),
                () -> assertEquals(1, finalObjects.size()),
                () -> assertEquals(1, compensationTasks.size()),
                () -> assertEquals(
                        finalObjects.get(0),
                        compensationTasks.get(0).getObjectName()
                ),
                () -> assertEquals(
                        MinioDeleteTaskService.STATUS_PENDING,
                        compensationTasks.get(0).getStatus()
                ),
                () -> assertEquals(
                        fixture.fileSize(),
                        minioService.stat(finalObjects.get(0)).size()
                )
        );
    }

    private UploadFixture persistFixture(long fileSize, String fileName) {
        String suffix = compactUuid();
        String assetId = "asset-upload-" + suffix;
        String readyVersionId = "ready-upload-" + suffix;
        String workspaceId = "workspace-upload-" + suffix;
        String sampleId = "sample-upload-" + suffix;
        String uploadId = "upload-" + suffix;
        int totalChunks = (int) ((fileSize + CHUNK_SIZE - 1) / CHUNK_SIZE);
        String expectedSha256 = expectedSha256(fileSize, totalChunks);
        long revision = 5L;
        Instant now = Instant.now();

        DatasetAsset asset = new DatasetAsset();
        asset.setId(assetId);
        asset.setName("Upload integration " + suffix);
        asset.setType("NLP");
        asset.setOwnerUserId(OWNER_USER_ID);
        asset.setCreatedAt(now);
        asset.setUpdatedAt(now);
        asset.setDeleted(false);
        assetRepository.saveAndFlush(asset);

        DatasetVersion ready = new DatasetVersion();
        ready.setId(readyVersionId);
        ready.setAssetId(assetId);
        ready.setVersion("v1");
        ready.setVersionNo(1);
        ready.setVersionLabel("v1");
        ready.setStatus("READY");
        ready.setOwnerUserId(OWNER_USER_ID);
        ready.setCreatedBy(OWNER_USER_ID);
        ready.setCreatedAt(now);
        ready.setUpdatedAt(now);
        ready.setWorkspaceRevision(0L);
        ready.setDeleted(false);
        versionRepository.saveAndFlush(ready);
        asset.setCurrentVersionId(readyVersionId);
        assetRepository.saveAndFlush(asset);

        DatasetVersion workspace = new DatasetVersion();
        workspace.setId(workspaceId);
        workspace.setAssetId(assetId);
        workspace.setVersion("v2");
        workspace.setVersionNo(2);
        workspace.setVersionLabel("v2");
        workspace.setParentVersionId(readyVersionId);
        workspace.setStatus("DRAFT");
        workspace.setOwnerUserId(OWNER_USER_ID);
        workspace.setCreatedBy(OWNER_USER_ID);
        workspace.setCreatedAt(now);
        workspace.setUpdatedAt(now);
        workspace.setWorkspaceRevision(revision);
        workspace.setDeleted(false);
        versionRepository.saveAndFlush(workspace);

        DatasetSample sample = new DatasetSample();
        sample.setId(sampleId);
        sample.setDatasetVersionId(workspaceId);
        sample.setExternalId("sample-" + suffix);
        sample.setSampleIndex(0);
        sample.setOwnerUserId(OWNER_USER_ID);
        sample.setCreatedAt(now);
        sample.setUpdatedAt(now);
        sample.setDeleted(false);
        sampleRepository.saveAndFlush(sample);

        DatasetUploadSession session = new DatasetUploadSession();
        session.setId(uploadId);
        session.setUploadPurpose(DatasetWorkspaceFileUploadService.PURPOSE);
        session.setFileName(fileName);
        session.setFileSize(fileSize);
        session.setChunkSize(CHUNK_SIZE);
        session.setTotalChunks(totalChunks);
        session.setDatasetName(asset.getName());
        session.setVersion(workspace.getVersion());
        session.setVersionLabel(workspace.getVersionLabel());
        session.setVersionNo(workspace.getVersionNo());
        session.setVersionLabelGenerated(false);
        session.setType(asset.getType());
        session.setStrictManifest(false);
        session.setAssetCreatedByUpload(false);
        session.setStatus("UPLOADING");
        session.setAssetId(assetId);
        session.setVersionId(workspaceId);
        session.setWorkspaceBaseRevision(revision);
        session.setTargetKind("DATA");
        session.setTargetOperation("CREATE");
        session.setTargetSampleId(sampleId);
        session.setExpectedSha256(expectedSha256);
        session.setDeclaredFormat("bin");
        session.setDeclaredContentType("application/octet-stream");
        session.setTargetDataType("OTHER");
        session.setTargetSeq(0);
        session.setOwnerUserId(OWNER_USER_ID);
        session.setCreatedAt(now);
        session.setUpdatedAt(now);
        sessionRepository.saveAndFlush(session);

        return new UploadFixture(
                assetId,
                workspaceId,
                uploadId,
                fileSize,
                totalChunks,
                expectedSha256,
                revision
        );
    }

    private void uploadPart(UploadFixture fixture, int partIndex) {
        long partSize = partIndex == fixture.totalChunks() - 1
                ? fixture.fileSize() - (long) CHUNK_SIZE * partIndex
                : CHUNK_SIZE;
        byte[] content = new byte[Math.toIntExact(partSize)];
        Arrays.fill(content, patternByte(partIndex));
        uploadService.saveChunk(
                fixture.uploadId(),
                partIndex,
                new MockMultipartFile(
                        "file",
                        "part-" + partIndex,
                        "application/octet-stream",
                        content
                )
        );
    }

    private void installForcedAuditFailure(String workspaceId) {
        jdbcTemplate.execute("""
                CREATE OR REPLACE FUNCTION %s()
                RETURNS trigger
                LANGUAGE plpgsql
                AS $function$
                BEGIN
                    RAISE EXCEPTION
                        'forced dataset workspace upload audit failure'
                        USING ERRCODE = 'P0001';
                    RETURN NEW;
                END;
                $function$
                """.formatted(AUDIT_FAILURE_FUNCTION));
        jdbcTemplate.execute("""
                CREATE TRIGGER %s
                BEFORE INSERT ON dataset_workspace_audit_log
                FOR EACH ROW
                WHEN (
                    NEW.operation = 'WORKSPACE_FILE_UPLOAD_COMPLETED'
                    AND NEW.dataset_version_id = '%s'
                )
                EXECUTE FUNCTION %s()
                """.formatted(
                AUDIT_FAILURE_TRIGGER,
                workspaceId,
                AUDIT_FAILURE_FUNCTION
        ));
    }

    private long count(String sql, String id) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class, id);
        return value == null ? 0L : value;
    }

    private static String expectedSha256(long fileSize, int totalChunks) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buffer = new byte[64 * 1024];
            for (int partIndex = 0; partIndex < totalChunks; partIndex++) {
                long remaining = partIndex == totalChunks - 1
                        ? fileSize - (long) CHUNK_SIZE * partIndex
                        : CHUNK_SIZE;
                Arrays.fill(buffer, patternByte(partIndex));
                while (remaining > 0) {
                    int size = (int) Math.min(buffer.length, remaining);
                    digest.update(buffer, 0, size);
                    remaining -= size;
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (Exception exception) {
            throw new AssertionError("SHA-256 must be available", exception);
        }
    }

    private static String sha256(InputStream input) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        byte[] buffer = new byte[64 * 1024];
        int read;
        while ((read = input.read(buffer)) >= 0) {
            if (read > 0) {
                digest.update(buffer, 0, read);
            }
        }
        return HexFormat.of().formatHex(digest.digest());
    }

    private static byte patternByte(int partIndex) {
        return (byte) ((partIndex * 31 + 17) & 0xff);
    }

    private static String mappedMinioEndpoint() {
        String host = MINIO.getHost();
        String uriHost = host.contains(":") && !host.startsWith("[")
                ? "[" + host + "]"
                : host;
        return "http://" + uriHost + ":"
                + MINIO.getMappedPort(MINIO_API_PORT);
    }

    private static String compactUuid() {
        return UUID.randomUUID()
                .toString()
                .replace("-", "")
                .substring(0, 16);
    }

    private record UploadFixture(
            String assetId,
            String workspaceId,
            String uploadId,
            long fileSize,
            int totalChunks,
            String expectedSha256,
            long workspaceRevision
    ) {
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class TestAuthConfiguration {

        @Bean
        @Primary
        AuthContext datasetUploadIntegrationAuthContext() {
            return new AuthContext() {
                @Override
                public Integer currentUserId() {
                    return OWNER_USER_ID;
                }

                @Override
                public boolean isAdmin() {
                    return true;
                }

                @Override
                public boolean canAccessOwner(Integer ownerUserId) {
                    return Objects.equals(OWNER_USER_ID, ownerUserId);
                }

                @Override
                public boolean canAccessObjectName(
                        String objectName,
                        Integer ownerUserId
                ) {
                    return canAccessOwner(ownerUserId)
                            && objectName != null
                            && objectName.startsWith(
                            "users/" + OWNER_USER_ID + "/"
                    );
                }
            };
        }
    }
}
