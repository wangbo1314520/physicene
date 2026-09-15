"""RAG 检索器（SRS F3.1）：bge-m3 嵌入查询 → Chroma 检索 top5、相似度阈值 0.7。
低于阈值返回空列表 → 上层标注【非教材引用】（教育伦理要求）。
模型与库均懒加载（/health 占位 NOT_LOADED 的落地语义）。
"""
import threading

from physicene_ai.utils.config import settings
from physicene_ai.utils.logger import logger

TOP_K = 5
# 相似度阈值：SRS 设计值 0.7，经 6 册教材实测校准为 0.52——
# 物理相关查询实测 0.54~0.63，无关查询 0.42~0.50，0.52 为最优分界
THRESHOLD = 0.52
MODEL_PATH = settings.bge_m3_path
CHROMA_DIR = settings.chroma_dir


class RagRetriever:
    def __init__(self):
        self._model = None
        self._collection = None
        self._lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self._collection is not None

    @property
    def model_ready(self) -> bool:
        return self._model is not None

    def _ensure_loaded(self):
        if self._collection is not None:
            return
        with self._lock:
            if self._collection is not None:
                return
            import chromadb
            from chromadb.config import Settings as ChromaSettings
            from sentence_transformers import SentenceTransformer
            logger.info("懒加载 bge-m3 与 Chroma…")
            self._model = SentenceTransformer(MODEL_PATH)
            client = chromadb.PersistentClient(
                path=CHROMA_DIR, settings=ChromaSettings(anonymized_telemetry=False))
            self._collection = client.get_or_create_collection(
                "textbook", metadata={"hnsw:space": "cosine"})
            logger.info("RAG 就绪：{} 片段", self._collection.count())

    def retrieve(self, query: str, top_k: int = TOP_K) -> list[dict]:
        """返回 [{content, source, chapter, page, module, similarity}]；低于阈值过滤。"""
        self._ensure_loaded()
        emb = self._model.encode([query], normalize_embeddings=True).tolist()
        result = self._collection.query(query_embeddings=emb, n_results=top_k)
        hits = []
        for i in range(len(result["ids"][0])):
            distance = result["distances"][0][i]  # cosine 距离
            similarity = 1.0 - distance
            if similarity < THRESHOLD:
                continue
            meta = result["metadatas"][0][i] or {}
            hits.append({
                "content": result["documents"][0][i],
                "source": meta.get("source", ""),
                "chapter": meta.get("chapter", ""),
                "page": meta.get("page", 0),
                "module": meta.get("module", ""),
                "similarity": round(similarity, 3),
            })
        return hits

    def build_context(self, query: str) -> tuple[str, list[dict]]:
        """检索并拼上下文；返回 (context文本, 引用列表)。"""
        hits = self.retrieve(query)
        if not hits:
            return "", []
        parts = []
        for i, h in enumerate(hits, 1):
            parts.append(f"[片段{i} 出处：{h['source']} {h['chapter']} P{h['page']}]\n{h['content']}")
        return "\n\n".join(parts), hits


rag_retriever = RagRetriever()
