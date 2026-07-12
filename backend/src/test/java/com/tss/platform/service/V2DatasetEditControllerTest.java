package com.tss.platform.service;

import com.tss.platform.controller.v2.V2DatasetEditController;
import com.tss.platform.controller.v2.V2ExceptionHandler;
import com.tss.platform.dto.v2.V2DatasetDiscardResult;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import java.time.Instant;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class V2DatasetEditControllerTest {

    @Test
    void discardRouteDelegatesToV2EditService() throws Exception {
        V2DatasetEditService service = mock(V2DatasetEditService.class);
        V2DatasetDiscardResult result = new V2DatasetDiscardResult();
        result.setEditSessionId("draft-2");
        result.setDatasetId("asset-1");
        result.setStatus("DISCARDED");
        result.setDiscardedAt(Instant.parse("2026-07-04T00:00:00Z"));
        when(service.discard("draft-2")).thenReturn(result);

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new V2DatasetEditController(service))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();

        mvc.perform(delete("/api/v2/dataset-edit-sessions/draft-2"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.editSessionId").value("draft-2"))
                .andExpect(jsonPath("$.datasetId").value("asset-1"))
                .andExpect(jsonPath("$.status").value("DISCARDED"));
    }
}
