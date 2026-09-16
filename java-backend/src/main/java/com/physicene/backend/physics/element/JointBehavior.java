package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.Vector2D;
import org.dyn4j.dynamics.Body;
import org.dyn4j.dynamics.joint.Joint;
import org.dyn4j.world.World;

import java.util.Map;

/**
 * 关节型元件接口（统一搭建台阶段一，方案 §3.3）。
 * 关节元件没有自己的刚体（createBody 返回 null），在全部刚体创建完毕后
 * 由 SimulationInstance 第二遍装配调用 createJoint。
 */
public interface JointBehavior {

    /** 在全部刚体创建后建立 dyn4j 关节并挂到 world（返回关节实例供检测器读取） */
    Joint<Body> createJoint(World<Body> world, Map<String, Body> bodies);

    /** 锚点世界坐标：元件自身 position（固定锚）或目标本体 position + 旋转·局部锚 */
    static Vector2D anchorWorld(com.physicene.backend.physics.model.PhysicsElement owner,
                                Vector2D local, Body body, Vector2D fallback) {
        if (body == null) {
            return fallback;
        }
        org.dyn4j.geometry.Vector2 p = body.getTransform().getTranslation();
        double c = Math.cos(body.getTransform().getRotationAngle());
        double s = Math.sin(body.getTransform().getRotationAngle());
        double lx = local == null ? 0 : local.x();
        double ly = local == null ? 0 : local.y();
        return new Vector2D(p.x + c * lx - s * ly, p.y + s * lx + c * ly);
    }
}
