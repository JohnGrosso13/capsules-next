import type { AuthServerAdapter } from "@/ports/auth";

export type AuthClientUser = {
  id: string;
  key: string | null;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
  provider: string | null;
};

export type AuthClientState = {
  user: AuthClientUser | null;
  isLoaded: boolean;
};

export interface AuthClientAdapter {
  useCurrentUser(): AuthClientState;
}

export type AuthAdapters = {
  server: AuthServerAdapter | null;
  client: AuthClientAdapter | null;
};
