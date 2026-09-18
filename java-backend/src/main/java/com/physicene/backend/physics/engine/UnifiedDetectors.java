package com.physicene.backend.physics.engine;

import com.physicene.backend.physics.model.KeyEvent;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.BodyFixture;
import org.dyn4j.dynamics.joint.DistanceJoint;
import org.dyn4j.geometry.Vector2;
import org.dyn4j.dynamics.contact.ContactConstraint;
import org.dyn4j.world.listener.ContactListener;

import java.util.Map;

/**
 * 统一搭建台阶段一：接触回调与关键事件检测（方案 §3.1/§3.6）。
 *  - BeltContactListener：对含 belt 刚体的接触注入带速（表面切向速度）
 *  - ContactTracker：land_surface / leave_surface / detach（含 θ 载荷）
 *  - FrameDetectors：belt_common_speed / common_speed / apex_pass / rope_taut / rope_slack / spring_natural
 * 三个类均为 SimulationInstance 内部协作对象（需读取实例的 bodies/belts/loops/stringJoints），
 * 独立成文件便于阶段一单测直接断言。
 */
final class UnifiedDetectors {

    private UnifiedDetectors() {
    }

    /** 传送带表面速度：把带速沿接触切向注入（等价带面运动） */
    static class BeltContactListener implements ContactListener<Body> {
        private final SimulationInstance sim;

        BeltContactListener(SimulationInstance sim) {
            this.sim = sim;
        }

        @Override
        public void begin(org.dyn4j.world.ContactCollisionData<Body> data,
                          org.dyn4j.dynamics.contact.Contact contact) {
            apply(data.getContactConstraint());
        }

        @Override
        public void persist(org.dyn4j.world.ContactCollisionData<Body> data,
                            org.dyn4j.dynamics.contact.Contact oldContact,
                            org.dyn4j.dynamics.contact.Contact newContact) {
            apply(data.getContactConstraint());
        }

        @Override
        public void preSolve(org.dyn4j.world.ContactCollisionData<Body> data,
                             org.dyn4j.dynamics.contact.Contact contact) {
            apply(data.getContactConstraint());
        }

        private void apply(ContactConstraint<Body> cc) {
            String id1 = sim.idOf(cc.getBody1());
            String id2 = sim.idOf(cc.getBody2());
            double[] belt = sim.beltOf(id1);
            if (belt == null) {
                belt = sim.beltOf(id2);
            }
            if (belt == null) {
                return;
            }
            double speed = belt[0];
            if (speed == 0) {
                return;
            }
            Vector2 dir = new Vector2(Math.cos(belt[1]), Math.sin(belt[1]));
            Vector2 tangent = cc.getTangent();
            cc.setTangentSpeed(speed * tangent.dot(dir));
        }

        @Override
        public void end(org.dyn4j.world.ContactCollisionData<Body> data,
                        org.dyn4j.dynamics.contact.Contact contact) {
        }

        @Override
        public void destroyed(org.dyn4j.world.ContactCollisionData<Body> data,
                              org.dyn4j.dynamics.contact.Contact contact) {
        }

        @Override
        public void collision(org.dyn4j.world.ContactCollisionData<Body> data) {
        }

        @Override
        public void postSolve(org.dyn4j.world.ContactCollisionData<Body> data,
                              org.dyn4j.dynamics.contact.SolvedContact contact) {
        }
    }

    /** 接触起止：land_surface / leave_surface / detach（接触消失且位于弧上半部，θ 自最低点起算） */
    static class ContactTracker implements ContactListener<Body> {
        private final SimulationInstance sim;

        ContactTracker(SimulationInstance sim) {
            this.sim = sim;
        }

        @Override
        public void begin(org.dyn4j.world.ContactCollisionData<Body> data,
                          org.dyn4j.dynamics.contact.Contact contact) {
            if (data.getFixture1().isSensor() || data.getFixture2().isSensor()) {
                return;
            }
            try {
            String pair = SimulationInstance.pairOf(sim.idOf(data.getBody1()), sim.idOf(data.getBody2()));
            boolean fresh = sim.activeContactsAdd(pair);
            if (fresh && sim.currentTime() > sim.contractDt() * 2) {
                String dynamic = sim.dynamicOf(pair);
                String label = dynamic == null ? "开始接触" : dynamic + " 接触表面";
                sim.fireKeyEvent(sim.currentTime(), "land_surface", label, null);
            }
            } catch (Throwable ex) { System.err.println("[tracker-begin] " + ex); }
        }

        @Override
        public void end(org.dyn4j.world.ContactCollisionData<Body> data,
                        org.dyn4j.dynamics.contact.Contact contact) {
            if (data.getFixture1().isSensor() || data.getFixture2().isSensor()) {
                return;
            }
            try {
            String pair = SimulationInstance.pairOf(sim.idOf(data.getBody1()), sim.idOf(data.getBody2()));
            if (sim.activeContactsRemove(pair) && sim.currentTime() > sim.contractDt() * 2) {
                String dynamic = sim.dynamicOf(pair);
                if (dynamic != null) {
                    sim.fireKeyEvent(sim.currentTime(), "leave_surface", dynamic + " 离开表面", null);
                    sim.maybeDetach(dynamic, sim.idOf(data.getBody1()), sim.idOf(data.getBody2()));
                }
            }
            } catch (Throwable ex) { System.err.println("[tracker-end] " + ex); }
        }

