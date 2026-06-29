package com.tss.platform.service;

import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class ModelWeightZipValidatorTest {

    @Test
    void acceptsAllowedWeightFiles() throws Exception {
        byte[] zip = buildZip(
                entry("weights/best.pt", "FAKE"),
                entry("config/model.yaml", "model: logreg\n"),
                entry("meta.json", "{}")
        );
        assertDoesNotThrow(() -> validate(zip));
    }

    @Test
    void rejectsPythonScript() throws Exception {
        byte[] zip = buildZip(entry("scripts/load.py", "import os"));
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> validate(zip)
        );
        assertEquals("模型权重包不允许脚本或可执行文件: scripts/load.py", error.getMessage());
    }

    @Test
    void rejectsUnsupportedExtension() throws Exception {
        byte[] zip = buildZip(entry("weights/model.bin", "binary"));
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> validate(zip)
        );
        assertEquals("模型权重包包含不支持的文件类型: weights/model.bin", error.getMessage());
    }

    @Test
    void rejectsFileWithoutExtension() throws Exception {
        byte[] zip = buildZip(entry("weights/best", "noext"));
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> validate(zip)
        );
        assertEquals("模型权重包包含无扩展名文件: weights/best", error.getMessage());
    }

    @Test
    void rejectsPathTraversal() throws Exception {
        byte[] zip = buildZip(entry("../etc/passwd", "x"));
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> validate(zip)
        );
        assertEquals("模型权重 zip 包含非法路径: ../etc/passwd", error.getMessage());
    }

    @Test
    void rejectsEmptyZip() throws Exception {
        byte[] zip = buildZip();
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> validate(zip)
        );
        assertEquals("模型权重 zip 不能为空", error.getMessage());
    }

    private static ZipEntrySpec entry(String name, String content) {
        return new ZipEntrySpec(name, content);
    }

    private static byte[] buildZip(ZipEntrySpec... entries) throws Exception {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(out)) {
            for (ZipEntrySpec spec : entries) {
                ZipEntry zipEntry = new ZipEntry(spec.name);
                zos.putNextEntry(zipEntry);
                zos.write(spec.content.getBytes());
                zos.closeEntry();
            }
        }
        return out.toByteArray();
    }

    private static void validate(byte[] zipBytes) throws Exception {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(zipBytes))) {
            ModelWeightZipValidator.validate(zip);
        }
    }

    private record ZipEntrySpec(String name, String content) {
    }
}
