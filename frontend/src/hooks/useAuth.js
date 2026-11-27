// Authentification JWT : inscription, connexion, déconnexion.
// Les jetons sont dans localStorage ("access", "refresh") ; le refresh automatique
// sur 401 est géré dans api.js, qui émet "auth:logout" s'il échoue.
import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, clearTokens, getTokens, setTokens } from "../api";

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

  // Au démarrage : si un jeton est stocké, on vérifie qu'il est encore valide via /auth/me/
  // (api.js le renouvelle si besoin, ou déclenche "auth:logout" s'il est mort)
  useEffect(() => {
    if (!getTokens().access) return;
    apiGet("/auth/me/")
      .then((me) => {
        localStorage.setItem("username", me.username);
        setUser(me);
      })
      .catch(() => {
        /* 401 : déjà géré par api.js ; autre erreur (réseau) : on garde la session locale */
      });
  }, []);

  const login = useCallback(async (username, password) => {
    const tokens = await apiSend("POST", "/auth/token/", { username, password }, { auth: false });
    setTokens(tokens);
    localStorage.setItem("username", username);
    setUser({ username });
    // Infos complètes (id, email, nombre d'implantations), sans bloquer la connexion
    apiGet("/auth/me/").then(setUser).catch(() => {});
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
