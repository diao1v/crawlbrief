export type ErrorCode =
  | 'UNAUTHORIZED'
  | 'VALIDATION_ERROR'
  | 'GATEWAY_ERROR'
  | 'LLM_ERROR'
  | 'DATABASE_ERROR'
  | 'SLACK_ERROR'
  | 'TIMEOUT'
  | 'NOT_FOUND'
  | 'INTERNAL_ERROR';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly statusCode: number = 500,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'AppError';
  }

  toJSON() {
    return {
      success: false as const,
      error: {
        code: this.code,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details?: Record<string, unknown>) {
    super('UNAUTHORIZED', message, 401, details);
    this.name = 'UnauthorizedError';
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: Record<string, unknown>) {
    super('VALIDATION_ERROR', message, 400, details);
    this.name = 'ValidationError';
  }
}

export class GatewayError extends AppError {
  constructor(message = 'Gateway request failed', details?: Record<string, unknown>) {
    super('GATEWAY_ERROR', message, 502, details);
    this.name = 'GatewayError';
  }
}

export class LLMError extends AppError {
  constructor(message = 'LLM request failed', details?: Record<string, unknown>) {
    super('LLM_ERROR', message, 502, details);
    this.name = 'LLMError';
  }
}

export class DatabaseError extends AppError {
  constructor(message = 'Database operation failed', details?: Record<string, unknown>) {
    super('DATABASE_ERROR', message, 500, details);
    this.name = 'DatabaseError';
  }
}

export class SlackError extends AppError {
  constructor(message = 'Slack operation failed', details?: Record<string, unknown>) {
    super('SLACK_ERROR', message, 502, details);
    this.name = 'SlackError';
  }
}

export class TimeoutError extends AppError {
  constructor(message = 'Request timed out', details?: Record<string, unknown>) {
    super('TIMEOUT', message, 504, details);
    this.name = 'TimeoutError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details?: Record<string, unknown>) {
    super('NOT_FOUND', message, 404, details);
    this.name = 'NotFoundError';
  }
}

export class InternalError extends AppError {
  constructor(message = 'Internal server error', details?: Record<string, unknown>) {
    super('INTERNAL_ERROR', message, 500, details);
    this.name = 'InternalError';
  }
}
