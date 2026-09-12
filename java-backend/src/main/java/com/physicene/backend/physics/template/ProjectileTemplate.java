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

/** 斜抛运动模板（SRS F2.3）：v0=20 m/s、45° 分解为 (14.14, 14.14)，落地停止。 */
@Component
public class ProjectileTemplate implements SimulationTemplate {

    @Override
    public String getType() {
        return "template_projectile";
    }

    @Override
    public String getDisplayName() {
        return "斜抛运动";
    }

    @Override
    public String getDescription() {
        return "初速度 20 m/s、抛射角 45° 的斜抛运动，观察轨迹与最高点";
    }

    @Override
    public Scene initialScene() {
        List<PhysicsElement> elements = new ArrayList<>();

        PhysicsElement ball = new PhysicsElement();
        ball.setId("ball");
        ball.setType("cube");
        ball.setPosition(new Vector2D(0, 0));
        PhysicalProperties p = new PhysicalProperties();
        p.setMass(0.1);
        p.setFriction(0);
        p.setRestitution(0);
        ball.setProperties(p);
        InitialState init = new InitialState();
        init.setVelocity(new Vector2D(14.14, 14.14));
        ball.setInitialState(init);
        ball.setColor("#F5C542");
        elements.add(ball);

        PhysicsElement ground = new PhysicsElement();
        ground.setId("ground");
        ground.setType("wall");
        ground.setPosition(new Vector2D(0, -0.5));
        ground.setScale(new Vector2D(60, 0.2));
        ground.setColor("#8a8aa0");
        elements.add(ground);

        Scene scene = new Scene();
        scene.setElements(elements);
        SimulationConfig config = new SimulationConfig();
        config.setGravity(new Vector2D(0, -9.8));
        config.setMaxDuration(30.0);
        config.setAirResistance(false);
        config.setDragCoeff(0.1);
        scene.setConfig(config);
        return scene;
    }
}
