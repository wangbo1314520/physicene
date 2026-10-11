# -*- coding: utf-8 -*-
"""P1 压缩浸泡（1h）：REST 仿真循环 + WS 循环收帧 + AI（mock）每 10 分钟 + 每 10 分钟采样（6 点 ≥4）。
断言（今晚口径）：后 2 点均值 ≤ 前 2 点均值 × 1.15。"""
import json, time, socket, base64, os, subprocess, urllib.request, urllib.parse

API = "http://localhost:8080"
OUT = r"E:\Program\physicene-backups\soak-tonight.csv"

def hj(path, method="GET", body=None, headers=None, timeout=60):
    h = {"Content-Type": "application/json"}; h.update(headers or {})
    req = urllib.request.Request(API + path, method=method, data=json.dumps(body).encode() if body else None, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def heap():
    try:
        return round(hj("/actuator/metrics/jvm.memory.used?tag=area:heap", timeout=10)["measurements"][0]["value"] / 1048576, 1)
    except Exception:
        return -1

tok = hj("/api/auth/login", "POST", {"username": "demo", "password": "demo1234"})["data"]["token"]
AUTH = {"Authorization": "Bearer " + tok}
EL = [{"id": "g", "type": "wall", "position": {"x": 0, "y": -1}, "angle": 0, "properties": {"friction": 0.1}, "params": {}, "isFixed": True},
      {"id": "b", "type": "cube", "position": {"x": 0, "y": 0.1}, "angle": 0, "properties": {"mass": 1, "friction": 0.1}, "params": {}, "initialState": {"velocity": {"x": 3, "y": 0}}}]

def ws_round():
    """一条 100s 仿真 + 裸 WS 收帧到断开，返回帧数"""
    try:
        r = hj("/api/simulations/run", "POST", {"elements": EL, "config": {"maxDuration": 100}}, headers=AUTH)
        u = urllib.parse.urlparse(f"http://localhost:8080{r['data']['wsUrl']}?token={tok}")
        s = socket.create_connection((u.hostname, u.port), timeout=20)
        key = base64.b64encode(os.urandom(16)).decode()
        s.send((f"GET {u.path}?{u.query} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\nUpgrade: websocket\r\n"
                f"Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        s.settimeout(60)
        frames = 0
        try:
            while True:
                chunk = s.recv(65536)
                if not chunk:
                    break
                frames += chunk.count(b'"frame"')
        except Exception:
            pass   # 仿真结束后的静默超时是正常收尾——已收帧不丢弃（计数 bug 修正 2026-10-12）
        s.close()
        return frames
    except Exception:
        return 0

samples, ws_total, ai_calls, sims = [], 0, 0, 0
t0 = time.time()
while time.time() - t0 < 3600:
    ws_total += ws_round(); sims += 1
    if int(time.time() - t0) % 600 < 105:
        try:
            hj("/api/v1/agent/chat", "POST", {"userId": 900010, "sessionId": "soak1h", "message": "soak mock: 什么是动量定理"}, headers=AUTH)
            ai_calls += 1
        except Exception:
            pass
    h = heap()
    samples.append((round(time.time() - t0), h))
    print({"t": samples[-1][0], "heap": h, "ws": ws_total}, flush=True)
    time.sleep(max(5, 600 - 105))

with open(OUT, "w", encoding="utf-8") as f:
    f.write("t,heap_mb\n")
    for t, h in samples:
        f.write(f"{t},{h}\n")
    f.write(f"# sims={sims} ws_frames={ws_total} ai={ai_calls}\n")
first2 = sum(h for _, h in samples[:2]) / 2
last2 = sum(h for _, h in samples[-2:]) / 2
ratio = last2 / first2 if first2 else 0
print(f"TONIGHT-SOAK-DONE n={len(samples)} first2={first2:.1f} last2={last2:.1f} "
      f"ratio={ratio:.3f} {'PASS<=1.15' if last2 <= first2 * 1.15 else 'FAIL'}", flush=True)