        @Override
        public void persist(org.dyn4j.world.ContactCollisionData<Body> data,
                            org.dyn4j.dynamics.contact.Contact c1, org.dyn4j.dynamics.contact.Contact c2) {
        }

        @Override
        public void destroyed(org.dyn4j.world.ContactCollisionData<Body> data,
                              org.dyn4j.dynamics.contact.Contact contact) {
        }

        @Override
        public void collision(org.dyn4j.world.ContactCollisionData<Body> data) {
        }

        @Override
        public void preSolve(org.dyn4j.world.ContactCollisionData<Body> data,
                             org.dyn4j.dynamics.contact.Contact contact) {
        }

        @Override
        public void postSolve(org.dyn4j.world.ContactCollisionData<Body> data,
                              org.dyn4j.dynamics.contact.SolvedContact contact) {
        }
    }

    /** 帧级：带共速 / 两体共速 / 过顶 / 绳绷紧松弛 / 弹簧原长 */
    static void detectFrameEvents(SimulationInstance sim) {
        double t = sim.currentTime();
        for (String pair : sim.activeContactsSnapshot()) {
            String[] ids = pair.split("\\|");
            Body b1 = sim.bodyOf(ids[0]);
            Body b2 = sim.bodyOf(ids[1]);
            if (b1 == null || b2 == null) {
                continue;
            }
            double[] belt = sim.beltOf(ids[0]) != null ? sim.beltOf(ids[0]) : sim.beltOf(ids[1]);
            if (belt != null) {
                Body other = sim.beltOf(ids[0]) != null ? b2 : b1;
                double vb = belt[0];
                double vAlong = other.getLinearVelocity().x * Math.cos(belt[1])
                        + other.getLinearVelocity().y * Math.sin(belt[1]);
                if (Math.abs(vAlong - vb) < 0.02 && sim.latch("belt:" + pair)) {
                    sim.fireKeyEvent(t, "belt_common_speed",
                            "与带共速 v=" + String.format("%.2f", vb) + " m/s", Map.of("v", vb));
                }
            } else if (!ids[0].contains("#") && !ids[1].contains("#")) {
                // dyn4j Vector2.subtract 会原地修改接收者（刚体速度！）：必须用纯算术，禁止对 getLinearVelocity() 的返回值做向量运算
                double dvx = b1.getLinearVelocity().x - b2.getLinearVelocity().x;
                double dvy = b1.getLinearVelocity().y - b2.getLinearVelocity().y;
                if (Math.hypot(dvx, dvy) < 0.02 && sim.latch("common:" + pair)) {
                    sim.fireKeyEvent(t, "common_speed", ids[0] + " 与 " + ids[1] + " 共速",
                            Map.of("v", b1.getLinearVelocity().getMagnitude()));
                }
            }
        }
        for (int i = 0; i < sim.dynamicBodyCount(); i++) {
            Body b = sim.dynamicBodyAt(i);
            String id = sim.dynamicElementIdAt(i);
            for (double[] g : sim.loopsSnapshot()) {
                double dx = b.getTransform().getTranslationX() - g[0];
                double dy = b.getTransform().getTranslationY() - g[1];
                if (Math.abs(Math.hypot(dx, dy) - g[2]) < 0.25 && dy > 0
                        && b.getLinearVelocity().y <= 0.01 && sim.latch("apex:" + id)) {
                    sim.fireKeyEvent(t, "apex_pass", id + " 过最高点", Map.of("y", g[1] + dy));
                }
            }
        }
        for (Map.Entry<String, DistanceJoint<Body>> e : sim.stringJointsSnapshot()) {
            DistanceJoint<Body> j = e.getValue();
            double cur = j.getCurrentDistance();
            String kind = e.getKey().endsWith("#spring") ? "spring" : e.getKey().endsWith("#rod") ? "rod" : "rope";
            if ("rope".equals(kind)) {
                boolean taut = j.isUpperLimitEnabled() && cur >= j.getUpperLimit() - 1e-4;
                if (taut && sim.latch("taut:" + e.getKey())) {
                    sim.fireKeyEvent(t, "rope_taut", "绳绷紧（L=" + String.format("%.3f", j.getUpperLimit()) + " m）",
                            Map.of("length", cur));
                } else if (!taut && sim.latch("slack:" + e.getKey())) {
                    sim.fireKeyEvent(t, "rope_slack", "绳松弛（当前 " + String.format("%.3f", cur) + " m）",
                            Map.of("length", cur));
                }
            } else if ("spring".equals(kind)) {
                if (Math.abs(cur - j.getRestDistance()) < 0.005 * Math.max(1e-6, j.getRestDistance())
                        && sim.latch("nat:" + e.getKey())) {
                    sim.fireKeyEvent(t, "spring_natural", "弹簧恢复原长", Map.of("length", cur));
                }
            }
        }
    }

}
