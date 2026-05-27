export interface User {
  id: string
  name: string
  email: string
  image?: string | null
}

export interface Post {
  id: number
  title: string
  body: string
  userId: string
  user: Pick<User, 'id' | 'name'>
  createdAt: string
  updatedAt: string
}

// Props shapes passed from Express routes to Inertia pages
export interface LoginPageProps {
  error?: string
}

export interface PostsIndexPageProps {
  posts: Post[]
  user: User
}

export interface PostsShowPageProps {
  post: Post
  user: User
}