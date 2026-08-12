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
    private String nodePath = "/var/lib/tss-platform/model-cache";

    /** Root path mounted into the trusted cache initializer. */
    private String mountPath = "/var/cache/tss/models";

    /** Cooperative cache size limit (20 GiB by default). */
    private long maxBytes = 20L * 1024 * 1024 * 1024;

    /** Minimum free space retained on the cache filesystem (5 GiB by default). */
    private long minFreeBytes = 5L * 1024 * 1024 * 1024;
}
