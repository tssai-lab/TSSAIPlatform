package com.tss.platform.service;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class CodePathPolicyTest {

    private final CodePathPolicy policy = new CodePathPolicy();

    @Test
    void normalizesWindowsSeparatorsWithoutCollapsingComponents() {
        assertEquals("src/training/train.py", policy.normalizeFilePath("src\\training\\train.py"));
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {
            "",
            "   ",
            "/absolute.py",
            "\\absolute.py",
            "C:\\training\\train.py",
            "a/../train.py",
            "a/./train.py",
            "a//train.py",
            "trailing/",
            "nul\u0000name.py"
    })
    void rejectsUnsafeOrAmbiguousPaths(String rawPath) {
        CodeValidationException error = assertThrows(
                CodeValidationException.class,
                () -> policy.normalizeFilePath(rawPath)
        );

        assertEquals("INVALID_PATH", error.getReasonCode());
    }

    @Test
    void rejectsExactDuplicateAfterNormalization() {
        CodeValidationException error = assertThrows(
                CodeValidationException.class,
                () -> policy.validateNoTreeConflicts(List.of("src/train.py", "src/train.py"))
        );

        assertEquals("DUPLICATE_PATH", error.getReasonCode());
    }

    @Test
    void rejectsFileThatIsAncestorOfAnotherFile() {
        CodeValidationException error = assertThrows(
                CodeValidationException.class,
                () -> policy.validateNoTreeConflicts(List.of("train.py/config.json", "train.py"))
        );

        assertEquals("TREE_CONFLICT", error.getReasonCode());
    }

    @Test
    void treatsPathsAsCaseSensitive() {
        assertDoesNotThrow(() -> policy.validateNoTreeConflicts(List.of("Train.py", "train.py")));
    }
}
