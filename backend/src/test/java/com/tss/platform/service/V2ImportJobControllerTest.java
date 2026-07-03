package com.tss.platform.service;

import com.tss.platform.controller.v2.V2ExceptionHandler;
import com.tss.platform.controller.v2.V2ImportJobController;
import com.tss.platform.dto.v2.V2ImportJobStatusDto;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class V2ImportJobControllerTest {

    @Test
    void retryRouteDelegatesToV2ImportJobService() throws Exception {
        V2ImportJobService service = mock(V2ImportJobService.class);
        V2ImportJobStatusDto dto = new V2ImportJobStatusDto();
        dto.setImportJobId("ijob-1");
        dto.setStatus("PENDING");
        dto.setDisplayStatus("IMPORTING");
        dto.setImportProgress(0);
        when(service.retry("ijob-1", "FULL")).thenReturn(dto);

        MockMvc mvc = MockMvcBuilders
                .standaloneSetup(new V2ImportJobController(service))
                .setControllerAdvice(new V2ExceptionHandler())
                .build();

        mvc.perform(post("/api/v2/import-jobs/ijob-1/retry")
                        .param("mode", "FULL"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.importJobId").value("ijob-1"))
                .andExpect(jsonPath("$.status").value("PENDING"))
                .andExpect(jsonPath("$.displayStatus").value("IMPORTING"));
    }
}
