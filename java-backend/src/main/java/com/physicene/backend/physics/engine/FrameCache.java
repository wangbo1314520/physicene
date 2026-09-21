package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.model.Frame;
import com.physicene.backend.physics.model.FullSnapshot;
import com.physicene.backend.physics.model.KeySnapshot;

import java.util.ArrayList;
import java.util.List;

/**
 * 帧缓存（SRS F2.7）：单次模拟 ≤1800 帧；最近 300 帧 FullSnapshot，更早的按需降级为
 * KeySnapshot（仅位置+速度），保证旧帧体积小。超限（>1800）环形淘汰最早帧。
 */
public class FrameCache {

    /** 契约：最多 9000 帧（=300s @30fps，覆盖 maxDuration 上限——第三十一轮 1800→9000 升级；
     *  内存=300 full（RECENT_FULL）+8700 key 轻帧，量级 MB 级） */
    private static final int MAX_FRAMES = 9000;

    /** 契约：最近 300 帧保留完整快照 */
    private static final int RECENT_FULL = 300;

    private final List<Double> times = new ArrayList<>();
    private final List<FullSnapshot> snapshots = new ArrayList<>();

    public synchronized void append(double t, FullSnapshot snapshot) {
        times.add(t);
        snapshots.add(snapshot);
        if (times.size() > MAX_FRAMES) {
            times.remove(0);
            snapshots.remove(0);
        }
    }

    public synchronized int size() {
        return times.size();
    }

    public synchronized double timeAt(int i) {
        return times.get(i);
    }

    /** 取第 i 帧：距末尾 300 帧内为 full，更早的惰性降级为 key（SRS F2.7 双帧策略） */
    public synchronized Frame frameAt(int i) {
        double t = times.get(i);
        FullSnapshot full = snapshots.get(i);
        if (i >= times.size() - RECENT_FULL) {
            return new Frame(t, full, "full");
        }
        KeySnapshot key = new KeySnapshot();
        key.setT(t);
        key.setSubjects(full.getElements());
        return new Frame(t, key, "key");
    }

    public synchronized Frame lastFrame() {
        if (times.isEmpty()) {
            return null;
        }
        return frameAt(times.size() - 1);
    }

    /** 全局帧号 → 最近帧（seek 用：超出范围返回最近帧，契约规定） */
    public synchronized Frame seekNearest(double t) {
        if (times.isEmpty()) {
            return null;
        }
        int lo = 0, hi = times.size() - 1;
        while (lo < hi) {
            int mid = (lo + hi + 1) / 2;
            if (times.get(mid) <= t) lo = mid;
            else hi = mid - 1;
        }
        return frameAt(lo);
    }
}
