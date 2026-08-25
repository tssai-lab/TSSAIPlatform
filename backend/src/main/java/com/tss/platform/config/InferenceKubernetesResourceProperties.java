package com.tss.platform.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

/** Server-controlled resource limits used by the enabled inference profile. */
@Getter
@Setter
@ConfigurationProperties(prefix = "inference.kubernetes")
public class InferenceKubernetesResourceProperties {

    private String cpuRequest = "500m";
    private String cpuLimit = "2";
    private String memoryRequest = "512Mi";
    private String memoryLimit = "4Gi";
    private String ephemeralStorageRequest = "2Gi";
    private String ephemeralStorageLimit = "12Gi";
}
