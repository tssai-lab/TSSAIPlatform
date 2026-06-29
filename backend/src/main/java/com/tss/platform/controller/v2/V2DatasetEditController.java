package com.tss.platform.controller.v2;

import com.tss.platform.dto.DatasetPackageAppendInitRequest;
import com.tss.platform.dto.v2.V2DatasetEditSessionDto;
import com.tss.platform.dto.v2.V2DatasetPublishResult;
import com.tss.platform.dto.v2.V2DatasetUploadDto;
import com.tss.platform.service.V2DatasetEditService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v2")
public class V2DatasetEditController {

    private final V2DatasetEditService service;

    public V2DatasetEditController(V2DatasetEditService service) {
        this.service = service;
    }

    @PostMapping("/datasets/{datasetId}/edit-sessions")
    public V2DatasetEditSessionDto create(@PathVariable String datasetId) {
        return service.createEditSession(datasetId);
    }

    @GetMapping("/dataset-edit-sessions/{editSessionId}")
    public V2DatasetEditSessionDto get(@PathVariable String editSessionId) {
        return service.getEditSession(editSessionId);
    }

    @PostMapping("/dataset-edit-sessions/{editSessionId}/uploads/init")
    public V2DatasetUploadDto initUpload(
            @PathVariable String editSessionId,
            @RequestBody DatasetPackageAppendInitRequest request
    ) {
        return service.initUpload(editSessionId, request);
    }

    @PostMapping("/dataset-edit-sessions/{editSessionId}/publish")
    public V2DatasetPublishResult publish(@PathVariable String editSessionId) {
        return service.publish(editSessionId);
    }
}
