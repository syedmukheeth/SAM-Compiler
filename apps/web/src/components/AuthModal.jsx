import React, { useState } from "react";
import Modal from "./Modal";
import { login, register } from "../services/authApi";
import { Loader2 } from "lucide-react";

// The Render backend URL — OAuth MUST start here directly, it cannot be proxied
const RENDER_API = "https://sam-compiler.onrender.com";

export default function AuthModal({ isOpen, onClose, isDarkMode, onLogin, theme }) {
  const [isLoginTab, setIsLoginTab] = useState(true);
  const [isForgotTab, setIsForgotTab] = useState(false);
  const [isLoading, setIsLoading] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [formData, setFormData] = useState({ name: "", email: "", password: "" });

  const handleSocialLogin = (provider) => {
    window.location.href = `${RENDER_API}/api/auth/${provider}`;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setIsLoading("email");
    setError(null);
    setSuccess(null);
    try {
      if (isForgotTab) {
        // Mock forgot password call
        console.log("Simulating forgot password for:", formData.email);
        await new Promise(r => setTimeout(r, 1000));
        setSuccess("Check your email for instructions (Simulated).");
      } else if (isLoginTab) {
        const result = await login(formData.email, formData.password);
        onLogin(result.user, result.token);
        onClose();
      } else {
        const result = await register(formData.name, formData.email, formData.password);
        onLogin(result.user, result.token);
        onClose();
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setIsLoading(null);
    }
  };

  const getTitle = () => {
    if (isForgotTab) return "Reset Password";
    return isLoginTab ? "Sign in to SAM" : "Create SAM Account";
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      isDarkMode={isDarkMode}
      theme={theme}
    >
      <div style={{ animation: "fadeIn 0.3s ease" }}>
        {!isForgotTab && (
          <div style={{
            display: "flex",
            gap: 4,
            marginBottom: 28,
            padding: 4,
            borderRadius: 10,
            background: "var(--sam-surface-low)",
            border: "1px solid var(--sam-glass-border)",
          }}>
            {["Sign In", "Create Account"].map((tab, i) => {
              const active = i === 0 ? isLoginTab : !isLoginTab;
              return (
                <button
                  key={tab}
                  id={`auth-tab-${i}`}
                  onClick={() => { setIsLoginTab(i === 0); setError(null); setSuccess(null); }}
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 7, border: "none", fontSize: 11, fontWeight: 700,
                    letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.25s",
                    background: active ? "var(--sam-accent)" : "transparent",
                    color: active ? "var(--sam-bg)" : "var(--sam-text-dim)",
                    boxShadow: active ? "var(--sam-glow-bloom)" : "none",
                    fontFamily: "var(--font-body)",
                  }}
                >
                  {tab}
                </button>
              );
            })}
          </div>
        )}

        {(error || success) && (
          <div style={{
            marginBottom: 20,
            padding: "12px 16px",
            borderRadius: 8,
            border: `1px solid ${error ? "rgba(255,59,59,0.3)" : "rgba(16,185,129,0.3)"}`,
            background: error ? "rgba(255,59,59,0.1)" : "rgba(16,185,129,0.1)",
            color: error ? "#FF3B3B" : "#10b981",
            fontSize: 12,
            fontWeight: 600,
          }}>
            {error || success}
          </div>
        )}

        {!isForgotTab && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            <button
              onClick={() => handleSocialLogin("github")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                padding: "13px 0", borderRadius: 10, border: "1px solid var(--sam-glass-border)",
                background: "var(--sam-surface)", color: "var(--sam-text)", fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all 0.25s", fontFamily: "var(--font-body)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.167 6.839 9.49.5.092.682-.217.682-.482 0-.237-.008-.866-.013-1.7-2.782.603-3.369-1.342-3.369-1.342-.454-1.155-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.831.092-.645.35-1.087.636-1.337-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.682-.103-.253-.446-1.27.098-2.647 0 0 .84-.268 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.026 2.747-1.026.546 1.377.202 2.394.1 2.647.64.698 1.028 1.591 1.028 2.682 0 3.841-2.337 4.687-4.565 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.743 0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10z"/></svg>
              Continue with GitHub
            </button>
            <button
              onClick={() => handleSocialLogin("google")}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                padding: "13px 0", borderRadius: 10, border: "1px solid var(--sam-glass-border)",
                background: "var(--sam-surface)", color: "var(--sam-text)", fontSize: 12, fontWeight: 700,
                cursor: "pointer", transition: "all 0.25s", fontFamily: "var(--font-body)",
              }}
            >
              <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg" alt="Google" style={{ width: 18, height: 18 }} />
              Continue with Google
            </button>
            <button
              onClick={onClose}
              style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
                padding: "16px 0", borderRadius: 12, border: "1px solid rgba(255,255,255,0.08)",
                background: "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)",
                color: "var(--sam-text)", fontSize: 11, fontWeight: 900,
                textTransform: "uppercase", letterSpacing: "0.15em",
                cursor: "pointer", transition: "all 0.3s cubic-bezier(0.16, 1, 0.3, 1)", 
                fontFamily: "var(--font-display)",
                boxShadow: "0 4px 15px rgba(0,0,0,0.1)",
              }}
              onMouseEnter={(e) => { 
                e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)"; 
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.15)";
                e.currentTarget.style.transform = "translateY(-1px)";
                e.currentTarget.style.boxShadow = "0 8px 25px rgba(0,0,0,0.2)";
              }}
              onMouseLeave={(e) => { 
                e.currentTarget.style.background = "linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)"; 
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "0 4px 15px rgba(0,0,0,0.1)";
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              Continue as Guest
            </button>
          </div>
        )}

        {!isForgotTab && (
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
            <div style={{ flex: 1, height: 1, background: "var(--sam-glass-border)" }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: "var(--sam-text-dim)", textTransform: "uppercase", letterSpacing: "0.12em" }}>or with email</span>
            <div style={{ flex: 1, height: 1, background: "var(--sam-glass-border)" }} />
          </div>
        )}

        <form onSubmit={handleAuth} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {!isLoginTab && !isForgotTab && (
            <div>
              <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--sam-text-dim)", marginBottom: 8, fontFamily: "var(--font-body)" }}>Full Name</label>
              <input required type="text" placeholder="Your name" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="sam-input" />
            </div>
          )}
          <div>
            <label style={{ display: "block", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--sam-text-dim)", marginBottom: 8, fontFamily: "var(--font-body)" }}>Email Address</label>
            <input required type="email" placeholder="you@samcompiler.dev" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="sam-input" />
          </div>
          {!isForgotTab && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <label style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--sam-text-dim)", fontFamily: "var(--font-body)" }}>Password</label>
                {isLoginTab && (
                  <button type="button" onClick={() => setIsForgotTab(true)} style={{ fontSize: 10, fontWeight: 700, color: "var(--sam-accent)", background: "none", border: "none", cursor: "pointer" }}>Forgot?</button>
                )}
              </div>
              <input required type="password" placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="sam-input" />
            </div>
          )}
          <button type="submit" disabled={!!isLoading} style={{
            width: "100%", padding: "14px 0", borderRadius: 10, border: "none", background: "var(--sam-accent)", color: "var(--sam-bg)",
            fontSize: 12, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", cursor: isLoading ? "not-allowed" : "pointer",
            boxShadow: "var(--sam-glow-bloom)", transition: "all 0.3s", display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          }}>
            {isLoading ? <Loader2 size={16} style={{ animation: "spin 0.8s linear infinite" }} /> : (isForgotTab ? "Send Reset Link" : (isLoginTab ? "Sign In" : "Create Account"))}
          </button>
        </form>

        <p style={{ textAlign: "center", fontSize: 12, color: "var(--sam-text-dim)", marginTop: 20, fontFamily: "var(--font-body)" }}>
          {isForgotTab ? (
            <button type="button" onClick={() => { setIsForgotTab(false); setError(null); setSuccess(null); }} style={{ color: "var(--sam-text)", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>Back to Sign In</button>
          ) : (
            <>
              {isLoginTab ? "New to SAM Compiler? " : "Already have an account? "}
              <button type="button" onClick={() => { setIsLoginTab(!isLoginTab); setError(null); setSuccess(null); }} style={{ color: "var(--sam-text)", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textDecoration: "underline" }}>{isLoginTab ? "Create free account" : "Sign in here"}</button>
            </>
          )}
        </p>
      </div>


      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </Modal>
  );
}
