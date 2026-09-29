package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.circuit.CircuitEngine;

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
    /** P0-1: slope 表面 [中心x, 中心y, 角度rad, 中心到面距离] */
    private final java.util.List<double[]> slopeSurfaces = new java.util.ArrayList<>();
    private final java.util.List<com.physicene.backend.physics.element.SensorElement> sensors = new java.util.ArrayList<>();
    /** 追问1 修正：接触力累积（bodyId → [ΣFx, ΣFy]），由 ContactListener.postSolve 填充 */
    private final java.util.Map<String, double[]> contactForceAccum = new java.util.concurrent.ConcurrentHashMap<>();
    /** loop_track id -> 元件实例（解析导轨力） */
    private final Map<String, LoopTrackElement> loopGuides = new LinkedHashMap<>();
    /** 动态体 id -> 本契约步是否有导轨力（步首清零，子步置位） */
    private final Map<String, Boolean> loopContactNow = new java.util.concurrent.ConcurrentHashMap<>();
    /** 动态体 id -> 上一契约步是否贴轨（脱离判定：was 贴轨 && 本步全程无力） */
    private final Map<String, Boolean> loopContactPrev = new java.util.concurrent.ConcurrentHashMap<>();
    /** 滑轮元件（自研绳段罚力对） */
    private final java.util.List<com.physicene.backend.physics.element.PulleyElement> pulleys = new java.util.ArrayList<>();
    /** D5 冲量式绳（断裂判定 + rope_break 事件） */
    private final java.util.List<com.physicene.backend.physics.element.RopeElement> ropes = new java.util.ArrayList<>();
    /** P2.1·耦合编排器（null=无耦合场景零开销） */
    private CouplingOrchestrator orchestrator = null;
    /** P5a：恒力装置持续时间 */
    private double forceDuration = Double.MAX_VALUE;
    /** P2.1·耦合读数（E2E 数值断言用：各 rod 支路电流 / 气室压强 / 活塞位置） */
    private final java.util.Map<String, Double> couplingReadings = new LinkedHashMap<>();
    /** P2.1·活塞耦合参数：阻尼系数 c=2ζ√(kM)（气弹簧 k=γpA²/V₀ 线性化）/ 活塞面积 / 气室元胞 */
    private final java.util.Map<String, Double> pistonDamping = new LinkedHashMap<>();
    private final java.util.Map<String, Double> pistonArea = new LinkedHashMap<>();
    private final java.util.Map<String, com.physicene.backend.physics.thermal.GasCell> pistonCells = new LinkedHashMap<>();
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
        // 第6模式：全局禁用 dyn4j at-rest 冻结（body 级开关实测不生效）——受约束/接触物体持续受力，
        // 不应被瞬时低速判静止（阻尼振荡尾段块冻在小离面位移处，净压面 8N 无法恢复贴面）；
        // 教学仿真的静止收尾由自家 stillThreshold 负责
        world.getSettings().setAtRestDetectionEnabled(false);

        // 第一遍：普通元件建刚体；关节元件（rope/rod/spring/pulley）收集待第二遍
        List<JointBehavior> jointBehaviors = new ArrayList<>();
        for (PhysicsElement element : scene.getElements()) {
            ElementBehavior behavior = registry.create(element);
            behaviors.add(behavior);
            if (behavior instanceof com.physicene.backend.physics.element.SensorElement se) {
                sensors.add(se);
            }
            if ("slope".equals(element.getType())) {
                // P0-1 修正：存斜边法向量 [cx, cy, cosθ, sinθ]——θ=斜面倾角
                double th = Math.toRadians(Math.toDegrees(Math.atan2(
                        Math.max(0.05, element.getScale().y()), Math.max(0.05, element.getScale().x()))));
                slopeSurfaces.add(new double[]{element.getPosition().x(), element.getPosition().y(),
                        Math.cos(th), Math.sin(th)});
            }
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
                // 滑块理想化（第6模式最终修复）：fixRot=1 锁转动（保质量）——方块在斜面上以角接触会
                // 产生角脉冲→微楔角卡死（中心偏 0.1m），教学滑块模型应保持面接触不翻转
                if (element.getParams() != null && element.getParams().getOrDefault("fixRot", 0.0) >= 1 && !element.isFixed()) {
                    body.setMassType(org.dyn4j.geometry.MassType.FIXED_ANGULAR_VELOCITY);
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
            if (jb instanceof RopeElement rope && !(jb instanceof com.physicene.backend.physics.element.RodElement)) {
                ropes.add(rope);  // D5 冲量式绳（createJoint 返回 null 不入 stringJoints）
            }
            if (jb instanceof com.physicene.backend.physics.element.SpringElement se) {
                springs.add(se);
            }
            if (jb instanceof com.physicene.backend.physics.element.PulleyElement pe) {
                pulleys.add(pe);
            }
        }

        // 检测器绑定目标
        for (var se : sensors) {
            se.bindTarget(bodies);
        }

        // P2.1·耦合编排器接线：检测 rod_bar + rail_pair + b_region / piston + gas_cell 组合
        buildCouplingOrchestrator();

        // 追问1 修正：接触力累积（postSolve 读冲量→力，供 accel_sensor 精确采样）
        world.addContactListener(new org.dyn4j.world.listener.ContactListenerAdapter<Body>() {
            @Override
            public void postSolve(org.dyn4j.world.ContactCollisionData<Body> data,
                                  org.dyn4j.dynamics.contact.SolvedContact contact) {
                double dtSub = dt / substeps;
                double normalImpulse = contact.getNormalImpulse();
                double tangentImpulse = contact.getTangentialImpulse();
                if (normalImpulse == 0 && tangentImpulse == 0) return;
                // 法向力和切向力（世界坐标）
                org.dyn4j.geometry.Vector2 n = data.getContactConstraint().getNormal();
                double fn = normalImpulse / dtSub;
                double ft = tangentImpulse / dtSub;
                double fx = n.x * fn - n.y * ft;  // 法向+切向合成
                double fy = n.y * fn + n.x * ft;
                // 累积到两个 body（各受一半反作用力方向相反——简化：只累积到传感器目标）
                for (var se : sensors) {
                    if (se.getTarget() != null && (se.getTarget() == data.getBody1() || se.getTarget() == data.getBody2())) {
                        double[] acc = contactForceAccum.computeIfAbsent(se.ownId(), k -> new double[2]);
                        // 方向：body1 受 +，body2 受 −
                        double sign = (se.getTarget() == data.getBody1()) ? 1 : -1;
                        acc[0] += sign * fx; acc[1] += sign * fy;
                    }
                }
            }
        });

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

    /**
     * P2.1·耦合编排器构建：扫描场景元素，检测 rod_bar+b_region / piston+gas_cell 组合。
     * rod_bar→RodBarLink（B 从 b_region 取，L 从 rail_pair 取，R 从 rod_bar params 取）
     * piston+gas_cell→PistonCoupling（S 从 cylinder 取，热学参数从 gas_cell 取）
     */
    private void buildCouplingOrchestrator() {
        // P2.1：_srcType=1 标记的 cube = RunBridge 映射的 rod_bar（类型不匹配修——前端 rod_bar→Java cube，用参数标记识别）
        var rodEls = scene.getElements().stream().filter(e -> e.getParams() != null
                && e.getParams().getOrDefault("_srcType", 0.0) == 1.0).toList();
        var bEls = scene.getElements().stream().filter(e -> "b_field".equals(e.getType()) || "b_region".equals(e.getType())).toList();
        var pistonEls = scene.getElements().stream().filter(e -> e.getParams() != null
                && e.getParams().getOrDefault("_srcType", 0.0) == 2.0).toList();
        var gasEls = scene.getElements().stream().filter(e -> e.getParams() != null
                && e.getParams().getOrDefault("_srcType", 0.0) == 3.0).toList();

        // P4 批3：coil(_srcType=6) 也需要 bEls——早退条件扩展
        var coilElsCheck = scene.getElements().stream().filter(e -> e.getParams() != null
                && e.getParams().getOrDefault("_srcType", 0.0) == 6.0).toList();
        boolean hasCoilCoupling = !coilElsCheck.isEmpty() && !bEls.isEmpty();
        boolean hasRodCoupling = !rodEls.isEmpty() && !bEls.isEmpty();
        boolean hasPistonCoupling = !pistonEls.isEmpty() && !gasEls.isEmpty();
        if (!hasRodCoupling && !hasPistonCoupling && !hasCoilCoupling) return;

        double subDt = dt / substeps;
        var circuit = new com.physicene.backend.physics.circuit.CircuitEngine.Circuit();
        var orch = new CouplingOrchestrator(circuit, subDt);

        if (hasRodCoupling) {
            double b = bEls.get(0).getProperties() != null ? Math.abs(bEls.get(0).getProperties().getBField() == null ? 1 : bEls.get(0).getProperties().getBField()) : 1;
            double l = 1.0;  // rail L 默认 1m
            var rail = scene.getElements().stream().filter(e -> "wall".equals(e.getType())
                    && e.getParams() != null && e.getParams().containsKey("railL")).findFirst();
            if (rail.isPresent()) l = rail.get().getParams().get("railL");
            for (var rod : rodEls) {
                Body rodBody = bodies.get(rod.getId());
                if (rodBody == null) continue;
                double r = rod.getParams() != null && rod.getParams().containsKey("R") ? rod.getParams().get("R") : 1.0;
                var res = new CircuitEngine.Comp();
                res.id = "R_" + rod.getId();
                res.kind = "resistor";
                res.props.put("R", r);
                circuit.components.add(res);
                var bat = new CircuitEngine.Comp();
                bat.id = "src_" + rod.getId();
                bat.kind = "battery";
                bat.props.put("emf", 0.0);
                bat.props.put("r", 0.001);
                circuit.components.add(bat);
                circuit.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef(bat.id, 0), new CircuitEngine.PinRef(res.id, 0)));
                circuit.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef(bat.id, 1), new CircuitEngine.PinRef(res.id, 1)));
                orch.addRodLink(new CouplingOrchestrator.RodBarLink(rod.getId(), rodBody, "R_" + rod.getId(), b, l));
            }
        }

        if (hasPistonCoupling) {
            var gasEl = gasEls.get(0);
            double p0 = gasEl.getParams() != null && gasEl.getParams().containsKey("p0") ? gasEl.getParams().get("p0") : 101325;
            double v0 = gasEl.getParams() != null && gasEl.getParams().containsKey("V0") ? gasEl.getParams().get("V0") : 0.01;
            double t0 = gasEl.getParams() != null && gasEl.getParams().containsKey("T0") ? gasEl.getParams().get("T0") : 300;
            double gamma = gasEl.getParams() != null && gasEl.getParams().containsKey("gamma") ? gasEl.getParams().get("gamma") : 1.0;
            var cell = new com.physicene.backend.physics.thermal.GasCell(p0, v0, t0, gamma);
            var pistonEl = pistonEls.get(0);
            Body pistonBody = bodies.get(pistonEl.getId());
            if (pistonBody != null) {
                double area = 0.01;
                var cyl = scene.getElements().stream().filter(e -> "wall".equals(e.getType())
                        && e.getParams() != null && e.getParams().containsKey("area")).findFirst();
                if (cyl.isPresent()) area = cyl.get().getParams().get("area");
                double x0 = pistonEl.getPosition().y() - v0 / area;  // 初始位置推算
                orch.addPiston(new com.physicene.backend.physics.thermal.PistonCoupling(cell, pistonBody, area, x0, true));
                // 气弹簧阻尼：k = γ·p·A²/V₀（V₀ 处线性化）→ c = 2ζ√(kM)，ζ 来自 RunBridge dampingRatio。
                // 无阻尼时活塞以 ω=√(k/M) 自由振荡不停，平衡断言 |vy|→0 永远不成立
                double zeta = pistonEl.getParams() != null && pistonEl.getParams().containsKey("dampingRatio")
                        ? pistonEl.getParams().get("dampingRatio") : 0.5;
                double kGas = gamma * p0 * area * area / Math.max(1e-9, v0);
                pistonDamping.put(pistonEl.getId(), 2.0 * zeta * Math.sqrt(kGas * pistonBody.getMass().getMass()));
                pistonArea.put(pistonEl.getId(), area);
                pistonCells.put(pistonEl.getId(), cell);
            }
        }

