// Connexion / inscription / déconnexion.
import { useState } from "react";

export default function AuthPanel({ user, onLogin, onRegister, onLogout }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  if (user) {
    return (
      <section className="panel auth">
        <span>
          Connecté : <strong>{user.username}</strong>
        </span>
        <button type="button" className="secondary" onClick={onLogout}>Déconnexion</button>
      </section>
    );
  }

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "login") await onLogin(form.username, form.password);
      else await onRegister(form.username, form.email, form.password);
    } catch (err) {
      // 401 sur /token/ = identifiants invalides
      setError(err.status === 401 ? "Identifiants incorrects." : err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={handleSubmit}>
      <div className="tabs">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>
          Connexion
        </button>
        <button type="button" className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>
          Inscription
        </button>
      </div>
      <input placeholder="Nom d'utilisateur" autoComplete="username" required value={form.username} onChange={set("username")} />
      {mode === "register" && (
        <input type="email" placeholder="E-mail" autoComplete="email" value={form.email} onChange={set("email")} />
      )}
      <input
        type="password"
        placeholder={mode === "register" ? "Mot de passe (8 caractères min.)" : "Mot de passe"}
        autoComplete={mode === "register" ? "new-password" : "current-password"}
        minLength={mode === "register" ? 8 : undefined}
        required
        value={form.password}
        onChange={set("password")}
      />
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={busy}>
        {busy ? "…" : mode === "login" ? "Se connecter" : "Créer le compte"}
      </button>
      <p className="hint">La connexion permet d'enregistrer vos implantations potentielles.</p>
    </form>
  );
}
