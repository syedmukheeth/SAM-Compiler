import React, { useState } from "react";
import { useSearchParams, Link, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { resetPassword } from "../services/authApi";

const MIN_PASSWORD_LENGTH = 8; // must match the API's policy

/**
 * Landing page for the link in a password-reset email.
 *
 * The backend routes for this already existed; there was simply no page to
 * receive the emailed token, and the modal's "forgot password" flow was a
 * console.log labelled "(Simulated)".
 */
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState("idle"); // idle | saving | done
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Those passwords do not match.");
      return;
    }

    setStatus("saving");
    try {
      await resetPassword(token, password);
      setStatus("done");
      setTimeout(() => navigate("/"), 2500);
    } catch (err) {
      setStatus("idle");
      setError(err.response?.data?.message || "That reset link is invalid or has expired.");
    }
  };

  const fieldStyle = {
    background: "var(--sam-surface-low)",
    borderColor: "var(--sam-glass-border)",
    color: "var(--sam-text)"
  };

  return (
    <div
      className="flex min-h-[100dvh] w-full items-center justify-center px-4"
      style={{ background: "var(--sam-bg)" }}
    >
      <div
        className="sam-glass w-full max-w-md rounded-[24px] border p-8"
        style={{ borderColor: "var(--sam-glass-border)" }}
      >
        <h1
          className="mb-2 text-[13px] font-black uppercase tracking-[0.2em]"
          style={{ color: "var(--sam-text)" }}
        >
          Choose a new password
        </h1>

        {!token ? (
          <>
            <p className="mb-6 text-[11px] leading-relaxed" style={{ color: "var(--sam-text-dim)" }}>
              This link is missing its reset token. Request a new one from the sign-in screen.
            </p>
            <Link
              to="/"
              className="inline-flex rounded-xl px-5 py-2.5 text-[9px] font-black uppercase tracking-[0.2em]"
              style={{ background: "var(--sam-accent)", color: "var(--sam-bg)" }}
            >
              Back to editor
            </Link>
          </>
        ) : status === "done" ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2" style={{ color: "var(--sam-green)" }}>
              <ShieldCheck className="h-4 w-4" />
              <span className="text-[11px] font-black uppercase tracking-[0.2em]">Password updated</span>
            </div>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--sam-text-dim)" }}>
              You have been signed out everywhere else. Redirecting you to the editor…
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--sam-text-dim)" }}>
              Pick something at least {MIN_PASSWORD_LENGTH} characters long. Signing in again elsewhere will
              be required.
            </p>

            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--sam-text-dim)" }}>
                New password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-xl border px-4 py-3 text-[12px] outline-none focus-visible:ring-2"
                style={fieldStyle}
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-[0.2em]" style={{ color: "var(--sam-text-dim)" }}>
                Confirm password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                className="rounded-xl border px-4 py-3 text-[12px] outline-none focus-visible:ring-2"
                style={fieldStyle}
              />
            </label>

            {error && (
              <p role="alert" className="text-[10px] font-bold" style={{ color: "var(--sam-red)" }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={status === "saving"}
              className="mt-2 flex items-center justify-center gap-2 rounded-xl py-3 text-[10px] font-black uppercase tracking-[0.2em] disabled:opacity-60"
              style={{ background: "var(--sam-accent)", color: "var(--sam-bg)" }}
            >
              {status === "saving" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Update password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
