#!/bin/bash
# pre-commit 双层扫描自测（第二十四轮）：验证扫描**有效**而非仅"当前无违规"。
# 场景A：未入库源文件（untracked）应被第①层拦住
# 场景B：被 .gitignore 错匹配的源文件（data/ 事故同型）应被第②层拦住
# 用法：bash .githooks/selftest.sh   （结束时自动清理毒文件，退出码 0=两层都有效）
set -u
cd "$(git rev-parse --show-toplevel)"

echo "── 场景A：制造 untracked 源文件 frontend/src/zz-untracked-probe.ts"
echo "export const probe = 1" > frontend/src/zz-untracked-probe.ts
OUT_A=$(bash .githooks/pre-commit 2>&1)
RC_A=$?
echo "$OUT_A" | grep -q "zz-untracked-probe" && echo "✅ 第①层拦截 untracked" || { echo "❌ 第①层未拦截"; rm -f frontend/src/zz-untracked-probe.ts; exit 1; }
rm -f frontend/src/zz-untracked-probe.ts

echo "── 场景B：制造被 data/ 规则错匹配的源文件 frontend/src/zztest/data/probe.ts"
mkdir -p frontend/src/zztest/data
echo "export const probe = 2" > frontend/src/zztest/data/probe.ts
OUT_B=$(bash .githooks/pre-commit 2>&1)
RC_B=$?
echo "$OUT_B" | grep -q "zztest" && echo "✅ 第②层拦截 gitignore 错匹配（data/ 事故同型）" || { echo "❌ 第②层未拦截"; rm -rf frontend/src/zztest; exit 1; }
rm -rf frontend/src/zztest

[ "$RC_A" -ne 0 ] && [ "$RC_B" -ne 0 ] || { echo "❌ 退出码异常（A=$RC_A B=$RC_B，均应为非零）"; exit 1; }
echo "✅ 双层扫描自测通过（两层均有效，毒文件已清理）"
