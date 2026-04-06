import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { fetchHistory } from "../services/codeExecutionApi";
import { Clock, X, ChevronRight, RefreshCw, Code2, CheckCircle2, XCircle, Loader2, AlertCircle } from "lucide-react";

const LANG_COLORS = {
  cpp:        { bg: "rgba(0,112,243,0.15)",  border: "rgba(0,112,243,0.4)",  label: "C++" },
  c:          { bg: "rgba(85,170,255,0.12)", border: "rgba(85,170,255,0.35)", label: "C"   },
  python:     { bg: "rgba(255,212,0,0.12)",  border: "rgba(255,212,0,0.35)", label: "Python" },
  javascript: { bg: "rgba(240,219,79,0.12)", border: "rgba(240,219,79,0.35)", label: "JS" },
  java:       { bg: "rgba(255,100,50,0.12)", border: "rgba(255,100,50,0.35)", label: "Java" },
};

function StatusBadge({ status }) {
  if (status === "succeeded") return (
    <span className="flex items-center gap-1" style={{ color: "#10b981", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" }}>
      <CheckCircle2 size={10} /> OK
    </span>
  );
  if (status === "failed") return (
    <span className="flex items-center gap-1" style={{ color: "#ff3b3b", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" }}>
      <XCircle size={10} /> ERR
    </span>
  );
  return (
    <span className="flex items-center gap-1" style={{ color: "var(--sam-text-dim)", fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.12em" }}>
      <Loader2 size={10} className="animate-spin" /> {status}
    </span>
  );
}

function timeAgo(dateStr) {
  if (!dateStr) return "just now";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function HistoryPanel({ isOpen, onClose, theme, onLoadCode, token }) {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);

  const isDark = theme === "dark";

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await fetchHistory();
      setRuns(data);
    } catch (e) {
      setError("Failed to load run history.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const handleLoadCode = (run) => {
    const runtime = run.runtime || "cpp";
    const code = run.files?.[0]?.content || "";
    onLoadCode?.(runtime, code);
    onClose?.();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: "fixed", inset: 0, zIndex: 80,
              background: isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.25)",
              backdropFilter: "blur(4px)",
            }}
          />

          {/* Panel */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 300 }}
            style={{
              position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 90,
              width: "min(460px, 100vw)",
              display: "flex", flexDirection: "column",
              background: isDark ? "rgba(8,8,12,0.97)" : "rgba(255,255,255,0.97)",
              borderLeft: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.08)"}`,
              backdropFilter: "blur(40px)",
              boxShadow: isDark ? "-24px 0 80px rgba(0,0,0,0.6)" : "-24px 0 80px rgba(0,0,0,0.1)",
            }}
          >
            {/* Header */}
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "20px 24px 16px",
              borderBottom: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10,
                  background: isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
                }}>
                  <Clock size={14} style={{ color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.5)" }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: isDark ? "#fff" : "#0f172a", fontFamily: "var(--font-body)", letterSpacing: "0.01em" }}>
                    Run History
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                    {runs.length > 0 ? `${runs.length} runs` : "your compiled sessions"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={load}
                  disabled={loading}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                    background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                    color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s",
                  }}
                  title="Refresh history"
                >
                  <RefreshCw size={12} style={{ animation: loading ? "spin 0.8s linear infinite" : "none" }} />
                </button>
                <button
                  onClick={onClose}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                    background: isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.04)",
                    color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)",
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "all 0.2s",
                  }}
                >
                  <X size={13} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "12px 16px 80px" }}>

              {!token && (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  height: 280, gap: 14, textAlign: "center", padding: "0 32px",
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
                    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <AlertCircle size={20} style={{ color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)" }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)", fontFamily: "var(--font-body)" }}>
                    Sign in to see history
                  </div>
                  <div style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)", fontFamily: "var(--font-body)", lineHeight: 1.6 }}>
                    Your compiled code runs are saved when you're logged in.
                  </div>
                </div>
              )}

              {token && loading && runs.length === 0 && (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 200, gap: 12 }}>
                  <Loader2 size={20} style={{ color: isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.25)", animation: "spin 0.8s linear infinite" }} />
                  <span style={{ fontSize: 11, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.25)" : "rgba(0,0,0,0.25)", textTransform: "uppercase", letterSpacing: "0.15em" }}>
                    Loading runs...
                  </span>
                </div>
              )}

              {token && !loading && error && (
                <div style={{
                  margin: "12px 0", padding: "14px 16px", borderRadius: 12,
                  background: "rgba(255,59,59,0.08)", border: "1px solid rgba(255,59,59,0.2)",
                  color: "#ff3b3b", fontSize: 11, fontWeight: 700, fontFamily: "var(--font-body)",
                }}>
                  {error}
                </div>
              )}

              {token && !loading && runs.length === 0 && !error && (
                <div style={{
                  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
                  height: 280, gap: 14, textAlign: "center", padding: "0 32px",
                }}>
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, border: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
                    background: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.03)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Code2 size={20} style={{ color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)" }} />
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.4)", fontFamily: "var(--font-body)" }}>
                    No runs yet
                  </div>
                  <div style={{ fontSize: 11, color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)", fontFamily: "var(--font-body)", lineHeight: 1.6 }}>
                    Run some code and it will appear here. Each execution is saved to your history.
                  </div>
                </div>
              )}

              {runs.map((run, idx) => {
                const lang = run.runtime || "cpp";
                const langMeta = LANG_COLORS[lang] || LANG_COLORS.cpp;
                const isOpen_ = expanded === idx;
                const code = run.files?.[0]?.content || "";
                const preview = code.split("\n").slice(0, 4).join("\n");
                const hasOutput = run.stdout || run.stderr;

                return (
                  <motion.div
                    key={run._id || idx}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    style={{
                      marginBottom: 10,
                      borderRadius: 14,
                      border: `1px solid ${isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}`,
                      background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      overflow: "hidden",
                      transition: "border-color 0.2s",
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.12)"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = isDark ? "rgba(255,255,255,0.07)" : "rgba(0,0,0,0.07)"}
                  >
                    {/* Run Header Row */}
                    <div
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", cursor: "pointer" }}
                      onClick={() => setExpanded(isOpen_ ? null : idx)}
                    >
                      {/* Lang Badge */}
                      <div style={{
                        padding: "3px 8px", borderRadius: 6, fontSize: 9, fontWeight: 800,
                        textTransform: "uppercase", letterSpacing: "0.15em",
                        background: langMeta.bg, border: `1px solid ${langMeta.border}`,
                        color: isDark ? "rgba(255,255,255,0.8)" : "rgba(0,0,0,0.6)",
                        fontFamily: "var(--font-body)", whiteSpace: "nowrap",
                      }}>
                        {langMeta.label}
                      </div>

                      {/* Code preview */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 10, fontWeight: 600, fontFamily: "var(--font-mono)",
                          color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.5)",
                          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
                          lineHeight: 1.3,
                        }}>
                          {run.title || code.split("\n")[0] || "// empty"}
                        </div>
                        <div style={{ fontSize: 9, color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.3)", marginTop: 2, fontFamily: "var(--font-body)", fontWeight: 600, letterSpacing: "0.08em" }}>
                          {timeAgo(run.createdAt || run.startedAt)}
                        </div>
                      </div>

                      {/* Status + Chevron */}
                      <StatusBadge status={run.status} />
                      <ChevronRight
                        size={13}
                        style={{
                          color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
                          transform: isOpen_ ? "rotate(90deg)" : "none",
                          transition: "transform 0.2s",
                          flexShrink: 0,
                        }}
                      />
                    </div>

                    {/* Expandable Body */}
                    <AnimatePresence>
                      {isOpen_ && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22 }}
                          style={{ overflow: "hidden" }}
                        >
                          <div style={{
                            borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
                            padding: "12px 14px",
                            display: "flex", flexDirection: "column", gap: 10,
                          }}>
                            {/* Code block */}
                            <div style={{
                              background: isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.04)",
                              border: `1px solid ${isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"}`,
                              borderRadius: 10, padding: "10px 12px", position: "relative",
                            }}>
                              <div style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)", marginBottom: 8 }}>
                                Code
                              </div>
                              <pre style={{
                                margin: 0, fontSize: 10, fontFamily: "var(--font-mono)", lineHeight: 1.6,
                                color: isDark ? "rgba(255,255,255,0.65)" : "rgba(0,0,0,0.6)",
                                whiteSpace: "pre-wrap", wordBreak: "break-all",
                                maxHeight: 120, overflowY: "auto",
                              }}>
                                {preview}{code.split("\n").length > 4 ? `\n...` : ""}
                              </pre>
                            </div>

                            {/* Output block */}
                            {hasOutput && (
                              <div style={{
                                background: isDark ? "rgba(0,0,0,0.4)" : "rgba(0,0,0,0.04)",
                                border: `1px solid ${run.stderr ? "rgba(255,59,59,0.15)" : isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.07)"}`,
                                borderRadius: 10, padding: "10px 12px",
                              }}>
                                <div style={{ fontSize: 8, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em", color: run.stderr ? "rgba(255,59,59,0.5)" : isDark ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.25)", marginBottom: 8 }}>
                                  {run.stderr ? "Error Output" : "Output"}
                                </div>
                                <pre style={{
                                  margin: 0, fontSize: 10, fontFamily: "var(--font-mono)", lineHeight: 1.6,
                                  color: run.stderr ? "#ff3b3b" : isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",
                                  whiteSpace: "pre-wrap", wordBreak: "break-all",
                                  maxHeight: 80, overflowY: "auto",
                                }}>
                                  {(run.stderr || run.stdout || "").slice(0, 400)}
                                </pre>
                              </div>
                            )}

                            {/* Meta row */}
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <div style={{ fontSize: 9, color: isDark ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.3)", fontFamily: "var(--font-body)", fontWeight: 600 }}>
                                {run.metrics?.duration ? `${run.metrics.duration}ms` : ""}
                                {run.exitCode !== null && run.exitCode !== undefined ? ` · exit ${run.exitCode}` : ""}
                              </div>
                              <button
                                onClick={() => handleLoadCode(run)}
                                style={{
                                  padding: "6px 14px", borderRadius: 8, border: "1px solid var(--sam-accent)",
                                  background: "transparent", color: "var(--sam-accent)",
                                  fontSize: 9, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.15em",
                                  cursor: "pointer", fontFamily: "var(--font-body)",
                                  transition: "all 0.2s",
                                }}
                                onMouseEnter={e => { e.currentTarget.style.background = "var(--sam-accent)"; e.currentTarget.style.color = "var(--sam-bg)"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--sam-accent)"; }}
                              >
                                Load into editor
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>

          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </>
      )}
    </AnimatePresence>
  );
}
