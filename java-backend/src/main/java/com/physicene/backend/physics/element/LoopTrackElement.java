package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.BodyFixture;
import org.dyn4j.geometry.Geometry;
import org.dyn4j.geometry.Link;
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
    public static final double SEG_DEG = 5.0;

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

    private void addArc(Body body, Vector2D c, double radius, double a0, double a1, double friction) {
        double span = Math.max(SEG_DEG, a1 - a0);
        int n = (int) Math.ceil(span / SEG_DEG);
        List<Vector2> pts = new ArrayList<>(n + 1);
        for (int i = 0; i <= n; i++) {
            double ang = Math.toRadians(a0 + span * i / n);
            pts.add(new Vector2(c.x() + radius * Math.cos(ang), c.y() + radius * Math.sin(ang)));
        }
        for (Link link : Geometry.createLinks(pts, false)) {
            BodyFixture f = body.addFixture(link);
            f.setFriction(friction);
            f.setRestitution(data.getProperties().getRestitution());
        }
    }

    public String side() {
        double s = param("arcSideCode", -1);
        if (s >= 0) {
            return s == 1 ? "outer" : s == 2 ? "both" : "inner";
        }
        return "inner"; // 默认（JSON 数字参数表无法存字符串，arcSideCode 0/1/2）
    }

    public double radius() {
        return Math.max(0.1, param("radius", data.getScale().x()));
    }

    double param(String key, double def) {
        Double v = data.getParams() == null ? null : data.getParams().get(key);
        return v == null ? def : v;
    }
}
