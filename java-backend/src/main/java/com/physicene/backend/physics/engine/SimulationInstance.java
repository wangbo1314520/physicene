package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.element.ElementBehavior;
import com.physicene.backend.physics.element.ElementContext;
import com.physicene.backend.physics.element.ElementRegistry;
import com.physicene.backend.physics.model.DataRow;
import com.physicene.backend.physics.model.Frame;
import com.physicene.backend.physics.model.FullSnapshot;
import com.physicene.backend.physics.model.KeyEvent;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SubjectState;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.BodyFixture;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.World;
import org.dyn4j.world.listener.CollisionListener;
import org.dyn4j.world.listener.CollisionListenerAdapter;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

/**
 * 单次仿真实例：持有 dyn4j World 与全部运行态（帧/数据表/关键事件/状态）。
 * 仿真线程（SimulationRunner）独占调用 step()；控制与查询经 synchronized 方法。
 */
public class SimulationInstance {

    private static final Logger log = LoggerFactory.getLogger(SimulationInstance.class);

    /** 静止判定阈值：线速度/角速度低于此值视为静止（SRS F2.8 全静止 2s 停止） */
    private static final double STILL_SPEED = 0.08;

    public enum Status {RUNNING, PAUSED, ENDED}

    public record EndInfo(String reason, int totalFrames, double totalDuration) {
    }

    private String simId;
    private final Scene scene;
    private final World<Body> world;
    private final double dt;

    /** 归属用户（WS 握手校验用；内联调试运行可为 null） */
    private volatile Long ownerId;

    private final Map<String, Body> bodies = new LinkedHashMap<>();       // id → body（全部）
    private final List<Body> dynamicBodies = new ArrayList<>();           // 可运动主体（快照/统计只看它们）
    private final List<ElementBehavior> behaviors = new ArrayList<>();
    private final List<PhysicsElement> dynamicElements = new ArrayList<>();

    private final FrameCache frameCache = new FrameCache();
    private final List<DataRow> dataTable = new CopyOnWriteArrayList<>();
    private final List<KeyEvent> keyEvents = new CopyOnWriteArrayList<>();
    private final Set<String> collisionPairs = ConcurrentHashMap.newKeySet();
    private final Map<String, Boolean> maxHeightReported = new HashMap<>();

    private Status status = Status.RUNNING;
    private double t = 0;
    private int frameCount = 0;
    private double stillTimer = 0;
    private EndInfo endInfo;
    private SimResultBuilder resultBuilder;
    /** 结束时间戳（实例回收依据，SD-4：30 分钟无连接释放） */
    private volatile long endedAtMillis;
    /** 创建时间戳（兜底回收：暂停后遗忘的实例等） */
    private final long createdAtMillis = System.currentTimeMillis();

    // —— 推送监听（WebSocket 层注册；在仿真线程回调，发送方自行保证线程安全）——
    private final List<Consumer<Frame>> frameListeners = new CopyOnWriteArrayList<>();
    private final List<Consumer<KeyEvent>> keyEventListeners = new CopyOnWriteArrayList<>();
    private final List<Consumer<EndInfo>> endListeners = new CopyOnWriteArrayList<>();
    private final List<Consumer<DataRow>> dataRowListeners = new CopyOnWriteArrayList<>();

