package com.tss.platform.service;

import com.tss.platform.dto.PointCloudPreviewDto;
import com.tss.platform.entity.DatasetAsset;
import com.tss.platform.entity.DatasetVersion;
import com.tss.platform.model.ZipEntryInfo;
import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.security.AuthContext;
import org.junit.jupiter.api.Test;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Optional;
import java.util.List;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PointCloudPreviewServiceTest {

    @Test
    void pcdPreviewReturnsSupportedPcd() {
        TestFixture fixture = fixture("scan.pcd", "POINT_CLOUD", 7, 1024L, 100_000, null);

        PointCloudPreviewDto preview = fixture.service.preview("dataset-ver-1");

        assertTrue(preview.isPreviewSupported());
        assertEquals("PCD", preview.getFormat());
        assertEquals("/api/dataset/point-cloud/file?id=dataset-ver-1", preview.getPreviewUrl());
    }

    @Test
    void v2PcdPreviewReturnsVersionedFileLink() {
        TestFixture fixture = fixture("scan.pcd", "POINT_CLOUD", 7, 1024L, 100_000, null);

        PointCloudPreviewDto preview = fixture.service.previewForV2("dataset-ver-1");

        assertTrue(preview.isPreviewSupported());
        assertEquals(
                "/api/v2/dataset-versions/dataset-ver-1/point-cloud/file",
                preview.getPreviewUrl()
        );
        assertFalse(preview.getPreviewUrl().contains("/api/dataset/"));
    }

    @Test
    void plyPreviewReturnsSupportedPly() {
        TestFixture fixture = fixture("scan.ply", "POINT_CLOUD", 7, 1024L, 100_000, null);

        PointCloudPreviewDto preview = fixture.service.preview("dataset-ver-1");

        assertTrue(preview.isPreviewSupported());
        assertEquals("PLY", preview.getFormat());
    }

    @Test
    void zipPreviewReturnsPointCloudFiles() throws Exception {
        byte[] zip = zip(
                entry("clouds/scan1.pcd", "pcd"),
                entry("clouds/scan2.ply", "ply"),
                entry("meta/info.json", "{}")
        );
        TestFixture fixture = fixture("pointcloud.zip", "POINT_CLOUD", 7, (long) zip.length, 100_000, zip);

        PointCloudPreviewDto preview = fixture.service.preview("dataset-ver-1");

        assertTrue(preview.isPreviewSupported());
        assertEquals("ZIP", preview.getFormat());
        assertNotNull(preview.getPointCloudFiles());
        assertEquals(2, preview.getPointCloudFiles().size());
        assertEquals("clouds/scan1.pcd", preview.getPointCloudFiles().get(0).getPath());
        assertEquals(3L, preview.getPointCloudFiles().get(0).getSizeBytes());
        assertTrue(preview.getPointCloudFiles().get(0).isPreviewAllowed());
        assertTrue(preview.getPointCloudFiles().get(0).getPreviewUrl().contains("/api/dataset/point-cloud/zip-file"));
        verify(fixture.minioService, never()).downloadStream(fixture.version.getStoragePath());
    }

    @Test
    void v2ZipPreviewReturnsVersionedZipFileLinks() throws Exception {
        byte[] zip = zip(entry("clouds/scan1.pcd", "pcd"));
        TestFixture fixture = fixture("pointcloud.zip", "POINT_CLOUD", 7, (long) zip.length, 100_000, zip);

        PointCloudPreviewDto preview = fixture.service.previewForV2("dataset-ver-1");

        assertTrue(preview.isPreviewSupported());
        assertEquals(
                "/api/v2/dataset-versions/dataset-ver-1/point-cloud/zip-file?path=clouds%2Fscan1.pcd",
                preview.getPointCloudFiles().get(0).getPreviewUrl()
        );
        assertFalse(preview.getPointCloudFiles().get(0).getPreviewUrl().contains("/api/dataset/"));
    }

    @Test
    void zipFileReturnsSelectedPointCloudEntryStream() throws Exception {
        byte[] content = "pcd-content".getBytes(StandardCharsets.UTF_8);
        byte[] zip = zip(entry("clouds/scan.pcd", new String(content, StandardCharsets.UTF_8)));
        TestFixture fixture = fixture("pointcloud.zip", "POINT_CLOUD", 7, (long) zip.length, 100_000, zip);

        PointCloudPreviewService.PointCloudFileStream stream =
                fixture.service.openZipPointCloudFile("dataset-ver-1", "clouds/scan.pcd");

        try (InputStream is = stream.inputStream()) {
            assertArrayEquals(content, is.readAllBytes());
        }
        assertEquals("PCD", stream.format());
    }

    @Test
    void zipPreviewTempStreamDoesNotRegisterDeleteOnExitHooks() throws Exception {
        String source = Files.readString(Path.of(
                "src/main/java/com/tss/platform/service/PointCloudPreviewService.java"
        ));

        assertFalse(source.contains("deleteOnExit("));
    }

    @Test
    void zipPreviewListsOversizedEntryAsNotPreviewableWithoutDecompressingIt() throws Exception {
        byte[] zip = zip(entry("clouds/large.pcd", "x".repeat(101)));
        TestFixture fixture = fixture("pointcloud.zip", "POINT_CLOUD", 7, (long) zip.length, 100, zip);

        PointCloudPreviewDto preview = fixture.service.preview("dataset-ver-1");

        assertFalse(preview.isPreviewSupported());
        assertEquals(1, preview.getPointCloudFiles().size());
        assertEquals(101L, preview.getPointCloudFiles().get(0).getSizeBytes());
        assertFalse(preview.getPointCloudFiles().get(0).isPreviewAllowed());
        assertEquals("文件过大，请下载后本地查看", preview.getPointCloudFiles().get(0).getMessage());
        verify(fixture.minioService, never()).downloadStream(fixture.version.getStoragePath());
    }

    @Test
    void zipFileNearArchiveEndReadsOnlySelectedEntryRange() throws Exception {
        byte[] content = "selected-point-cloud".getBytes(StandardCharsets.UTF_8);
        byte[] zip = zipWithLargeStoredPredecessor(
                "clouds/predecessor.pcd",
                "clouds/selected.ply",
                content
        );
        List<ZipEntryInfo> entries = readZipEntries(zip);
        ZipEntryInfo predecessor = entries.stream()
                .filter(entry -> "clouds/predecessor.pcd".equals(entry.normalizedPath()))
                .findFirst()
                .orElseThrow();
        ZipEntryInfo selected = entries.stream()
                .filter(entry -> "clouds/selected.ply".equals(entry.normalizedPath()))
                .findFirst()
                .orElseThrow();
        TestFixture fixture = fixture("pointcloud.zip", "POINT_CLOUD", 7, (long) zip.length, 100_000, zip);

        PointCloudPreviewService.PointCloudFileStream result =
                fixture.service.openZipPointCloudFile("dataset-ver-1", "clouds/selected.ply");

        try (InputStream input = result.inputStream()) {
            assertArrayEquals(content, input.readAllBytes());
        }
        verify(fixture.minioService).downloadRange(
                fixture.version.getStoragePath(),
                selected.zipDataOffset(),
                selected.compressedSize()
        );
        verify(fixture.minioService, never()).downloadRange(
                fixture.version.getStoragePath(),
                predecessor.zipDataOffset(),
                predecessor.compressedSize()
        );
        verify(fixture.minioService, never()).downloadStream(fixture.version.getStoragePath());
    }

    @Test
    void rejectsUnsafeZipEntryPathInPreview() throws Exception {
        byte[] zip = zip(entry("../escape.pcd", "bad"));
        TestFixture fixture = fixture("pointcloud.zip", "POINT_CLOUD", 7, (long) zip.length, 100_000, zip);

        IllegalArgumentException error = assertThrows(IllegalArgumentException.class, () ->
                fixture.service.preview("dataset-ver-1")
        );

        assertTrue(error.getMessage().contains("非法"));
    }

    @Test
    void zipPreviewAllowsDoubleDotInsideLegalFileName() throws Exception {
        byte[] zip = zip(entry("clouds/foo..bar.pcd", "pcd"));
        TestFixture fixture = fixture("pointcloud.zip", "POINT_CLOUD", 7, (long) zip.length, 100_000, zip);

        PointCloudPreviewDto preview = fixture.service.preview("dataset-ver-1");

        assertTrue(preview.isPreviewSupported());
        assertEquals("clouds/foo..bar.pcd", preview.getPointCloudFiles().get(0).getPath());
    }

    @Test
    void rejectsNonPointCloudDataset() {
        TestFixture fixture = fixture("image.zip", "CV", 7, 1024L, 100_000, null);

        DatasetPreviewAccessException error = assertThrows(DatasetPreviewAccessException.class, () ->
                fixture.service.preview("dataset-ver-1")
        );

        assertEquals(DatasetPreviewAccessException.Reason.NOT_PREVIEWABLE, error.getReason());
        assertTrue(error.getMessage().contains("POINT_CLOUD"));
    }

    @Test
    void rejectsArchivedPointCloudDatasetPreview() {
        TestFixture fixture = fixture("scan.pcd", "POINT_CLOUD", 7, 1024L, 100_000, null);
        fixture.version.setStatus("ARCHIVED");

        DatasetPreviewAccessException error = assertThrows(DatasetPreviewAccessException.class, () ->
                fixture.service.preview("dataset-ver-1")
        );

        assertEquals(DatasetPreviewAccessException.Reason.NOT_PREVIEWABLE, error.getReason());
        assertTrue(error.getMessage().contains("READY"));
    }

    @Test
    void rejectsOtherUsersDatasetForNormalUser() {
        TestFixture fixture = fixture("scan.pcd", "POINT_CLOUD", 8, 1024L, 100_000, null);

        DatasetPreviewAccessException error = assertThrows(DatasetPreviewAccessException.class, () ->
                fixture.service.preview("dataset-ver-1")
        );

        assertEquals(DatasetPreviewAccessException.Reason.NOT_FOUND, error.getReason());
        assertTrue(error.getMessage().contains("no permission"));
    }

    @Test
    void oversizedSingleFilePreviewIsNotSupported() {
        TestFixture fixture = fixture("scan.pcd", "POINT_CLOUD", 7, 1024L, 100, null);
        fixture.version.setSizeBytes(101L);

        PointCloudPreviewDto preview = fixture.service.preview("dataset-ver-1");

        assertFalse(preview.isPreviewSupported());
        assertEquals("文件过大，请下载后本地查看", preview.getMessage());
    }

    @Test
    void historicalUnknownSizeDoesNotBypassPreviewLimitWhenStatFails() throws Exception {
        TestFixture fixture = fixture("scan.pcd", "POINT_CLOUD", 7, null, 100, null);
        when(fixture.minioService.stat(fixture.version.getStoragePath()))
                .thenThrow(new IllegalStateException("metadata unavailable"));

        PointCloudPreviewDto preview = fixture.service.previewForV2("dataset-ver-1");

        assertFalse(preview.isPreviewSupported());
        assertEquals("文件过大，请下载后本地查看", preview.getMessage());
        assertThrows(IllegalArgumentException.class, () ->
                fixture.service.openPointCloudFile("dataset-ver-1")
        );
        verify(fixture.minioService, never()).downloadStream(fixture.version.getStoragePath());
    }

    @Test
    void historicalZipUnknownObjectSizeFailsClosedWhenStatFails() throws Exception {
        byte[] zip = zip(entry("clouds/scan.pcd", "pcd"));
        TestFixture fixture = fixture("pointcloud.zip", "POINT_CLOUD", 7, null, 100_000, zip);
        when(fixture.minioService.stat(fixture.version.getStoragePath()))
                .thenThrow(new IllegalStateException("metadata unavailable"));

        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> fixture.service.previewForV2("dataset-ver-1")
        );

        assertTrue(error.getMessage().contains("大小"));
        verify(fixture.minioService, never()).downloadStream(fixture.version.getStoragePath());
        verify(fixture.minioService, never()).downloadRange(anyString(), anyLong(), anyLong());
    }

    private TestFixture fixture(
            String fileName,
            String type,
            Integer ownerUserId,
            Long sizeBytes,
            long maxPreviewSize,
            byte[] minioObject
    ) {
        DatasetVersionRepository versionRepo = mock(DatasetVersionRepository.class);
        DatasetAssetRepository assetRepo = mock(DatasetAssetRepository.class);
        MinioService minioService = mock(MinioService.class);
        AuthContext authContext = mock(AuthContext.class);

        DatasetVersion version = new DatasetVersion();
        version.setId("dataset-ver-1");
        version.setAssetId("dataset-asset-1");
        version.setFileName(fileName);
        version.setStoragePath("users/" + ownerUserId + "/datasets/dataset-asset-1/v1/" + fileName);
        version.setSizeBytes(sizeBytes);
        version.setOwnerUserId(ownerUserId);
        version.setStatus("READY");

        DatasetAsset asset = new DatasetAsset();
        asset.setId("dataset-asset-1");
        asset.setType(type);
        asset.setOwnerUserId(ownerUserId);

        when(versionRepo.findByIdAndDeletedFalse("dataset-ver-1")).thenReturn(Optional.of(version));
        when(assetRepo.findByIdAndDeletedFalse("dataset-asset-1")).thenReturn(Optional.of(asset));
        doAnswer(invocation -> {
            Integer owner = invocation.getArgument(0);
            String message = invocation.getArgument(1);
            if (!Integer.valueOf(7).equals(owner)) {
                throw new IllegalArgumentException(message);
            }
            return null;
        }).when(authContext).requireOwnerAccess(any(), anyString());

        if (minioObject != null) {
            try {
                when(minioService.downloadStream(version.getStoragePath()))
                        .thenAnswer(invocation -> new ByteArrayInputStream(minioObject));
                stubRangeDownloads(minioService, minioObject);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        }

        PointCloudPreviewService service = new PointCloudPreviewService(
                versionRepo,
                assetRepo,
                minioService,
                authContext,
                maxPreviewSize
        );
        return new TestFixture(service, version, minioService);
    }

    private static Entry entry(String name, String content) {
        return new Entry(name, content);
    }

    private static byte[] zip(Entry... entries) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            for (Entry entry : entries) {
                zip.putNextEntry(new ZipEntry(entry.name()));
                zip.write(entry.content().getBytes(StandardCharsets.UTF_8));
                zip.closeEntry();
            }
        }
        return bytes.toByteArray();
    }

    private static byte[] zipWithLargeStoredPredecessor(
            String predecessorName,
            String selectedName,
            byte[] selectedContent
    ) throws Exception {
        byte[] predecessorContent = new byte[200_000];
        for (int index = 0; index < predecessorContent.length; index += 1) {
            predecessorContent[index] = (byte) (index * 31 + 7);
        }
        CRC32 crc = new CRC32();
        crc.update(predecessorContent);

        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
            ZipEntry predecessor = new ZipEntry(predecessorName);
            predecessor.setMethod(ZipEntry.STORED);
            predecessor.setSize(predecessorContent.length);
            predecessor.setCompressedSize(predecessorContent.length);
            predecessor.setCrc(crc.getValue());
            zip.putNextEntry(predecessor);
            zip.write(predecessorContent);
            zip.closeEntry();

            zip.putNextEntry(new ZipEntry(selectedName));
            zip.write(selectedContent);
            zip.closeEntry();
        }
        return bytes.toByteArray();
    }

    private static List<ZipEntryInfo> readZipEntries(byte[] zip) throws Exception {
        MinioService minioService = mock(MinioService.class);
        stubRangeDownloads(minioService, zip);
        return new ZipCentralDirectoryReader(minioService).read("archive.zip", zip.length);
    }

    private static void stubRangeDownloads(MinioService minioService, byte[] objectBytes) throws Exception {
        when(minioService.downloadRange(anyString(), anyLong(), anyLong()))
                .thenAnswer(invocation -> {
                    long offset = invocation.getArgument(1);
                    long length = invocation.getArgument(2);
                    if (offset < 0 || length < 0 || offset > objectBytes.length - length) {
                        throw new IllegalArgumentException("invalid test range");
                    }
                    return new ByteArrayInputStream(
                            objectBytes,
                            Math.toIntExact(offset),
                            Math.toIntExact(length)
                    );
                });
    }

    private record Entry(String name, String content) {
    }

    private record TestFixture(
            PointCloudPreviewService service,
            DatasetVersion version,
            MinioService minioService
    ) {
    }
}