// P4 批3 第0.5步：电容支路接入 rod 回路（RC 充放电）
        if (hasRodCoupling && !pistonEls.isEmpty() == false) {
            var capEls5 = scene.getElements().stream().filter(e -> e.getParams() != null
                    && e.getParams().getOrDefault("_srcType", 0.0) == 5.0).toList();
            if (!capEls5.isEmpty()) {
                var capEl = capEls5.get(0);
                double capacitance = capEl.getParams().getOrDefault("C", 0.1);
                var capComp = new CircuitEngine.Comp();
                capComp.id = "C_cap";
                capComp.kind = "capacitor";
                capComp.props.put("C", capacitance);
                capComp.props.put("v0", 0.0);
                circuit.components.add(capComp);
                if (!rodEls.isEmpty()) {
                    circuit.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef("src_" + rodEls.get(0).getId(), 0), new CircuitEngine.PinRef("C_cap", 0)));
                    circuit.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef("src_" + rodEls.get(0).getId(), 1), new CircuitEngine.PinRef("C_cap", 1)));
                }
            }
        }
        // P4 批3 第0.5步：线框感应（磁通量→EMF→楞次力，与 rod 同形式但 w 代替 L）
        var coilEls6 = scene.getElements().stream().filter(e -> e.getParams() != null
                && e.getParams().getOrDefault("_srcType", 0.0) == 6.0).toList();
        if (!coilEls6.isEmpty() && !bEls.isEmpty()) {
            var coilEl = coilEls6.get(0);
            Body coilBody = bodies.get(coilEl.getId());

            if (coilBody != null) {
                double bCoil = bEls.get(0).getProperties() != null ? Math.abs(bEls.get(0).getProperties().getBField() == null ? 1 : bEls.get(0).getProperties().getBField()) : 1;
                double wCoil = coilEl.getParams().getOrDefault("w", 1.0);
                double rCoil = coilEl.getParams().getOrDefault("R", 1.0);
                // 场域边界（B 场 scale 12×12 默认，中心=场元件位置）
                double fieldCx = bEls.get(0).getPosition().x();
                double fieldHalf = bEls.get(0).getScale() != null ? bEls.get(0).getScale().x() / 2.0 : 6.0;
                orch.addCoilLink(new CouplingOrchestrator.CoilLink(coilEl.getId(), coilBody, "R_coil", bCoil, wCoil,
                    fieldCx - fieldHalf, fieldCx + fieldHalf));
                var coilRes = new CircuitEngine.Comp();
                coilRes.id = "R_coil";
                coilRes.kind = "resistor";
                coilRes.props.put("R", rCoil);
                circuit.components.add(coilRes);
                var coilSrc = new CircuitEngine.Comp();
                coilSrc.id = "src_coil";
                coilSrc.kind = "battery";
                coilSrc.props.put("emf", 0.0);
                coilSrc.props.put("r", 0.001);
                circuit.components.add(coilSrc);
                circuit.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef("src_coil", 0), new CircuitEngine.PinRef("R_coil", 0)));
                circuit.wires.add(new CircuitEngine.Wire(new CircuitEngine.PinRef("src_coil", 1), new CircuitEngine.PinRef("R_coil", 1)));
            }
        }

        this.orchestrator = orch;
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
// P5a 回填：恒力装置（_srcType=7）对目标体施加恒力 F·Δt（duration 后停止）
            for (var cfEl : scene.getElements()) {
                if (cfEl.getParams() != null && cfEl.getParams().getOrDefault("_srcType", 0.0) == 7.0) {
                    double fVal = cfEl.getParams().getOrDefault("F", 4.0);
                    double fDur = cfEl.getParams().getOrDefault("duration", 2.0);
                    System.out.printf("[cf-dbg] t=%.3f fDur=%.3f F=%.1f params=%s%n", t, fDur, fVal, cfEl.getParams().keySet()); if (t >= fDur) continue;
                    int targetIdx = (int)(double) cfEl.getParams().getOrDefault("target", 0.0);
                    var dynIt = dynamicBodies.iterator();
                    Body target = null;
                    for (int bi = 0; bi <= targetIdx && dynIt.hasNext(); bi++) target = dynIt.next();
                    if (target != null && fVal != 0) {
                        target.applyForce(new org.dyn4j.geometry.Vector2(fVal, 0));
                    }
                }
            }

            // P2.1·耦合编排：EMF→电流→安培力 / 气室→压力→活塞力（每子步，方案 §3.9）
            if (orchestrator != null) {
                var cr = orchestrator.step(t);
                if (cr.sol() != null && cr.sol().ok) {
                    for (var entry : cr.sol().elements.entrySet()) {
                        couplingReadings.put("I_" + entry.getKey(), entry.getValue().i());
                    }
                }
                // rod_bar 外力 F（恒力推/拉——_srcType=1 标记的 cube = RunBridge 映射的 rod_bar）
                for (var rodEl : scene.getElements()) {
                    if (rodEl.getParams() != null && rodEl.getParams().getOrDefault("_srcType", 0.0) == 1.0) {
                        Body b = bodies.get(rodEl.getId());
                        if (b == null) continue;
                        double fExt = rodEl.getParams().getOrDefault("F", 0.0);
                        if (fExt != 0) b.applyForce(new org.dyn4j.geometry.Vector2(fExt, 0));
                        couplingReadings.put("v_" + rodEl.getId(), b.getLinearVelocity().x);
                    }
                }
                // 活塞阻尼力 F=-c·v（竖直缸）+ 气室读数（p_gauge/pA/Mg 对照，E2E 平衡断言数据源）
                for (var pid : pistonDamping.keySet()) {
                    Body pb = bodies.get(pid);
                    if (pb == null) continue;
                    org.dyn4j.geometry.Vector2 pv = pb.getLinearVelocity();
                    pb.applyForce(new org.dyn4j.geometry.Vector2(0, -pistonDamping.get(pid) * pv.y));
                    var cell = pistonCells.get(pid);
                    double a = pistonArea.get(pid);
                    couplingReadings.put("p_gauge_" + pid, cell.gaugePressure());
                    couplingReadings.put("pA_" + pid, cell.gaugePressure() * a);
                    couplingReadings.put("Mg_" + pid, pb.getMass().getMass() * 9.8);
                }
            }
            // 冲量式绳/滑轮约束（阶段三·五 D1）：速度约束 + Baumgarte 位置偏置，替代罚力对
            for (com.physicene.backend.physics.element.PulleyElement pe : pulleys) {
                pe.applyImpulse(dt / substeps);
            }
            // D5 冲量式绳：约束冲量 + 张力超限断裂（每条绳独立判定）
            for (com.physicene.backend.physics.element.RopeElement rope : ropes) {
                double tension = rope.applyImpulse(dt / substeps);
                if (!rope.isBroken() && tension > rope.tMax()) {
                    rope.markBroken();
                    KeyEvent ev = new KeyEvent(t, "rope_break", "绳断裂（T=" + String.format("%.1f", tension)
                            + "N > T_max=" + String.format("%.1f", rope.tMax()) + "N）", frameCount,
                            Map.<String, Object>of("tension", tension, "tmax", rope.tMax(), "ropeId", rope.ownId()));
                    keyEvents.add(ev);
                    keyEventListeners.forEach(l -> l.accept(ev));
                }
            }
            world.step(1);
        }
        t += dt;
        frameCount++;

        // 追问1 修正：接触力从子步累积取平均（每子步 postSolve 累积 1 次，除以子步数=平均力）
        for (var se : sensors) {
            double[] cf = contactForceAccum.get(se.ownId());
            if (cf != null) {
                se.setContactForce(cf[0] / substeps, cf[1] / substeps);
                cf[0] = 0; cf[1] = 0;
            }
            se.sampleAccel(t, dt);
        }

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
                                    Map.<String, Object>of("theta", round(theta)));
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
            // 检测器采样上帧（任务E：probes 通道 30fps）
            if (!sensors.isEmpty()) {
                java.util.Map<String, double[]> probes = new java.util.LinkedHashMap<>();
                for (var se : sensors) {
                    double[] val = se.sample(t);
                    if (val != null) probes.put(se.ownId(), val);
                }
                if (!probes.isEmpty()) frame.setProbes(probes);
            }
            // P2.1·耦合读数入 probes 通道（E2E 从 window.__builder 读到 v/I 数值）
            if (!couplingReadings.isEmpty()) {
                Map<String, double[]> cp = frame.getProbes() != null ? frame.getProbes() : new LinkedHashMap<>();
                for (var entry : couplingReadings.entrySet()) {
                    cp.put(entry.getKey(), new double[]{t, entry.getValue()});
                }
                frame.setProbes(cp);
            }
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
        // 弹簧力对（锚点连线方向 + 质心作用）：力线沿锚↔锚连线（斜面场景=纯沿轴，零法向分量），
        // 作用点取质心——滑块模型无矩理想化（底锚作用会产生 0.5F 翻转力矩把块掀离面，教学模型不取）
        for (com.physicene.backend.physics.element.SpringElement se : springs) {
            double[] f = se.springForce();
            if (f != null && !Double.isNaN(f[0]) && !Double.isNaN(f[1])) {
                se.getBodyA().applyForce(new org.dyn4j.geometry.Vector2(f[0], f[1]));
                se.getBodyB().applyForce(new org.dyn4j.geometry.Vector2(-f[0], -f[1]));

            }
        }
        // P0-1 补强：逐子步脱离检测（240Hz，斜面场景）——块中心到斜面距离超阈值记 slope_detach 事件
        if (!slopeSurfaces.isEmpty()) {
            for (int i = 0; i < dynamicBodies.size(); i++) {
                Body b = dynamicBodies.get(i);
                PhysicsElement el = dynamicElements.get(i);
                for (double[] sl : slopeSurfaces) {
                    // P0-1 修正：垂直距离到斜边直线（法向量投影），统一 0.05m 阈值
                    double dx = b.getTransform().getTranslationX() - sl[0];
                    double dy = b.getTransform().getTranslationY() - sl[1];
                    double perpDist = Math.abs(dx * sl[3] - dy * sl[2]);  // 法向投影=点到线距离
                    if (perpDist > 0.55 && t > dt * 4) {  // 0.5(块半高)+0.05(阈值)
                        if (latch("sdetach:" + el.getId())) {
                            fireKeyEvent(t, "slope_detach",
                                    el.getId() + " 脱离斜面（垂直距离=" + String.format("%.3f", perpDist) + " > 0.55）",
                                    null);
                        }
                    }
                }
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

    /** 最近 N 帧（WS 订阅重播窗口=150 帧≈5s：覆盖快速过程视觉；全量 1800 帧在多订阅者下消息量过大
     *  ——第三十一轮并发审查修正。>60s 长场景的更早视觉不重播（keyEvents 仍完整），帧策略升级列重审计） */
    public synchronized java.util.List<Frame> lastFrames(int n) {
        int size = frameCache.size();
        java.util.List<Frame> out = new java.util.ArrayList<>(Math.min(n, size));
        for (int i = Math.max(0, size - n); i < size; i++) {
            out.add(frameCache.frameAt(i));
        }
        return out;
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

    /** D5 冲量式绳快照（UnifiedDetectors 绷紧/松弛检测用） */
    java.util.List<com.physicene.backend.physics.element.RopeElement> ropesSnapshot() { return ropes; }

    /** D5：按 joints 键（ownId#type）查绳 Tmax（0=不判断裂） */
    double ropeTmaxOf(String jointKey) {
        String ownId = jointKey.split("#")[0];
        for (PhysicsElement el : scene.getElements()) {
            if (ownId.equals(el.getId()) && "rope".equals(el.getType()) && el.getParams() != null) {
                Double t = el.getParams().get("Tmax");
                return t == null ? 0 : t;
            }
        }
        return 0;
    }

    /** D5：移除绳关节（断裂）——仿真线程内调用 */
    void removeStringJoint(String jointKey) {
        DistanceJoint<Body> j = stringJoints.remove(jointKey);
        if (j != null) {
            world.removeJoint(j);
        }
    }

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
                // 锚点语义同步：长度=锚↔锚距（与 springForce/rest 一致）
                double[] aw = se.anchorPointsPublic();
                double dist = Math.hypot(aw[2] - aw[0], aw[3] - aw[1]);
                return new double[]{dist, se.getRestLength()};
            }
        }
        return null;
    }

    /** 测试钩子：元件逐体参数是否在 Java 侧生效（bullet/fixRot） */
    public boolean bodyFlagsOf(String id, String flag) {
        Body b = bodies.get(id);
        if (b == null) return false;
        if ("bullet".equals(flag)) return b.isBullet();
        if ("fixRot".equals(flag)) return b.getMass().getInverseInertia() == 0;  // 锁转=逆惯量 0
        return false;
    }

    /** P0-3 测试钩子：重新启用 at-rest（性能对比用） */
    public void enableAtRestForBenchmark() {
        world.getSettings().setAtRestDetectionEnabled(true);
    }

    /** 追问1 测试钩子：设置速度约束求解器迭代次数 */
    public void setVelocitySolverIterations(int n) {
        world.getSettings().setVelocityConstraintSolverIterations(n);
    }

    boolean latch(String key) { return eventLatches.add(key); }

    void fireKeyEvent(double time, String type, String label, Map<String, Object> payload) {
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
                        Map.<String, Object>of("theta", round(theta)));
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
