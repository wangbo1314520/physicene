"""实验分析工具（第五周补充：analyze 意图）。"""
from physicene_ai.tools.base import BaseTool
from physicene_ai.tools.java_client import java_client


class GetExperimentResultTool(BaseTool):
    name = "get_experiment_result"
    description = "获取指定实验记录的完整数据（速度/动能曲线、关键事件）供分析"
    args_spec = {"recordId": "可选，缺省取最近一条"}

    def execute(self, user_id: int, scene_id, args: dict) -> dict:
        record_id = args.get("recordId")
        if record_id is None:
            latest = java_client.list_records(user_id, 1)
            items = latest.get("items", [])
            if not items:
                return {"__no_record__": True}
            record_id = items[0]["id"]
        detail = java_client.get_record_detail(user_id, int(record_id))
        return summarize(detail)


def summarize(detail: dict) -> dict:
    """把 SimResult 压缩成 LLM 可读的数据摘要（不全量塞 dataTable）。"""
    data_table = detail.get("dataTable") or []
    key_events = detail.get("keyEvents") or []
    scene = detail.get("scene") or {}
    elements = scene.get("elements") or []

    # 采样数据表：首/末 + 均匀 5 点，并统计各字段极值
    fields_stat: dict[str, dict] = {}
    for row in data_table:
        for k, v in (row.get("fields") or {}).items():
            s = fields_stat.setdefault(k, {"min": v, "max": v})
            s["min"] = min(s["min"], v)
            s["max"] = max(s["max"], v)
    sample = []
    n = len(data_table)
    if n:
        idxs = sorted(set([0, n // 4, n // 2, 3 * n // 4, n - 1]))
        sample = [data_table[i] for i in idxs]

    return {
        "recordId": detail.get("recordId"),
        "totalDuration": detail.get("totalDuration"),
        "sceneType": scene.get("type") or detail.get("scenarioId"),
        "elements": [{"id": e.get("id"), "type": e.get("type"),
                      "mass": (e.get("properties") or {}).get("mass"),
                      "velocity0": ((e.get("initialState") or {}).get("velocity") or {})}
                     for e in elements if not e.get("isFixed")],
        "keyEvents": [{"t": ev.get("t"), "type": ev.get("type"), "label": ev.get("label")}
                      for ev in key_events],
        "fieldExtremes": fields_stat,
        "dataSample": sample,
    }
