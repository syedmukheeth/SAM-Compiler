import React, { useState } from "react";
import Modal from "./Modal";
import { Cpu, Settings, User } from "lucide-react";

export default function SettingsModal({ isOpen, onClose, settings, onSettingsChange }) {
  const [activeTab, setActiveTab] = useState("editor");

  const tabs = [
    { id: "editor",  label: "Editor",  Icon: Settings },
    { id: "account", label: "Account", Icon: User },
    { id: "engine",  label: "Engine",  Icon: Cpu },
  ];

  const handleChange = (key, value) => onSettingsChange({ ...settings, [key]: value });

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="SAM Compiler Settings">
      <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Tab bar */}
        <div style={{
          display: "flex",
          gap: 6,
          padding: 6,
          borderRadius: 14,
          background: "var(--sam-surface-low)",
          border: "1px solid var(--sam-glass-border)",
        }}>
          {tabs.map(({ id, label, Icon }) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                id={`settings-tab-${id}`}
                onClick={() => setActiveTab(id)}
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  padding: "10px 0",
                  borderRadius: 10,
                  border: "none",
                  fontSize: 9,
                  fontWeight: 900,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  background: active ? "var(--sam-accent)" : "transparent",
                  color: active ? "var(--sam-bg)" : "var(--sam-text-dim)",
                  boxShadow: active ? "var(--sam-glow-bloom)" : "none",
                  fontFamily: "var(--font-body)",
                }}
              >
                <Icon size={13} strokeWidth={active ? 3 : 2.5} />
                <span className="hidden sm:inline">{label}</span>
              </button>
            );
          })}
        </div>

        {/* Editor Tab */}
        {activeTab === "editor" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 28, padding: "8px 0" }}>
            {/* Font Size */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "var(--sam-text)", fontFamily: "var(--font-body)", marginBottom: 4, letterSpacing: "-0.01em" }}>Font Size</p>
                <p style={{ fontSize: 10, fontWeight: 500, color: "var(--sam-text-dim)", fontFamily: "var(--font-body)", opacity: 0.8 }}>Editor text size in pixels</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <div style={{ display: "flex", itemsCenter: "center", gap: 4, padding: 4, background: "var(--sam-surface-low)", borderRadius: 10, border: "1px solid var(--sam-glass-border)" }}>
                  {["-", "+"].map((op) => (
                    <button
                      key={op}
                      onClick={() => handleChange("fontSize", op === "-"
                        ? Math.max(10, (settings.fontSize || 14) - 1)
                        : Math.min(32, (settings.fontSize || 14) + 1)
                      )}
                      style={{
                        width: 32, height: 32,
                        borderRadius: 8,
                        border: "none",
                        background: "transparent",
                        color: "var(--sam-text)",
                        cursor: "pointer",
                        fontSize: 18,
                        fontWeight: 900,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        transition: "all 0.2s",
                      }}
                      onMouseEnter={(e) => e.target.style.background = "var(--sam-glass-border)"}
                      onMouseLeave={(e) => e.target.style.background = "transparent"}
                    >{op}</button>
                  ))}
                </div>
                <span style={{ fontSize: 18, fontWeight: 900, color: "var(--sam-accent)", minWidth: 32, textAlign: "center", fontFamily: "var(--font-mono)" }}>
                  {settings.fontSize || 14}
                </span>
              </div>
            </div>

            <div style={{ height: 1, background: "var(--sam-glass-border)", opacity: 0.5 }} />

            {/* Tab Size */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: "var(--sam-text)", fontFamily: "var(--font-body)", marginBottom: 4 }}>Tab Size</p>
                <p style={{ fontSize: 10, fontWeight: 500, color: "var(--sam-text-dim)", fontFamily: "var(--font-body)", opacity: 0.8 }}>Spaces per indentation level</p>
              </div>
              <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 10, background: "var(--sam-surface-low)", border: "1px solid var(--sam-glass-border)" }}>
                {[2, 4, 8].map(size => (
                  <button
                    key={size}
                    onClick={() => handleChange("tabSize", size)}
                    style={{
                      width: 40, height: 32,
                      borderRadius: 7,
                      border: "none",
                      fontSize: 11,
                      fontWeight: 900,
                      cursor: "pointer",
                      transition: "all 0.2s",
                      background: settings.tabSize === size ? "var(--sam-accent)" : "transparent",
                      color: settings.tabSize === size ? "var(--sam-bg)" : "var(--sam-text-dim)",
                      fontFamily: "var(--font-mono)",
                    }}
                  >{size}</button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Account Tab */}
        {activeTab === "account" && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 24, padding: "24px 0" }}>
            <div style={{
              width: 88, height: 88,
              borderRadius: 24,
              background: "var(--sam-accent)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "var(--sam-glow-bloom)",
              fontSize: 36, fontWeight: 900, color: "var(--sam-bg)",
              fontFamily: "var(--font-display)",
              position: "relative",
              overflow: "hidden"
            }}>
              S
              <div style={{ position: "absolute", bottom: -20, right: -20, width: 60, height: 60, borderRadius: "50%", background: "var(--sam-bg)", opacity: 0.1 }} />
            </div>
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 15, fontWeight: 900, color: "var(--sam-text)", fontFamily: "var(--font-display)", marginBottom: 8, letterSpacing: "-0.02em" }}>
                SAM Member Account
              </p>
              <span style={{
                display: "inline-block",
                padding: "6px 16px",
                borderRadius: 30,
                background: "var(--sam-surface-low)",
                border: "1px solid var(--sam-glass-border)",
                fontSize: 9, fontWeight: 950,
                color: "var(--sam-text-dim)",
                textTransform: "uppercase",
                letterSpacing: "0.2em",
                fontFamily: "var(--font-body)",
              }}>Free tier active</span>
            </div>
            <button className="sam-button-primary" style={{
              padding: "14px 36px",
              borderRadius: 12,
              border: "none",
              background: "var(--sam-accent)",
              color: "var(--sam-bg)",
              fontSize: 10, fontWeight: 950,
              textTransform: "uppercase",
              letterSpacing: "0.2em",
              cursor: "pointer",
              transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
              fontFamily: "var(--font-body)",
              boxShadow: "0 10px 30px -5px rgba(0,0,0,0.15)"
            }}
            onMouseEnter={(e) => { e.target.style.transform = "translateY(-2px)"; e.target.style.boxShadow = "0 15px 40px -5px rgba(0,0,0,0.2)"; }}
            onMouseLeave={(e) => { e.target.style.transform = "translateY(0)"; e.target.style.boxShadow = "0 10px 30px -5px rgba(0,0,0,0.15)"; }}
            >
              Get SAM Pro Access
            </button>
          </div>
        )}

        {/* Engine Tab */}
        {activeTab === "engine" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{
              padding: 24,
              borderRadius: 20,
              background: "var(--sam-surface-low)",
              border: "1px solid var(--sam-glass-border)",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                <div style={{ 
                  width: 10, height: 10, borderRadius: "50%", 
                  background: "var(--sam-accent)", 
                  animation: "sam-pulse 2s infinite" 
                }} />
                <span style={{ fontSize: 11, fontWeight: 900, color: "var(--sam-text)", textTransform: "uppercase", letterSpacing: "0.25em", fontFamily: "var(--font-body)" }}>
                  SAM Node v1.2 Engine
                </span>
              </div>
              {[
                ["Cloud Grid", "SAM-Global-Vercel"],
                ["Resource Max", "2 Core • 2GB RAM"],
                ["Sandbox Iso", "Docker Runtime"],
                ["Engine Status", "OPTIMIZED"],
              ].map(([label, value]) => (
                <div key={label} style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, alignItems: "center" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "var(--sam-text-dim)", fontFamily: "var(--font-body)", textTransform: "uppercase", letterSpacing: "0.15em", opacity: 0.6 }}>{label}</span>
                  <span style={{ fontSize: 10, color: "var(--sam-text)", fontFamily: "var(--font-mono)", fontWeight: 800, background: "var(--sam-glass-border)", padding: "4px 8px", borderRadius: 6 }}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
