package com.physicene.backend.common.config;

import com.physicene.backend.common.websocket.PingWebSocketHandler;
import com.physicene.backend.physics.websocket.PhysicsWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 端点注册。第一周 /ws/ping 探针；第二周 /ws/simulation/{simId} 30fps 推帧。
 * 握手 JWT 鉴权与 simId 归属校验随第三周 JwtUtil 落地（开发期放开）。
 *
 * 缓冲上限结论（第三十二轮压测期核实，撤回此前"默认 8KB 会截断帧"的误判）：
 * 8KB 限制是**入站**（客户端→服务器消息，本项目仅 resume/pause 控制指令 <1KB，足够）；
 * **出站帧（服务器→客户端）走 Tomcat 流式写缓冲无 8KB 上限**——大场景 FullSnapshot 帧不受限。
 * 曾尝试 ServletServerContainerFactoryBean 提缓冲——Spring WS（非 JSR-356 端点）测试上下文
 * 不支持该 Bean（contextLoads 红），已撤。
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    private final PhysicsWebSocketHandler physicsWebSocketHandler;

    public WebSocketConfig(PhysicsWebSocketHandler physicsWebSocketHandler) {
        this.physicsWebSocketHandler = physicsWebSocketHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new PingWebSocketHandler(), "/ws/ping")
                .setAllowedOrigins("*"); // 开发期放开；上线随 CorsConfig 收紧
        registry.addHandler(physicsWebSocketHandler, "/ws/simulation/{simId}")
                .setAllowedOrigins("*");
    }
}
