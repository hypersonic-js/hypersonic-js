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

export interface PostRow {
  id: number
  title: string
  body: string
  userId: string
  user: { id: string; name: string }
  createdAt: Date
  updatedAt: Date
}

export interface PostBasicRow {
  id: number
  userId: string
}

export interface PrismaRouteClient {
  post: {
    findMany(args: unknown): Promise<PostRow[]>
    findUnique(args: unknown): Promise<PostBasicRow | null>
    create(args: unknown): Promise<PostRow>
    delete(args: unknown): Promise<PostRow>
  }
}