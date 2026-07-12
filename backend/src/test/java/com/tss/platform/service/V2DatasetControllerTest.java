package com.tss.platform.service;

import com.tss.platform.controller.v2.V2DatasetController;
import com.tss.platform.controller.v2.V2ExceptionHandler;
import com.tss.platform.dto.v2.V2DatasetListItem;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class V2DatasetControllerTest {

    @Test
    void detailRouteDelegatesToV2CatalogService() throws Exception {
        V2DatasetCatalogService service = mock(V2DatasetCatalogService.class);
        V2DatasetListItem item = new V2DatasetListItem();
        item.setDatasetId("asset-1");
        item.setName("multimodal");
        item.setCurrentVersionFileCount(9L);
        item.setFileCount(9L);
        when(service.get("asset-1")).thenReturn(item);

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new V2DatasetController(service))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();

        mvc.perform(get("/api/v2/datasets/asset-1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.datasetId").value("asset-1"))
                .andExpect(jsonPath("$.currentVersionFileCount").value(9))
                .andExpect(jsonPath("$.fileCount").value(9));
    }
}
