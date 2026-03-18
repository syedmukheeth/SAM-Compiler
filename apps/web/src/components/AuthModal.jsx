import React, { useState } from "react";
import Modal from "./Modal";
import { login, register } from "../services/authApi";

export default function AuthModal({ isOpen, onClose, isDarkMode, onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [isLoading, setIsLoading] = useState(null); // 'github', 'google', 'email'
  const [error, setError] = useState(null);

  const [formData, setFormData] = useState({ name: "", email: "", password: "" });

  const handleSocialLogin = (provider) => {
    const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";
    window.location.href = `${API_URL}/auth/${provider}`;
  };

  const handleAuth = async (e) => {
    e.preventDefault();
    setIsLoading('email');
    setError(null);

    try {
      let result;
      if (isLogin) {
        result = await login(formData.email, formData.password);
      } else {
        result = await register(formData.name, formData.email, formData.password);
      }
      onLogin(result.user, result.token);
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setIsLoading(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={isLogin ? "Sign In to Flux" : "Create Flux Account"} isDarkMode={isDarkMode}>
      <form onSubmit={handleAuth} className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        {error && (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-[11px] font-bold text-rose-500 animate-in shake-1">
            {error}
          </div>
        )}
        
        <div className="space-y-4">
          {!isLogin && (
            <div className="space-y-2">
              <label className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/30" : "text-slate-400"}`}>Full Name</label>
              <input 
                required
                type="text" 
                placeholder="Your Name"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className={`w-full rounded-2xl border px-6 py-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${isDarkMode ? "border-white/5 bg-white/5 text-white placeholder:text-white/10" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300"}`}
              />
            </div>
          )}
          <div className="space-y-2">
            <label className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/30" : "text-slate-400"}`}>Email Address</label>
            <input 
              required
              type="email" 
              placeholder="name@example.com"
              value={formData.email}
              onChange={(e) => setFormData({...formData, email: e.target.value})}
              className={`w-full rounded-2xl border px-6 py-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${isDarkMode ? "border-white/5 bg-white/5 text-white placeholder:text-white/10" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300"}`}
            />
          </div>
          <div className="space-y-2">
            <label className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/30" : "text-slate-400"}`}>Password</label>
            <input 
              required
              type="password" 
              placeholder="••••••••"
              value={formData.password}
              onChange={(e) => setFormData({...formData, password: e.target.value})}
              className={`w-full rounded-2xl border px-6 py-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50 ${isDarkMode ? "border-white/5 bg-white/5 text-white placeholder:text-white/10" : "border-slate-200 bg-slate-50 text-slate-900 placeholder:text-slate-300"}`}
            />
          </div>
        </div>

        <button 
          disabled={!!isLoading}
          className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 py-4 text-[12px] font-black uppercase tracking-widest text-white shadow-2xl shadow-blue-500/20 transition-all hover:brightness-110 active:scale-95 disabled:opacity-50"
        >
          {isLoading === 'email' ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>{isLogin ? "Signing In..." : "Creating Account..."}</span>
            </div>
          ) : (
            isLogin ? "Sign In" : "Create Account"
          )}
        </button>

        <div className="flex items-center gap-4 py-2">
          <div className={`h-px flex-1 ${isDarkMode ? "bg-white/5" : "bg-slate-100"}`} />
          <span className={`text-[10px] font-black uppercase tracking-widest ${isDarkMode ? "text-white/10" : "text-slate-300"}`}>Or continue with</span>
          <div className={`h-px flex-1 ${isDarkMode ? "bg-white/5" : "bg-slate-100"}`} />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            type="button"
            onClick={() => handleSocialLogin('github')}
            className={`flex items-center justify-center gap-3 rounded-2xl border py-4 transition-all active:scale-95 ${isDarkMode ? "border-white/5 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50 shadow-sm"}`}
          >
            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/github/github-original.svg" className={`h-5 w-5 ${isDarkMode ? "invert" : ""}`} alt="GitHub" />
            <span className="text-[11px] font-black uppercase tracking-widest opacity-80">GitHub</span>
          </button>
          <button 
            type="button"
            onClick={() => handleSocialLogin('google')}
            className={`flex items-center justify-center gap-3 rounded-2xl border py-4 transition-all active:scale-95 ${isDarkMode ? "border-white/5 bg-white/5 hover:bg-white/10" : "border-slate-200 bg-white hover:bg-slate-50 shadow-sm"}`}
          >
            <img src="https://cdn.jsdelivr.net/gh/devicons/devicon/icons/google/google-original.svg" className="h-5 w-5" alt="Google" />
            <span className="text-[11px] font-black uppercase tracking-widest opacity-80">Google</span>
          </button>
        </div>

        <p className={`text-center text-[11px] font-bold ${isDarkMode ? "text-white/20" : "text-slate-400"}`}>
          {isLogin ? "New to Flux?" : "Already have an account?"}{" "}
          <button 
            type="button"
            onClick={() => { setIsLogin(!isLogin); setError(null); }}
            className="text-blue-500 hover:text-blue-400 underline underline-offset-4 transition-colors font-black"
          >
            {isLogin ? "Create an account" : "Sign in here"}
          </button>
        </p>
      </form>
    </Modal>
  );
}
