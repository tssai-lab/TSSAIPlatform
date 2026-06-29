package com.tss.platform.training;

import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

public final class TrainingProfileRegistry {

    public static final String IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG = "image_text_consistency_fusion_logreg";

    public static final String TRUSTED_CODE_VERSION_CONSISTENCY_TEST = "code-ver-consistency-test-v1";

    private static final Set<String> SUPPORTED = Set.of(IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG);

    /** 训练方案展示名（用户可见文案，内部值仍用 profile 常量） */
    public static final Map<String, String> PROFILE_DISPLAY_NAMES = Map.of(
            IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG, "图文一致性基线训练"
    );

    public static String displayNameOf(String profile) {
        if (profile == null) return null;
        return PROFILE_DISPLAY_NAMES.getOrDefault(profile.trim(), profile);
    }

    private TrainingProfileRegistry() {
    }

    public static boolean isSupported(String profile) {
        return profile != null && SUPPORTED.contains(profile.trim());
    }

    public static void requireSupported(String profile) {
        if (!isSupported(profile)) {
            throw new IllegalArgumentException("不支持的 trainingProfile: " + profile);
        }
    }

    public static Optional<ProfileSpec> specOf(String profile) {
        if (!isSupported(profile)) {
            return Optional.empty();
        }
        if (IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG.equals(profile.trim())) {
            return Optional.of(new ProfileSpec(
                    IMAGE_TEXT_CONSISTENCY_FUSION_LOGREG,
                    List.of(
                            "python",
                            "scripts/training/train_fusion_baseline.py",
                            "--data-dir", "data",
                            "--model", "logreg",
                            "--out-dir", "outputs/fusion_baseline_logreg"
                    ),
                    "scripts/training/train_fusion_baseline.py",
                    "outputs/fusion_baseline_logreg/metrics.json",
                    "outputs/fusion_baseline_logreg",
                    List.of(
                            "fusion_model.pkl",
                            "metrics.json",
                            "val_predictions.csv",
                            "test_predictions.csv"
                    ),
                    "NLP"
            ));
        }
        return Optional.empty();
    }

    public record ProfileSpec(
            String name,
            List<String> command,
            String requiredEntryScript,
            String metricsRelativePath,
            String outputRelativeDir,
            List<String> artifactFiles,
            String requiredDatasetType
    ) {
    }
}
