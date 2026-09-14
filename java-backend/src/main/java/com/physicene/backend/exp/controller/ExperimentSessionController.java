package com.physicene.backend.exp.controller;

import com.physicene.backend.common.ApiResponse;
import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.common.util.UserContext;
import com.physicene.backend.exp.service.ExperimentSessionService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 实验库 API（B0，5 个接口）：
 * ① 开始/续做 ② 自动保存 ③ 提交（挂 Report） ④ 我的实验 ⑤ 教师统计。
 * 鉴权沿用 JWT 拦截器；错误码沿用 §6.4（1003 越权 / 1005 乐观锁冲突 / 1004 不存在）。
 */
@RestController
@RequestMapping("/api/experiments/sessions")
public class ExperimentSessionController {

    private final ExperimentSessionService service;

    public ExperimentSessionController(ExperimentSessionService service) {
        this.service = service;
    }

    /** ① 开始实验：{experimentId} → 会话（有草稿自动断点续做） */
    @PostMapping
    public ApiResponse<Map<String, Object>> start(@RequestBody Map<String, Object> body) {
        String experimentId = String.valueOf(body.getOrDefault("experimentId", ""));
        if (experimentId.isBlank()) {
            throw new BusinessException(ErrorCode.PARAM_INVALID, "缺少 experimentId");
        }
        return ApiResponse.ok(service.start(UserContext.userId(), experimentId));
    }

    /** ② 自动保存：{stepState?, rawData?, processedData?, conclusion?}；并发冲突 409 */
    @PutMapping("/{id}")
    public ApiResponse<Map<String, Object>> save(@PathVariable Long id,
                                                 @RequestBody Map<String, Object> body) {
        return ApiResponse.ok(service.save(UserContext.userId(), id, body));
    }

    /** ③ 提交实验：锁定 + 生成 Report 挂接 */
    @PostMapping("/{id}/submit")
    public ApiResponse<Map<String, Object>> submit(@PathVariable Long id,
                                                   @RequestBody(required = false) Map<String, Object> body) {
        String conclusion = body == null ? null : String.valueOf(body.getOrDefault("conclusion", ""));
        return ApiResponse.ok(service.submit(UserContext.userId(), id, conclusion));
    }

    /** ④ 我的实验列表：?status=draft|submitted&experimentId=&page=&size= */
    @GetMapping
    public ApiResponse<Map<String, Object>> myList(@RequestParam(required = false) String status,
                                                   @RequestParam(required = false) String experimentId,
                                                   @RequestParam(defaultValue = "1") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        return ApiResponse.ok(service.myList(UserContext.userId(), experimentId, status, page, size));
    }

    /** ⑤ 教师统计：?experimentId=（仅 teacher/admin） */
    @GetMapping("/class")
    public ApiResponse<Map<String, Object>> classStats(@RequestParam String experimentId,
                                                       @RequestParam(defaultValue = "20") int size) {
        String role = UserContext.get() == null ? "" : UserContext.get().role();
        if (!"teacher".equals(role) && !"admin".equals(role)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "仅教师可查看班级统计");
        }
        return ApiResponse.ok(service.classStats(experimentId, 1, size));
    }
}
