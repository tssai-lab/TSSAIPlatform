package com.tss.platform.controller.v2;

import com.tss.platform.dto.DatasetContentPreviewDto;
import com.tss.platform.dto.DatasetPreviewFileListDto;
import com.tss.platform.dto.PointCloudPreviewDto;
import com.tss.platform.dto.v2.V2DatasetPreviewDescriptor;
import com.tss.platform.service.DatasetPreviewService;
import com.tss.platform.service.DatasetPreviewService.DatasetImageStream;
import com.tss.platform.service.PointCloudPreviewService;
import com.tss.platform.service.PointCloudPreviewService.PointCloudFileStream;
import com.tss.platform.service.V2DatasetPreviewDescriptorService;
import org.springframework.core.io.InputStreamResource;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

@RestController
@RequestMapping("/api/v2/dataset-versions")
public class V2DatasetPreviewController {

    private final V2DatasetPreviewDescriptorService descriptorService;
    private final DatasetPreviewService archivePreviewService;
    private final PointCloudPreviewService pointCloudPreviewService;

    public V2DatasetPreviewController(
            V2DatasetPreviewDescriptorService descriptorService,
            DatasetPreviewService archivePreviewService,
            PointCloudPreviewService pointCloudPreviewService
    ) {
        this.descriptorService = descriptorService;
        this.archivePreviewService = archivePreviewService;
        this.pointCloudPreviewService = pointCloudPreviewService;
    }

    @GetMapping("/{versionId}/preview")
    public V2DatasetPreviewDescriptor preview(@PathVariable String versionId) {
        return descriptorService.describe(versionId);
    }

    @GetMapping("/{versionId}/preview/files")
    public DatasetPreviewFileListDto archiveFiles(
            @PathVariable String versionId,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "pageSize", required = false) Integer pageSize,
            @RequestParam(value = "keyword", required = false) String keyword,
            @RequestParam(value = "kind", required = false) String kind
    ) {
        return archivePreviewService.listFilesForV2(
                versionId,
                page,
                pageSize,
                keyword,
                kind
        );
    }

    @GetMapping("/{versionId}/preview/content")
    public DatasetContentPreviewDto archiveContent(
            @PathVariable String versionId,
            @RequestParam(value = "path", required = false) String path,
            @RequestParam(value = "page", required = false) Integer page,
            @RequestParam(value = "pageSize", required = false) Integer pageSize
    ) {
        return archivePreviewService.previewContentForV2(versionId, path, page, pageSize);
    }

    @GetMapping("/{versionId}/preview/image")
    public ResponseEntity<InputStreamResource> archiveImage(
            @PathVariable String versionId,
            @RequestParam("path") String path
    ) {
        DatasetImageStream image = archivePreviewService.openImage(versionId, path);
        ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, inlineDisposition(
                        image.fileName(),
                        "dataset-image"
                ))
                .contentType(MediaType.parseMediaType(image.contentType()));
        if (image.sizeBytes() != null && image.sizeBytes() >= 0) {
            builder.contentLength(image.sizeBytes());
        }
        return builder.body(new InputStreamResource(image.inputStream()));
    }

    @GetMapping("/{versionId}/point-cloud/preview")
    public PointCloudPreviewDto pointCloudPreview(@PathVariable String versionId) {
        return pointCloudPreviewService.previewForV2(versionId);
    }

    @GetMapping("/{versionId}/point-cloud/file")
    public ResponseEntity<InputStreamResource> pointCloudFile(
            @PathVariable String versionId
    ) {
        return pointCloudStream(pointCloudPreviewService.openPointCloudFile(versionId));
    }

    @GetMapping("/{versionId}/point-cloud/zip-file")
    public ResponseEntity<InputStreamResource> pointCloudZipFile(
            @PathVariable String versionId,
            @RequestParam("path") String path
    ) {
        return pointCloudStream(
                pointCloudPreviewService.openZipPointCloudFile(versionId, path)
        );
    }

    private ResponseEntity<InputStreamResource> pointCloudStream(
            PointCloudFileStream file
    ) {
        ResponseEntity.BodyBuilder builder = ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, inlineDisposition(
                        file.fileName(),
                        "point-cloud"
                ))
                .contentType(MediaType.APPLICATION_OCTET_STREAM);
        if (file.sizeBytes() != null && file.sizeBytes() >= 0) {
            builder.contentLength(file.sizeBytes());
        }
        return builder.body(new InputStreamResource(file.inputStream()));
    }

    private String inlineDisposition(String fileName, String defaultName) {
        String encoded = URLEncoder.encode(
                        fileName == null ? defaultName : fileName,
                        StandardCharsets.UTF_8
                )
                .replace("+", "%20");
        return "inline; filename*=UTF-8''" + encoded;
    }
}
