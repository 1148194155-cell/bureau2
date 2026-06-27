"""
FastAPI 全局异常处理器
"""
import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from exceptions import NotFoundError, ConflictError, ForbiddenError, UnauthorizedError, BadRequestError

logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """在 FastAPI 应用上注册所有自定义异常处理器"""

    @app.exception_handler(NotFoundError)
    async def not_found_handler(request: Request, exc: NotFoundError):
        logger.warning("404 | %s | %s", request.url.path, exc)
        return JSONResponse(
            status_code=404,
            content={"error": "not found", "detail": str(exc)},
        )

    @app.exception_handler(ConflictError)
    async def conflict_handler(request: Request, exc: ConflictError):
        logger.warning("409 | %s | %s", request.url.path, exc)
        return JSONResponse(
            status_code=409,
            content={"error": "conflict", "detail": str(exc)},
        )

    @app.exception_handler(UnauthorizedError)
    async def unauthorized_handler(request: Request, exc: UnauthorizedError):
        logger.warning("401 | %s | %s", request.url.path, exc)
        return JSONResponse(
            status_code=401,
            content={"error": "unauthorized", "detail": str(exc)},
            headers={"WWW-Authenticate": "Bearer"},
        )

    @app.exception_handler(ForbiddenError)
    async def forbidden_handler(request: Request, exc: ForbiddenError):
        logger.warning("403 | %s | %s", request.url.path, exc)
        return JSONResponse(
            status_code=403,
            content={"error": "forbidden", "detail": str(exc)},
        )

    @app.exception_handler(BadRequestError)
    async def bad_request_handler(request: Request, exc: BadRequestError):
        logger.warning("400 | %s | %s", request.url.path, exc)
        return JSONResponse(
            status_code=400,
            content={"error": "bad request", "detail": str(exc)},
        )

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception):
        """兜底——记录完整 traceback，返回 500"""
        logger.exception("500 | %s | 未捕获异常: %s", request.url.path, exc)
        return JSONResponse(
            status_code=500,
            content={"error": "internal_server_error"},
        )
