/**
 * 分层错误模型 — 所有应用异常的基类。
 * @since 2025-01 阶段1：引入结构化错误体系，替代裸 Error 对象。
 */
export class AppError extends Error {
  constructor(message, { code = 'INTERNAL', httpStatus = 500, retryable = false, cause } = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.cause = cause;
  }

  toJSON() {
    return { success: false, error: this.message, code: this.code, retryable: this.retryable };
  }
}

export class NotFoundError extends AppError {
  constructor(message, cause) { super(message, { code: 'NOT_FOUND', httpStatus: 404, cause }); }
}

export class ValidationError extends AppError {
  constructor(message, details) { super(message, { code: 'VALIDATION', httpStatus: 400 }); this.details = details; }
}

export class AuthError extends AppError {
  constructor(message) { super(message, { code: 'UNAUTHORIZED', httpStatus: 401 }); }
}

export class ExecutionError extends AppError {
  constructor(message, cause) { super(message, { code: 'EXEC_FAILED', httpStatus: 502, retryable: true, cause }); }
}

export class TimeoutError extends AppError {
  constructor(message, cause) { super(message, { code: 'TIMEOUT', httpStatus: 504, retryable: true, cause }); }
}
