package com.tss.platform.training.plan;

import com.tss.platform.dto.TrainingResourceRequest;
import com.tss.platform.service.KubernetesQuantityParser;

import java.math.BigDecimal;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;

/** Resolves optional user values inside the immutable bounds of one plan resource profile. */
final class TrainingResourceRequestResolver {

    private static final long MIB = 1024L * 1024L;

    private TrainingResourceRequestResolver() {
    }

    static TrainingRunSpec.Resources resolve(
            TrainingPlanDefinition.RuntimeVariant runtime,
            TrainingPlanDefinition.ResourceProfile profile,
            TrainingResourceRequest request
    ) {
        Map<String, String> nodeSelector = profile.nodeSelector() == null
                ? Map.of()
                : Collections.unmodifiableMap(new LinkedHashMap<>(profile.nodeSelector()));
        int profileGpuCount = profile.gpuCount() == null ? -1 : profile.gpuCount();
        validateDeviceContract(runtime.deviceType(), profileGpuCount);

        if (request == null) {
            return new TrainingRunSpec.Resources(
                    profile.id(), profile.cpuRequest(), profile.cpuLimit(),
                    profile.memoryRequest(), profile.memoryLimit(), profile.ephemeralStorageLimit(),
                    profileGpuCount, null, nodeSelector
            );
        }

        String cpuRequest = profile.cpuRequest();
        String cpuLimit = profile.cpuLimit();
        if (request.getCpuCores() != null) {
            double selected = requireFinitePositive(request.getCpuCores(), "resourceRequest.cpuCores");
            double minimum = KubernetesQuantityParser.cpuCores(profile.cpuRequest());
            double maximum = KubernetesQuantityParser.cpuCores(profile.cpuLimit());
            requireRange(selected, minimum, maximum, "resourceRequest.cpuCores");
            cpuRequest = formatCpu(selected);
            cpuLimit = cpuRequest;
        }

        String memoryRequest = profile.memoryRequest();
        String memoryLimit = profile.memoryLimit();
        if (request.getMemoryMiB() != null) {
            long selected = request.getMemoryMiB();
            if (selected <= 0 || selected > Long.MAX_VALUE / MIB) {
                throw new IllegalArgumentException("resourceRequest.memoryMiB must be a positive integer");
            }
            long selectedBytes = selected * MIB;
            long minimum = KubernetesQuantityParser.memoryBytes(profile.memoryRequest());
            long maximum = KubernetesQuantityParser.memoryBytes(profile.memoryLimit());
            if (selectedBytes < minimum || selectedBytes > maximum) {
                throw new IllegalArgumentException("resourceRequest.memoryMiB is outside the selected profile bounds");
            }
            memoryRequest = selected + "Mi";
            memoryLimit = memoryRequest;
        }

        int gpuCount = request.getGpuCount() == null ? profileGpuCount : request.getGpuCount();
        if (gpuCount != profileGpuCount) {
            throw new IllegalArgumentException("resourceRequest.gpuCount must match the selected profile");
        }

        Long gpuMemoryLimitMiB = request.getGpuMemoryLimitMiB();
        if (gpuMemoryLimitMiB != null) {
            if (runtime.deviceType() != TrainingPlanDefinition.DeviceType.NVIDIA_GPU) {
                throw new IllegalArgumentException("resourceRequest.gpuMemoryLimitMiB is only valid for GPU training");
            }
            if (gpuMemoryLimitMiB <= 0) {
                throw new IllegalArgumentException("resourceRequest.gpuMemoryLimitMiB must be a positive integer");
            }
        }

        return new TrainingRunSpec.Resources(
                profile.id(), cpuRequest, cpuLimit, memoryRequest, memoryLimit,
                profile.ephemeralStorageLimit(), gpuCount, gpuMemoryLimitMiB, nodeSelector
        );
    }

    private static void validateDeviceContract(
            TrainingPlanDefinition.DeviceType deviceType,
            int gpuCount
    ) {
        if (deviceType == TrainingPlanDefinition.DeviceType.NVIDIA_GPU && gpuCount != 1) {
            throw new IllegalArgumentException("NVIDIA_GPU profile must request exactly one GPU");
        }
        if (deviceType == TrainingPlanDefinition.DeviceType.CPU && gpuCount != 0) {
            throw new IllegalArgumentException("CPU profile cannot request a GPU");
        }
    }

    private static double requireFinitePositive(Double value, String field) {
        if (value == null || !Double.isFinite(value) || value <= 0) {
            throw new IllegalArgumentException(field + " must be a finite positive number");
        }
        return value;
    }

    private static void requireRange(double value, double minimum, double maximum, String field) {
        if (value < minimum || value > maximum) {
            throw new IllegalArgumentException(field + " is outside the selected profile bounds");
        }
    }

    private static String formatCpu(double value) {
        return BigDecimal.valueOf(value).stripTrailingZeros().toPlainString();
    }
}
