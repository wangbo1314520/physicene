"""离线建库脚本（SRS F3.1 知识库配置）：
python scripts/build_kb.py [--volumes 1]   # 只建必修一；默认全部已放好的教材
路径均来自 .env / 环境变量：TEXTBOOKS_DIR（教材 PDF 目录）、BGE_M3_PATH、CHROMA_DIR。
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from physicene_ai.core.knowledge_base import build_collection  # noqa: E402
from physicene_ai.utils.config import settings  # noqa: E402

VOLUMES = [
    ("人教版物理必修第一册", "普通高中教科书·物理必修 第一册.pdf"),
    ("人教版物理必修第二册", "普通高中教科书·物理必修 第二册.pdf"),
    ("人教版物理必修第三册", "普通高中教科书·物理必修 第三册.pdf"),
    ("人教版物理选择性必修第一册", "普通高中教科书·物理选择性必修 第一册.pdf"),
    ("人教版物理选择性必修第二册", "普通高中教科书·物理选择性必修 第二册.pdf"),
    ("人教版物理选择性必修第三册", "普通高中教科书·物理选择性必修 第三册.pdf"),
]

if __name__ == "__main__":
    only = None
    if "--volumes" in sys.argv:
        only = int(sys.argv[sys.argv.index("--volumes") + 1])
    books_dir = Path(settings.textbooks_dir)
    books = [(name, str(books_dir / file)) for name, file in VOLUMES]
    if only:
        books = books[:only]
    total = build_collection(books, chroma_dir=settings.chroma_dir,
                             model_path=settings.bge_m3_path)
    print(f"知识库构建完成：{len(books)} 册 → {total} 片段")