    public SimulationInstance(String simId, Scene scene, ElementRegistry registry) {
        this.simId = simId;
        this.scene = scene;
        this.world = new World<>();
        this.dt = scene.getConfig().getTimestep();

        world.setGravity(new Vector2(scene.getConfig().getGravity().x(), scene.getConfig().getGravity().y()));
        // dyn4j 默认步长 1/60s，契约 timestep 同为 1/60；时间推进以契约 dt 为准

        for (PhysicsElement element : scene.getElements()) {
            ElementBehavior behavior = registry.create(element);
            behaviors.add(behavior);
            Body body = behavior.createBody(world);
            bodies.put(element.getId(), body);
            if (!element.isFixed()) {
                dynamicBodies.add(body);
                dynamicElements.add(element);
            }
        }

        // 碰撞关键事件：同一对元件只报一次（碰撞持续期每步都会回调）
        CollisionListener<Body, BodyFixture> collisionAdapter = new CollisionListenerAdapter<>() {
            @Override
            public boolean collision(org.dyn4j.world.ManifoldCollisionData<Body, BodyFixture> data) {
                String id1 = String.valueOf(data.getBody1().getUserData());
                String id2 = String.valueOf(data.getBody2().getUserData());
                String pair = id1.compareTo(id2) < 0 ? id1 + "|" + id2 : id2 + "|" + id1;
                if (collisionPairs.add(pair)) {
                    KeyEvent event = new KeyEvent(t, "collision", "碰撞瞬间", frameCount);
                    keyEvents.add(event);
                    keyEventListeners.forEach(l -> l.accept(event));
                }
                return true;
            }
        };
        world.addCollisionListener(collisionAdapter);
    }

    /** 单步推进（仅仿真线程 / 同步测试调用） */
    public synchronized void step() {
        if (status != Status.RUNNING) {
            return;
        }
        // 扩展点：自定义力（V1.5 电磁元件 computeForce 在此注入 ElementContext）

        world.step(1);
        t += dt;
        frameCount++;

        // 最高点检测：vy 由正转负（每主体一次）
        for (int i = 0; i < dynamicBodies.size(); i++) {
            Body body = dynamicBodies.get(i);
            String id = dynamicElements.get(i).getId();
            double vy = body.getLinearVelocity().y;
            Boolean reported = maxHeightReported.get(id);
            if (reported == null) {
                maxHeightReported.put(id, vy <= 0.01); // 初速向下则永不报
            } else if (!reported && vy <= 0.01) {
                maxHeightReported.put(id, true);
                KeyEvent event = new KeyEvent(t, "max_height", id + " 最高点", frameCount);
                keyEvents.add(event);
                keyEventListeners.forEach(l -> l.accept(event));
            }
        }

        FullSnapshot snapshot = buildSnapshot();
        frameCache.append(t, snapshot);

        DataRow row = buildDataRow(snapshot);
        dataTable.add(row);
        dataRowListeners.forEach(l -> l.accept(row));

        // 30fps 推帧：60Hz 计算每两步通知一次
        if (frameCount % 2 == 0) {
            Frame frame = new Frame(t, snapshot, "full");
            frameListeners.forEach(l -> l.accept(frame));
        }

        evaluateStopConditions();
    }

    private FullSnapshot buildSnapshot() {
        FullSnapshot snapshot = new FullSnapshot();
        List<SubjectState> states = new ArrayList<>(dynamicBodies.size());
        double ek = 0;
        double px = 0, py = 0;
        for (int i = 0; i < dynamicBodies.size(); i++) {
            Body body = dynamicBodies.get(i);
            String id = dynamicElements.get(i).getId();
            double m = dynamicElements.get(i).getProperties().getMass();
            Vector2 v = body.getLinearVelocity();
            double x = body.getTransform().getTranslationX();
            double y = body.getTransform().getTranslationY();
            double vx = v.x, vy = v.y;
            states.add(new SubjectState(id, x, y, vx, vy, body.getTransform().getRotationAngle()));
            ek += 0.5 * m * (vx * vx + vy * vy);
            px += m * vx;
            py += m * vy;
        }
        snapshot.setElements(states);
        snapshot.setKineticEnergy(round(ek));
        snapshot.setMomentum(round(Math.hypot(px, py)));
        return snapshot;
    }

    private DataRow buildDataRow(FullSnapshot snapshot) {
        DataRow row = new DataRow();
        row.setT(round(t));
        Map<String, Double> fields = new LinkedHashMap<>();
        for (int i = 0; i < snapshot.getElements().size(); i++) {
            SubjectState s = snapshot.getElements().get(i);
            fields.put("v" + (i + 1), round(Math.hypot(s.vx(), s.vy())));
        }
        fields.put("Ek", snapshot.getKineticEnergy());
        fields.put("p", snapshot.getMomentum());
        row.setFields(fields);
        return row;
    }

