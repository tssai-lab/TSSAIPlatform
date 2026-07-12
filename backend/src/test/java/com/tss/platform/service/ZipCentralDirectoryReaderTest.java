package com.tss.platform.service;

import com.tss.platform.model.ZipEntryInfo;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ZipCentralDirectoryReaderTest {

    @Test
    void parsesCentralDirectoryAndLocalDataOffsets() throws Exception {
        byte[] zip = ZipTestFixtures.zip(
                ZipTestFixtures.stored("manifest.json", "{\"version\":\"1.0\"}"),
                ZipTestFixtures.deflated("samples/image.txt", "sample")
        );
        ZipCentralDirectoryReader reader = readerFor(zip);

        List<ZipEntryInfo> entries = reader.read("dataset.zip", zip.length);

        assertEquals(2, entries.size());
        ZipEntryInfo manifest = entries.get(0);
        assertEquals("manifest.json", manifest.path());
        assertEquals(0, manifest.method());
        assertEquals(17, manifest.uncompressedSize());
        assertTrue(manifest.zipDataOffset() > manifest.localHeaderOffset());
        assertTrue(manifest.zipDataOffset() + manifest.compressedSize() <= zip.length);
        assertEquals(8, entries.get(1).method());
    }

    @Test
    void normalizesBackslashEntryPathsAsDirectorySeparators() throws Exception {
        byte[] zip = ZipTestFixtures.zip(
                ZipTestFixtures.stored("data\\scores.jsonl", "{}")
        );
        ZipCentralDirectoryReader reader = readerFor(zip);

        List<ZipEntryInfo> entries = reader.read("dataset.zip", zip.length);

        assertEquals(1, entries.size());
        assertEquals("data\\scores.jsonl", entries.get(0).path());
        assertEquals("data/scores.jsonl", entries.get(0).normalizedPath());
    }

    @Test
    void treatsBackslashTerminatedEntriesAsDirectories() throws Exception {
        byte[] zip = ZipTestFixtures.zip(
                ZipTestFixtures.stored("data\\", "")
        );
        ZipCentralDirectoryReader reader = readerFor(zip);

        List<ZipEntryInfo> entries = reader.read("dataset.zip", zip.length);

        assertEquals(1, entries.size());
        assertEquals("data/", entries.get(0).normalizedPath());
        assertTrue(entries.get(0).directory());
    }

    @Test
    void rejectsParentDirectoryTraversal() throws Exception {
        byte[] zip = ZipTestFixtures.zip(ZipTestFixtures.stored("../manifest.json", "{}"));

        assertThrows(IllegalArgumentException.class,
                () -> readerFor(zip).read("dataset.zip", zip.length));
    }

    @Test
    void rejectsDuplicateNormalizedPaths() throws Exception {
        byte[] zip = ZipTestFixtures.zip(
                ZipTestFixtures.stored("a//manifest.json", "{}"),
                ZipTestFixtures.stored("a/./manifest.json", "{}")
        );

        assertThrows(IllegalArgumentException.class,
                () -> readerFor(zip).read("dataset.zip", zip.length));
    }

    @Test
    void rejectsUnsupportedCompressionMethod() throws Exception {
        byte[] zip = ZipTestFixtures.zip(ZipTestFixtures.stored("manifest.json", "{}"));
        byte[] patched = ZipTestFixtures.patchCompressionMethod(zip, 99);

        assertThrows(IllegalArgumentException.class,
                () -> readerFor(patched).read("dataset.zip", patched.length));
    }

    @Test
    void explicitEntryLimitRejectsFromEocdBeforeAnyLocalHeaderRangeRequest() throws Exception {
        ZipTestFixtures.EntrySpec[] entries = new ZipTestFixtures.EntrySpec[10_001];
        for (int index = 0; index < entries.length; index += 1) {
            entries[index] = ZipTestFixtures.stored("entry-" + index + ".txt", "");
        }
        byte[] zip = ZipTestFixtures.zip(entries);
        AtomicInteger localHeaderRangeRequests = new AtomicInteger();
        MinioService minioService = mock(MinioService.class);
        when(minioService.downloadRange(eq("dataset.zip"), anyLong(), anyLong()))
                .thenAnswer(invocation -> {
                    long offset = invocation.getArgument(1);
                    long length = invocation.getArgument(2);
                    int start = Math.toIntExact(offset);
                    if (length == 30
                            && start <= zip.length - 4
                            && (zip[start] & 0xff) == 0x50
                            && (zip[start + 1] & 0xff) == 0x4b
                            && (zip[start + 2] & 0xff) == 0x03
                            && (zip[start + 3] & 0xff) == 0x04) {
                        localHeaderRangeRequests.incrementAndGet();
                    }
                    int end = Math.toIntExact(offset + length);
                    return new ByteArrayInputStream(java.util.Arrays.copyOfRange(zip, start, end));
                });
        ZipCentralDirectoryReader reader = new ZipCentralDirectoryReader(minioService);

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> reader.read("dataset.zip", zip.length, 10_000)
        );

        assertTrue(error.getMessage().contains("10000"));
        assertEquals(0, localHeaderRangeRequests.get());
    }

    private static ZipCentralDirectoryReader readerFor(byte[] object) throws Exception {
        MinioService minioService = mock(MinioService.class);
        when(minioService.downloadRange(eq("dataset.zip"), anyLong(), anyLong()))
                .thenAnswer(invocation -> {
                    long offset = invocation.getArgument(1);
                    long length = invocation.getArgument(2);
                    int start = Math.toIntExact(offset);
                    int end = Math.toIntExact(offset + length);
                    return new ByteArrayInputStream(java.util.Arrays.copyOfRange(object, start, end));
                });
        return new ZipCentralDirectoryReader(minioService);
    }
}
