package com.tss.platform.service;

import com.tss.platform.repository.DatasetAssetRepository;
import com.tss.platform.repository.DatasetVersionRepository;
import com.tss.platform.repository.ImportJobRepository;
import com.tss.platform.security.AuthContext;
import org.junit.jupiter.api.Test;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DatasetCatalogQueryServiceTest {

    @Test
    void normalizesAndEscapesNameKeywordForOwnerCatalog() {
        DatasetAssetRepository assetRepo = mock(DatasetAssetRepository.class);
        AuthContext authContext = mock(AuthContext.class);
        DatasetCatalogQueryService service = service(assetRepo, authContext);
        when(authContext.isAdmin()).thenReturn(false);
        when(authContext.currentUserId()).thenReturn(7);
        when(assetRepo.searchCatalogForOwner(
                eq(7),
                eq("CV"),
                eq("100!%!_\\!!"),
                any(Pageable.class)
        )).thenReturn(Page.empty());

        service.list("cv", " 100%_\\! ", 1, null, 20);

        verify(assetRepo).searchCatalogForOwner(
                eq(7),
                eq("CV"),
                eq("100!%!_\\!!"),
                any(Pageable.class)
        );
    }

    @Test
    void treatsBlankNameKeywordAsNoFilterForAdminCatalog() {
        DatasetAssetRepository assetRepo = mock(DatasetAssetRepository.class);
        AuthContext authContext = mock(AuthContext.class);
        DatasetCatalogQueryService service = service(assetRepo, authContext);
        when(authContext.isAdmin()).thenReturn(true);
        when(assetRepo.searchCatalogForAdmin(
                isNull(),
                isNull(),
                any(Pageable.class)
        )).thenReturn(Page.empty());

        service.list(null, "   ", 1, null, 20);

        verify(assetRepo).searchCatalogForAdmin(
                isNull(),
                isNull(),
                any(Pageable.class)
        );
    }

    private static DatasetCatalogQueryService service(
            DatasetAssetRepository assetRepo,
            AuthContext authContext
    ) {
        return new DatasetCatalogQueryService(
                assetRepo,
                mock(DatasetVersionRepository.class),
                mock(ImportJobRepository.class),
                mock(DatasetVersionFileCountService.class),
                authContext
        );
    }
}
