package com.tss.platform.service;

import com.tss.platform.controller.v2.V2DatasetPreviewController;
import com.tss.platform.controller.v2.V2ExceptionHandler;
import com.tss.platform.dto.DatasetPreviewFileDto;
import com.tss.platform.dto.DatasetPreviewFileListDto;
import com.tss.platform.dto.PointCloudPreviewDto;
import com.tss.platform.dto.PointCloudPreviewFileDto;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class V2DatasetPreviewControllerTest {

    @Test
    void archiveFilesRouteReturnsV2PreviewLinks() throws Exception {
        V2DatasetPreviewDescriptorService descriptorService =
                mock(V2DatasetPreviewDescriptorService.class);
        DatasetPreviewService previewService = mock(DatasetPreviewService.class);
        PointCloudPreviewService pointCloudService = mock(PointCloudPreviewService.class);
        DatasetPreviewFileListDto dto = new DatasetPreviewFileListDto();
        dto.setDatasetVersionId("version-1");
        DatasetPreviewFileDto file = new DatasetPreviewFileDto();
        file.setPath("images/front.png");
        file.setPreviewAllowed(true);
        file.setPreviewUrl(
                "/api/v2/dataset-versions/version-1/preview/image?path=images%2Ffront.png"
        );
        dto.setFiles(List.of(file));
        when(previewService.listFilesForV2("version-1", 1, 20, "front", "image"))
                .thenReturn(dto);

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new V2DatasetPreviewController(
                        descriptorService,
                        previewService,
                        pointCloudService
                ))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();

        mvc.perform(get("/api/v2/dataset-versions/version-1/preview/files")
                        .param("page", "1")
                        .param("pageSize", "20")
                        .param("keyword", "front")
                        .param("kind", "image"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.datasetVersionId").value("version-1"))
                .andExpect(jsonPath("$.files[0].previewUrl").value(
                        "/api/v2/dataset-versions/version-1/preview/image?path=images%2Ffront.png"
                ))
                .andExpect(jsonPath("$.files[0].previewUrl").value(
                        org.hamcrest.Matchers.not(
                                org.hamcrest.Matchers.containsString("/api/dataset/")
                        )
                ));
    }

    @Test
    void pointCloudPreviewRouteReturnsV2PreviewLinks() throws Exception {
        V2DatasetPreviewDescriptorService descriptorService =
                mock(V2DatasetPreviewDescriptorService.class);
        DatasetPreviewService previewService = mock(DatasetPreviewService.class);
        PointCloudPreviewService pointCloudService = mock(PointCloudPreviewService.class);
        PointCloudPreviewDto dto = new PointCloudPreviewDto();
        dto.setDatasetVersionId("version-1");
        dto.setFormat("ZIP");
        PointCloudPreviewFileDto file = new PointCloudPreviewFileDto();
        file.setPath("clouds/scan.pcd");
        file.setPreviewAllowed(true);
        file.setPreviewUrl(
                "/api/v2/dataset-versions/version-1/point-cloud/zip-file?path=clouds%2Fscan.pcd"
        );
        dto.setPointCloudFiles(List.of(file));
        when(pointCloudService.previewForV2("version-1")).thenReturn(dto);

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new V2DatasetPreviewController(
                        descriptorService,
                        previewService,
                        pointCloudService
                ))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();

        mvc.perform(get("/api/v2/dataset-versions/version-1/point-cloud/preview"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.datasetVersionId").value("version-1"))
                .andExpect(jsonPath("$.format").value("ZIP"))
                .andExpect(jsonPath("$.pointCloudFiles[0].previewUrl").value(
                        "/api/v2/dataset-versions/version-1/point-cloud/zip-file?path=clouds%2Fscan.pcd"
                ))
                .andExpect(jsonPath("$.pointCloudFiles[0].previewUrl").value(
                        org.hamcrest.Matchers.not(
                                org.hamcrest.Matchers.containsString("/api/dataset/")
                        )
                ));
    }

    @Test
    void archivePreviewHidesMissingOrCrossUserDatasetAsNotFound() throws Exception {
        V2DatasetPreviewDescriptorService descriptorService =
                mock(V2DatasetPreviewDescriptorService.class);
        DatasetPreviewService previewService = mock(DatasetPreviewService.class);
        PointCloudPreviewService pointCloudService = mock(PointCloudPreviewService.class);
        when(previewService.listFilesForV2("hidden-version", null, null, null, null))
                .thenThrow(new DatasetPreviewAccessException(
                        DatasetPreviewAccessException.Reason.NOT_FOUND,
                        "dataset not found or no permission"
                ));
        MockMvc mvc = mvc(descriptorService, previewService, pointCloudService);

        mvc.perform(get("/api/v2/dataset-versions/hidden-version/preview/files"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.errorCode").value("DATASET_NOT_FOUND"))
                .andExpect(jsonPath("$.errorMessage").value("数据集版本不存在或无权访问"));
    }

    @Test
    void pointCloudPreviewMapsExistingButUnpreviewableDatasetTo422() throws Exception {
        V2DatasetPreviewDescriptorService descriptorService =
                mock(V2DatasetPreviewDescriptorService.class);
        DatasetPreviewService previewService = mock(DatasetPreviewService.class);
        PointCloudPreviewService pointCloudService = mock(PointCloudPreviewService.class);
        when(pointCloudService.previewForV2("draft-version"))
                .thenThrow(new DatasetPreviewAccessException(
                        DatasetPreviewAccessException.Reason.NOT_PREVIEWABLE,
                        "dataset version status must be READY or DEPRECATED for preview"
                ));
        MockMvc mvc = mvc(descriptorService, previewService, pointCloudService);

        mvc.perform(get("/api/v2/dataset-versions/draft-version/point-cloud/preview"))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.errorCode").value("DATASET_NOT_PREVIEWABLE"))
                .andExpect(jsonPath("$.errorMessage").value("该数据集版本当前不可预览"));
    }

    @Test
    void invalidArchivePageRemainsBadRequest() throws Exception {
        V2DatasetPreviewDescriptorService descriptorService =
                mock(V2DatasetPreviewDescriptorService.class);
        DatasetPreviewService previewService = mock(DatasetPreviewService.class);
        PointCloudPreviewService pointCloudService = mock(PointCloudPreviewService.class);
        when(previewService.listFilesForV2("version-1", 0, null, null, null))
                .thenThrow(new IllegalArgumentException("page must be greater than or equal to 1"));
        MockMvc mvc = mvc(descriptorService, previewService, pointCloudService);

        mvc.perform(get("/api/v2/dataset-versions/version-1/preview/files")
                        .param("page", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
    }

    @Test
    void invalidArchiveContentPageUsesStrictV2ServiceContract() throws Exception {
        V2DatasetPreviewDescriptorService descriptorService =
                mock(V2DatasetPreviewDescriptorService.class);
        DatasetPreviewService previewService = mock(DatasetPreviewService.class);
        PointCloudPreviewService pointCloudService = mock(PointCloudPreviewService.class);
        when(previewService.previewContentForV2("version-1", null, 0, null))
                .thenThrow(new IllegalArgumentException(
                        "page must be greater than or equal to 1"
                ));
        MockMvc mvc = mvc(descriptorService, previewService, pointCloudService);

        mvc.perform(get("/api/v2/dataset-versions/version-1/preview/content")
                        .param("page", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errorCode").value("INVALID_REQUEST"));
    }

    private MockMvc mvc(
            V2DatasetPreviewDescriptorService descriptorService,
            DatasetPreviewService previewService,
            PointCloudPreviewService pointCloudService
    ) {
        return MockMvcBuilders
                .standaloneSetup(new V2DatasetPreviewController(
                        descriptorService,
                        previewService,
                        pointCloudService
                ))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();
    }
}
