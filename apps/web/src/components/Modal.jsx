import React, { useEffect } from "react";

// Inline SAM logo for modal header (no logo.jpg dependency)
function SamLogoSmall() {
  return (
    <svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="samModalGrad" x1="0" y1="0" x2="36" y2="36">
          <stop offset="0%" stopColor="var(--sam-text)" stopOpacity="1" />
          <stop offset="100%" stopColor="var(--sam-text)" stopOpacity="0.4" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="9" fill="var(--sam-accent)" />
      <path
        d="M22 11.5C20.8 10.5 19.2 10 17.5 10C14.5 10 12 11.8 12 14.2C12 16.4 13.8 17.5 16.5 18.2L17.5 18.5C20.2 19.2 22 20.3 22 22.5C22 25 19.5 26.5 16.8 26.5C14.8 26.5 12.8 25.8 11.5 24.5"
        stroke="var(--sam-bg)"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export default function Modal({ isOpen, onClose, title, children }) {
  useEffect(() => {
    const handleEsc = (e) => { if (e.key === "Escape") onClose(); };
    if (isOpen) window.addEventListener("keydown", handleEsc);
    return () => window.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.4)",
          backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)",
          animation: "fadeIn 0.2s ease",
        }}
      />

      {/* Modal Card */}
      <div
        className="sam-glass"
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 480,
          maxHeight: "90vh",
          borderRadius: 24,
          border: "1px solid var(--sam-glass-border)",
          background: "var(--sam-glass-bg)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          boxShadow: "var(--sam-card-shadow)",
          animation: "slideUp 0.3s cubic-bezier(0.16,1,0.3,1)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 24px",
          background: "var(--sam-surface-low)",
          borderBottom: "1px solid var(--sam-glass-border)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <SamLogoSmall />
            <span style={{
              fontSize: 10,
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.25em",
              color: "var(--sam-text)",
              fontFamily: "var(--font-body)",
              opacity: 0.9
            }}>{title}</span>
          </div>
          <button
            id="modal-close-btn"
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: "1px solid var(--sam-glass-border)",
              background: "transparent",
              color: "var(--sam-text-dim)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--sam-glass-border)"; e.currentTarget.style.color = "var(--sam-text)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--sam-text-dim)"; }}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div style={{ 
          padding: "24px", 
          overflowY: "auto", 
          flex: 1,
          color: "var(--sam-text)",
          fontSize: "14px",
          lineHeight: "1.6"
        }}>
          {children}
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
