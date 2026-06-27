import { type FormEvent, useState } from "react";
import { Navigate, useNavigate, useSearch } from "@tanstack/react-router";
import { authClient } from "../lib/auth-client";

type AuthMode = "sign-in" | "sign-up";

export function LoginScreen() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false });
  const session = authClient.useSession();
  const [mode, setMode] = useState<AuthMode>("sign-in");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const redirectTo = getSafeRedirect(search.redirect);

  if (session.data) {
    return <Navigate to={redirectTo} />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(undefined);
    setIsSubmitting(true);

    try {
      const result =
        mode === "sign-in"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: name || email });

      if (result.error) {
        throw new Error(result.error.message ?? "Authentication failed.");
      }

      await navigate({ to: redirectTo });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Authentication failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-screen">
      <section className="auth-panel">
        <header className="auth-header">
          <span>Local SEO Mission Control</span>
          <h1>{mode === "sign-in" ? "Sign in" : "Create account"}</h1>
        </header>

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "sign-up" ? (
            <label className="form-field">
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" />
            </label>
          ) : null}

          <label className="form-field">
            <span>Email</span>
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </label>

          <label className="form-field">
            <span>Password</span>
            <input
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={8}
            />
          </label>

          {error ? <div className="notice notice--danger">{error}</div> : null}

          <button className="button-primary auth-submit" type="submit" disabled={isSubmitting || session.isPending}>
            {isSubmitting ? "Working..." : mode === "sign-in" ? "Sign in" : "Create account"}
          </button>
        </form>

        <button
          className="button-secondary auth-mode-toggle"
          type="button"
          onClick={() => {
            setError(undefined);
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
          }}
        >
          {mode === "sign-in" ? "Create account" : "Use existing account"}
        </button>
      </section>
    </main>
  );
}

function getSafeRedirect(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    return "/";
  }

  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\") || value.includes("..")) {
    return "/";
  }

  return value;
}
