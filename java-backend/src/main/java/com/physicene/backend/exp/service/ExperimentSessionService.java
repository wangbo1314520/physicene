package com.physicene.backend.exp.service;

import tools.jackson.databind.ObjectMapper;
import com.physicene.backend.common.exception.BusinessException;
import com.physicene.backend.common.exception.ErrorCode;
import com.physicene.backend.exp.entity.ExperimentSessionEntity;
import com.physicene.backend.exp.repository.ExperimentSessionRepository;
import com.physicene.backend.physics.report.ReportEntity;
import com.physicene.backend.physics.report.ReportRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.core.type.TypeReference;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 实验会话服务（B0）：开始/续做 → 自动保存（乐观锁 409）→ 提交（锁定 + 挂 Report 预埋）。
 */
@Service
public class ExperimentSessionService {

    private static final Logger log = LoggerFactory.getLogger(ExperimentSessionService.class);

    private final ExperimentSessionRepository repository;
    private final ReportRepository reportRepository;
    private final ObjectMapper mapper = new ObjectMapper();

    public ExperimentSessionService(ExperimentSessionRepository repository,
                                    ReportRepository reportRepository) {
        this.repository = repository;
        this.reportRepository = reportRepository;
    }

    /** 开始实验：有草稿则断点续做，否则新建 */
    @Transactional
    public Map<String, Object> start(Long studentId, String experimentId) {
        ExperimentSessionEntity session = repository
                .findFirstByStudentIdAndExperimentIdAndStatusOrderByIdDesc(
                        studentId, experimentId, ExperimentSessionEntity.Status.DRAFT);
        boolean resumed = session != null;
        if (session == null) {
            session = new ExperimentSessionEntity();
            session.setStudentId(studentId);
            session.setExperimentId(experimentId);
            session.setStatus(ExperimentSessionEntity.Status.DRAFT);
            session.setStepState("{\"current\":0,\"completed\":[],\"records\":{},\"mode\":\"guided\"}");
            repository.save(session);
            log.info("新建实验会话 id={} exp={} student={}", session.getId(), experimentId, studentId);
        }
        Map<String, Object> result = toMap(session);
        result.put("resumed", resumed);
        return result;
    }

    /** 自动保存：JPA @Version 冲突 → 1005（另一端已保存） */
    @Transactional
    public Map<String, Object> save(Long studentId, Long sessionId, Map<String, Object> body) {
        ExperimentSessionEntity session = loadOwned(studentId, sessionId);
        if (session.getStatus() != ExperimentSessionEntity.Status.DRAFT) {
            throw new BusinessException(ErrorCode.CONFLICT, "实验已提交，不可再修改");
        }
        if (body.containsKey("stepState")) {
            session.setStepState(writeJson(body.get("stepState")));
        }
        if (body.containsKey("rawData")) {
            session.setRawData(writeJson(body.get("rawData")));
        }
        if (body.containsKey("processedData")) {
            session.setProcessedData(writeJson(body.get("processedData")));
        }
        if (body.containsKey("conclusion")) {
            session.setConclusion(str(body.get("conclusion")));
        }
        session.setUpdatedAt(LocalDateTime.now());
        try {
            repository.saveAndFlush(session);
        } catch (OptimisticLockingFailureException e) {
            throw new BusinessException(ErrorCode.CONFLICT, "数据已在其他设备保存，请刷新后继续");
        }
        return toMap(session);
    }

    /** 提交：锁定会话 + 生成 Report 挂接记录（Report 预埋） */
    @Transactional
    public Map<String, Object> submit(Long studentId, Long sessionId, String conclusion) {
        ExperimentSessionEntity session = loadOwned(studentId, sessionId);
        if (session.getStatus() == ExperimentSessionEntity.Status.SUBMITTED) {
            throw new BusinessException(ErrorCode.CONFLICT, "实验已提交过（幂等，无需重复提交）");
        }
        if (conclusion != null && !conclusion.isBlank()) {
            session.setConclusion(conclusion);
        }
        session.setStatus(ExperimentSessionEntity.Status.SUBMITTED);
        session.setUpdatedAt(LocalDateTime.now());

        // Report 挂接：内容 JSON 含数据摘要与结论（AI 反馈字段 B7 回填）
        Map<String, Object> content = new LinkedHashMap<>();
        content.put("experimentType", "exp-session");
        content.put("sessionId", sessionId);
        content.put("experimentId", session.getExperimentId());
        content.put("studentId", studentId);
        content.put("conclusion", session.getConclusion());
        content.put("rawData", readJson(session.getRawData()));
        content.put("stepState", readJson(session.getStepState()));
        content.put("submittedAt", LocalDateTime.now().toString());

        ReportEntity report = new ReportEntity();
        report.setSessionId(sessionId);
        report.setRecordId(null);
        report.setContent(writeJson(content));
        reportRepository.save(report);

        repository.save(session);
        log.info("实验提交 sessionId={} → reportId={}", sessionId, report.getId());
        Map<String, Object> result = toMap(session);
        result.put("reportId", report.getId());
        return result;
    }

