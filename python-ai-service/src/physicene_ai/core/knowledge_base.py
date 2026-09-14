"""教材知识库构建（SRS F3.1）：
pdfplumber 提取 → 按章节边界切片（不重叠、段内重叠 100 字、单片 300-500 字）
→ bge-m3 嵌入 → Chroma 嵌入式入库（持久化 data/chroma）。

离线脚本调用（scripts/build_kb.py），服务运行时只查询不重建。
"""
import re

import pdfplumber

from physicene_ai.utils.logger import logger

# 章节标题模式（人教版教材："第一章 运动的描述" / "1.2 时间 位移" / "序言"）
SECTION_PATTERN = re.compile(
    r"^(第[一二三四五六七八九十]+章|序言|附录)\s*\S*"
    r"|^\d+\.\d+\s+\S+"
)

CHUNK_MIN = 300   # 片段目标区间（SRS：300-500 字）
CHUNK_MAX = 500
OVERLAP = 100      # 段落间重叠


def extract_pages(pdf_path: str) -> list[tuple[int, str]]:
    """逐页提取文本，返回 [(页码1起始, 文本)]。"""
    pages = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages):
            text = (page.extract_text() or "").strip()
            if text:
                pages.append((i + 1, text))
    return pages


def split_chunks(pages: list[tuple[int, str]], source: str) -> list[dict]:
    """按章节边界切片：章节内按段落聚合，单片超上限再切，片段间重叠 100 字。"""
    chunks: list[dict] = []
    chapter = "前言"
    buf: list[str] = []
    buf_page = 0

    def flush():
        nonlocal buf, buf_page
        if not buf:
            return
        text = "\n".join(buf)
        if len(text) < 50:  # 过滤目录/页眉等碎片
            buf = []
            return
        # 超上限再切（保留尾部重叠）
        start = 0
        while start < len(text):
            piece = text[start:start + CHUNK_MAX]
            if len(piece) < CHUNK_MIN and start > 0:  # 尾片太短并入前片
                chunks[-1]["content"] += piece
                break
            chunks.append({
                "source": source,
                "chapter": chapter,
                "page": buf_page,
                "content": piece,
            })
            if start + CHUNK_MAX >= len(text):
                break
            start += CHUNK_MAX - OVERLAP
        buf = []

    for page_no, text in pages:
        for line in text.split("\n"):
            if SECTION_PATTERN.match(line.strip()):
                flush()
                chapter = line.strip()[:30]
                buf_page = page_no
            buf.append(line)
        buf.append("")  # 页边界
    flush()
    return chunks


def module_of(chapter: str) -> str:
    """章节 → 学科模块（SRS KnowledgeChunk.module：力学/电磁/光学/热学）。"""
    mechanics = ("运动", "力", "牛顿", "曲线", "万有", "机械", "碰撞", "动量", "抛体", "圆周")
    em = ("电", "磁", "场", "电磁感应")
    optics = ("光", "折射", "反射", "干涉", "衍射")
    heat = ("热", "温度", "分子", "能量守恒", "气体")
    for kw in mechanics:
        if kw in chapter:
            return "力学"
    for kw in em:
        if kw in chapter:
            return "电磁"
    for kw in optics:
        if kw in chapter:
            return "光学"
    for kw in heat:
        if kw in chapter:
            return "热学"
    return "力学"


def build_collection(pdf_paths: list[tuple[str, str]], chroma_dir: str,
                     model_path: str, batch_size: int = 32) -> int:
    """建库：[(书名, pdf路径)] → Chroma collection 'textbook'。返回片段数。"""
    import chromadb
    from chromadb.config import Settings as ChromaSettings
    from sentence_transformers import SentenceTransformer

    all_chunks: list[dict] = []
    for source, path in pdf_paths:
        pages = extract_pages(path)
        chunks = split_chunks(pages, source)
        for c in chunks:
            c["module"] = module_of(c["chapter"])
        all_chunks.extend(chunks)
        logger.info("{}：{} 页 → {} 片段", source, len(pages), len(chunks))

    logger.info("加载 bge-m3：{}", model_path)
    model = SentenceTransformer(model_path)

    client = chromadb.PersistentClient(path=chroma_dir,
                                       settings=ChromaSettings(anonymized_telemetry=False))
    client.delete_collection("textbook")  # 重建（幂等）
    col = client.get_or_create_collection(
        "textbook", metadata={"hnsw:space": "cosine"})

    for i in range(0, len(all_chunks), batch_size):
        batch = all_chunks[i:i + batch_size]
        embeddings = model.encode([c["content"] for c in batch],
                                  normalize_embeddings=True).tolist()
        col.add(
            ids=[f"chunk_{i + j}" for j in range(len(batch))],
            embeddings=embeddings,
            documents=[c["content"] for c in batch],
            metadatas=[{"source": c["source"], "chapter": c["chapter"],
                        "module": c["module"], "page": c["page"]} for c in batch],
        )
        logger.info("嵌入进度 {}/{}", min(i + batch_size, len(all_chunks)), len(all_chunks))
    return len(all_chunks)
