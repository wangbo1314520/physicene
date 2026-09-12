package com.physicene.backend.common.websocket;

import tools.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import org.springframework.web.socket.WebSocketSession;

import java.io.IOException;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * 第一周 WebSocket 链路验证：/ws/ping 每秒推心跳 + 回显客户端消息。
 * 第二周由 physics/websocket/PhysicsWebSocketHandler 接棒（30fps 物理帧），
 * 本类保留作为通道探针。
 */
public class PingWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(PingWebSocketHandler.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final Map<String, ScheduledFuture<?>> pingTasks = new ConcurrentHashMap<>();

    /** 单线程足够：第一周只有探针心跳，物理仿真线程池第二周另建 */
    private final ScheduledExecutorService scheduler =
            Executors.newSingleThreadScheduledExecutor(r -> {
                Thread t = new Thread(r, "ws-ping-scheduler");
                t.setDaemon(true);
                return t;
            });

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        log.info("WS ping 连接建立: {}", session.getId());
        pingTasks.put(session.getId(),
                scheduler.scheduleAtFixedRate(() -> sendPing(session), 1, 1, TimeUnit.SECONDS));
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) throws IOException {
        Map<String, Object> echo = Map.of(
                "type", "echo",
                "received", message.getPayload(),
                "time", System.currentTimeMillis()
        );
        session.sendMessage(new TextMessage(objectMapper.writeValueAsString(echo)));
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        ScheduledFuture<?> task = pingTasks.remove(session.getId());
        if (task != null) {
            task.cancel(false);
        }
        log.info("WS ping 连接关闭: {} status={}", session.getId(), status);
    }

    private void sendPing(WebSocketSession session) {
        try {
            if (session.isOpen()) {
                session.sendMessage(new TextMessage(objectMapper.writeValueAsString(Map.of(
                        "type", "ping",
                        "t", System.currentTimeMillis()
                ))));
            }
        } catch (Exception e) {
            // Jackson 3 抛 unchecked 异常，与 IO 异常一并兜住，探针心跳不允许打断调度线程
            log.warn("WS ping 推送失败 session={}: {}", session.getId(), e.getMessage());
        }
    }
}
