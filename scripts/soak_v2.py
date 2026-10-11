# -*- coding: utf-8 -*-
"""B1 浸泡 v2（2 小时）：真实负载混合——REST 仿真循环 + 常驻 WS 长仿真 + AI 每 10 分钟 + 每 5 分钟采样。
采样：heap used/committed、threads、GC 次数、WS 帧数、8080 连接数。输出 CSV。"""
import json, time, urllib.request, http.client, threading

API = "http://localhost:8080"
DUR_S = 2 * 3600
SAMPLE_EVERY = 300
OUT = r"E:\Program\physicene-backups\soak-v2.csv"

def http_json(path, method="GET", body=None, headers=None, timeout=30):
    h = {"Content-Type": "application/json"}
    if headers:
        h.update(headers)
    req = urllib.request.Request(API + path, method=method,
        data=json.dumps(body).encode() if body else None, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode())

def metric(name):
    try:
        d = http_json(f"/actuator/metrics/{name}", timeout=10)
        m = d["measurements"][0]
        return round(m["value"] / 1048576, 1) if "memory" in name else round(m["value"])
    except Exception:
        return -1

# 登录
tok = http_json("/api/auth/login", "POST", {"username": "demo", "password": "demo1234"})["data"]["token"]
AUTH = {"Authorization": "Bearer " + tok}
IK = "x"  # AI 经 Java 转发，无需内部 key

ELEMENTS = [
    {"id": "g", "type": "wall", "position": {"x": 0, "y": -1}, "angle": 0, "properties": {"friction": 0.1}, "params": {}, "isFixed": True},
    {"id": "b", "type": "cube", "position": {"x": 0, "y": 0.1}, "angle": 0, "properties": {"mass": 1, "friction": 0.1}, "params": {}, "initialState": {"velocity": {"x": 3, "y": 0}}},
    {"id": "s", "type": "speed_sensor", "position": {"x": -2, "y": 0.5}, "angle": 0, "properties": {}, "params": {}, "connectTo": "b"},
]

# 常驻 WS：一条 maxDuration=7500s 的长仿真，WS 保持 2 小时收帧
ws_frames = [0]
def ws_holder():
    try:
        r = http_json("/api/simulations/run", "POST",
            {"elements": ELEMENTS, "config": {"maxDuration": 7500}}, headers=AUTH)
        sim_id, ws_url = r["data"]["simId"], r["data"]["wsUrl"]
        import socket, base64, hashlib, struct, os
        u = urllib.parse.urlparse(f"http://localhost:8080{ws_url}?token={tok}")
        s = socket.create_connection((u.hostname, u.port), timeout=20)
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET {u.path}?{u.query} HTTP/1.1\r\nHost: {u.hostname}:{u.port}\r\n"
               "Upgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        s.send(req.encode())
        s.settimeout(30)
        buf = b""
        while True:  # 只数帧不解析（掩码分帧头解析省略——计数够用）
            chunk = s.recv(65536)
            if not chunk:
                break
            buf += chunk
            ws_frames[0] += chunk.count(b'"frame"')
            buf = buf[-8:]
    except Exception as e:
        print("WS holder exit:", str(e)[:80], flush=True)

import urllib.parse
threading.Thread(target=ws_holder, daemon=True).start()

rows = []
t0 = time.time()
sims = ai_calls = 0
while time.time() - t0 < DUR_S:
    # 负载：REST 短仿真（每次循环 1 条 maxDuration=20，约 25s 一轮）+ AI 每 600s
    try:
        http_json("/api/simulations/run", "POST",
                  {"elements": ELEMENTS, "config": {"maxDuration": 20}}, headers=AUTH)
        sims += 1
    except Exception:
        pass
    if int(time.time() - t0) % 600 < 26:
        try:
            http_json("/api/v1/agent/chat", "POST",
                      {"userId": 1, "sessionId": "soak", "message": "soak: 用一句话说明动量守恒"},
                      headers=AUTH, timeout=60)
            ai_calls += 1
        except Exception:
            pass
    import subprocess
    try:
        conns = int(subprocess.run(["bash", "-c", "netstat -ano | grep :8080 | grep -c ESTABLISHED"],
                   capture_output=True, text=True, timeout=15).stdout.strip() or 0)
    except Exception:
        conns = -1
    row = dict(t=round(time.time() - t0), heap=metric("jvm.memory.used?tag=area:heap"),
               committed=metric("jvm.memory.committed?tag=area:heap"),
               threads=metric("jvm.threads.live"), gc=metric("jvm.gc.pause"),
               ws=ws_frames[0], conns=conns)
    rows.append(row)
    print(row, flush=True)
    time.sleep(max(10, SAMPLE_EVERY - 25))

with open(OUT, "w", encoding="utf-8", newline="") as f:
    f.write("t,heap,committed,threads,gc,ws,conns\n")
    for r in rows:
        f.write(f"{r['t']},{r['heap']},{r['committed']},{r['threads']},{r['gc']},{r['ws']},{r['conns']}\n")
    f.write(f"# sims={sims} ai={ai_calls} ws_frames={ws_frames[0]}\n")
half = len(rows) // 2
m1 = sum(r['heap'] for r in rows[:half]) / max(1, half)
m2 = sum(r['heap'] for r in rows[half:]) / max(1, len(rows) - half)
print(f"SOAK-V2-DONE rows={len(rows)} firstHalf={m1:.1f} secondHalf={m2:.1f} "
      f"ratio={m2/m1:.3f} {'PASS<=1.1' if m2 <= m1*1.1 else 'FAIL>1.1'}", flush=True)
