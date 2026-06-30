package com.tss.platform.persistence;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DatasetDraftVersionPersistenceContractTest {

    @Test
    void migrationEnforcesOnlyOneActiveDraftPerDatasetAsset() throws Exception {
        String resource = "db/migration/V18__dataset_version_one_active_draft.sql";
        try (var input = Thread.currentThread().getContextClassLoader().getResourceAsStream(resource)) {
            assertNotNull(input, resource);
            String sql = new String(input.readAllBytes(), StandardCharsets.UTF_8);

            assertTrue(sql.contains("CREATE UNIQUE INDEX IF NOT EXISTS uk_dataset_version_one_active_draft"));
            assertTrue(sql.contains("ON dataset_version (asset_id)"));
            assertTrue(sql.contains("WHERE status = 'DRAFT' AND deleted = false"));
        }
    }
}
