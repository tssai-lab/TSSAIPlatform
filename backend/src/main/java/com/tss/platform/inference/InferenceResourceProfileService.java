package com.tss.platform.inference;

import com.tss.platform.config.InferenceKubernetesResourceProperties;
import com.tss.platform.dto.InferenceResourceProfileDto;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Server-side whitelist for inference resources.
 *
 * The first CPU-only delivery intentionally exposes one usable profile. GPU fields stay in the
 * contract so a later GPU profile does not require another public API shape change.
 */
@Service
public class InferenceResourceProfileService {

    public static final String DEFAULT_PROFILE_ID = "cpu-small";

    private final InferenceKubernetesResourceProperties properties;

    public InferenceResourceProfileService(InferenceKubernetesResourceProperties properties) {
        this.properties = properties;
    }

    public List<InferenceResourceProfileDto> listEnabledProfiles() {
        return List.of(cpuSmall());
    }

    /** Missing profile IDs from old clients deliberately use the safe CPU default. */
    public InferenceResourceProfileDto resolveForCreate(String requestedProfileId) {
        String profileId = normalize(requestedProfileId);
        return resolve(profileId == null ? DEFAULT_PROFILE_ID : profileId);
    }

    /** Historical rows have null and retain the former global-resource behaviour. */
    public InferenceResourceProfileDto resolveForExecution(String storedProfileId) {
        String profileId = normalize(storedProfileId);
        return resolve(profileId == null ? DEFAULT_PROFILE_ID : profileId);
    }

    private InferenceResourceProfileDto resolve(String profileId) {
        if (!DEFAULT_PROFILE_ID.equals(profileId)) {
            throw new IllegalArgumentException("不支持的推理资源规格: " + profileId);
        }
        return cpuSmall();
    }

    private InferenceResourceProfileDto cpuSmall() {
        return new InferenceResourceProfileDto(
                DEFAULT_PROFILE_ID,
                "CPU 小型",
                "当前 CPU 推理的默认资源规格",
                "CPU",
                properties.getCpuRequest(),
                properties.getCpuLimit(),
                properties.getMemoryRequest(),
                properties.getMemoryLimit(),
                properties.getEphemeralStorageRequest(),
                properties.getEphemeralStorageLimit(),
                0
        );
    }

    private static String normalize(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
