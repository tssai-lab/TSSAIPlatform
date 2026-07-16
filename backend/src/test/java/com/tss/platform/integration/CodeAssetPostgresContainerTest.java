package com.tss.platform.integration;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.stream.IntStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Testcontainers(disabledWithoutDocker = true)
@Timeout(value = 30, unit = TimeUnit.SECONDS)
class CodeAssetPostgresContainerTest {

    private static final String POSTGRES_IMAGE = "postgres:16.6-alpine";
    private static final String CHECK_VIOLATION = "23514";
    private static final String FOREIGN_KEY_VIOLATION = "23503";
    private static final String UNIQUE_VIOLATION = "23505";
    private static final String LOCK_NOT_AVAILABLE = "55P03";

    private static final String ASSET_LOCK_SQL = """
            SELECT id
            FROM code_asset
            WHERE id = ? AND deleted = FALSE
            FOR UPDATE
            """;

    private static final String WORKSPACE_LOCK_SQL = """
            SELECT id, status, revision
            FROM code_workspace
            WHERE id = ? AND deleted = FALSE
            FOR UPDATE
            """;

    private static final String INSERT_WORKSPACE_SQL = """
            INSERT INTO code_workspace (
                id, asset_id, status, revision, owner_user_id,
                created_at, updated_at, deleted
            )
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE)
            """;

    @Container
    private static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>(DockerImageName.parse(POSTGRES_IMAGE))
                    .withDatabaseName("code_asset_integration")
                    .withUsername("code_asset_test")
                    .withPassword("code_asset_test_password");

    @BeforeAll
    static void migrateFreshDatabase() {
        Flyway.configure()
                .dataSource(
                        POSTGRES.getJdbcUrl(),
                        POSTGRES.getUsername(),
                        POSTGRES.getPassword()
                )
                .locations("classpath:db/migration")
                .cleanDisabled(true)
                .load()
                .migrate();
    }

    @Test
    void flywayAppliesEveryVersionFromV1ThroughV31() throws SQLException {
        List<String> expectedVersions = IntStream.rangeClosed(1, 31)
                .mapToObj(Integer::toString)
                .toList();
        List<String> installedVersions = queryStrings("""
                SELECT version
                FROM flyway_schema_history
                WHERE success = TRUE AND version IS NOT NULL
                ORDER BY installed_rank
                """);

        assertEquals(expectedVersions, installedVersions);
        assertEquals("31", installedVersions.get(installedVersions.size() - 1));
        for (String table : List.of(
                "code_workspace",
                "code_workspace_file_delta",
                "code_validation_run",
                "code_approval_record",
                "code_asset_audit_log",
                "code_risk_assessment",
                "code_risk_finding"
        )) {
            assertEquals(
                    1L,
                    queryLong("""
                            SELECT COUNT(*)
                            FROM information_schema.tables
                            WHERE table_schema = 'public' AND table_name = ?
                            """, table),
                    () -> "code asset table was not created: " + table
            );
        }
    }

    @Test
    void partialUniqueIndexAllowsOnlyOneConcurrentOpenWorkspacePerAsset() throws Exception {
        String assetId = id("asset-open-race");
        insertAsset(assetId);
        insertWorkspace(
                id("workspace-published"),
                assetId,
                "PUBLISHED",
                1L,
                7
        );

        CountDownLatch ready = new CountDownLatch(2);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        Future<InsertAttempt> first = executor.submit(() -> concurrentOpenInsert(
                id("workspace-open-a"), assetId, ready, start
        ));
        Future<InsertAttempt> second = executor.submit(() -> concurrentOpenInsert(
                id("workspace-open-b"), assetId, ready, start
        ));

        List<InsertAttempt> attempts;
        try {
            assertTrue(ready.await(10, TimeUnit.SECONDS), "insert workers did not become ready");
            start.countDown();
            attempts = List.of(
                    first.get(15, TimeUnit.SECONDS),
                    second.get(15, TimeUnit.SECONDS)
            );
        } finally {
            start.countDown();
            executor.shutdownNow();
        }
        assertTrue(
                executor.awaitTermination(5, TimeUnit.SECONDS),
                "insert workers did not terminate"
        );

        assertEquals(1L, attempts.stream().filter(InsertAttempt::inserted).count());
        InsertAttempt rejected = attempts.stream()
                .filter(attempt -> !attempt.inserted())
                .findFirst()
                .orElseThrow();
        assertEquals(UNIQUE_VIOLATION, rejected.sqlState());
        assertTrue(
                rejected.message().contains("uk_code_workspace_open_asset"),
                rejected.message()
        );
        assertEquals(1L, queryLong("""
                SELECT COUNT(*)
                FROM code_workspace
                WHERE asset_id = ? AND status = 'OPEN' AND deleted = FALSE
                """, assetId));
        assertEquals(2L, queryLong(
                "SELECT COUNT(*) FROM code_workspace WHERE asset_id = ?",
                assetId
        ));
    }

