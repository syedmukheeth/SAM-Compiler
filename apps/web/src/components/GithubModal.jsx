import React, { useState, useEffect } from "react";
import Modal from "./Modal";
import { ExternalLink, GitBranch, Github } from "lucide-react";

export function GithubModal({ isOpen, onClose, code, isDarkMode, filename = "solution.txt", user, authToken }) {
  const [repos, setRepos] = useState([]);
  const [repo, setRepo] = useState(localStorage.getItem("gh_repo") || "");
  const [branch, setBranch] = useState(localStorage.getItem("gh_branch") || "main");
  const [path, setPath] = useState(filename);
  const [message, setMessage] = useState(`Update ${filename} via LiquidIDE`);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState(null);
  const [resultUrl, setResultUrl] = useState(null);
  const [loadingRepos, setLoadingRepos] = useState(false);

  const isConnected = !!user?.githubToken;

  // Sync path and message when filename changes
  useEffect(() => {
    setPath(filename);
    setMessage(`Update ${filename} via LiquidIDE`);
  }, [filename]);

  // Fetch repositories
  useEffect(() => {
    if (isOpen && isConnected && authToken) {
      const fetchRepos = async () => {
        setLoadingRepos(true);
        try {
          const res = await fetch("/api/github/repos", {
            headers: { "Authorization": `Bearer ${authToken}` }
          });
          if (res.ok) {
            const data = await res.json();
            setRepos(data);
          }
        } catch (err) {
          console.error("Failed to fetch repos", err);
        } finally {
          setLoadingRepos(false);
        }
      };
      fetchRepos();
    }
  }, [isOpen, isConnected, authToken]);

  const onPush = async () => {
    if (!repo.trim()) {
      setError("Repository name is required");
      return;
    }

    setStatus("Pushing...");
    setError(null);
    setResultUrl(null);
    localStorage.setItem("gh_repo", repo);
    localStorage.setItem("gh_branch", branch);

    try {
      const res = await fetch("/api/github/push", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`
        },
        body: JSON.stringify({ 
          repo, 
          path, 
          content: code, 
          message,
          branch 
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatus("Success!");
        setResultUrl(data.url);
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
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400/80 mb-0.5">Authorizing As</p>
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Repository</label>
              <div className="relative">
                <input
                  type="text"
                  list="repo-list"
                  value={repo}
                  onChange={(e) => {
                    const val = e.target.value;
                    setRepo(val);
                    const selected = repos.find(r => r.name === val || r.full_name === val);
                    if (selected) setBranch(selected.default_branch);
                  }}
                  placeholder="Select or type repository..."
                  className="w-full rounded-xl border border-white/5 bg-white/5 px-4 py-3 text-[13px] text-white outline-none focus:border-blue-500/50"
                />
                <datalist id="repo-list">
                  {repos.map(r => (
                    <option key={r.full_name} value={r.full_name}>
                      {r.private ? "🔒 " : "🌐 "}{r.name}
                    </option>
                  ))}
                </datalist>
                {loadingRepos && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="h-3 w-3 animate-spin rounded-full border border-white/20 border-t-white" />
                  </div>
                )}
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Branch</label>
              <div className="relative">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20">
                  <GitBranch size={14} />
                </div>
                <input
                  type="text"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  placeholder="main"
                  className="w-full rounded-xl border border-white/5 bg-white/5 pl-9 pr-4 py-3 text-[13px] text-white outline-none focus:border-blue-500/50"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="space-y-1">
               <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Commit Type</label>
               <select 
                onChange={(e) => setMessage(prev => `${e.target.value}: ${prev.split(': ').pop()}`)}
                className="w-full rounded-xl border border-white/5 bg-white/5 px-3 py-3 text-[11px] font-bold text-white/60 outline-none focus:border-blue-500/50 appearance-none"
               >
                 <option value="feat">Feature (feat)</option>
                 <option value="fix">Fix (fix)</option>
                 <option value="docs">Docs (docs)</option>
                 <option value="chore">Chore (chore)</option>
               </select>
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

        {status === "Success!" && resultUrl ? (
          <div className="space-y-3">
             <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 py-4 text-[11px] font-black uppercase tracking-widest text-emerald-500 border border-emerald-500/20 animate-in zoom-in duration-300">
               <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-black">✓</span>
               Sync Successful
             </div>
             <a 
              href={resultUrl} 
              target="_blank" 
              rel="noopener noreferrer"
              className="group flex items-center justify-center gap-2 w-full py-4 text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-white transition-all animate-in slide-in-from-top-2 duration-500"
             >
               Open on GitHub
               <ExternalLink size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
             </a>
          </div>
        ) : (
          <button
            onClick={onPush}
            disabled={status === "Pushing..." || !isConnected}
            className={`liquid-button-primary w-full py-4 text-[11px] font-black uppercase tracking-widest animate-shimmer ${!isConnected ? "opacity-30 cursor-not-allowed" : ""}`}
          >
            {status === "Pushing..." ? (
              <div className="flex items-center justify-center gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                <span>Syncing with GitHub...</span>
              </div>
            ) : (
              "Push to Repository"
            )}
          </button>
        )}
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
