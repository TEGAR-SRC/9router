"use client";

import { useState, useEffect } from "react";
import Button from "@/shared/components/Button";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [resetHint, setResetHint] = useState("");
  const [retryAfter, setRetryAfter] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasPassword, setHasPassword] = useState(null);
  const [authMode, setAuthMode] = useState("password");
  const [oidcConfigured, setOidcConfigured] = useState(false);
  const [oidcLoginLabel, setOidcLoginLabel] = useState("Sign in with OIDC");
  const [mustChange, setMustChange] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowPasswordNew] = useState(false);

  // Countdown for rate-limit
  useEffect(() => {
    if (retryAfter <= 0) return;
    const id = setInterval(() => setRetryAfter((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, [retryAfter]);

  useEffect(() => {
    async function checkAuth() {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const baseUrl = typeof window !== "undefined" ? window.location.origin : "";

      try {
        const res = await fetch(`${baseUrl}/api/auth/status`, {
          signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const data = await res.json();
          if (data.requireLogin === false) {
            window.location.assign("/dashboard");
            return;
          }
          setHasPassword(!!data.hasPassword);
          setAuthMode(data.authMode || "password");
          setOidcConfigured(data.oidcConfigured === true);
          setOidcLoginLabel(data.oidcLoginLabel || "Sign in with OIDC");
        } else {
          setHasPassword(true);
        }
      } catch (err) {
        clearTimeout(timeoutId);
        setHasPassword(true);
      }
    }
    checkAuth();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResetHint("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.mustChangePassword) {
          setMustChange(true);
          return;
        }
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Invalid password");
        if (data.resetHint) setResetHint(data.resetHint);
        if (data.retryAfter) setRetryAfter(Number(data.retryAfter));
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      if (res.ok) {
        window.location.assign("/dashboard");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to set password");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleOidcLogin = () => {
    window.location.href = "/api/auth/oidc/start";
  };

  const oidcAvailable = oidcConfigured && ["oidc", "both"].includes(authMode);
  const passwordAvailable = authMode !== "oidc" || !oidcConfigured;

  if (hasPassword === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="text-center flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-500"></div>
          <p className="text-text-muted text-sm font-semibold tracking-wider uppercase">Connecting to 9Router...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg p-4 relative overflow-hidden">
      {/* Animated glowing backdrops */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-brand-500/5 rounded-full blur-[100px] pointer-events-none animate-pulse-glow" />

      {/* Faint grid background */}
      <div className="landing-grid absolute inset-0 pointer-events-none opacity-5 dark:opacity-10" aria-hidden="true" />

      <div className="relative z-10 w-full max-w-[420px] space-y-8 animate-fade-in">

        {/* Logo and branding header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center size-14 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 shadow-warm animate-float">
            <span className="material-symbols-outlined text-white text-[28px] fill-1">hub</span>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text-main">
              Welcome to 9Router
            </h1>
            <p className="text-sm text-text-muted mt-1 max-w-xs mx-auto leading-relaxed">
              {authMode === "oidc" && oidcConfigured
                ? "Sign in with your OIDC identity provider to access the gateway"
                : "Gateway Dashboard Access Authorization Check"}
            </p>
          </div>
        </div>

        {/* Auth card wrapper */}
        <div className="bg-vibrancy border border-border-subtle rounded-2xl shadow-elevated p-6 md:p-8 space-y-6">
          {mustChange ? (
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-700 dark:text-amber-200 rounded-xl text-xs flex gap-2">
                <span className="material-symbols-outlined text-[16px] text-amber-600 shrink-0 mt-0.5">warning</span>
                <span className="leading-normal">
                  Set a new strong password before accessing the dashboard remotely to ensure gateway security.
                </span>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted uppercase tracking-wider block">New Password</label>
                <div className="relative">
                  <span className="material-symbols-outlined text-text-subtle absolute left-3 top-2.5 text-[18px]">lock</span>
                  <input
                    type={showNewPassword ? "text" : "password"}
                    placeholder="Enter new strong password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                    className="w-full pl-9 pr-10 py-2.5 bg-bg border border-border-subtle rounded-xl text-sm text-text-main placeholder-text-subtle focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPasswordNew(!showNewPassword)}
                    className="absolute right-3 top-2 text-text-subtle hover:text-text-main cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[18px]">{showNewPassword ? "visibility_off" : "visibility"}</span>
                  </button>
                </div>
                {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
              </div>

              <Button type="submit" variant="primary" className="w-full h-11 bg-brand-500 hover:bg-brand-600 rounded-xl font-bold" loading={loading} disabled={!newPassword}>
                <span className="material-symbols-outlined text-[18px]">key</span>
                Set Password & Proceed
              </Button>
            </form>
          ) : (
            <div className="space-y-5">
              {oidcAvailable && (
                <Button type="button" variant="primary" className="w-full h-11 bg-brand-500 hover:bg-brand-600 rounded-xl font-bold flex items-center justify-center gap-2" onClick={handleOidcLogin}>
                  <span className="material-symbols-outlined text-[18px]">shield_person</span>
                  {oidcLoginLabel}
                </Button>
              )}

              {oidcAvailable && passwordAvailable && (
                <div className="flex items-center justify-center gap-3">
                  <div className="h-px flex-1 bg-border-subtle" />
                  <span className="text-[10px] text-text-subtle uppercase tracking-wider font-extrabold">or connect with password</span>
                  <div className="h-px flex-1 bg-border-subtle" />
                </div>
              )}

              {passwordAvailable ? (
                <form onSubmit={handleLogin} className="space-y-5">
                  {((authMode === "oidc" && !oidcConfigured) || (authMode === "both" && !oidcConfigured)) && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 rounded-xl text-xs text-amber-700 dark:text-amber-300 leading-normal flex gap-2">
                      <span className="material-symbols-outlined text-[16px] text-amber-600 shrink-0">info</span>
                      <span>
                        OIDC is enabled but client secrets are unconfigured. Use local master password recovery mode.
                      </span>
                    </div>
                  )}

                  {authMode === "both" && oidcConfigured && (
                    <p className="text-xs text-text-muted text-center italic">
                      Multi-mode authorized credentials active.
                    </p>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-extrabold text-text-muted uppercase tracking-wider block">Security Password</label>
                    <div className="relative">
                      <span className="material-symbols-outlined text-text-subtle absolute left-3 top-2.5 text-[18px]">lock</span>
                      <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Enter password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoFocus={!oidcAvailable}
                        disabled={retryAfter > 0}
                        className="w-full pl-9 pr-10 py-2.5 bg-bg border border-border-subtle rounded-xl text-sm text-text-main placeholder-text-subtle focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-2.5 text-text-subtle hover:text-text-main cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[18px]">{showPassword ? "visibility_off" : "visibility"}</span>
                      </button>
                    </div>

                    {error && (
                      <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 rounded-xl text-xs flex gap-2 font-medium">
                        <span className="material-symbols-outlined text-[16px] text-red-500 shrink-0">error</span>
                        <span>{error}</span>
                      </div>
                    )}

                    {retryAfter > 0 && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 text-amber-600 dark:text-amber-400 rounded-xl text-xs flex gap-2 font-bold animate-pulse">
                        <span className="material-symbols-outlined text-[16px] shrink-0">hourglass_empty</span>
                        <span>Gateway locked. cooling down: {retryAfter} seconds</span>
                      </div>
                    )}

                    {resetHint && (
                      <div className="p-3 bg-surface-2 border border-border-subtle rounded-xl text-[10px] text-text-muted leading-relaxed">
                        Forgot your password? Run the 9Router CLI executable directly:
                        <code className="block mt-1 font-mono bg-bg px-2 py-1 rounded border border-border-subtle text-brand-500 font-bold">
                          9router CLI → Settings → Reset Password to Default
                        </code>
                      </div>
                    )}
                  </div>

                  <Button
                    type="submit"
                    variant="primary"
                    className="w-full h-11 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-sm"
                    loading={loading}
                    disabled={retryAfter > 0}
                  >
                    <span className="material-symbols-outlined text-[18px]">vpn_key</span>
                    Authorize Login
                  </Button>

                  <div className="text-center pt-2 border-t border-border-subtle">
                    <p className="text-[10px] text-text-subtle font-medium">
                      Default fresh installer key is <code className="bg-surface-2 px-1.5 py-0.5 rounded border border-border-subtle font-mono text-brand-500 font-bold">123456</code>
                    </p>
                  </div>

                  {hasPassword === false && (
                    <div className="p-2.5 bg-red-50 dark:bg-red-950/10 border border-red-200 dark:border-red-950 text-[10px] text-red-500 font-semibold rounded-lg text-center">
                      Security alert: Default password active. Please update your profile settings immediately.
                    </div>
                  )}
                </form>
              ) : (
                error && (
                  <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 text-red-600 dark:text-red-300 rounded-xl text-xs flex gap-2 font-medium">
                    <span className="material-symbols-outlined text-[16px] text-red-500 shrink-0">error</span>
                    <span>{error}</span>
                  </div>
                )
              )}
            </div>
          )}
        </div>

        {/* Footer legalities */}
        <div className="text-center">
          <p className="text-xs text-text-subtle">
            Built with ❤️ for developers who code 24/7.
          </p>
        </div>

      </div>
    </div>
  );
}
