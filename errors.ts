/**
 * @fileoverview Custom Error classes and HTTP error response utilities.
 */

import * as http from 'http';

export class BaseError extends Error {
  constructor(
    public readonly code: string,
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      status: "error",
      error: {
        code: this.code,
        message: this.message,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export class ValidationError extends BaseError {
  constructor(message: string) {
    super('VALIDATION_ERROR', 400, message);
  }
}

export class AuthError extends BaseError {
  constructor(message: string) {
    super('UNAUTHORIZED', 401, message);
  }
}

export class GovernanceError extends BaseError {
  constructor(message: string, statusCode = 403) {
    super('GOVERNANCE_BLOCKED', statusCode, message);
  }
}

export class AdapterError extends BaseError {
  constructor(platform: string, message: string) {
    super('PLATFORM_ADAPTER_ERROR', 502, `[${platform}] ${message}`);
  }
}

export class RateLimitError extends BaseError {
  constructor(message = 'Rate limit exceeded. Please try again later.') {
    super('RATE_LIMIT_EXCEEDED', 429, message);
  }
}

/**
 * Sends a structured JSON error response using native http ServerResponse.
 */
export function sendErrorResponse(res: http.ServerResponse, error: any) {
  if (res.headersSent) {
    return;
  }

  let baseError: BaseError;

  if (error instanceof BaseError) {
    baseError = error;
  } else {
    baseError = new BaseError(
      'INTERNAL_SERVER_ERROR',
      500,
      error instanceof Error ? error.message : String(error),
    );
  }

  res.writeHead(baseError.statusCode, {'Content-Type': 'application/json'});
  res.end(JSON.stringify(baseError.toJSON()));
}
