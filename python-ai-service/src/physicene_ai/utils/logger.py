"""统一日志（SRS 4.4：JSON 格式，v1 输出 stdout 供 docker logs 查看）。"""

import sys

from loguru import logger

logger.remove()
logger.add(
    sys.stdout,
    serialize=True,  # JSON 行格式
    level="INFO",
    enqueue=True,  # 多进程/异步安全
)

__all__ = ["logger"]
