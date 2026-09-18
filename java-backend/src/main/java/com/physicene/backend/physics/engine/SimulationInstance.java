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
import com.physicene.backend.physics.element.BeltElement;
import com.physicene.backend.physics.element.JointBehavior;
import com.physicene.backend.physics.element.LoopTrackElement;
import com.physicene.backend.physics.element.RopeElement;
import org.dyn4j.dynamics.ContinuousDetectionMode;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.BodyFixture;
import org.dyn4j.dynamics.joint.DistanceJoint;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.World;
import org.dyn4j.world.listener.ContactListener;
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

    // ===== 统一搭建台阶段一状态（方案 §3.1/3.2/3.4/3.6）=====
    private final int substeps;
    /** belt id -> [speed, angle, cx, cy]：接触回调取带速与方向 */
    private final Map<String, double[]> belts = new LinkedHashMap<>();
    /** loop_track id -> [cx, cy, R]：脱离角/过顶检测 */
    private final Map<String, double[]> loops = new LinkedHashMap<>();
    /** loop_track id -> 元件实例（解析导轨力） */
    private final Map<String, LoopTrackElement> loopGuides = new LinkedHashMap<>();
    /** 动态体 id -> 本契约步是否有导轨力（步首清零，子步置位） */
    private final Map<String, Boolean> loopContactNow = new java.util.concurrent.ConcurrentHashMap<>();
    /** 动态体 id -> 上一契约步是否贴轨（脱离判定：was 贴轨 && 本步全程无力） */
    private final Map<String, Boolean> loopContactPrev = new java.util.concurrent.ConcurrentHashMap<>();
    /** 滑轮元件（自研绳段罚力对） */
    private final java.util.List<com.physicene.backend.physics.element.PulleyElement> pulleys = new java.util.ArrayList<>();
    /** 弹簧元件（力对施加） */
    private final java.util.List<com.physicene.backend.physics.element.SpringElement> springs = new java.util.ArrayList<>();
    /** 关节键 -> DistanceJoint：绳绷紧/松弛、弹簧原长事件 */
    private final Map<String, DistanceJoint<Body>> stringJoints = new LinkedHashMap<>();
    /** 活跃接触对 id1|id2（ContactTracker 维护） */
    private final Set<String> activeContacts = ConcurrentHashMap.newKeySet();
    /** 事件去重锁 */
    private final Set<String> eventLatches = ConcurrentHashMap.newKeySet();

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
        this.substeps = Math.max(1, Math.min(8, scene.getConfig().getSubsteps()));

        world.setGravity(new Vector2(scene.getConfig().getGravity().x(), scene.getConfig().getGravity().y()));
        // 子步：物理步长 = 契约 dt / substeps（默认 4 -> 240Hz），帧与数据仍按契约 1/60 输出（方案 §3.4）
        // dyn4j 5.0.2 语义实核（反编译确认）：stepFrequency 存的是“每步秒数”（默认 0.0166…），不是 Hz——传 dt/substeps 而非其倒数
        world.getSettings().setStepFrequency(this.dt / substeps);
        // 连续碰撞：仅对标记 bullet 的运动体启用（薄边/高速防穿透，方案 §3.4）
        world.getSettings().setContinuousDetectionMode(ContinuousDetectionMode.BULLETS_ONLY);
        world.getSettings().setPositionConstraintSolverIterations(20);

        // 第一遍：普通元件建刚体；关节元件（rope/rod/spring/pulley）收集待第二遍
        List<JointBehavior> jointBehaviors = new ArrayList<>();
        for (PhysicsElement element : scene.getElements()) {
            ElementBehavior behavior = registry.create(element);
            behaviors.add(behavior);
            if (behavior instanceof LoopTrackElement lt) {
                loops.put(element.getId(), new double[]{element.getPosition().x(),
                        element.getPosition().y(), lt.radius()});
                loopGuides.put(element.getId(), lt);
            }
            if (behavior instanceof JointBehavior jb && !(behavior instanceof LoopTrackElement)) {
                jointBehaviors.add(jb);
                continue;
            }
            if (behavior instanceof BeltElement be) {
                belts.put(element.getId(), new double[]{be.beltSpeed(), element.getAngle(),
                        element.getPosition().x(), element.getPosition().y()});
            }
            Body body = behavior.createBody(world);
            if (body != null) {
                if (element.getParams() != null && element.getParams().getOrDefault("bullet", 0.0) >= 1) {
                    body.setBullet(true);
                }
                bodies.put(element.getId(), body);
                if (!element.isFixed()) {
                    dynamicBodies.add(body);
                    dynamicElements.add(element);
                }
            }
        }
        // 第二遍：全部刚体就绪后建关节（连接目标必须已存在，SceneValidator 已静态校验）
        for (JointBehavior jb : jointBehaviors) {
            var joint = jb.createJoint(world, bodies);
            if (jb instanceof RopeElement rope && joint instanceof DistanceJoint dj) {
                stringJoints.put(rope.ownId() + "#" + rope.getType(), dj);
            }
            if (jb instanceof com.physicene.backend.physics.element.SpringElement se) {
                springs.add(se);
            }
            if (jb instanceof com.physicene.backend.physics.element.PulleyElement pe) {
                pulleys.add(pe);
            }
        }

        // 传送带：接触求解前按带速设表面切向速度（dyn4j 官方传送带语义，方案 §3.1）
        if (!belts.isEmpty()) {
            world.addContactListener(new UnifiedDetectors.BeltContactListener(this));
        }
        // 接触起止跟踪：land_surface / leave_surface / detach（方案 §3.6）
        world.addContactListener(new UnifiedDetectors.ContactTracker(this));

        // 碰撞关键事件：同一对元件只报一次；初始就贴合的接触（如方块恰好放在地面上）
        // 不算"碰撞"——前两步内的接触是放置不是碰撞
        CollisionListener<Body, BodyFixture> collisionAdapter = new CollisionListenerAdapter<>() {
            @Override
            public boolean collision(org.dyn4j.world.ManifoldCollisionData<Body, BodyFixture> data) {
                if (t <= dt * 2) {
                    return true; // 初始贴合：静默放行
                }
                // 场区域（sensor）接触不算碰撞事件
                if (data.getFixture1().isSensor() || data.getFixture2().isSensor()) {
                    return true;
                }
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
        loopContactNow.clear();
        // 自定义力扩展点（F2.6 computeForce）：电磁元件（点电荷）在此受力；
        // 统一搭建台：每个子步刷新一次（场力跟随子步位置，方案 §3.4）
        for (int i = 0; i < substeps; i++) {
            applyCustomForces();
            world.step(1);
        }
        t += dt;
        frameCount++;

        if (simId.startsWith("t-atwood") && frameCount % 15 == 0 && !pulleys.isEmpty()) {
            var pe = pulleys.get(0);
            System.out.println("[pul] f=" + frameCount + " t=" + String.format("%.2f", t)
                    + " L=" + String.format("%.4f", pe.getCurrentLength()) + " L0=" + String.format("%.4f", pe.getRestLength())
                    + " v1=" + String.format("%.3f", dynamicBodies.get(0).getLinearVelocity().y)
                    + " v2=" + String.format("%.3f", dynamicBodies.get(1).getLinearVelocity().y));
        }
        // 圆轨道解析脱离（双缓冲）：上一步贴轨 && 本步全程导轨力为零且在上半弧 → detach（θ 载荷）
        if (!loops.isEmpty()) {
            for (int i = 0; i < dynamicBodies.size(); i++) {
                Body b = dynamicBodies.get(i);
                String id = dynamicElements.get(i).getId();
                boolean was = Boolean.TRUE.equals(loopContactPrev.get(id));
                boolean now = Boolean.TRUE.equals(loopContactNow.get(id));
                if (was && !now && t > dt * 4) {
                    for (double[] g : loops.values()) {
                        double dx = b.getTransform().getTranslationX() - g[0];
                        double dy = b.getTransform().getTranslationY() - g[1];
                        double theta = Math.toDegrees(Math.atan2(dx, -dy));
                        if (theta < 0) {
                            theta += 360;
                        }
                        boolean upper = theta > 90 && theta < 270;
                        boolean near = Math.abs(Math.hypot(dx, dy) - g[2]) < 0.5;
                        if (upper && near && latch("detach:" + id)) {
                            fireKeyEvent(t, "detach",
                                    id + " 脱离轨道（θ=" + String.format("%.1f", theta) + "°）",
                                    Map.of("theta", round(theta)));
                        }
                    }
                }
                loopContactPrev.put(id, now);
            }
        }
        // 帧级关键事件检测（方案 §3.6）：共速/带共速/过顶/绳状态/弹簧原长
        UnifiedDetectors.detectFrameEvents(this);
        if (simId.startsWith("t-pend") && (frameCount == 1 || frameCount % 30 == 0) && !dynamicBodies.isEmpty()) {
            Body b0 = dynamicBodies.get(0);
            System.out.println("[pend] f=" + frameCount + " t=" + String.format("%.3f", t)
                    + " x=" + String.format("%.3f", b0.getTransform().getTranslationX())
                    + " y=" + String.format("%.3f", b0.getTransform().getTranslationY())
                    + " vx=" + String.format("%.3f", b0.getLinearVelocity().x)
                    + " vy=" + String.format("%.3f", b0.getLinearVelocity().y)
                    + " joints=" + world.getJointCount());
        }
        if (simId.startsWith("t-atwood") && frameCount % 15 == 0 && dynamicBodies.size() == 2) {
            System.out.println("[atw] f=" + frameCount + " t=" + String.format("%.2f", t)
                    + " v1y=" + String.format("%.3f", dynamicBodies.get(0).getLinearVelocity().y)
                    + " v2y=" + String.format("%.3f", dynamicBodies.get(1).getLinearVelocity().y)
                    + " y1=" + String.format("%.2f", dynamicBodies.get(0).getTransform().getTranslationY())
                    + " y2=" + String.format("%.2f", dynamicBodies.get(1).getTransform().getTranslationY()));
        }
        if (simId.startsWith("t-loop") && frameCount % 15 == 0 && !dynamicBodies.isEmpty()) {
            Body b0 = dynamicBodies.get(0);
            System.out.println("[loop] f=" + frameCount + " t=" + String.format("%.2f", t)
                    + " x=" + String.format("%.2f", b0.getTransform().getTranslationX())
                    + " y=" + String.format("%.2f", b0.getTransform().getTranslationY())
                    + " v=" + String.format("%.2f", b0.getLinearVelocity().getMagnitude())
                    + " contacts=" + activeContacts.size());
        }
        if (simId.startsWith("t-belt") && frameCount % 30 == 0 && !dynamicBodies.isEmpty()) {
            Body b0 = dynamicBodies.get(0);
            System.out.println("[belt] f=" + frameCount + " t=" + String.format("%.3f", t)
                    + " x=" + String.format("%.3f", b0.getTransform().getTranslationX())
                    + " y=" + String.format("%.3f", b0.getTransform().getTranslationY())
                    + " vx=" + String.format("%.3f", b0.getLinearVelocity().x)
                    + " contacts=" + activeContacts.size());
        }

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

    /** 构建力上下文并对有 computeForce 的元件施力（ElementContext 只读，SRS F2.9） */
    private void applyCustomForces() {
        boolean anyForce = false;
        for (ElementBehavior behavior : behaviors) {
            if (behavior.hasCustomForce()) {
                anyForce = true;
                break;
            }
        }
        if (!anyForce && loops.isEmpty() && springs.isEmpty() && pulleys.isEmpty()) {
            return; // 纯力学场景零开销（圆轨道解析导轨走 loops 路径）
        }
        java.util.Map<String, Vector2D> positionMap = new java.util.HashMap<>();
        java.util.Map<String, Vector2D> velocityMap = new java.util.HashMap<>();
        for (java.util.Map.Entry<String, Body> e : bodies.entrySet()) {
            org.dyn4j.geometry.Vector2 p = e.getValue().getTransform().getTranslation();
            org.dyn4j.geometry.Vector2 v = e.getValue().getLinearVelocity();
            positionMap.put(e.getKey(), new Vector2D(p.x, p.y));
            velocityMap.put(e.getKey(), new Vector2D(v.x, v.y));
        }
        ElementContext ctx = new ElementContext(scene.getElements(), positionMap, velocityMap,
                t, new Vector2D(scene.getConfig().getGravity().x(), scene.getConfig().getGravity().y()));
        for (ElementBehavior behavior : behaviors) {
            Vector2D force = behavior.computeForce(ctx);
            if (force != null) {
                Body body = bodies.get(behavior.ownId());
                if (body != null && !Double.isNaN(force.x()) && !Double.isNaN(force.y())) {
                    body.applyForce(new org.dyn4j.geometry.Vector2(force.x(), force.y()));
                }
            }
        }
        // 滑轮绳段罚力（教材精确解）：张力对 A/B 按 ratio 分配
        for (com.physicene.backend.physics.element.PulleyElement pe : pulleys) {
            pe.applyRopeForce();
        }
        // 弹簧力对（教材精确解）：A 受 +F、B 受 −F
        for (com.physicene.backend.physics.element.SpringElement se : springs) {
            double[] f = se.springForce();
            if (f != null && !Double.isNaN(f[0]) && !Double.isNaN(f[1])) {
                se.getBodyA().applyForce(new org.dyn4j.geometry.Vector2(f[0], f[1]));
                se.getBodyB().applyForce(new org.dyn4j.geometry.Vector2(-f[0], -f[1]));
            }
        }
        // 圆轨道解析导轨（方案 §3.2 解析化）：对每个动态体按位置/速度/质量/等效半径施加径向罚力
        if (!loopGuides.isEmpty()) {
            for (int i = 0; i < dynamicBodies.size(); i++) {
                Body b = dynamicBodies.get(i);
                PhysicsElement el = dynamicElements.get(i);
                double rb = equivalentRadius(el);
                for (LoopTrackElement lt : loopGuides.values()) {
                    double[] f = lt.guideForce(
                            b.getTransform().getTranslationX(), b.getTransform().getTranslationY(),
                            b.getLinearVelocity().x, b.getLinearVelocity().y,
                            el.getProperties().getMass(), rb);
                    if (f != null && f[2] > 0) {
                        b.applyForce(new org.dyn4j.geometry.Vector2(f[0], f[1]));
                        loopContactNow.put(el.getId(), true);
                    }
                }
            }
        }
    }

    /** 元件等效半径（球=半径；方块=外接圆半径）——圆轨道导轨接触判定用 */
    private static double equivalentRadius(PhysicsElement e) {
        double sx = Math.max(0.05, e.getScale().x()), sy = Math.max(0.05, e.getScale().y());
        if ("sphere".equals(e.getType()) || "point_charge".equals(e.getType())) {
            return 0.5 * (sx + sy) / 2.0; // 与 SphereElement.buildShape 一致
        }
        return Math.hypot(sx, sy) / 2.0;
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

    // ===== 统一搭建台阶段一：检测器桥接（包内可见，方案 §3.6）=====

    String idOf(Body b) {
        Object ud = b == null ? null : b.getUserData();
        return ud == null ? "none" : String.valueOf(ud);
    }

    static String pairOf(String a, String b) {
        return a.compareTo(b) < 0 ? a + "|" + b : b + "|" + a;
    }

    boolean activeContactsAdd(String pair) { return activeContacts.add(pair); }

    boolean activeContactsRemove(String pair) { return activeContacts.remove(pair); }

    java.util.Set<String> activeContactsSnapshot() { return Set.copyOf(activeContacts); }

    double[] beltOf(String id) { return belts.get(id); }

    java.util.Collection<double[]> loopsSnapshot() { return loops.values(); }

    java.util.Set<Map.Entry<String, DistanceJoint<Body>>> stringJointsSnapshot() { return stringJoints.entrySet(); }

    Body bodyOf(String id) { return bodies.get(id); }

    int dynamicBodyCount() { return dynamicBodies.size(); }

    Body dynamicBodyAt(int i) { return dynamicBodies.get(i); }

    String dynamicElementIdAt(int i) { return dynamicElements.get(i).getId(); }

    String dynamicOf(String pair) {
        String[] ids = pair.split("\\|");
        for (String id : ids) {
            for (PhysicsElement el : dynamicElements) {
                if (el.getId().equals(id)) return id;
            }
        }
        return null;
    }

    double currentTime() { return t; }

    double contractDt() { return dt; }


    java.util.List<String> springKeys() {
        java.util.List<String> keys = new java.util.ArrayList<>();
        for (var se : springs) {
            keys.add(se.ownId() + "#spring");
        }
        return keys;
    }

    double[] springState(String key) {
        for (var se : springs) {
            if ((se.ownId() + "#spring").equals(key)) {
                Body a = se.getBodyA(), b = se.getBodyB();
                double dist = Math.hypot(a.getTransform().getTranslationX() - b.getTransform().getTranslationX(),
                        a.getTransform().getTranslationY() - b.getTransform().getTranslationY());
                return new double[]{dist, se.getRestLength()};
            }
        }
        return null;
    }

    boolean latch(String key) { return eventLatches.add(key); }

    void fireKeyEvent(double time, String type, String label, Map<String, Double> payload) {
        KeyEvent event = new KeyEvent(time, type, label, frameCount, payload);
        keyEvents.add(event);
        keyEventListeners.forEach(l -> l.accept(event));
    }

    /** 接触消失时判定圆轨道脱离（上半弧），θ 自最低点起算（°） */
    void maybeDetach(String dynamicId, String id1, String id2) {
        for (var loop : loops.entrySet()) {
            if (!loop.getKey().equals(id1) && !loop.getKey().equals(id2)) continue;
            double[] g = loop.getValue();
            Body b = bodies.get(dynamicId);
            if (b == null) continue;
            double dx = b.getTransform().getTranslationX() - g[0];
            double dy = b.getTransform().getTranslationY() - g[1];
            double theta = Math.toDegrees(Math.atan2(dx, -dy));
            if (theta < 0) theta += 360;
            boolean upperHalf = theta > 90 && theta < 270;
            boolean withinAnnulus = Math.abs(Math.hypot(dx, dy) - g[2]) < 0.25;
            if (upperHalf && withinAnnulus) {
                fireKeyEvent(t, "detach",
                        dynamicId + " 脱离轨道（θ=" + String.format("%.1f", theta) + "°）",
                        Map.of("theta", round(theta)));
                return;
            }
        }
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
