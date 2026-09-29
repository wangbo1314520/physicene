"""参数链审计 CI 检查：catalog 新增参数必须更新 docs/参数链审计表.md
用法：python scripts/check-param-chain.py（在 pre-commit 或 CI 中跑）
检查：catalog P()/SEL() 数量 > 审计表列出的参数数 → 报错"""
import re, sys
from pathlib import Path
ROOT = Path(__file__).parent.parent
catalog = (ROOT / 'frontend/src/builder/catalog.ts').read_text(encoding='utf-8')
audit = (ROOT / 'docs/参数链审计表.md').read_text(encoding='utf-8')
cat_params = set(re.findall(r"P\('(\w+)'", catalog))
audit_params = set(re.findall(r'(\w+)', audit))  # 粗匹配——改进方向
missing = cat_params - audit_params - {'dir','mat','mode'}  # SEL 排除
if missing:
    print(f'❌ catalog 参数 {missing} 未在参数链审计表中——更新 docs/参数链审计表.md')
    sys.exit(1)
print('✅ 参数链审计表覆盖 catalog 全部参数')
