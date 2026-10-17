"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { ArrowRight, Layers3 } from "lucide-react";
import { api, usePlatform } from "@/components/platform";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
function Auth() {
  const params = useSearchParams();
  const router = useRouter();
  const { refresh } = usePlatform();
  const [mode, setMode] = useState(params.get("mode") || "login");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    setMode(params.get("mode") || "login");
  }, [params]);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const form = new FormData(e.currentTarget);
    const data = Object.fromEntries(form);
    if (params.get("token")) data.token = params.get("token")!;
    try {
      const result = await api<{ message?: string }>(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      if (mode === "login" || mode === "register") {
        await refresh();
        router.push("/account");
      } else
        setMessage(
          result.message ||
            (mode === "recover"
              ? "If that email has an account, recovery instructions are on their way."
              : mode === "reset"
                ? "Password updated. You can sign in now."
                : "Email confirmed. You can return to your account."),
        );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const title =
    mode === "register"
      ? "Make yourself at home."
      : mode === "recover"
        ? "Let’s get you back in."
        : mode === "reset"
          ? "A fresh start."
          : mode === "verify"
            ? "Make it official."
            : "Welcome back, maker.";
  return (
    <div className="auth-wrap">
      <div className="panel">
        <Layers3 size={29} className="accent-text" />
        <h1>{title}</h1>
        <p className="subtitle">A good workflow is only the beginning.</p>
        {["login", "register"].includes(mode) && (
          <div className="auth-tabs">
            <button
              className={mode === "login" ? "active" : ""}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Sign in
            </button>
            <button
              className={mode === "register" ? "active" : ""}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Create account
            </button>
          </div>
        )}
        <form onSubmit={submit}>
          {mode === "register" && (
            <div className="field">
              <label htmlFor="username">Username</label>
              <Input
                id="username"
                name="username"
                autoComplete="username"
                required
                minLength={3}
                maxLength={30}
                pattern="[A-Za-z0-9_]+"
              />
            </div>
          )}
          {mode === "login" && (
            <div className="field">
              <label htmlFor="identifier">Email or username</label>
              <Input
                id="identifier"
                name="identifier"
                autoComplete="username"
                required
              />
            </div>
          )}
          {["register", "recover"].includes(mode) && (
            <div className="field">
              <label htmlFor="email">Email address</label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
              />
            </div>
          )}
          {["login", "register", "reset"].includes(mode) && (
            <div className="field">
              <label htmlFor="password">
                {mode === "reset" ? "New password" : "Password"}
              </label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "login" ? 1 : 12}
              />
              {mode !== "login" && <small>Use at least 12 characters.</small>}
            </div>
          )}
          {["verify", "reset"].includes(mode) && !params.get("token") && (
            <div className="field">
              <label htmlFor="token">Token from your email</label>
              <Input id="token" name="token" required autoComplete="off" />
            </div>
          )}
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}
          {message && (
            <div className="success-message" role="status">
              {message}
            </div>
          )}
          <Button type="submit" disabled={busy} style={{ width: "100%" }}>
            {busy
              ? "One moment..."
              : mode === "login"
                ? "Sign in"
                : mode === "register"
                  ? "Create account"
                  : mode === "recover"
                    ? "Send recovery link"
                    : mode === "reset"
                      ? "Set new password"
                      : "Verify email"}
            <ArrowRight size={15} />
          </Button>
        </form>
        <div
          style={{
            marginTop: 19,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <button
            className="text-link"
            onClick={() => {
              setMode(mode === "login" ? "recover" : "login");
              setError("");
              setMessage("");
            }}
          >
            {mode === "login" ? "Forgot your password?" : "Back to sign in"}
          </button>
          {mode === "login" && (
            <button className="text-link" onClick={() => setMode("verify")}>
              Verify email
            </button>
          )}
        </div>
      </div>
      <p
        className="muted"
        style={{ fontSize: 10, textAlign: "center", marginTop: 19 }}
      >
        Less friction. More creating.
      </p>
    </div>
  );
}
export default function Page() {
  return (
    <Suspense
      fallback={<div className="loading-page">Opening your workspace...</div>}
    >
      <Auth />
    </Suspense>
  );
}
