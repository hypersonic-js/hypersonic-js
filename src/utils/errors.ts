/**
 * Base class for all HTTP errors thrown within a Hypersonic application.
 */
export class HttpError extends Error {
  public readonly statusCode: number

  constructor(statusCode: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.statusCode = statusCode
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not Found') {
    super(404, message)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message)
    this.name = 'ForbiddenError'
  }
}

export class ValidationError extends HttpError {
  constructor(message = 'Unprocessable Entity') {
    super(422, message)
    this.name = 'ValidationError'
  }
}
