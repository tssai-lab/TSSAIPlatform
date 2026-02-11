package com.tss.platform.controller;

import com.tss.platform.dto.ApiResponse;
import com.tss.platform.model.ModelRecord;
import com.tss.platform.service.ModelStoreService;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/model")
public class ModelController {

    private final ModelStoreService modelStore;

    public ModelController(ModelStoreService modelStore) {
        this.modelStore = modelStore;
    }

    @GetMapping("/list")
    public ApiResponse<Map<String, Object>> list() {
        List<ModelRecord> list = modelStore.findAll();
        List<Map<String, Object>> data = list.stream().map(m -> {
            Map<String, Object> item = new HashMap<>();
            item.put("id", m.getId());
            item.put("name", m.getName());
            item.put("version", m.getVersion());
            item.put("type", m.getType());
            item.put("remark", m.getRemark());
            item.put("storagePath", m.getStoragePath());
            item.put("createdAt", m.getCreatedAt());
            return item;
        }).collect(Collectors.toList());
        Map<String, Object> result = new HashMap<>();
        result.put("data", data);
        result.put("total", data.size());
        return ApiResponse.ok(result);
    }

    @GetMapping("/detail")
    public ApiResponse<ModelRecord> detail(@RequestParam String id) {
        return modelStore.findById(id)
                .map(ApiResponse::ok)
                .orElse(ApiResponse.fail("模型不存在"));
    }

    @DeleteMapping("/delete")
    public ApiResponse<Void> delete(@RequestParam String id) {
        if (modelStore.findById(id).isEmpty()) {
            return ApiResponse.fail("模型不存在");
        }
        modelStore.delete(id);
        return ApiResponse.ok(null);
    }
}