    @Test
    void v29LifecycleChecksRejectInvalidStatusesAndRevision() throws SQLException {
        String assetId = id("asset-checks");
        String versionId = id("version-checks");
        insertAsset(assetId);
        insertVersion(versionId, assetId);

        assertCheckViolation(
                "ck_code_version_status",
                """
                        INSERT INTO code_version (
                            id, asset_id, version, status, approval_status,
                            validation_status, owner_user_id, deleted
                        )
                        VALUES (?, ?, ?, 'DRAFT', 'PENDING', 'NOT_RUN', 7, FALSE)
                        """,
                id("bad-version-status"), assetId, id("label")
        );
        assertCheckViolation(
                "ck_code_version_validation_status",
                """
                        INSERT INTO code_version (
                            id, asset_id, version, status, approval_status,
                            validation_status, owner_user_id, deleted
                        )
                        VALUES (?, ?, ?, 'READY', 'PENDING', 'RUNNING', 7, FALSE)
                        """,
                id("bad-validation-status"), assetId, id("label")
        );
        assertCheckViolation(
                "ck_code_version_approval_status",
                """
                        INSERT INTO code_version (
                            id, asset_id, version, status, approval_status,
                            validation_status, owner_user_id, deleted
                        )
                        VALUES (?, ?, ?, 'READY', 'UNKNOWN', 'NOT_RUN', 7, FALSE)
                        """,
                id("bad-approval-status"), assetId, id("label")
        );
        assertCheckViolation(
                "ck_code_workspace_status",
                INSERT_WORKSPACE_SQL,
                id("bad-workspace-status"), assetId, "DRAFT", 0L, 7
        );
        assertCheckViolation(
                "ck_code_workspace_revision",
                INSERT_WORKSPACE_SQL,
                id("bad-workspace-revision"), assetId, "OPEN", -1L, 7
        );
        assertCheckViolation(
                "ck_code_validation_run_status",
                """
                        INSERT INTO code_validation_run (
                            id, version_id, artifact_sha256, policy_version, status,
                            requested_by_user_id, created_at
                        )
                        VALUES (?, ?, repeat('a', 64), 'policy-v1', 'RUNNING', 7,
                                CURRENT_TIMESTAMP)
                        """,
                id("bad-validation-run"), versionId
        );
        assertCheckViolation(
                "ck_code_approval_record_decision",
                """
                        INSERT INTO code_approval_record (
                            id, version_id, decision, reviewer_user_id, created_at
                        )
                        VALUES (?, ?, 'UNKNOWN', 7, CURRENT_TIMESTAMP)
                        """,
                id("bad-approval-decision"), versionId
        );
    }

