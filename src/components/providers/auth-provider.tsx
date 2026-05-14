"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  AuthUser,
  getToken,
  setToken,
  removeToken,
  getStoredUser,
  setStoredUser,
} from "@/lib/auth-client";

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<{ error?: string }>;
  logout: () => void;
  getPassword: () => string | null;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isAuthenticated: false,
  loading: true,
  login: async () => ({ error: "Not initialized" }),
  logout: () => {},
  getPassword: () => null,
});

const PUBLIC_PATHS = ["/login", "/register"];
const SESSION_PW_KEY = "hpo_session_pw";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setTokenState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const passwordRef = useRef<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Restore session from localStorage on mount
  useEffect(() => {
    const storedToken = getToken();
    const storedUser = getStoredUser();
    if (storedToken && storedUser) {
      setTokenState(storedToken);
      setUser(storedUser);
      const sessionPw = sessionStorage.getItem(SESSION_PW_KEY);
      if (sessionPw) passwordRef.current = sessionPw;
    }
    setLoading(false);
  }, []);

  // Redirect logic
  useEffect(() => {
    if (loading) return;
    const isPublic = PUBLIC_PATHS.includes(pathname);
    if (!token && !isPublic) {
      router.push("/login");
    } else if (token && isPublic) {
      router.push("/chat");
    }
  }, [token, loading, pathname, router]);

  const login = useCallback(
    async (username: string, password: string) => {
      try {
        const res = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        });

        if (!res.ok) {
          const data = await res.json();
          return { error: data.detail || "Login failed" };
        }

        const data = await res.json();
        passwordRef.current = password;
        sessionStorage.setItem(SESSION_PW_KEY, password);
        setToken(data.access_token);
        setTokenState(data.access_token);

        const authUser: AuthUser = {
          id: data.user.id,
          username: data.user.username,
          displayName: data.user.displayName,
        };
        setStoredUser(authUser);
        setUser(authUser);

        // Silently ensure vault is backed up whenever the user logs in.
        // This covers users who registered before vault support was added.
        const userId = data.user.id;
        (async () => {
          try {
            const { initCryptoStore } = await import("@/crypto/store");
            const { ensureVaultSynced } = await import("@/crypto/key-manager");
            initCryptoStore(userId);
            await ensureVaultSynced(password);
          } catch {}
        })();

        return {};
      } catch {
        return { error: "Network error" };
      }
    },
    []
  );

  const logout = useCallback(() => {
    passwordRef.current = null;
    sessionStorage.removeItem(SESSION_PW_KEY);
    removeToken();
    setTokenState(null);
    setUser(null);
    router.push("/login");
  }, [router]);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        loading,
        login,
        logout,
        getPassword: () => passwordRef.current,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
