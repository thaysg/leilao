export type Role = 'seller' | 'bidder'
export interface User { id: number; name: string; email: string; role: Role }
export interface Session { token: string; user: User }
export interface RegisterInput { name: string; email: string; password: string; role: Role }