    @Test
    void v29ForeignKeysRejectOrphansAcrossTheCodeAssetAggregate() throws SQLException {
        String assetId = id("asset-fk");
        String versionId = id("version-fk");
        insertAsset(assetId);
        insertVersion(versionId, assetId);

        assertForeignKeyViolation(
                "fk_code_version_asset",
                """
                        INSERT INTO code_version (
                            id, asset_id, version, status, approval_status,
                            validation_status, deleted
                        )
                        VALUES (?, ?, ?, 'READY', 'PENDING', 'NOT_RUN', FALSE)
                        """,
                id("orphan-version"), id("missing-asset"), id("label")
        );
        assertForeignKeyViolation(
                "fk_code_workspace_asset",
                INSERT_WORKSPACE_SQL,
                id("orphan-workspace"), id("missing-asset"), "PUBLISHED", 0L, 7
        );
        assertForeignKeyViolation(
                "fk_code_workspace_base_version",
                """
                        INSERT INTO code_workspace (
                            id, asset_id, base_version_id, status, revision,
                            owner_user_id, created_at, updated_at, deleted
                        )
                        VALUES (?, ?, ?, 'PUBLISHED', 0, 7,
                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE)
                        """,
                id("orphan-base-workspace"), assetId, id("missing-version")
        );
        assertForeignKeyViolation(
                "fk_code_workspace_closed_version",
                """
                        INSERT INTO code_workspace (
                            id, asset_id, closed_version_id, status, revision,
                            owner_user_id, created_at, updated_at, deleted
                        )
                        VALUES (?, ?, ?, 'PUBLISHED', 0, 7,
                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE)
                        """,
                id("orphan-closed-workspace"), assetId, id("missing-version")
        );
        assertForeignKeyViolation(
                "fk_code_workspace_file_delta_workspace",
                """
                        INSERT INTO code_workspace_file_delta (
                            id, workspace_id, path, operation, created_at, updated_at
                        )
                        VALUES (?, ?, 'src/deleted.py', 'DELETE',
                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """,
                id("orphan-delta"), id("missing-workspace")
        );
        assertForeignKeyViolation(
                "fk_code_validation_run_version",
                """
                        INSERT INTO code_validation_run (
                            id, version_id, artifact_sha256, policy_version, status,
                            requested_by_user_id, created_at
                        )
                        VALUES (?, ?, repeat('a', 64), 'policy-v1', 'NOT_RUN', 7,
                                CURRENT_TIMESTAMP)
                        """,
                id("orphan-validation"), id("missing-version")
        );
        assertForeignKeyViolation(
                "fk_code_approval_record_version",
                """
                        INSERT INTO code_approval_record (
                            id, version_id, decision, reviewer_user_id, created_at
                        )
                        VALUES (?, ?, 'PENDING', 7, CURRENT_TIMESTAMP)
                        """,
                id("orphan-approval-version"), id("missing-version")
        );
        assertForeignKeyViolation(
                "fk_code_approval_record_validation_run",
                """
                        INSERT INTO code_approval_record (
                            id, version_id, validation_run_id, decision,
                            reviewer_user_id, created_at
                        )
                        VALUES (?, ?, ?, 'PENDING', 7, CURRENT_TIMESTAMP)
                        """,
                id("orphan-approval-run"), versionId, id("missing-validation")
        );
        assertForeignKeyViolation(
                "fk_code_asset_audit_log_asset",
                """
                        INSERT INTO code_asset_audit_log (
                            id, asset_id, action, actor_user_id, created_at
                        )
                        VALUES (?, ?, 'TEST', 7, CURRENT_TIMESTAMP)
                        """,
                id("orphan-audit-asset"), id("missing-asset")
        );
        assertForeignKeyViolation(
                "fk_code_asset_audit_log_version",
                """
                        INSERT INTO code_asset_audit_log (
                            id, asset_id, version_id, action, actor_user_id, created_at
                        )
                        VALUES (?, ?, ?, 'TEST', 7, CURRENT_TIMESTAMP)
                        """,
                id("orphan-audit-version"), assetId, id("missing-version")
        );
        assertForeignKeyViolation(
                "fk_code_asset_audit_log_workspace",
                """
                        INSERT INTO code_asset_audit_log (
                            id, asset_id, workspace_id, action, actor_user_id, created_at
                        )
                        VALUES (?, ?, ?, 'TEST', 7, CURRENT_TIMESTAMP)
                        """,
                id("orphan-audit-workspace"), assetId, id("missing-workspace")
        );
    }

