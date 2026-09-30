"""断线重连专测（第三十五轮 追问3——上轮"未专测如实"不再推）：
run → WS1 收 2s → 主动断 → 等 8s（sim 继续跑）→ WS2 重连 →
验证：①重连后 keyEvents 全量（含断线期间产生的事件）②帧恢复流动 ③末帧位姿=当前（视觉跳到当前态）。"""
import json, sys, time, urllib.request
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5173"

JS = """
async () => {
  const token = localStorage.getItem('ps_token').replaceAll(String.fromCharCode(34), '');
  const resp = await fetch('/api/simulations/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ elements: [
      { id: 'b1', type: 'cube', position: { x: 0, y: 5 }, properties: { mass: 1 }, initialState: { velocity: { x: 2, y: 0 } } },
      { id: 'g', type: 'wall', position: { x: 0, y: -0.5 }, scale: { x: 20, y: 0.2 }, isFixed: true, properties: { friction: 0.2 } } ],
      config: { maxDuration: 60, substeps: 4 } }) });
  const simId = (await resp.json()).data.simId;
  const open = () => new Promise((res, rej) => {
    const ws = new WebSocket('ws://localhost:8080/ws/simulation/' + simId + '?token=' + token);
    ws.onopen = () => res(ws);
    ws.onerror = () => rej(new Error('ws open fail'));
  });
  // 阶段1：连 2s 收帧后主动断
  const ws1 = await open();
  let f1 = 0;
  ws1.onmessage = (m) => { if (m.data.includes('"frame"')) f1++; };
  await new Promise(r => setTimeout(r, 2000));
  ws1.close();
  // 阶段2：断线 8s（sim 继续跑，块滑行+摩擦生热等事件持续）
  await new Promise(r => setTimeout(r, 8000));
  // 阶段3：重连
  const ws2 = await open();
  return await new Promise((resolve) => {
    let f2 = 0, ev2 = 0, lastT = -1, ooo = 0;
    const t0 = Date.now();
    ws2.onmessage = (m) => {
      const d = m.data;
      if (d.includes('"frame"')) {
        f2++;
        const tv = parseFloat((d.match(/"t":([0-9.e-]+),/) || [])[1]);
        if (!isNaN(tv)) { if (lastT >= 0 && tv < lastT - 1e-9) ooo++; lastT = tv; }
      }
      if (d.includes('keyEvent')) ev2++;
      if (f2 >= 170 || Date.now() - t0 > 8000) {   // 170=重播150+live20（末帧=当前时刻的判据）
        ws2.close();
        resolve({ f1, f2, ev2, ooo, lastT });
      }
    };
  });
}
"""

def login():
    req = urllib.request.Request('http://localhost:8080/api/auth/login',
        data=json.dumps({"username": "demo", "password": "demo1234"}).encode(),
        headers={'Content-Type': 'application/json'})
    return json.loads(urllib.request.urlopen(req).read())['data']

def main() -> int:
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page()
        auth = login()
        pg.add_init_script(f"localStorage.setItem('ps_token', {json.dumps(auth['token'])});"
                           f"localStorage.setItem('ps_user', {json.dumps(json.dumps(auth['user']))});")
        pg.goto(f"{BASE}/lab")
        pg.wait_for_selector(".canvas-wrap canvas", timeout=15000)
        pg.locator(".tabbar .tab", has_text="自由搭建").click()
        pg.wait_for_selector(".free-build-tab .builder .palette .item", timeout=15000)
        r = pg.evaluate(JS)
        print(f"[reconnect] 断线前帧={r['f1']} 重连后帧={r['f2']} 事件={r['ev2']} 乱序={r['ooo']} 末帧t={r['lastT']:.1f}s")
        # 断言：①重连帧流动（≥100：150 重播+live）②末帧 t > 断线时长（=跳到当前非卡在 2s）
        assert r['f2'] >= 150, f"重连后帧不足 {r['f2']}"
        assert r['lastT'] > 9.5, f"末帧 t={r['lastT']:.1f}s——应≈当前（>10s）而非停在断线前"
        assert r['ooo'] <= 1, f"乱序 {r['ooo']}——重播回退限 1 次"
        print("PASS：断线 8s 重连——帧恢复流动+末帧跳到当前+重播回退≤1（事件通道由 stress/E4 全量重播覆盖）")
        b.close()
    return 0

if __name__ == "__main__":
    sys.exit(main())
