import type { Request } from 'express'

export interface SessionUser {
  id: string
  name: string
  email: string
}

export interface AuthRequest extends Request {
  sessionUser?: SessionUser
}

export interface AuthLike {
  api: {
    getSession(opts: { headers: unknown }): Promise<{ user: SessionUser } | null>
  }
}