    @Test
    void v30PersistsRiskEvidenceAutomaticDecisionsAndSystemAuditActors()
            throws SQLException {
        String assetId = id("risk-asset");
        String versionId = id("risk-version");
        String validationId = id("risk-validation");
        String lowAssessmentId = id("risk-low");
        String blockAssessmentId = id("risk-block");
        String artifactSha256 = "a".repeat(64);

        insertAsset(assetId);
        insertVersion(versionId, assetId);
        executeUpdate(
                "UPDATE code_version SET artifact_sha256 = ? WHERE id = ?",
                artifactSha256,
                versionId
        );
        executeUpdate("""
                INSERT INTO code_validation_run (
                    id, version_id, artifact_sha256, policy_version, status,
                    requested_by_user_id, created_at, completed_at
                )
                VALUES (?, ?, ?, 'validation-v1', 'PASSED', 7,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, validationId, versionId, artifactSha256);

        executeUpdate("""
                INSERT INTO code_risk_assessment (
                    id, version_id, validation_run_id, artifact_sha256,
                    risk_policy_version, scanner_version, status, risk_level,
                    disposition, finding_count, requested_by_user_id,
                    created_at, started_at, completed_at
                )
                VALUES (?, ?, ?, ?, 'risk-v1', 'scanner-v1', 'COMPLETED', 'LOW',
                        'AUTO_APPROVE', 1, NULL,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, lowAssessmentId, versionId, validationId, artifactSha256);
        executeUpdate("""
                INSERT INTO code_risk_finding (
                    id, risk_assessment_id, rule_id, severity, category,
                    file_path, line_start, line_end, description, created_at
                )
                VALUES (?, ?, 'PYTHON_NETWORK', 'LOW', 'NETWORK',
                        'src/train.py', 12, 12,
                        'Network import was classified by policy', CURRENT_TIMESTAMP)
                """, id("risk-finding"), lowAssessmentId);
        executeUpdate("""
                UPDATE code_version
                SET latest_risk_assessment_id = ?,
                    risk_status = 'COMPLETED',
                    risk_level = 'LOW',
                    review_disposition = 'AUTO_APPROVE',
                    risk_policy_version = 'risk-v1'
                WHERE id = ?
                """, lowAssessmentId, versionId);
        executeUpdate("""
                INSERT INTO code_approval_record (
                    id, version_id, artifact_sha256, validation_run_id,
                    policy_version, decision, decision_source,
                    risk_assessment_id, approval_policy_version,
                    reviewer_user_id, created_at
                )
                VALUES (?, ?, ?, ?, 'validation-v1', 'APPROVED', 'AUTO_POLICY',
                        ?, 'approval-v1', NULL, CURRENT_TIMESTAMP)
                """, id("risk-auto-approve"), versionId, artifactSha256,
                validationId, lowAssessmentId);

        executeUpdate("""
                INSERT INTO code_risk_assessment (
                    id, version_id, validation_run_id, artifact_sha256,
                    risk_policy_version, scanner_version, status, risk_level,
                    disposition, finding_count, created_at, started_at, completed_at
                )
                VALUES (?, ?, ?, ?, 'risk-v1', 'scanner-v1', 'COMPLETED', 'HIGH',
                        'BLOCK', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP,
                        CURRENT_TIMESTAMP)
                """, blockAssessmentId, versionId, validationId, artifactSha256);
        executeUpdate("""
                INSERT INTO code_approval_record (
                    id, version_id, artifact_sha256, validation_run_id,
                    policy_version, decision, decision_source,
                    risk_assessment_id, approval_policy_version,
                    reviewer_user_id, created_at
                )
                VALUES (?, ?, ?, ?, 'validation-v1', 'REJECTED', 'AUTO_POLICY',
                        ?, 'approval-v1', NULL, CURRENT_TIMESTAMP)
                """, id("risk-auto-reject"), versionId, artifactSha256,
                validationId, blockAssessmentId);

        executeUpdate("""
                INSERT INTO code_asset_audit_log (
                    id, asset_id, version_id, action, actor_type,
                    actor_user_id, created_at
                )
                VALUES (?, ?, ?, 'AUTO_RISK_DECISION', 'SYSTEM', NULL,
                        CURRENT_TIMESTAMP)
                """, id("risk-system-audit"), assetId, versionId);

        assertEquals(2L, queryLong(
                "SELECT COUNT(*) FROM code_risk_assessment WHERE version_id = ?",
                versionId
        ));
        assertEquals(2L, queryLong("""
                SELECT COUNT(*)
                FROM code_approval_record
                WHERE version_id = ? AND decision_source = 'AUTO_POLICY'
                  AND reviewer_user_id IS NULL
                """, versionId));
        assertEquals(1L, queryLong("""
                SELECT COUNT(*)
                FROM code_asset_audit_log
                WHERE version_id = ? AND actor_type = 'SYSTEM'
                  AND actor_user_id IS NULL
                """, versionId));
    }

    @Test
    void v30RejectsMismatchedEvidenceInvalidRiskStatesAndSpoofedActors()
            throws SQLException {
        String assetId = id("bad-risk-asset");
        String versionId = id("bad-risk-version");
        String validationId = id("bad-risk-validation");

        insertAsset(assetId);
        insertVersion(versionId, assetId);
        executeUpdate("""
                INSERT INTO code_validation_run (
                    id, version_id, artifact_sha256, policy_version, status,
                    requested_by_user_id, created_at, completed_at
                )
                VALUES (?, ?, repeat('a', 64), 'validation-v1', 'PASSED', 7,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """, validationId, versionId);

        assertForeignKeyViolation(
                "fk_code_risk_assessment_validation_evidence",
                """
                        INSERT INTO code_risk_assessment (
                            id, version_id, validation_run_id, artifact_sha256,
                            risk_policy_version, scanner_version, created_at
                        )
                        VALUES (?, ?, ?, repeat('b', 64),
                                'risk-v1', 'scanner-v1', CURRENT_TIMESTAMP)
                        """,
                id("bad-risk-hash"), versionId, validationId
        );
        assertCheckViolation(
                "ck_code_risk_assessment_status",
                """
                        INSERT INTO code_risk_assessment (
                            id, version_id, validation_run_id, artifact_sha256,
                            risk_policy_version, scanner_version, status, created_at
                        )
                        VALUES (?, ?, ?, repeat('a', 64),
                                'risk-v1', 'scanner-v1', 'WAITING', CURRENT_TIMESTAMP)
                        """,
                id("bad-risk-status"), versionId, validationId
        );
        assertCheckViolation(
                "ck_code_risk_assessment_completed_disposition",
                """
                        INSERT INTO code_risk_assessment (
                            id, version_id, validation_run_id, artifact_sha256,
                            risk_policy_version, scanner_version, status,
                            completed_at, created_at
                        )
                        VALUES (?, ?, ?, repeat('a', 64),
                                'risk-v1', 'scanner-v1', 'COMPLETED',
                                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                        """,
                id("bad-risk-complete"), versionId, validationId
        );
        assertCheckViolation(
                "ck_code_approval_record_reviewer",
                """
                        INSERT INTO code_approval_record (
                            id, version_id, decision, decision_source,
                            reviewer_user_id, created_at
                        )
                        VALUES (?, ?, 'APPROVED', 'AUTO_POLICY', NULL,
                                CURRENT_TIMESTAMP)
                        """,
                id("bad-auto-decision"), versionId
        );
        assertCheckViolation(
                "ck_code_asset_audit_log_actor",
                """
                        INSERT INTO code_asset_audit_log (
                            id, asset_id, action, actor_type,
                            actor_user_id, created_at
                        )
                        VALUES (?, ?, 'SPOOFED_SYSTEM', 'SYSTEM', 7,
                                CURRENT_TIMESTAMP)
                        """,
                id("bad-system-actor"), assetId
        );
        assertCheckViolation(
                "ck_code_asset_audit_log_actor",
                """
                        INSERT INTO code_asset_audit_log (
                            id, asset_id, action, actor_type,
                            actor_user_id, created_at
                        )
                        VALUES (?, ?, 'MISSING_USER', 'USER', NULL,
                                CURRENT_TIMESTAMP)
                        """,
                id("bad-user-actor"), assetId
        );
    }

    @Test
    void assetRowLockSerializesTheOpenWorkspaceDecision() throws SQLException {
        String assetId = id("asset-lock-race");
        String workspaceId = id("workspace-lock-winner");
        insertAsset(assetId);

        try (Connection winner = connection(); Connection contender = connection()) {
            winner.setAutoCommit(false);
            contender.setAutoCommit(false);

            lockAsset(winner, assetId);
            executeUpdate(
                    winner,
                    INSERT_WORKSPACE_SQL,
                    workspaceId, assetId, "OPEN", 0L, 7
            );
            assertLockUnavailable(contender, ASSET_LOCK_SQL, assetId);
            contender.rollback();
            winner.commit();
        }

        try (Connection retry = connection()) {
            retry.setAutoCommit(false);
            lockAsset(retry, assetId);
            WorkspaceState visibleWinner = openWorkspace(retry, assetId);

            assertNotNull(visibleWinner);
            assertEquals(workspaceId, visibleWinner.id());
            assertEquals("OPEN", visibleWinner.status());
            assertEquals(0L, visibleWinner.revision());
            retry.commit();
        }
    }

    @Test
    void workspaceRowLockMakesTheLosingTransitionObserveTheCommittedWinner() throws SQLException {
        String assetId = id("asset-workspace-lock");
        String workspaceId = id("workspace-transition");
        insertAsset(assetId);
        insertWorkspace(workspaceId, assetId, "OPEN", 0L, 7);

        try (Connection winner = connection(); Connection contender = connection()) {
            winner.setAutoCommit(false);
            contender.setAutoCommit(false);

            WorkspaceState initial = lockWorkspace(winner, workspaceId);
            assertEquals("OPEN", initial.status());
            assertEquals(0L, initial.revision());
            executeUpdate(winner, """
                    UPDATE code_workspace
                    SET status = 'PUBLISHED', revision = revision + 1,
                        updated_at = CURRENT_TIMESTAMP, closed_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """, workspaceId);

            assertLockUnavailable(contender, WORKSPACE_LOCK_SQL, workspaceId);
            contender.rollback();
            winner.commit();
        }

        try (Connection retry = connection()) {
            retry.setAutoCommit(false);
            WorkspaceState committedWinner = lockWorkspace(retry, workspaceId);

            assertEquals("PUBLISHED", committedWinner.status());
            assertEquals(1L, committedWinner.revision());
            retry.commit();
        }
    }

    private static InsertAttempt concurrentOpenInsert(
            String workspaceId,
            String assetId,
            CountDownLatch ready,
            CountDownLatch start
    ) throws Exception {
        try (Connection connection = connection()) {
            connection.setAutoCommit(false);
            ready.countDown();
            if (!start.await(10, TimeUnit.SECONDS)) {
                throw new IllegalStateException("concurrent insert start signal timed out");
            }
            try {
                executeUpdate(
                        connection,
                        INSERT_WORKSPACE_SQL,
                        workspaceId, assetId, "OPEN", 0L, 7
                );
                connection.commit();
                return new InsertAttempt(true, null, "");
            } catch (SQLException exception) {
                connection.rollback();
                return new InsertAttempt(
                        false,
                        exception.getSQLState(),
                        lowerCaseMessage(exception)
                );
            }
        }
    }

    private static void insertAsset(String assetId) throws SQLException {
        executeUpdate("""
                INSERT INTO code_asset (
                    id, name, owner_user_id, created_at, updated_at, deleted
                )
                VALUES (?, ?, 7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE)
                """, assetId, "Integration asset " + assetId);
    }

    private static void insertVersion(String versionId, String assetId) throws SQLException {
        executeUpdate("""
                INSERT INTO code_version (
                    id, asset_id, version, status, approval_status,
                    validation_status, owner_user_id, created_at, updated_at, deleted
                )
                VALUES (?, ?, ?, 'READY', 'PENDING', 'NOT_RUN', 7,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, FALSE)
                """, versionId, assetId, id("label"));
    }

    private static void insertWorkspace(
            String workspaceId,
            String assetId,
            String status,
            long revision,
            int ownerUserId
    ) throws SQLException {
        executeUpdate(
                INSERT_WORKSPACE_SQL,
                workspaceId, assetId, status, revision, ownerUserId
        );
    }

    private static void assertCheckViolation(
            String constraint,
            String sql,
            Object... parameters
    ) {
        assertConstraintViolation(CHECK_VIOLATION, constraint, sql, parameters);
    }

    private static void assertForeignKeyViolation(
            String constraint,
            String sql,
            Object... parameters
    ) {
        assertConstraintViolation(FOREIGN_KEY_VIOLATION, constraint, sql, parameters);
    }

    private static void assertConstraintViolation(
            String sqlState,
            String constraint,
            String sql,
            Object... parameters
    ) {
        SQLException exception = assertThrows(
                SQLException.class,
                () -> executeUpdate(sql, parameters),
                () -> "expected constraint violation: " + constraint
        );
        assertEquals(sqlState, exception.getSQLState(), exception::getMessage);
        assertTrue(
                lowerCaseMessage(exception).contains(constraint.toLowerCase(Locale.ROOT)),
                exception::getMessage
        );
    }

    private static void assertLockUnavailable(
            Connection connection,
            String lockSql,
            String rowId
    ) throws SQLException {
        try (Statement statement = connection.createStatement()) {
            statement.execute("SET LOCAL lock_timeout = '500ms'");
        }
        SQLException exception = assertThrows(SQLException.class, () -> {
            try (PreparedStatement statement = connection.prepareStatement(lockSql)) {
                statement.setString(1, rowId);
                try (ResultSet ignored = statement.executeQuery()) {
                    // The competing transaction owns the row lock, so this never yields a row.
                }
            }
        });
        assertEquals(LOCK_NOT_AVAILABLE, exception.getSQLState(), exception::getMessage);
    }

    private static void lockAsset(Connection connection, String assetId) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(ASSET_LOCK_SQL)) {
            statement.setString(1, assetId);
            try (ResultSet result = statement.executeQuery()) {
                assertTrue(result.next(), "asset row was not found for locking");
                assertEquals(assetId, result.getString("id"));
            }
        }
    }

    private static WorkspaceState lockWorkspace(
            Connection connection,
            String workspaceId
    ) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(WORKSPACE_LOCK_SQL)) {
            statement.setString(1, workspaceId);
            try (ResultSet result = statement.executeQuery()) {
                assertTrue(result.next(), "workspace row was not found for locking");
                return workspaceState(result);
            }
        }
    }

    private static WorkspaceState openWorkspace(
            Connection connection,
            String assetId
    ) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement("""
                SELECT id, status, revision
                FROM code_workspace
                WHERE asset_id = ? AND status = 'OPEN' AND deleted = FALSE
                """)) {
            statement.setString(1, assetId);
            try (ResultSet result = statement.executeQuery()) {
                return result.next() ? workspaceState(result) : null;
            }
        }
    }

    private static WorkspaceState workspaceState(ResultSet result) throws SQLException {
        return new WorkspaceState(
                result.getString("id"),
                result.getString("status"),
                result.getLong("revision")
        );
    }

    private static void executeUpdate(String sql, Object... parameters) throws SQLException {
        try (Connection connection = connection()) {
            executeUpdate(connection, sql, parameters);
        }
    }

    private static void executeUpdate(
            Connection connection,
            String sql,
            Object... parameters
    ) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, parameters);
            statement.executeUpdate();
        }
    }

    private static long queryLong(String sql, Object... parameters) throws SQLException {
        try (Connection connection = connection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            bind(statement, parameters);
            try (ResultSet result = statement.executeQuery()) {
                assertTrue(result.next(), "aggregate query returned no row");
                return result.getLong(1);
            }
        }
    }

    private static List<String> queryStrings(String sql) throws SQLException {
        try (Connection connection = connection();
             PreparedStatement statement = connection.prepareStatement(sql);
             ResultSet result = statement.executeQuery()) {
            List<String> values = new java.util.ArrayList<>();
            while (result.next()) {
                values.add(result.getString(1));
            }
            return List.copyOf(values);
        }
    }

    private static void bind(PreparedStatement statement, Object... parameters)
            throws SQLException {
        for (int index = 0; index < parameters.length; index++) {
            Object parameter = parameters[index];
            if (parameter instanceof byte[] bytes) {
                statement.setBytes(index + 1, bytes);
            } else {
                statement.setObject(index + 1, parameter);
            }
        }
    }

    private static Connection connection() throws SQLException {
        return DriverManager.getConnection(
                POSTGRES.getJdbcUrl(),
                POSTGRES.getUsername(),
                POSTGRES.getPassword()
        );
    }

    private static String id(String prefix) {
        return prefix + "-" + UUID.randomUUID().toString().replace("-", "");
    }

    private static String lowerCaseMessage(SQLException exception) {
        String message = exception.getMessage();
        return message == null ? "" : message.toLowerCase(Locale.ROOT);
    }

    private record InsertAttempt(boolean inserted, String sqlState, String message) {
    }

    private record WorkspaceState(String id, String status, long revision) {
    }
}