    private void evaluateStopConditions() {
        var cfg = scene.getConfig();
        if (t >= cfg.getMaxDuration() || frameCount >= cfg.getMaxFrames()) {
            end("max_duration");
            return;
        }
        boolean allStill = !dynamicBodies.isEmpty();
        for (Body body : dynamicBodies) {
            if (body.getLinearVelocity().getMagnitude() > STILL_SPEED
                    || Math.abs(body.getAngularVelocity()) > STILL_SPEED) {
                allStill = false;
                break;
            }
        }
        if (allStill) {
            stillTimer += dt;
            if (stillTimer >= cfg.getStillThreshold()) {
                end("all_still");
            }
        } else {
            stillTimer = 0;
        }
    }

    public synchronized void end(String reason) {
        if (status == Status.ENDED) {
            return;
        }
        status = Status.ENDED;
        endedAtMillis = System.currentTimeMillis();
        endInfo = new EndInfo(reason, frameCount, round(t));
        log.info("仿真结束 simId={} reason={} frames={} duration={}", simId, reason, frameCount, t);
        endListeners.forEach(l -> l.accept(endInfo));
    }

    // ===== 控制接口（WebSocket 调用）=====

    public synchronized void pause() {
        if (status == Status.RUNNING) {
            status = Status.PAUSED;
        }
    }

    public synchronized void resume() {
        if (status == Status.PAUSED) {
            status = Status.RUNNING;
        }
    }

    /** 单步：契约要求暂停状态下才生效 */
    public synchronized void stepOnce() {
        if (status == Status.PAUSED) {
            status = Status.RUNNING;
            step();
            if (status == Status.RUNNING) {
                status = Status.PAUSED;
            }
        }
    }

    public synchronized Frame seek(double t) {
        return frameCache.seekNearest(t);
    }

    // ===== 查询 =====

    public synchronized Frame latestFrame() {
        return frameCache.lastFrame();
    }

    public synchronized boolean isPaused() {
        return status == Status.PAUSED;
    }

    public synchronized boolean isEnded() {
        return status == Status.ENDED;
    }

    public synchronized Status getStatus() {
        return status;
    }

    public synchronized double getCurrentT() {
        return t;
    }

    public synchronized int getFrameCount() {
        return frameCount;
    }

    public String getSimId() {
        return simId;
    }

    public Long getOwnerId() {
        return ownerId;
    }

    public void setOwnerId(Long ownerId) {
        this.ownerId = ownerId;
    }

    public long getEndedAtMillis() {
        return endedAtMillis;
    }

    public long getCreatedAtMillis() {
        return createdAtMillis;
    }

    public Scene getScene() {
        return scene;
    }

    public double getDt() {
        return dt;
    }

    public EndInfo getEndInfo() {
        return endInfo;
    }

    public FrameCache getFrameCache() {
        return frameCache;
    }

    public List<DataRow> getDataTable() {
        return dataTable;
    }

    public List<KeyEvent> getKeyEvents() {
        return keyEvents;
    }

    public List<PhysicsElement> getDynamicElements() {
        return dynamicElements;
    }

    // ===== 同步执行（单元测试/回放构建用，不启线程）=====

    public void runToEndSync() {
        int guard = 0;
        while (!isEnded() && guard < 100_000) {
            step();
            guard++;
        }
    }

    // ===== 监听器注册 =====

    public void addFrameListener(Consumer<Frame> listener) {
        frameListeners.add(listener);
    }

    public void addKeyEventListener(Consumer<KeyEvent> listener) {
        keyEventListeners.add(listener);
    }

    public void addEndListener(Consumer<EndInfo> listener) {
        endListeners.add(listener);
    }

    public void addDataRowListener(Consumer<DataRow> listener) {
        dataRowListeners.add(listener);
    }

    private static double round(double v) {
        return Math.round(v * 1e6) / 1e6;
    }
}
