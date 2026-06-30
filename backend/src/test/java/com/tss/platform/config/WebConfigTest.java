package com.tss.platform.config;

import org.junit.jupiter.api.Test;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.servlet.config.annotation.CorsRegistry;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WebConfigTest {

    @Test
    void corsAllowsPatchForStatusEndpoints() {
        InspectableCorsRegistry registry = new InspectableCorsRegistry();
        new WebConfig().addCorsMappings(registry);

        CorsConfiguration configuration = registry.configurations().get("/**");

        assertNotNull(configuration);
        assertTrue(configuration.getAllowedMethods().contains("PATCH"));
    }

    private static class InspectableCorsRegistry extends CorsRegistry {

        Map<String, CorsConfiguration> configurations() {
            return getCorsConfigurations();
        }
    }
}
