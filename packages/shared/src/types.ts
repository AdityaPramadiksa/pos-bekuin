import type { Role } from './enums';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  role: Role;
  mustChangePassword: boolean;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: AuthUser;
}
