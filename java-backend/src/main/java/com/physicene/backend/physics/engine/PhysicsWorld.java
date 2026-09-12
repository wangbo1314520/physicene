package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.element.ElementRegistry;
import com.physicene.backend.physics.model.Frame;
import com.physicene.backend.physics.model.Scene;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 物理世界门面（设计文档 PhysicsWorld 职责）：管理 simId → 仿真实例，
 * 对外提供启动/暂停/单步/seek/结束/释放。无状态服务，可随时重启。
 */
@Component
public class PhysicsWorld {

    private final ElementRegistry elementRegistry;

    private final Map<String, SimulationInstance> instances = new ConcurrentHashMap<>();

    public PhysicsWorld(ElementRegistry elementRegistry) {
        this.elementRegistry = elementRegistry;
    }

    /** 初始化并启动（异步实时仿真），返回 simId；userId 用于 WS 握手归属校验 */
    public String start(Scene scene, Long userId) {
        String simId = UUID.randomUUID().toString();
        SimulationInstance instance = new SimulationInstance(simId, scene, elementRegistry);
        instance.setOwnerId(userId);
        instances.put(simId, instance);
        new SimulationRunner(instance).start();
        return simId;
    }

    public SimulationInstance getInstance(String simId) {
        return instances.get(simId);
    }

    public void pause(String simId) {
        SimulationInstance instance = instances.get(simId);
        if (instance != null) {
            instance.pause();
        }
    }

    public void resume(String simId) {
        SimulationInstance instance = instances.get(simId);
        if (instance != null) {
            instance.resume();
        }
    }

    public Frame seek(String simId, double t) {
        SimulationInstance instance = instances.get(simId);
        return instance == null ? null : instance.seek(t);
    }

    /** 释放实例（Week 3 接 30 分钟无连接定时清理，SRS SD-4） */
    public void release(String simId) {
        SimulationInstance instance = instances.remove(simId);
        if (instance != null) {
            instance.end("released");
        }
    }
}
