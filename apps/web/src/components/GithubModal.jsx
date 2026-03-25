import React, { useState } from "react";
import Modal from "./Modal";

export function GithubModal({ isOpen, onClose, code, isDarkMode, filename = "solution.txt", user }) {
  const [token, setToken] = useState(localStorage.getItem("gh_token") || "");
  const [repo, setRepo] = useState(localStorage.getItem("gh_repo") || "");
  const [path, setPath] = useState(filename);
  const [message, setMessage] = useState(`Update ${filename} via LiquidIDE`);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState(null);

  const isConnected = !!user?.githubToken;

  // Sync path and message when filename changes
  React.useEffect(() => {
    setPath(filename);
    setMessage(`Update ${filename} via LiquidIDE`);
  }, [filename]);

  const onPush = async () => {
    setStatus("Pushing...");
    setError(null);
    localStorage.setItem("gh_token", token);
    localStorage.setItem("gh_repo", repo);
    localStorage.setItem("gh_path", path);

    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, repo, path, content: code, message }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatus("Success!");
        setTimeout(() => onClose(), 2000);
      } else {
        setError(data.message || "Failed to push to GitHub");
        setStatus("Failed");
      }
    } catch (err) {
      setError(err.message);
      setStatus("Failed");
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Push to GitHub" isDarkMode={isDarkMode}>
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-4">
          {!isConnected && (
            <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-6 text-center animate-in fade-in duration-500">
               <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-blue-400">
                 <GithubLogo />
               </div>
               <h3 className="mb-2 text-sm font-black uppercase tracking-tight text-white">GitHub Integration</h3>
               <p className="mb-6 text-[11px] font-bold leading-relaxed text-white/40 px-4">Link your GitHub account to directly push code to your repositories from LiquidIDE.</p>
               <button 
                onClick={() => window.location.href = "/api/auth/github"}
                className="liquid-button-primary w-full py-3 text-[10px] font-black uppercase tracking-widest"
               >
                Connect GitHub Account
              </button>
            </div>
          )}
          
          {isConnected && (
            <div className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 mb-2">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 shadow-inner">
                <GithubLogo />
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400/80 mb-0.5">Pushing directly As</p>
                <p className="text-[13px] font-bold text-white">@{user.githubUsername}</p>
              </div>
              <button 
                onClick={() => window.location.href = "/api/auth/github"}
                className="rounded-lg bg-white/5 px-3 py-1.5 text-[10px] font-bold text-white/40 hover:bg-white/10 hover:text-white transition-all"
                title="Change Account"
              >
                Switch
              </button>
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Repository Name</label>
              <input
                type="text"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="my-cool-repo"
                className="w-full rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[13px] text-white outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40">File Path</label>
              <input
                type="text"
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="src/main.py"
                className="w-full rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[13px] text-white outline-none focus:border-blue-500/50"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Commit Message</label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[13px] text-white outline-none focus:border-blue-500/50"
            />
          </div>
        </div>

        {error && <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-4 text-[11px] font-bold text-rose-500">{error}</div>}

        <button
          onClick={onPush}
          disabled={status === "Pushing..."}
          className="liquid-button-primary w-full py-4 text-[11px] font-black uppercase tracking-widest animate-shimmer"
        >
          {status === "Pushing..." ? (
            <div className="flex items-center justify-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <span>Sycing with GitHub...</span>
            </div>
          ) : (
            "Push to Repository"
          )}
        </button>
      </div>
    </Modal>
  );
}
export function GithubLogo() {
  return (
    <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/>
    </svg>
  );
}
