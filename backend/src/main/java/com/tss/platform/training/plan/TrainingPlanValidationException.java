package com.tss.platform.training.plan;

import java.util.List;

public class TrainingPlanValidationException extends IllegalArgumentException {

    private final List<String> violations;

    public TrainingPlanValidationException(String planSource, List<String> violations) {
        super("训练方案配置非法 " + planSource + ": " + String.join("; ", violations));
        this.violations = List.copyOf(violations);
    }

    public List<String> getViolations() {
        return violations;
    }
}
