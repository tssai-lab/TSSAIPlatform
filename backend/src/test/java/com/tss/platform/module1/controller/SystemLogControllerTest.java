package com.tss.platform.module1.controller;

import cn.dev33.satoken.session.SaSession;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.tss.platform.module1.common.Result;
import com.tss.platform.module1.dto.LogItemVO;
import com.tss.platform.module1.dto.LogListQueryDTO;
import com.tss.platform.module1.service.AuditRecordQueryService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.MockedStatic;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.mockStatic;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SystemLogControllerTest {

    private AuditRecordQueryService queryService;
    private SystemLogController controller;

    @BeforeEach
    void setUp() {
        queryService = mock(AuditRecordQueryService.class);
        controller = new SystemLogController();
        ReflectionTestUtils.setField(controller, "auditRecordQueryService", queryService);
    }

    @Test
    void ordinaryUserCannotUseCurrentUsernameToReadAnotherAccount() {
        try (MockedStatic<StpUtil> stp = userSession(3, 7, "alice")) {
            Result<?> result = list("bob", "bob", null);

            assertThat(result.getCode()).isEqualTo(Result.NO_AUTH_CODE);
            verify(queryService, never()).queryLogPage(any());
        }
    }

    @Test
    void ordinaryUserQueryIsForcedToOwnUserIdAndIpIsHidden() {
        when(queryService.queryLogPage(any())).thenReturn(new Page<LogItemVO>(1, 10, 0));
        try (MockedStatic<StpUtil> stp = userSession(3, 7, "alice")) {
            Result<?> result = list("bob", null, null);

            assertThat(result.getCode()).isEqualTo(Result.SUCCESS_CODE);
            ArgumentCaptor<LogListQueryDTO> captor = ArgumentCaptor.forClass(LogListQueryDTO.class);
            verify(queryService).queryLogPage(captor.capture());
            assertThat(captor.getValue().getForceUserId()).isEqualTo(7);
            assertThat(captor.getValue().getUsername()).isNull();
            assertThat(captor.getValue().getHideIp()).isTrue();
        }
    }

    @Test
    void invalidTimeRangeIsRejectedBeforeDatabaseQuery() {
        try (MockedStatic<StpUtil> stp = userSession(1, 1, "admin")) {
            Result<?> result = list(null, null,
                    List.of("2026-08-28 00:00:00", "2026-08-27 00:00:00"));

            assertThat(result.getCode()).isEqualTo(Result.FAIL_CODE);
            verify(queryService, never()).queryLogPage(any());
        }
    }

    @Test
    void exposesExactlyTheSixContractActionFilters() {
        Result<List<java.util.Map<String, String>>> result = controller.getLogTypes();

        assertThat(result.getData()).extracting(item -> item.get("key"))
                .containsExactly("UPLOAD", "DELETE", "TRAIN", "INFERENCE", "LOGIN", "PERMISSION_CHANGE");
    }

    private Result<?> list(String username, String currentUsername, List<String> operateTime) {
        return controller.getLogList(
                1, 10, username, null, operateTime, "198.51.100.8",
                null, null, null, currentUsername, null
        );
    }

    private static MockedStatic<StpUtil> userSession(int roleId, int userId, String username) {
        SaSession session = mock(SaSession.class);
        when(session.get("roleId")).thenReturn(roleId);
        when(session.get("username")).thenReturn(username);
        MockedStatic<StpUtil> stp = mockStatic(StpUtil.class);
        stp.when(StpUtil::getTokenSession).thenReturn(session);
        stp.when(StpUtil::getLoginIdAsInt).thenReturn(userId);
        return stp;
    }
}
