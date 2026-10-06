package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.BodyFixture;
import org.dyn4j.geometry.Geometry;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.world.World;

import java.util.ArrayList;
import java.util.List;

/**
 * 圆弧轨道（方案 §3.2）：按 a0..a1 以 5° 分段生成 Link 链（共享端点、无幽灵凸起）。
 *  side=inner/outer：单链在半径 R（内轨=球在轨内侧；外轨=球在轨外侧，由接触法线自然区分）；
 *  side=both：R±t/2 双链（管道）。
 *  元件 position=圆心；重力默认向下，arcA0/arcA1 为数学角（°，CCW，0=+x）。
 */
public class LoopTrackElement implements ElementBehavior {

    /** 分段角（度）：方案 §3.2 定 5° */
    public static final double SEG_DEG = 10.0; // 分段角：10° 折中接缝耗能与圆度（5° 接缝过密在 60Hz 下耗能，风险 R4）

    private final PhysicsElement data;

    public LoopTrackElement(PhysicsElement data) {
        this.data = data;
    }

    @Override
    public String getType() {
        return "loop_track";
    }

    @Override
    public String ownId() {
        return data.getId();
    }

    @Override
    public Body createBody(World<Body> world) {
        Vector2D c = data.getPosition();
        double r = Math.max(0.1, param("radius", data.getScale().x()));
        double a0 = param("arcA0", 0.0);
        double a1 = param("arcA1", 360.0);
        double thickness = Math.max(0.04, param("arcThickness", 0.12));
        String side = side();
        Body body = new Body();
        double friction = data.getProperties().getFriction();
        if ("inner".equals(side) || "outer".equals(side)) {
            addArc(body, c, r, a0, a1, friction);
        } else {
            addArc(body, c, r - thickness / 2, a0, a1, friction);
            addArc(body, c, r + thickness / 2, a0, a1, friction);
        }
        body.setMass(org.dyn4j.geometry.MassType.INFINITE);
        body.setUserData(data.getId());
        body.setBullet(false);
        world.addBody(body);
        return body;
    }

    /** 分段半径（m）：逐段 Capsule 粗 2×0.05，端帽互相重叠防缝隙——Link 链实测与圆不产生接触，Capsule 为带元件已验证的可靠形状 */
    public static final double SEG_RADIUS = 0.05;

    private void addArc(Body body, Vector2D c, double radius, double a0, double a1, double friction) {
        double span = Math.max(SEG_DEG, a1 - a0);
        int n = (int) Math.ceil(span / SEG_DEG);
        Vector2 prev = null;
        for (int i = 0; i <= n; i++) {
            double ang = Math.toRadians(a0 + span * i / n);
            Vector2 p = new Vector2(c.x() + radius * Math.cos(ang), c.y() + radius * Math.sin(ang));
            if (prev != null) {
                double dx = p.x - prev.x, dy = p.y - prev.y;
                double len = Math.hypot(dx, dy) + 2 * SEG_RADIUS; // 端帽重叠：相邻段无缝
                org.dyn4j.geometry.Capsule seg = Geometry.createCapsule(len, SEG_RADIUS);
                seg.rotate(Math.atan2(dy, dx) - Math.PI / 2.0); // Capsule 默认沿 +y，转到段方向
                seg.translate((p.x + prev.x) / 2.0, (p.y + prev.y) / 2.0);
                BodyFixture f = body.addFixture(seg);
                f.setSensor(true); // 圆轨道物理走解析导轨（guideForce），链仅可视
                f.setFriction(friction);
                f.setRestitution(data.getProperties().getRestitution());
            }
            prev = p;
        }
    }

