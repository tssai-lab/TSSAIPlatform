package com.tss.platform.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;

@Getter
@Setter
@ConfigurationProperties(prefix = "inference.kubernetes.model-cache")
public class InferenceModelCacheProperties {

    /** Keep disabled until the Kubernetes node has the physical-host cache mount. */
    private boolean enabled = false;

    /** Path visible inside the Kubernetes node. */
    private String nodePath = "/opt/tss-platform/model-cache";

    /** Root path mounted into the trusted cache initializer. */
    private String mountPath = "/var/cache/tss/models";

    /** Conservative cooperative cache size limit for disk-constrained nodes (8 GiB by default). */
    private long maxBytes = 8L * 1024 * 1024 * 1024;

    /** Minimum free space retained on the cache filesystem (5 GiB by default). */
    private long minFreeBytes = 5L * 1024 * 1024 * 1024;
}
