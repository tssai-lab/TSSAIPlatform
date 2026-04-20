package com.tss.platform.model;

import java.util.Locale;

public enum TaskType {
    CV,
    NLP;

    public static String normalize(String value) {
        if (value == null || value.isBlank()) {
            throw new IllegalArgumentException("任务类型不能为空，仅支持 CV 或 NLP");
        }
        String normalized = value.trim().toUpperCase(Locale.ROOT);
        try {
            return TaskType.valueOf(normalized).name();
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("任务类型仅支持 CV 或 NLP");
        }
    }
}
