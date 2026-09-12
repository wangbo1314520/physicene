package com.physicene.backend.physics.engine;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 仿真线程：以 60Hz 实时节奏驱动 SimulationInstance.step()。
 * 落后于调度时只重置基准不追赶（实时流式场景宁可丢步不可加速物理）。
 */
public class SimulationRunner extends Thread {

    private static final Logger log = LoggerFactory.getLogger(SimulationRunner.class);

    private final SimulationInstance instance;

    public SimulationRunner(SimulationInstance instance) {
        super("sim-" + instance.getSimId().substring(0, 8));
        setDaemon(true);
        this.instance = instance;
    }

    @Override
    public void run() {
        long nanosPerStep = (long) (instance.getDt() * 1e9);
        long nextTick = System.nanoTime();
        try {
            while (!instance.isEnded()) {
                if (instance.isPaused()) {
                    Thread.sleep(20);
                    continue;
                }
                instance.step();
                if (instance.isEnded()) {
                    break;
                }
                nextTick += nanosPerStep;
                long sleepNanos = nextTick - System.nanoTime();
                if (sleepNanos > 0) {
                    Thread.sleep(sleepNanos / 1_000_000, (int) (sleepNanos % 1_000_000));
                } else {
                    // 已落后一个步长以上：重置基准，不追帧
                    nextTick = System.nanoTime();
                }
            }
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            instance.end("error");
            log.warn("仿真线程被中断 simId={}", instance.getSimId());
        }
    }
}
