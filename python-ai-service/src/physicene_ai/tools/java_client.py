"""Java 内部客户端：Agent 工具调 Java REST API 的统一出口。

鉴权（SRS 4.2）：X-Internal-Key 共享密钥 + X-User-Id（Java 侧 JwtInterceptor 放行内部调用）。
Python 不直接写 MySQL，所有持久化经 Java（Java 唯一写库方）。
"""
import httpx

from physicene_ai.utils.config import settings
from physicene_ai.utils.logger import logger


class JavaApiError(RuntimeError):
    def __init__(self, status: int, message: str):
        super().__init__(f"Java API {status}: {message}")
        self.status = status
        self.message = message


class JavaClient:
    def __init__(self):
        self._client: httpx.Client | None = None

    @property
    def client(self) -> httpx.Client:
        if self._client is None:
            self._client = httpx.Client(
                base_url=settings.java_base_url,
                timeout=httpx.Timeout(15.0),
                headers={"X-Internal-Key": settings.internal_key},
            )
        return self._client

    def _headers(self, user_id: int | None) -> dict:
        h = {}
        if user_id is not None:
            h["X-User-Id"] = str(user_id)
        return h

    def call(self, method: str, path: str, user_id: int | None = None,
             json_body: dict | None = None, params: dict | None = None) -> dict:
        resp = self.client.request(method, path, headers=self._headers(user_id),
                                   json=json_body, params=params)
        body = {}
        try:
            body = resp.json()
        except Exception:  # noqa: BLE001
            pass
        if resp.status_code >= 400 or (isinstance(body, dict) and body.get("code", 0) not in (0, None)):
            raise JavaApiError(resp.status_code,
                               str(body.get("message", ""))[:200] if isinstance(body, dict) else resp.text[:200])
        logger.debug("Java {} {} -> {}", method, path, resp.status_code)
        return body.get("data", body) if isinstance(body, dict) else body

    # ===== 场景操作 =====

    def get_scene(self, scene_id: str, user_id: int) -> dict:
        return self.call("GET", f"/api/scenarios/{scene_id}", user_id=user_id)

    def update_scene(self, scene_id: str, user_id: int, elements: list[dict],
                     config: dict) -> dict:
        return self.call("PUT", f"/api/scenarios/{scene_id}", user_id=user_id,
                         json_body={"elements": elements, "config": config})

    def load_template(self, user_id: int, template: str) -> dict:
        return self.call("POST", f"/api/templates/{template}/load", user_id=user_id)

    def run_simulation(self, user_id: int, scene_id: str) -> dict:
        return self.call("POST", "/api/simulations/run", user_id=user_id,
                         json_body={"sceneId": scene_id})

    def list_records(self, user_id: int, limit: int = 5) -> dict:
        return self.call("GET", "/api/records", user_id=user_id,
                         params={"page": 1, "size": min(limit, 20)})


java_client = JavaClient()