    /**
     * 解析法向导轨（内轨语义：球在圆内，表面超出 R 时受向心罚力）。
     * 返回 [Fx, Fy, N, pen]；N≤0 且此前有接触 → 脱离。要求 substeps≥4（240Hz）保稳定。
     * A1 开口环（2026-10-06）：
     * ① 球方位角落在缺口角区内不导——底部入口可自由进出；
     * ② onTrack 身份集：球心进入 R−r 球道圈才"上轨"——墙带(R−r, R]幽灵穿入的球不捕获
     *   （传感器链无外壁碰撞，原实现会对穿墙球垫罚力=能量注入，实测 v=2.5 爬 1.1m）；
     * ③ 脱离事件不受缺口影响（SimulationInstance 判 upper，底部区天然不触发）。
     */
    private final java.util.Set<org.dyn4j.dynamics.Body> onTrack =
            java.util.Collections.newSetFromMap(new java.util.IdentityHashMap<>());

    public double[] guideForce(org.dyn4j.dynamics.Body body, double bx, double by, double bvx, double bvy, double m, double ballRadius) {
        Vector2D c = data.getPosition();
        double R = radius();
        double dx = bx - c.x(), dy = by - c.y();
        double dist = Math.hypot(dx, dy);
        if (dist < 1e-6) {
            return null;
        }
        if (!inArc(dx, dy)) {
            return null;   // A1：缺口角区（含端部 2° 缓冲）内无轨道——入口/出口自由
        }
        double ux = dx / dist, uy = dy / dist; // 径向单位（向外）
        double vr = bvx * ux + bvy * uy;       // 径向速度（向外为正）
        String sd = side();
        double pen;
        double dir; // +1 力沿径向向外（外轨），−1 向内（内轨/管道内壁）
        if ("outer".equals(sd)) {
            // OPEN#3 修复：外轨只导「轨外近面」的球（dist ≥ R，防圈内球被反向推出轨道）
            if (dist < R) {
                return null;
            }
            pen = R - (dist - ballRadius);  // 球在外侧压向轨道
            dir = 1;
        } else {
            // 内轨/管道只导「圈内」的球（OPEN#3）+ A1 onTrack：球心进 R−r 球道圈才上轨——
            // 墙带 (R−r, R] 的幽灵穿入球（传感器链无外壁，从圈外穿墙进来）不捕获，防罚力垫注入能量
            if (dist <= R - ballRadius + 1e-9) {
                onTrack.add(body);
            } else if (!onTrack.contains(body)) {
                return null;
            }
            pen = (dist + ballRadius) - R;  // 球在圆内压向外壁（内轨/管道）
            dir = -1;
        }
        if (pen <= 0) {
            return new double[]{0, 0, 0, 0};
        }
        double k = 6000.0;                 // 罚刚度 s⁻²（对质量归一）
        double cd = 2.0 * Math.sqrt(k) * 0.35; // 径向阻尼（近临界，防接缝噪声）
        double f = m * (k * pen + cd * vr);
        if (f < 0) {
            f = 0; // 只压不拉（单侧接触）
        }
        return new double[]{dir * ux * f, dir * uy * f, f, pen};
    }

    public String side() {
        double s = param("arcSideCode", -1);
        if (s >= 0) {
            return s == 1 ? "outer" : s == 2 ? "both" : "inner";
        }
        return "inner"; // 默认（JSON 数字参数表无法存字符串，arcSideCode 0/1/2）
    }

    /** A1 开口环：球方位角是否在弧覆盖内（数学角 CCW，0=+x）。
     *  arcA0/arcA1 定义弧段（span=a1−a0，允许 >360 跨轴）；缺口两端各 2° 缓冲防力开关抖动。
     *  rel = 自 a0 起顺时针到 θ 的角距 ∈ (EDGE, span−EDGE) 才导——旧闭环场景 span=360 全程命中。 */
    private boolean inArc(double dx, double dy) {
        double a0 = param("arcA0", 0.0);
        double span = Math.max(0, param("arcA1", 360.0) - a0);
        if (span >= 360 - 1e-9) {
            return true;   // 闭环（兼容旧场景/无缺口参数）
        }
        double theta = Math.toDegrees(Math.atan2(dy, dx));
        if (theta < 0) {
            theta += 360;
        }
        double rel = (theta - (a0 % 360) + 360) % 360;
        double EDGE = 2.0;
        return rel > EDGE && rel < span - EDGE;
    }

    public double radius() {
        return Math.max(0.1, param("radius", data.getScale().x()));
    }

    double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }
}
