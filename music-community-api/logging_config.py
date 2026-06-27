"""
日志配置 — 控制台 + 文件双输出
"""
import logging
import sys
from pathlib import Path

LOG_FORMAT = "%(asctime)s | %(levelname)s | %(name)s | %(message)s"
DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def setup_logging(level: str = "INFO") -> None:
    """
    配置 root logger，输出到控制台 + logs/app.log。
    幂等调用——重复执行不会叠加 handler。
    """
    logger = logging.getLogger()
    if logger.handlers:
        return  # 已有 handler 则跳过

    logger.setLevel(level.upper())

    # ── 控制台 handler ──
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(level.upper())
    console.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    logger.addHandler(console)

    # ── 文件 handler ──
    log_dir = Path.cwd() / "logs"
    log_dir.mkdir(exist_ok=True)
    file_handler = logging.FileHandler(log_dir / "app.log", encoding="utf-8")
    file_handler.setLevel(level.upper())
    file_handler.setFormatter(logging.Formatter(LOG_FORMAT, DATE_FORMAT))
    logger.addHandler(file_handler)
