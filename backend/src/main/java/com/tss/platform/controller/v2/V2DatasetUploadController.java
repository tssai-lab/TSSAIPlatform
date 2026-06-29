package com.tss.platform.controller.v2;

import com.tss.platform.dto.DatasetUploadInitRequest;
import com.tss.platform.dto.v2.V2DatasetUploadDto;
import com.tss.platform.service.V2DatasetUploadService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/v2/dataset-uploads")
public class V2DatasetUploadController {

    private final V2DatasetUploadService service;

    public V2DatasetUploadController(V2DatasetUploadService service) {
        this.service = service;
    }

    @PostMapping("/init")
    public V2DatasetUploadDto init(@RequestBody DatasetUploadInitRequest request) {
        return service.init(request);
    }

    @PostMapping(
            value = "/{uploadId}/chunks",
            consumes = MediaType.MULTIPART_FORM_DATA_VALUE
    )
    public V2DatasetUploadDto uploadChunk(
            @PathVariable String uploadId,
            @RequestParam Integer partIndex,
            @RequestParam("file") MultipartFile file
    ) {
        return service.saveChunk(uploadId, partIndex, file);
    }

    @GetMapping("/{uploadId}")
    public V2DatasetUploadDto get(@PathVariable String uploadId) {
        return service.get(uploadId);
    }

    @PostMapping("/{uploadId}/complete")
    public V2DatasetUploadDto complete(@PathVariable String uploadId) {
        return service.complete(uploadId);
    }
}
