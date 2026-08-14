package com.tss.platform.controller.v2;

import com.tss.platform.dto.TrainingPlanAdminDtos;
import com.tss.platform.service.TrainingPlanAdministrationService;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@RestController
@RequestMapping("/api/admin/training-plans")
public class TrainingPlanAdministrationController {

    private final TrainingPlanAdministrationService service;

    public TrainingPlanAdministrationController(TrainingPlanAdministrationService service) {
        this.service = service;
    }

    @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TrainingPlanAdminDtos.Preview preview(
            @RequestPart(value = "file", required = false) MultipartFile file
    ) {
        return service.preview(file);
    }

    @PostMapping(value = "/publish", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public TrainingPlanAdminDtos.Detail publish(
            @RequestPart(value = "file", required = false) MultipartFile file,
            @RequestParam(required = false) String expectedSha256
    ) {
        return service.publish(file, expectedSha256);
    }

    @PostMapping("/{planId}/{version}/disable")
    public TrainingPlanAdminDtos.Detail disable(
            @PathVariable String planId,
            @PathVariable String version
    ) {
        return service.disable(planId, version);
    }

    @GetMapping
    public List<TrainingPlanAdminDtos.Summary> list() {
        return service.list();
    }

    @GetMapping("/{planId}/{version}")
    public TrainingPlanAdminDtos.Detail get(
            @PathVariable String planId,
            @PathVariable String version
    ) {
        return service.get(planId, version);
    }
}
