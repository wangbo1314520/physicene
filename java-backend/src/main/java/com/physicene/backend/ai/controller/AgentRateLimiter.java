package com.physicene.backend.ai.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Semaphore;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * AI 限流（阶段 A2 · 2026-10-11）：双管——按学生日配额 + 全局并发上限。
 * 超额行为显式（非静默）：配额尽 → QUOTA_EXCEEDED（前端提示"今日额度已用完"）；
 * 并发满 → BUSY（提示稍后再试）。观测计数随日志输出（monitoring.md 口径）。
 *
 * 配置（application.properties / 环境变量）：
 *   agent.daily-quota   每学生每日调用上限（默认 100）
 *   agent.max-concurrent 全局并发上限（默认 10）
 */
@Component
public class AgentRateLimiter {

    public enum Deny { NONE, QUOTA, BUSY }

    private final int dailyQuota;
    private final Semaphore slots;
    private final Map<Long, DayCounter> byUser = new ConcurrentHashMap<>();

    private record DayCounter(String day, AtomicInteger count) {
        boolean isToday(String today) {
            return day.equals(today);
        }
    }

    public AgentRateLimiter(@Value("${agent.daily-quota:100}") int dailyQuota,
                            @Value("${agent.max-concurrent:10}") int maxConcurrent) {
        this.dailyQuota = Math.max(1, dailyQuota);
        this.slots = new Semaphore(Math.max(1, maxConcurrent), true);
    }

    /** 进入：先试并发槽，再查日配额。返回 NONE=放行（调用方必须 finally release()） */
    public Deny acquire(Long userId) {
        if (!slots.tryAcquire()) {
            return Deny.BUSY;
        }
        try {
            String today = LocalDate.now().toString();
            DayCounter c = byUser.compute(userId, (k, old) ->
                    old != null && old.isToday(today) ? old : new DayCounter(today, new AtomicInteger()));
            if (c.count().incrementAndGet() > dailyQuota) {
                c.count().decrementAndGet(); // 超额不计数（今日已满，计数停在配额值即可）
                return Deny.QUOTA;
            }
            return Deny.NONE;
        } catch (RuntimeException e) {
            slots.release();
            throw e;
        }
    }

    public void release() {
        slots.release();
    }

    /** 观测口径（日志/监控用） */
    public String snapshot() {
        String today = LocalDate.now().toString();
        long activeToday = byUser.values().stream().filter(c -> c.isToday(today)).count();
        return "usersToday=" + activeToday + " quota=" + dailyQuota
                + " concurrentAvail=" + slots.availablePermits();
    }
}
