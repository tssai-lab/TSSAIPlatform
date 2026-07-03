package com.tss.platform.service;

import com.tss.platform.controller.v2.V2BusinessException;
import com.tss.platform.dto.ImportJobStatusDto;
import com.tss.platform.dto.v2.V2ImportJobStatusDto;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class V2ImportJobServiceTest {

    @Test
    void retryDelegatesToImportJobQueryServiceAndReturnsV2Status() {
        ImportJobQueryService delegate = mock(ImportJobQueryService.class);
        ImportJobStatusDto retryResult = new ImportJobStatusDto();
        retryResult.setImportJobId("ijob-1");
        retryResult.setStatus("PENDING");
        retryResult.setProgress(0);
        when(delegate.retry("ijob-1", "FULL")).thenReturn(retryResult);
        V2ImportJobService service = new V2ImportJobService(delegate);

        V2ImportJobStatusDto result = service.retry("ijob-1", "FULL");

        assertEquals("ijob-1", result.getImportJobId());
        assertEquals("PENDING", result.getStatus());
        assertEquals("IMPORTING", result.getDisplayStatus());
        assertEquals(0, result.getImportProgress());
        assertNull(result.getUserError());
    }

    @Test
    void retryMapsMissingImportJobToV2NotFound() {
        ImportJobQueryService delegate = mock(ImportJobQueryService.class);
        when(delegate.retry("ijob-missing", "FULL"))
                .thenThrow(new ImportJobQueryService.ImportJobAccessException(
                        "importJob not found or no permission"
                ));
        V2ImportJobService service = new V2ImportJobService(delegate);

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> service.retry("ijob-missing", "FULL")
        );

        assertEquals(HttpStatus.NOT_FOUND, error.getStatus());
        assertEquals("IMPORT_JOB_NOT_FOUND", error.getErrorCode());
    }

    @Test
    void retryMapsNonRetryableImportJobToV2BusinessError() {
        ImportJobQueryService delegate = mock(ImportJobQueryService.class);
        when(delegate.retry("ijob-running", "FULL"))
                .thenThrow(new ImportJobQueryService.ImportJobRetryRejectedException(
                        "only FAILED ImportJob can be retried"
                ));
        V2ImportJobService service = new V2ImportJobService(delegate);

        V2BusinessException error = assertThrows(
                V2BusinessException.class,
                () -> service.retry("ijob-running", "FULL")
        );

        assertEquals(HttpStatus.UNPROCESSABLE_ENTITY, error.getStatus());
        assertEquals("IMPORT_JOB_NOT_RETRYABLE", error.getErrorCode());
        assertEquals("only FAILED ImportJob can be retried", error.getDetails().get("reason"));
    }
}
