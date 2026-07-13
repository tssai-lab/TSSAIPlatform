package com.tss.platform.repository;

import com.tss.platform.entity.CodeAssetAuditLog;
import jakarta.persistence.LockModeType;
import org.junit.jupiter.api.Test;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.lang.reflect.Method;
import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class CodeAssetRepositoryContractTest {

    @Test
    void assetAndVersionRepositoriesExposeListingAndPessimisticLockQueries() throws Exception {
        Method assetLock = CodeAssetRepository.class.getMethod(
                "findByIdAndDeletedFalseForUpdate",
                String.class
        );
        assertPessimisticWriteQuery(assetLock, "deleted = false");

        Method ownerListing = CodeAssetRepository.class.getMethod(
                "findByOwnerUserIdAndDeletedFalseOrderByCreatedAtDesc",
                Integer.class
        );
        assertEquals(List.class, ownerListing.getReturnType());

        Method versionHistory = CodeVersionRepository.class.getMethod(
                "findByAssetIdAndDeletedFalseOrderByCreatedAtDesc",
                String.class
        );
        assertEquals(List.class, versionHistory.getReturnType());

        Method versionLock = CodeVersionRepository.class.getMethod(
                "findByIdAndDeletedFalseForUpdate",
                String.class
        );
        assertPessimisticWriteQuery(versionLock, "deleted = false");
    }

    @Test
    void workspaceRepositoryProvidesUnlockedLookupAndRequiredLockQueries() throws Exception {
        Method openLookup = CodeWorkspaceRepository.class.getMethod(
                "findOpenByAssetId",
                String.class
        );
        assertEquals(Optional.class, openLookup.getReturnType());
        assertOpenWorkspaceQuery(openLookup);
        assertFalse(openLookup.isAnnotationPresent(Lock.class));

        Method openLock = CodeWorkspaceRepository.class.getMethod(
                "findOpenByAssetIdForUpdate",
                String.class
        );
        assertOpenWorkspaceQuery(openLock);
        assertPessimisticWriteQuery(openLock, "status = 'OPEN'");

        Method workspaceLock = CodeWorkspaceRepository.class.getMethod(
                "findByIdAndDeletedFalseForUpdate",
                String.class
        );
        assertPessimisticWriteQuery(workspaceLock, "deleted = false");
    }

    @Test
    void supportingRepositoriesExposeDeterministicHistoryLookups() throws Exception {
        assertEquals(
                List.class,
                CodeWorkspaceFileDeltaRepository.class.getMethod(
                        "findByWorkspaceIdOrderByPathAsc",
                        String.class
                ).getReturnType()
        );
        assertEquals(
                Optional.class,
                CodeWorkspaceFileDeltaRepository.class.getMethod(
                        "findByWorkspaceIdAndPath",
                        String.class,
                        String.class
                ).getReturnType()
        );
        assertEquals(
                Optional.class,
                CodeValidationRunRepository.class.getMethod(
                        "findTopByVersionIdOrderByCreatedAtDescIdDesc",
                        String.class
                ).getReturnType()
        );
        assertEquals(
                Optional.class,
                CodeApprovalRecordRepository.class.getMethod(
                        "findTopByVersionIdOrderByCreatedAtDescIdDesc",
                        String.class
                ).getReturnType()
        );
        assertEquals(
                List.class,
                CodeAssetAuditLogRepository.class.getMethod(
                        "findByAssetIdOrderByCreatedAtDescIdDesc",
                        String.class
                ).getReturnType()
        );

        assertFalse(JpaRepository.class.isAssignableFrom(CodeAssetAuditLogRepository.class));
        assertEquals(
                CodeAssetAuditLog.class,
                CodeAssetAuditLogRepository.class.getMethod(
                        "save",
                        CodeAssetAuditLog.class
                ).getReturnType()
        );
    }

    private static void assertOpenWorkspaceQuery(Method method) {
        Query query = method.getAnnotation(Query.class);
        assertNotNull(query);
        assertTrue(query.value().contains("assetId = :assetId"));
        assertTrue(query.value().contains("status = 'OPEN'"));
        assertTrue(query.value().contains("deleted = false"));
    }

    private static void assertPessimisticWriteQuery(Method method, String queryFragment) {
        Lock lock = method.getAnnotation(Lock.class);
        assertNotNull(lock);
        assertEquals(LockModeType.PESSIMISTIC_WRITE, lock.value());

        Query query = method.getAnnotation(Query.class);
        assertNotNull(query);
        assertTrue(query.value().contains(queryFragment));
    }
}
