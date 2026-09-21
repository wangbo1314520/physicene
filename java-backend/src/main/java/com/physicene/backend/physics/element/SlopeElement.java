package com.physicene.backend.physics.element;

import com.physicene.backend.physics.model.PhysicsElement;
import org.dyn4j.geometry.Convex;
import org.dyn4j.geometry.Triangle;
import org.dyn4j.geometry.Vector2;

/**
 * 斜面元件：基准直角三角形（底 2 × 高 1，直角在左下，斜边朝右上），
 * angle 控制倾斜角，默认固定。scale.x 缩放底宽，scale.y 缩放高。
 */
public class SlopeElement extends AbstractMechanicalElement {

    /** 底端钝化 v2 参数（渲染侧 Renderer.ts 同值 0.25/0.04——双栈对账表） */
    private static final double BLUNT_CAP = 0.25, BLUNT_RATIO = 0.04;

    public SlopeElement(PhysicsElement data) {
        super(forceFixed(data));
    }

    private static PhysicsElement forceFixed(PhysicsElement data) {
        data.setFixed(true); // 斜面默认固定（学生把方块放斜面上靠引擎自动检测，SRS F2.5）
        return data;
    }

    @Override
    public String getType() {
        return "slope";
    }

    @Override
    protected Convex buildShape() {
        double w = 2 * Math.max(0.05, data.getScale().x());
        double h = 1 * Math.max(0.05, data.getScale().y());
        // 底端钝化（任务E·薄刃修复）：保全长斜边 (−w/2,h/2)→(w/2,−h/2)，在底端顶点处用小切角
        // 替代零宽尖点——块操作区近底端不再失稳穿面（实测 m≈5.7 穿面）。切角量 0.04w，
        // 锚点/吸附几何位移 ≤0.15m（δ=0.35 吸附阈值内，兼容既有场景）。
        // v2（第6模式修正）：斜边角度严格不变——斜边终止于 (w/2−e, 线上)，末端竖直小面落到 (w/2−e, −h/2)。
        // v1 竖直切角使斜边角度 30°→29°，锁转滑块与面恒 1° 楔角→单角接触悬浮（实测中心偏 0.105m）
        double e = Math.min(BLUNT_CAP, w * BLUNT_RATIO);
        double sx = w / 2 - e;                       // 斜边终点 x（线上）
        double sy = -h / 2 + (e * h / w);            // 斜边线上 y（斜率不变）
        return new org.dyn4j.geometry.Polygon(
                new Vector2(-w / 2, -h / 2),   // 左下（直角顶点）
                new Vector2(sx, -h / 2),       // 底边右端
                new Vector2(sx, sy),           // 竖直端面（钝化厚度）
                new Vector2(-w / 2, h / 2)     // 左上（顶端）——三点斜边与原三角形严格共线
        );
    }

    @Override
    protected double momentOfInertia(double mass) {
        return 0; // 固定体不使用惯量
    }
}
