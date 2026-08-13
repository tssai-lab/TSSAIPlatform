package com.tss.platform.controller;

import com.tss.platform.dto.resource.KubernetesDiagnosticsDto;
import com.tss.platform.security.AuthContext;
import com.tss.platform.service.ResourceMonitorService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ResourceMonitorControllerSecurityTest {

    @Test
    void superAdminCanReadKubernetesDiagnostics() {
        ResourceMonitorService service = mock(ResourceMonitorService.class);
        AuthContext authContext = mock(AuthContext.class);
        KubernetesDiagnosticsDto diagnostics = new KubernetesDiagnosticsDto();
        when(authContext.isSuperAdmin()).thenReturn(true);
        when(service.getKubernetesDiagnostics()).thenReturn(diagnostics);
        ResourceMonitorController controller = new ResourceMonitorController(service, authContext);

        var response = controller.kubernetesDiagnostics();

        assertThat(response.getData()).isSameAs(diagnostics);
        verify(service).getKubernetesDiagnostics();
    }

    @Test
    void regularAdminCannotReadKubernetesDiagnostics() {
        ResourceMonitorService service = mock(ResourceMonitorService.class);
        AuthContext authContext = mock(AuthContext.class);
        when(authContext.isAdmin()).thenReturn(true);
        when(authContext.isSuperAdmin()).thenReturn(false);
        ResourceMonitorController controller = new ResourceMonitorController(service, authContext);

        assertThatThrownBy(controller::kubernetesDiagnostics)
                .isInstanceOfSatisfying(ResponseStatusException.class, exception ->
                        assertThat(exception.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN))
                .hasMessageContaining("超级管理员");
        verify(service, never()).getKubernetesDiagnostics();
    }
}
