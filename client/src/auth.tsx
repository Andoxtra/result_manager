import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, type ReactNode } from "react";
import { api, ApiError, type Role, type SessionUser } from "./api";

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  /** true if the user has one of the roles; admins have every permission */
  can: (...roles: Role[]) => boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<SessionUser>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
  const user = data ?? null;

  // Drop everything cached for the previous user. The "me" query itself must stay:
  // removing it would detach it from this component, which would then never update.
  const setSession = (next: SessionUser | null) => {
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== "me" });
    queryClient.setQueryData(["me"], next);
  };

  const value: AuthContextValue = {
    user,
    loading: isPending,
    can: (...roles) => !!user && (user.roles.includes("ADMIN") || roles.some((r) => user.roles.includes(r))),
    login: async (username, password) => {
      setSession(await api.post<SessionUser>("/auth/login", { username, password }));
    },
    logout: async () => {
      await api.post("/auth/logout");
      setSession(null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth outside AuthProvider");
  return ctx;
}
