import { describe, it, expect } from 'vitest'
import {
  HttpError,
  NotFoundError,
  UnauthorizedError,
  ForbiddenError,
  ValidationError,
} from '../src/utils/errors.js'

describe('HttpError', () => {
  it('sets statusCode and message', () => {
    const err = new HttpError(500, 'Internal Server Error')
    expect(err.statusCode).toBe(500)
    expect(err.message).toBe('Internal Server Error')
    expect(err.name).toBe('HttpError')
    expect(err).toBeInstanceOf(Error)
  })
})

describe('NotFoundError', () => {
  it('has statusCode 404 and default message', () => {
    const err = new NotFoundError()
    expect(err.statusCode).toBe(404)
    expect(err.message).toBe('Not Found')
    expect(err.name).toBe('NotFoundError')
  })

  it('accepts a custom message', () => {
    const err = new NotFoundError('User not found')
    expect(err.message).toBe('User not found')
  })

  it('is an instance of HttpError', () => {
    expect(new NotFoundError()).toBeInstanceOf(HttpError)
  })
})

describe('UnauthorizedError', () => {
  it('has statusCode 401 and default message', () => {
    const err = new UnauthorizedError()
    expect(err.statusCode).toBe(401)
    expect(err.message).toBe('Unauthorized')
    expect(err.name).toBe('UnauthorizedError')
  })

  it('accepts a custom message', () => {
    expect(new UnauthorizedError('Token expired').message).toBe('Token expired')
  })
})

describe('ForbiddenError', () => {
  it('has statusCode 403 and default message', () => {
    const err = new ForbiddenError()
    expect(err.statusCode).toBe(403)
    expect(err.message).toBe('Forbidden')
    expect(err.name).toBe('ForbiddenError')
  })

  it('accepts a custom message', () => {
    expect(new ForbiddenError('Admins only').message).toBe('Admins only')
  })
})

describe('ValidationError', () => {
  it('has statusCode 422 and default message', () => {
    const err = new ValidationError()
    expect(err.statusCode).toBe(422)
    expect(err.message).toBe('Unprocessable Entity')
    expect(err.name).toBe('ValidationError')
  })

  it('accepts a custom message', () => {
    expect(new ValidationError('Email is invalid').message).toBe('Email is invalid')
  })
})
