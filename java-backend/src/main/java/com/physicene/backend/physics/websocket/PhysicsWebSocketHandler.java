package com.physicene.backend.physics.websocket;

import com.physicene.backend.common.util.JwtUtil;
import com.physicene.backend.physics.engine.PhysicsWorld;
import com.physicene.backend.physics.engine.SimulationInstance;
import com.physicene.backend.physics.model.DataRow;
import com.physicene.backend.physics.model.Frame;
import com.physicene.backend.physics.model.KeyEvent;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import tools.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 仿真推帧 WebSocket（SRS 6.1）：/ws/simulation/{simId}。
 * 服务端消息：frame(30fps) / keyEvent / paused / resumed / ended / sync / kicked / not_found / error。
 * 客户端控制：pause / play / step / seek / sync / end。
 * 握手 JWT 鉴权与 simId 归属校验随 Week 3 JwtUtil 落地（当前开发期放开）。
 */
@Component
public class PhysicsWebSocketHandler extends TextWebSocketHandler {

    private static final Logger log = LoggerFactory.getLogger(PhysicsWebSocketHandler.class);

    private final PhysicsWorld physicsWorld;
    private final JwtUtil jwtUtil;
    private final ObjectMapper objectMapper = new ObjectMapper();

    /** 同 simId 单连接：新连接挤掉旧连接（契约 kicked 语义） */
    private final Map<String, WebSocketSession> sessionsBySim = new ConcurrentHashMap<>();
    /** 重播中连接集合（第三十三轮保序）：重播期间抑制 live 直发——否则 live 帧（t=now）与重播帧（t=旧）
     *  交替到达客户端造成回放位姿来回跳（send 的 synchronized 只保证线程安全不保证顺序） */
    private final java.util.Set<String> replayingSessions = ConcurrentHashMap.newKeySet();
    /** 重播线程池（第三十二轮）：订阅重播异步化——同步重播占容器 IO 线程在慢客户端下阻塞全部并发 */
    private static final java.util.concurrent.ExecutorService replayExecutor =
            java.util.concurrent.Executors.newFixedThreadPool(4, r -> {
                Thread t = new Thread(r, "ws-replay");
                t.setDaemon(true);
                return t;
            });   // 4 线程（第三十二轮压测：单线程串行 10 连接×150 帧=1500 帧需 7.5s，浏览器实测 6s 仅收 ~127 帧/连接）

