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
