package com.tss.platform.service;

import com.tss.platform.controller.v2.V2DatasetSampleController;
import com.tss.platform.controller.v2.V2ExceptionHandler;
import com.tss.platform.dto.DatasetMultimodalExternalIdAnnotationDto;
import com.tss.platform.dto.DatasetMultimodalExternalIdDataDto;
import com.tss.platform.dto.DatasetMultimodalExternalIdSampleDto;
import com.tss.platform.dto.DatasetSampleDataDto;
import com.tss.platform.dto.DatasetSampleDetailDto;
import com.tss.platform.dto.DatasetSampleListItemDto;
import com.tss.platform.dto.PageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.util.List;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class V2DatasetSampleControllerTest {

    @Test
    void multimodalRouteUsesV2FileLinks() throws Exception {
        SampleService service = mock(SampleService.class);
        DatasetMultimodalExternalIdDataDto data =
                new DatasetMultimodalExternalIdDataDto();
        data.setSampleDataId("data-1");
        data.setPreviewUrl("/api/dataset-sample-data/data-1/preview");
        data.setDownloadUrl("/api/dataset-sample-data/data-1/download");
        DatasetMultimodalExternalIdAnnotationDto annotation =
                new DatasetMultimodalExternalIdAnnotationDto();
        annotation.setAnnotationId("annotation-1");
        annotation.setDownloadUrl("/api/dataset-annotations/annotation-1/download");
        DatasetMultimodalExternalIdSampleDto sample =
                new DatasetMultimodalExternalIdSampleDto();
        sample.setSampleId("sample-1");
        sample.setData(List.of(data));
        sample.setAnnotations(List.of(annotation));
        PageResponse<DatasetMultimodalExternalIdSampleDto> page = new PageResponse<>();
        page.setData(List.of(sample));
        when(service.findMultimodalByExternalId(
                "scene-1",
                List.of("version-1"),
                1,
                20
        )).thenReturn(page);

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new V2DatasetSampleController(service))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();

        mvc.perform(get("/api/v2/dataset-samples/multimodal")
                        .param("externalId", "scene-1")
                        .param("datasetVersionIds", "version-1")
                        .param("page", "1")
                        .param("pageSize", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].data[0].previewUrl")
                        .value("/api/v2/dataset-sample-data/data-1/preview"))
                .andExpect(jsonPath("$.data[0].data[0].downloadUrl")
                        .value("/api/v2/dataset-sample-data/data-1/download"))
                .andExpect(jsonPath("$.data[0].annotations[0].downloadUrl")
                        .value("/api/v2/dataset-annotations/annotation-1/download"));
    }

    @Test
    void hiddenSampleAccessUsesNotFoundEnvelopeForDetailAndDataRoutes() throws Exception {
        SampleService service = mock(SampleService.class);
        SampleService.DatasetSampleAccessException hidden =
                new SampleService.DatasetSampleAccessException(
                        "dataset sample not found or no permission"
                );
        when(service.getSample("hidden-sample")).thenThrow(hidden);
        when(service.listSampleData("hidden-sample")).thenThrow(hidden);

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new V2DatasetSampleController(service))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();

        mvc.perform(get("/api/v2/dataset-samples/hidden-sample"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.errorCode").value("DATASET_SAMPLE_NOT_FOUND"))
                .andExpect(jsonPath("$.errorMessage").value("数据集样本不存在或无权访问"));

        mvc.perform(get("/api/v2/dataset-samples/hidden-sample/data"))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.errorCode").value("DATASET_SAMPLE_NOT_FOUND"))
                .andExpect(jsonPath("$.errorMessage").value("数据集样本不存在或无权访问"));
    }

    @Test
    void sampleGalleryRoutesDelegateToSampleServiceWithoutLegacyEnvelope() throws Exception {
        SampleService service = mock(SampleService.class);
        DatasetSampleListItemDto item = new DatasetSampleListItemDto();
        item.setSampleId("sample-1");
        item.setDatasetVersionId("version-1");
        PageResponse<DatasetSampleListItemDto> page = new PageResponse<>();
        page.setData(List.of(item));
        page.setPage(1);
        page.setPageSize(20);
        page.setTotal(1);
        page.setTotalPages(1);
        when(service.listSamples("version-1", 1, 20)).thenReturn(page);

        DatasetSampleDataDto data = new DatasetSampleDataDto();
        data.setSampleDataId("data-1");
        DatasetSampleDetailDto detail = new DatasetSampleDetailDto();
        detail.setSampleId("sample-1");
        detail.setData(List.of(data));
        detail.setAnnotations(List.of());
        when(service.getSample("sample-1")).thenReturn(detail);
        when(service.listSampleData("sample-1")).thenReturn(List.of(data));

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new V2DatasetSampleController(service))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();

        mvc.perform(get("/api/v2/dataset-versions/version-1/samples")
                        .param("page", "1")
                        .param("pageSize", "20"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data[0].sampleId").value("sample-1"));

        mvc.perform(get("/api/v2/dataset-samples/sample-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.sampleId").value("sample-1"))
                .andExpect(jsonPath("$.data[0].sampleDataId").value("data-1"));

        mvc.perform(get("/api/v2/dataset-samples/sample-1/data"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].sampleDataId").value("data-1"));
    }
}