    public PhysicsWebSocketHandler(PhysicsWorld physicsWorld, JwtUtil jwtUtil) {
        this.physicsWorld = physicsWorld;
        this.jwtUtil = jwtUtil;
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws Exception {
        String simId = extractSimId(session);
        if (simId == null) {
            send(session, Map.of("type", "error", "code", 1001, "message", "路径缺少 simId"));
            session.close(CloseStatus.BAD_DATA);
            return;
        }
        // 握手鉴权（SRS 6.1）：token 查询参数 + simId 归属校验，失败 4001
        Long tokenUserId;
        try {
            String token = extractQueryParam(session, "token");
            if (token == null) {
                throw new IllegalArgumentException("缺少 token");
            }
            tokenUserId = jwtUtil.parse(token).userId();
        } catch (Exception e) {
            send(session, Map.of("type", "error", "code", 1002, "message", "握手鉴权失败"));
            session.close(CloseStatus.NOT_ACCEPTABLE); // 4001 语义
            return;
        }
        SimulationInstance instance = physicsWorld.getInstance(simId);
        if (instance == null) {
            send(session, Map.of("type", "not_found", "simId", simId));
            session.close(CloseStatus.NORMAL);
            return;
        }
        // 归属校验：内联调试运行（ownerId=null）放开；场景运行必须本人
        if (instance.getOwnerId() != null && !instance.getOwnerId().equals(tokenUserId)) {
            send(session, Map.of("type", "error", "code", 1003, "message", "无权访问该仿真"));
            session.close(CloseStatus.NOT_ACCEPTABLE);
            return;
        }

        WebSocketSession old = sessionsBySim.put(simId, session);
        if (old != null && old.isOpen() && old != session) {
            send(old, Map.of("type", "kicked"));
            old.close(CloseStatus.NORMAL);
        }

        instance.addFrameListener(frame -> {
            if (replayingSessions.contains(session.getId())) return;   // live 抑制在监听器处（重播路径直发不受限——
            sendFrame(session, instance, frame);                        // 第三十四轮修正：抑制放 send 方法里会挡掉重播自身）
        });
        instance.addKeyEventListener(event -> {
            if (replayingSessions.contains(session.getId())) return;
            sendKeyEvent(session, event);
        });
        // 订阅前已发生的历史重播（事件全量 + 帧窗口 150≈5s）——第三十二轮压测抓到架构缺陷：
        // 同步 forEach 在容器 IO 线程（nio-exec）执行，150 帧突发在慢客户端下阻塞 IO 线程，
        // 连 live 帧推送都被拖死（10 并发实测 Connection reset）。改为独立线程池异步重播（保序单线程）。
        replayingSessions.add(session.getId());
        replayExecutor.execute(() -> {
            try {
                // 早期事件（如 t=0.03s 断绳）零丢失重播（第二十八轮 E4 间歇根因）；前端按 t+type+label 去重
                instance.getKeyEvents().forEach(event -> sendKeyEvent(session, event));
                // 帧窗口：覆盖快速过程（断绳/碰撞）视觉衔接（第三十一轮并发修正）——串行发送保序
                instance.lastFrames(150).forEach(frame -> sendFrame(session, instance, frame));
            } finally {
                replayingSessions.remove(session.getId());   // 结束后恢复 live 直发
            }
        });
        instance.addEndListener(end -> {
            Map<String, Object> msg = new LinkedHashMap<>();
            msg.put("type", "ended");
            msg.put("simId", simId);
            msg.put("reason", end.reason());
            msg.put("totalFrames", end.totalFrames());
            msg.put("totalDuration", end.totalDuration());
            send(session, msg);
        });
        log.info("WS simulation 连接建立 simId={} session={}", simId, session.getId());
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        String simId = extractSimId(session);
        SimulationInstance instance = simId == null ? null : physicsWorld.getInstance(simId);
        if (instance == null) {
            send(session, Map.of("type", "not_found"));
            return;
        }
        Map<String, Object> body;
        try {
            body = objectMapper.readValue(message.getPayload(),
                    new tools.jackson.core.type.TypeReference<Map<String, Object>>() {
                    });
        } catch (Exception e) {
            send(session, Map.of("type", "error", "code", 1001, "message", "消息格式错误"));
            return;
        }
        String action = String.valueOf(body.get("action"));
        switch (action) {
            case "pause" -> {
                instance.pause();
                send(session, Map.of("type", "paused", "t", instance.getCurrentT()));
            }
            case "play" -> {
                instance.resume();
                send(session, Map.of("type", "resumed", "t", instance.getCurrentT()));
            }
            case "step" -> {
                // 契约：单步仅在暂停状态生效
                instance.stepOnce();
                Frame latest = instance.latestFrame();
                if (latest != null) {
                    sendFrame(session, instance, latest);
                }
            }
            case "seek" -> {
                double t = toDouble(body.get("t"), instance.getCurrentT());
                Frame frame = instance.seek(t);
                if (frame != null) {
                    sendFrame(session, instance, frame);
                }
            }
            case "sync" -> sendSync(session, instance);
            case "end" -> instance.end("stopped_by_user");
            default -> send(session, Map.of("type", "error", "code", 1001,
                    "message", "未知 action: " + action));
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        String simId = extractSimId(session);
        if (simId != null) {
            sessionsBySim.remove(simId, session);
            log.info("WS simulation 连接关闭 simId={} status={}", simId, status);
        }
    }

    private void sendSync(WebSocketSession session, SimulationInstance instance) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("type", "sync");
        msg.put("status", instance.isEnded() ? "ended" : "running");
        msg.put("currentT", instance.getCurrentT());
        msg.put("isPaused", instance.isPaused());
        Frame latest = instance.latestFrame();
        if (latest != null) {
            msg.put("latestFrame", latest);
        }
        send(session, msg);
    }

    private void sendFrame(WebSocketSession session, SimulationInstance instance, Frame frame) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("type", "frame");
        msg.put("t", frame.getT());
        msg.put("snapshotType", frame.getSnapshotType());
        msg.put("snapshot", frame.getSnapshot());
        DataRow lastRow = instance.getDataTable().isEmpty()
                ? null : instance.getDataTable().get(instance.getDataTable().size() - 1);
        msg.put("dataTableIncrement", lastRow);
        msg.put("hasChart", true);
        send(session, msg);
    }

    private void sendKeyEvent(WebSocketSession session, KeyEvent event) {
        Map<String, Object> msg = new LinkedHashMap<>();
        msg.put("type", "keyEvent");
        msg.put("t", event.getT());
        msg.put("eventType", event.getType());
        msg.put("label", event.getLabel());
        msg.put("frameIndex", event.getFrameIndex());
        msg.put("payload", event.getPayload()); // 数值载荷（CriticalPanel 理论对照用；可空）
        send(session, msg);
    }

    private void send(WebSocketSession session, Map<String, Object> msg) {
        try {
            if (session.isOpen()) {
                // 多线程（仿真线程 + WS 容器线程）并发写同一 session 需串行化
                synchronized (session) {
                    session.sendMessage(new TextMessage(objectMapper.writeValueAsString(msg)));
                }
            }
        } catch (IOException e) {
            log.warn("WS 推送失败 session={}: {}", session.getId(), e.getMessage());
        }
    }

    private static String extractSimId(WebSocketSession session) {
        String path = session.getUri() != null ? session.getUri().getPath() : null;
        if (path == null) {
            return null;
        }
        int idx = path.lastIndexOf('/');
        return idx >= 0 && idx < path.length() - 1 ? path.substring(idx + 1) : null;
    }

    private static String extractQueryParam(WebSocketSession session, String name) {
        String query = session.getUri() != null ? session.getUri().getQuery() : null;
        if (query == null) {
            return null;
        }
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && name.equals(pair.substring(0, eq))) {
                return java.net.URLDecoder.decode(pair.substring(eq + 1), java.nio.charset.StandardCharsets.UTF_8);
            }
        }
        return null;
    }

    private static double toDouble(Object v, double dflt) {
        return v instanceof Number n ? n.doubleValue() : dflt;
    }
}
