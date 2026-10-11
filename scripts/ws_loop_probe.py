# -*- coding: utf-8 -*-
"""B1 补充：WS 循环重连探针——REST run(maxDuration=100) → 裸 WS 连接收帧至断开 → 重连，
持续到 soak-v2 结束（对齐其 CSV 末行时间）。输出帧计数与连接轮数。"""
import json, time, socket, base64, os, urllib.request, urllib.parse

API = "http://localhost:8080"

def http_json(path, method="GET", body=None, headers=None, timeout=30):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(API + path, method=method,
        data=json.dumps(body).encode() if body else None, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

tok = http_json("/api/auth/login", "POST", {"username": "demo", "password": "demo1234"})["data"]["token"]
AUTH = {"Authorization": "Bearer " + tok}
ELEMENTS = [
    {"id": "g", "type": "wall", "position": {"x": 0, "y": -1}, "angle": 0, "properties": {"friction": 0.1}, "params": {}, "isFixed": True},
    {"id": "b", "type": "cube", "position": {"x": 0, "y": 0.1}, "angle": 0, "properties": {"mass": 1, "friction": 0.1}, "params": {}, "initialState": {"velocity": {"x": 3, "y": 0}}},
]

DEADLINE = time.time() + 100 * 60   # 与主 soak 剩余时长对齐
rounds = frames = 0
while time.time() < DEADLINE:
    try:
        r = http_json("/api/simulations/run", "POST",
                      {"elements": ELEMENTS, "config": {"maxDuration": 100}}, headers=AUTH)
        ws_url = r["data"]["wsUrl"]
        u = urllib.parse.urlparse(f"http://localhost:8080{ws_url}?token={tok}")
        s = socket.create_connection((u.hostname, u.port), timeout=20)
        key = base64.b64encode(os.urandom(16)).decode()
        s.send((f"GET {u.path}?{u.query} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\n"
                "Upgrade: websocket\r\nConnection: Upgrade\r\n"
                f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n").encode())
        s.settimeout(60)
        rounds += 1
        while True:
            chunk = s.recv(65536)
            if not chunk:
                break
            frames += chunk.count(b'"frame"')
        s.close()
    except Exception as e:
        print("round exit:", str(e)[:70], flush=True)
        time.sleep(3)
print(f"WS-LOOP-DONE rounds={rounds} frames={frames}", flush=True)
