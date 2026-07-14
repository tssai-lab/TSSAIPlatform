package com.tss.platform.controller.v2;

import com.tss.platform.dto.DatasetMultimodalExternalIdSampleDto;
import com.tss.platform.dto.PageResponse;
import com.tss.platform.service.SampleService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api/v2/dataset-samples")
public class V2DatasetSampleController {

    private final SampleService service;

    public V2DatasetSampleController(SampleService service) {
        this.service = service;
    }

    @GetMapping("/multimodal")
    public PageResponse<DatasetMultimodalExternalIdSampleDto> findMultimodalByExternalId(
            @RequestParam String externalId,
            @RequestParam List<String> datasetVersionIds,
            @RequestParam(required = false) Integer page,
            @RequestParam(required = false) Integer pageSize
    ) {
        return service.findMultimodalByExternalId(
                externalId,
                datasetVersionIds,
                page,
                pageSize
        );
    }
}
