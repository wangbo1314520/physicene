#!/usr/bin/env bash
# 30 分钟浸泡：循环跑仿真（REST）+ 每 60s 采 Java 堆 —— 输出 CSV 供性能报告
set -u
OUT=/e/Program/physicene-backups/soak-$(date +%H%M%S).csv
TOK=$(curl -s -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"demo1234"}' | "E:/Program/Python312/python.exe" -c "import sys,json;print(json.load(sys.stdin)['data']['token'])")
ELEMENTS='[{"id":"g","type":"wall","position":{"x":0,"y":-1},"angle":0,"properties":{"friction":0.1},"params":{},"isFixed":true},{"id":"b","type":"cube","position":{"x":0,"y":0.1},"angle":0,"properties":{"mass":1,"friction":0.1},"params":{},"initialState":{"velocity":{"x":3,"y":0}}}]'
echo "time,heap_used_mb,heap_committed_mb,threads" > "$OUT"
END=$((SECONDS+1740))
N=0
while [ $SECONDS -lt $END ]; do
  curl -s -m 30 -X POST http://localhost:8080/api/simulations/run -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" -d "{\"elements\":$ELEMENTS,\"config\":{\"maxDuration\":20}}" -o /dev/null 2>/dev/null && N=$((N+1))
  H=$(curl -s http://localhost:8080/actuator/metrics/jvm.memory.used?tag=area:heap | "E:/Program/Python312/python.exe" -c "import sys,json;print(round(json.load(sys.stdin)['measurements'][0]['value']/1048576))" 2>/dev/null)
  C=$(curl -s http://localhost:8080/actuator/metrics/jvm.memory.committed?tag=area:heap | "E:/Program/Python312/python.exe" -c "import sys,json;print(round(json.load(sys.stdin)['measurements'][0]['value']/1048576))" 2>/dev/null)
  T=$(curl -s http://localhost:8080/actuator/metrics/jvm.threads.live | "E:/Program/Python312/python.exe" -c "import sys,json;print(round(json.load(sys.stdin)['measurements'][0]['value']))" 2>/dev/null)
  echo "$(date +%T),$H,$C,$T" >> "$OUT"
  sleep 55
done
echo "runs=$N" >> "$OUT"
echo "SOAK-DONE $OUT"
