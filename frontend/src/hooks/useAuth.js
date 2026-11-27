// Authentification JWT : inscription, connexion, déconnexion.
// Les jetons sont dans localStorage ("access", "refresh") ; le refresh automatique
// sur 401 est géré dans api.js, qui émet "auth:logout" s'il échoue.
import { useCallback, useEffect, useState } from "react";
import { apiSend, clearTokens, getTokens, setTokens } from "../api";

function storedUser() {
  const { access } = getTokens();
  return access ? { username: localStorage.getItem("username") || "moi" } : null;
}

export function useAuth() {
  const [user, setUser] = useState(storedUser);

  // Déconnexion forcée (refresh expiré)
  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener("auth:logout", onLogout);
    return () => window.removeEventListener("auth:logout", onLogout);
  }, []);

  const login = useCallback(async (username, password) => {
    const tokens = await apiSend("POST", "/auth/token/", { username, password }, { auth: false });
    setTokens(tokens);
    localStorage.setItem("username", username);
    setUser({ username });
  }, []);

  const register = useCallback(
    async (username, email, password) => {
      await apiSend("POST", "/auth/register/", { username, email, password }, { auth: false });
      await login(username, password);
    },
    [login]
  );

  const logout = useCallback(() => {
    clearTokens();
    setUser(null);
  }, []);

  return { user, login, register, logout };
}
