package com.tss.platform.training.plan;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.io.InputStream;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class TrainingPlanV2SchemaContractTest {

    @Test
    void schemaDeclaresV2SpecBasedCpuOnlyContractWithoutLegacyMatchingFields() throws Exception {
        try (InputStream input = getClass().getResourceAsStream(
                "/training-plans/schema/training-plan-v2.schema.json"
        )) {
            assertNotNull(input);
            JsonNode schema = new ObjectMapper().readTree(input);

            assertEquals("tss.training.plan/v2",
                    schema.at("/properties/schemaVersion/const").asText());
            assertTrue(schema.at("/properties/category/enum").toString().contains("OTHER"));
            assertEquals("CPU", schema.at("/$defs/runtime/properties/deviceType/const").asText());
            assertTrue(schema.at("/$defs/modelInput/required").toString().contains("acceptedSpecIds"));
            assertTrue(schema.at("/$defs/datasetInput/required").toString().contains("acceptedSpecIds"));
            assertFalse(schema.at("/$defs/modelInput/properties").has("taskTypes"));
            assertFalse(schema.at("/$defs/datasetInput/properties").has("annotationFormats"));
        }
    }
}
