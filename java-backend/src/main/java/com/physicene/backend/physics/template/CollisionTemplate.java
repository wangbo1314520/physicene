package com.physicene.backend.physics.template;

import com.physicene.backend.physics.model.InitialState;
import com.physicene.backend.physics.model.PhysicalProperties;
import com.physicene.backend.physics.model.PhysicsElement;
import com.physicene.backend.physics.model.Scene;
import com.physicene.backend.physics.model.SimulationConfig;
import com.physicene.backend.physics.model.Vector2D;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/** 小车碰撞模板（SRS F2.1）：等质量两车相向 5 m/s，零重力，自带 10s 时长上限。 */
@Component
public class CollisionTemplate implements SimulationTemplate {

    @Override
    public String getType() {
        return "template_collision";
    }

    @Override
    public String getDisplayName() {
        return "小车碰撞";
    }

    @Override
    public String getDescription() {
        return "两辆等质量小车相向运动发生碰撞，验证动量守恒与动能变化";
    }

    @Override
    public Scene initialScene() {
        List<PhysicsElement> elements = new ArrayList<>();

        PhysicsElement car1 = new PhysicsElement();
        car1.setId("car1");
        car1.setType("cube");
        car1.setPosition(new Vector2D(-3, 0.5));
        car1.setProperties(props(1, 0, 1.0));
        InitialState init1 = new InitialState();
        init1.setVelocity(new Vector2D(5, 0));
        car1.setInitialState(init1);
        car1.setColor("#4A90D9");
        elements.add(car1);

        PhysicsElement car2 = new PhysicsElement();
        car2.setId("car2");
        car2.setType("cube");
        car2.setPosition(new Vector2D(3, 0.5));
        car2.setProperties(props(1, 0, 1.0));
        InitialState init2 = new InitialState();
        init2.setVelocity(new Vector2D(-5, 0));
        car2.setInitialState(init2);
        car2.setColor("#E05555");
        elements.add(car2);

        PhysicsElement ground = new PhysicsElement();
        ground.setId("ground");
        ground.setType("wall");
        ground.setPosition(new Vector2D(0, -0.5));
        ground.setScale(new Vector2D(20, 0.2));
        ground.setProperties(props(1, 0, 0.2));
        ground.setColor("#8a8aa0");
        elements.add(ground);

        Scene scene = new Scene();
        scene.setElements(elements);
        SimulationConfig config = new SimulationConfig();
        config.setGravity(Vector2D.ZERO);
        config.setMaxDuration(10.0);
        scene.setConfig(config);
        return scene;
    }

    private PhysicalProperties props(double mass, double friction, double restitution) {
        PhysicalProperties p = new PhysicalProperties();
        p.setMass(mass);
        p.setFriction(friction);
        p.setRestitution(restitution);
        return p;
    }
}
