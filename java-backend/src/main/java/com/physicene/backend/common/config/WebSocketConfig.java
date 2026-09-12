package com.physicene.backend.common.config;

import com.physicene.backend.common.websocket.PingWebSocketHandler;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

/**
 * WebSocket 端点注册。第一周仅 /ws/ping；
 * 第二周注册 /ws/simulation/{simId}（握手 JWT 鉴权随第三周 JwtUtil 落地）。
 */
@Configuration
@EnableWebSocket
public class WebSocketConfig implements WebSocketConfigurer {

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(new PingWebSocketHandler(), "/ws/ping")
                .setAllowedOrigins("*"); // 第一周开发期放开；上线随 CorsConfig 收紧
    }
}
