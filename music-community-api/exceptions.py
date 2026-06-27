"""
自定义异常 — 与 handlers.py 中的 exception_handler 配对
"""


class NotFoundError(Exception):
    """资源不存在 (404)"""
    pass


class ConflictError(Exception):
    """资源冲突 (409)"""
    pass


class UnauthorizedError(Exception):
    """未授权或身份验证失败 (401)"""
    pass


class ForbiddenError(Exception):
    """无权操作 (403)"""
    pass


class BadRequestError(Exception):
    """请求参数错误 (400)"""
    pass
