package com.tss.platform.service;

import com.tss.platform.model.ZipEntryInfo;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.zip.Inflater;
import java.util.zip.InflaterInputStream;

@Service
public class ManifestZipReader {

    private static final long MAX_MANIFEST_SIZE = 10L * 1024 * 1024;

    private final ZipCentralDirectoryReader centralDirectoryReader;
    private final MinioService minioService;

    public ManifestZipReader(
            ZipCentralDirectoryReader centralDirectoryReader,
            MinioService minioService
    ) {
        this.centralDirectoryReader = centralDirectoryReader;
        this.minioService = minioService;
    }

    public String readManifest(
            String objectName,
            long objectSize,
            String manifestPath
    ) throws Exception {
        String safePath = DatasetUploadService.normalizeManifestPath("MANIFEST", manifestPath);
        String normalizedPath = ZipCentralDirectoryReader.normalizePath(safePath);
        List<ZipEntryInfo> entries = centralDirectoryReader.read(objectName, objectSize);
        ZipEntryInfo manifest = entries.stream()
                .filter(entry -> normalizedPath.equals(entry.normalizedPath()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Manifest entry not found: " + safePath));

        if (manifest.directory()) {
            throw new IllegalArgumentException("Manifest path points to a directory");
        }
        if (manifest.uncompressedSize() > MAX_MANIFEST_SIZE) {
            throw new IllegalArgumentException("Manifest exceeds 10MB");
        }

        try (InputStream range = minioService.downloadRange(
                objectName,
                manifest.zipDataOffset(),
                manifest.compressedSize()
        )) {
            if (manifest.method() == 0) {
                return decodeBounded(range, manifest.uncompressedSize());
            }
            if (manifest.method() == 8) {
                try (InflaterInputStream inflater = new InflaterInputStream(range, new Inflater(true))) {
                    return decodeBounded(inflater, manifest.uncompressedSize());
                }
            }
            throw new IllegalArgumentException("Unsupported manifest compression method: " + manifest.method());
        }
    }

    private static String decodeBounded(InputStream input, long declaredSize) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream((int) Math.min(declaredSize, MAX_MANIFEST_SIZE));
        byte[] buffer = new byte[8192];
        long total = 0;
        int read;
        while ((read = input.read(buffer)) >= 0) {
            total += read;
            if (total > MAX_MANIFEST_SIZE) {
                throw new IllegalArgumentException("Manifest exceeds 10MB");
            }
            output.write(buffer, 0, read);
        }
        if (total != declaredSize) {
            throw new IllegalArgumentException("Manifest size does not match ZIP metadata");
        }
        return output.toString(StandardCharsets.UTF_8);
    }
}