    /** 我的实验列表（可按状态/实验过滤，分页） */
    public Map<String, Object> myList(Long studentId, String experimentId, String status,
                                      int page, int size) {
        PageRequest pageable = PageRequest.of(Math.max(0, page - 1), Math.min(100, Math.max(1, size)),
                Sort.by(Sort.Direction.DESC, "updatedAt"));
        Page<ExperimentSessionEntity> result;
        if (experimentId != null && !experimentId.isBlank()) {
            result = repository.findByStudentId(studentId, pageable); // 实验过滤在内存做（B0 量级小）
        } else {
            result = status == null || status.isBlank()
                    ? repository.findByStudentId(studentId, pageable)
                    : repository.findByStudentIdAndStatus(studentId,
                            ExperimentSessionEntity.Status.valueOf(status.toUpperCase()), pageable);
        }
        var items = result.getContent().stream()
                .filter(s -> experimentId == null || experimentId.isBlank()
                        || experimentId.equals(s.getExperimentId()))
                .map(this::toMap).toList();
        return Map.of("total", result.getTotalElements(), "page", page, "size", size, "items", items);
    }

    /** 教师统计：某实验的提交/草稿数 + 最近提交列表（教师/管理员专用） */
    public Map<String, Object> classStats(String experimentId, int page, int size) {
        long submitted = repository.countByExperimentIdAndStatus(
                experimentId, ExperimentSessionEntity.Status.SUBMITTED);
        long draft = repository.countByExperimentIdAndStatus(
                experimentId, ExperimentSessionEntity.Status.DRAFT);
        Page<ExperimentSessionEntity> recent = repository.findByExperimentId(experimentId,
                PageRequest.of(0, Math.min(100, Math.max(1, size)),
                        Sort.by(Sort.Direction.DESC, "updatedAt")));
        return Map.of(
                "experimentId", experimentId,
                "submittedCount", submitted,
                "draftCount", draft,
                "recent", recent.getContent().stream().map(this::toMap).toList());
    }

    // ===== 内部 =====

    private ExperimentSessionEntity loadOwned(Long studentId, Long sessionId) {
        ExperimentSessionEntity session = repository.findById(sessionId).orElse(null);
        if (session == null) {
            throw new BusinessException(ErrorCode.NOT_FOUND, "实验会话不存在: " + sessionId);
        }
        if (!session.getStudentId().equals(studentId)) {
            throw new BusinessException(ErrorCode.FORBIDDEN, "无权访问他人实验会话");
        }
        return session;
    }

    private Map<String, Object> toMap(ExperimentSessionEntity s) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id", s.getId());
        m.put("experimentId", s.getExperimentId());
        m.put("status", s.getStatus().name().toLowerCase());
        m.put("stepState", readJson(s.getStepState()));
        m.put("rawData", readJson(s.getRawData()));
        m.put("processedData", readJson(s.getProcessedData()));
        m.put("conclusion", s.getConclusion());
        m.put("aiFeedback", s.getAiFeedback());
        m.put("version", s.getVersion());
        m.put("updatedAt", s.getUpdatedAt().toString());
        return m;
    }

    private String writeJson(Object value) {
        if (value == null) {
            return null;
        }
        return value instanceof String s ? s : mapper.writeValueAsString(value);
    }

    private Object readJson(String json) {
        if (json == null || json.isBlank()) {
            return null;
        }
        try {
            return mapper.readValue(json, new TypeReference<Map<String, Object>>() {
            });
        } catch (Exception e) {
            return json; // 非 JSON 字符串原样返回
        }
    }

    private static String str(Object v) {
        return v == null ? null : String.valueOf(v);
    }
}
