package com.physicene.backend.physics.record;

import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.common.util.UserContext;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.ObjectMapper;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 实验记录接口（SRS 6.1）：列表 + 分页回放。
 * 回放契约：frameLimit≤500；首次请求（frameOffset=0 且带 withIndex=true）返回完整 frameIndex；
 * 响应头 X-Total-Frames / X-Total-Duration / X-Frame-Offset / X-Frame-Limit。
 */
@RestController
@RequestMapping("/api/records")
public class RecordController {

    private static final int MAX_FRAME_LIMIT = 500;

    private final RecordRepository repository;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public RecordController(RecordRepository repository) {
        this.repository = repository;
    }

    @GetMapping
    public ApiResponse<Map<String, Object>> list(@RequestParam(defaultValue = "1") int page,
                                                 @RequestParam(defaultValue = "20") int size) {
        Page<ExperimentRecordEntity> result = repository.findByStudentId(UserContext.userId(),
                PageRequest.of(Math.max(0, page - 1), Math.min(100, Math.max(1, size)),
                        Sort.by(Sort.Direction.DESC, "startTime")));
        List<Map<String, Object>> items = result.getContent().stream().map(r -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getId());
            m.put("scenarioId", r.getScenarioId());
            m.put("simId", r.getSimId());
            m.put("status", r.getStatus().name().toLowerCase());
            m.put("startTime", r.getStartTime().toString());
            m.put("endTime", r.getEndTime() == null ? null : r.getEndTime().toString());
            return m;
        }).toList();
        return ApiResponse.ok(Map.of("total", result.getTotalElements(), "page", page,
                "size", size, "items", items));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ApiResponse<Map<String, Object>>> replay(
            @PathVariable Long id,
            @RequestParam(defaultValue = "0") int frameOffset,
            @RequestParam(defaultValue = "300") int frameLimit,
            @RequestParam(defaultValue = "false") boolean withIndex) {

        Long userId = UserContext.userId();
        ExperimentRecordEntity record = repository.findById(id).orElse(null);
        if (record == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "记录不存在: " + id);
        }
        if (!record.getStudentId().equals(userId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "无权访问他人实验记录");
        }
        if (record.getSimResult() == null) {
            throw new BusinessException(ErrorCode.CONFLICT, "实验尚未完成，暂无回放数据");
        }

        Map<String, Object> simResult = objectMapper.readValue(record.getSimResult(),
                new TypeReference<Map<String, Object>>() {
                });
        List<Object> frames = (List<Object>) simResult.getOrDefault("frames", List.of());
        int total = frames.size();
        int limit = Math.min(MAX_FRAME_LIMIT, Math.max(1, frameLimit));
        int from = Math.min(Math.max(0, frameOffset), total);
        int to = Math.min(from + limit, total);

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("recordId", record.getId());
        data.put("scenarioId", record.getScenarioId());
        data.put("simId", record.getSimId());
        data.put("scene", simResult.get("scene"));
        data.put("timestep", simResult.get("timestep"));
        data.put("totalDuration", simResult.get("totalDuration"));
        data.put("totalFrames", total);
        data.put("frames", frames.subList(from, to));
        data.put("dataTable", simResult.get("dataTable"));
        data.put("charts", simResult.get("charts"));
        data.put("keyEvents", simResult.get("keyEvents"));
        data.put("camera", simResult.get("camera"));
        if (withIndex) {
            data.put("frameIndex", simResult.get("frameIndex"));
        }

        return ResponseEntity.ok()
                .header("X-Total-Frames", String.valueOf(total))
                .header("X-Total-Duration", String.valueOf(simResult.get("totalDuration")))
                .header("X-Frame-Offset", String.valueOf(from))
                .header("X-Frame-Limit", String.valueOf(limit))
                .body(ApiResponse.ok(data));
    }
}
