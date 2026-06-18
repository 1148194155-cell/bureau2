/**
 * Error model unit tests.
 */
import { describe, it, expect } from 'vitest';
import { AppError, NotFoundError, ValidationError, AuthError, ExecutionError, TimeoutError } from '../../src/errors.js';

describe('AppError', () => {
  it('constructs with defaults', () => {
    const err = new AppError('Something broke');
    expect(err.message).toBe('Something broke');
    expect(err.code).toBe('INTERNAL');
    expect(err.httpStatus).toBe(500);
    expect(err.retryable).toBe(false);
  });

  it('constructs with custom options', () => {
    const err = new AppError('Custom', { code: 'CUSTOM', httpStatus: 418, retryable: true });
    expect(err.code).toBe('CUSTOM');
    expect(err.httpStatus).toBe(418);
    expect(err.retryable).toBe(true);
  });

  it('toJSON returns serializable object', () => {
    const err = new AppError('Test error', { code: 'TEST', httpStatus: 400 });
    expect(err.toJSON()).toEqual({ success: false, error: 'Test error', code: 'TEST', retryable: false });
  });
});

describe('NotFoundError', () => {
  it('has 404 status and NOT_FOUND code', () => {
    const err = new NotFoundError('Workflow not found');
    expect(err.httpStatus).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Workflow not found');
  });
});

describe('ValidationError', () => {
  it('has 400 status and VALIDATION code', () => {
    const err = new ValidationError('name is required');
    expect(err.httpStatus).toBe(400);
    expect(err.code).toBe('VALIDATION');
  });
});

describe('AuthError', () => {
  it('has 401 status and UNAUTHORIZED code', () => {
    const err = new AuthError('Login required');
    expect(err.httpStatus).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });
});

describe('ExecutionError', () => {
  it('has 502 status and is retryable', () => {
    const err = new ExecutionError('Model failed');
    expect(err.httpStatus).toBe(502);
    expect(err.code).toBe('EXEC_FAILED');
    expect(err.retryable).toBe(true);
  });
});

describe('TimeoutError', () => {
  it('has 504 status and is retryable', () => {
    const err = new TimeoutError('Request timed out');
    expect(err.httpStatus).toBe(504);
    expect(err.code).toBe('TIMEOUT');
    expect(err.retryable).toBe(true);
  });
});
