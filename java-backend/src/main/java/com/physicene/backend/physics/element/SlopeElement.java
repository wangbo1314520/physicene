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
        // 逆时针三顶点：直角在左下，斜面从左下角升向右上？直角在左下、斜边连接 (w/2,-h/2) 与 (-w/2,h/2)
        return new Triangle(
                new Vector2(-w / 2, -h / 2),   // 左下（直角顶点）
                new Vector2(w / 2, -h / 2),    // 右下
                new Vector2(-w / 2, h / 2)     // 左上
        );
    }

    @Override
    protected double momentOfInertia(double mass) {
        return 0; // 固定体不使用惯量
    }
}
