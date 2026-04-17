import React, { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";

const languages = [
  { id: "cpp",        label: "C++",        icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg" },
  { id: "c",          label: "C",          icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg" },
  { id: "python",     label: "Python",     icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" },
  { id: "javascript", label: "JavaScript", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" },
  { id: "java",       label: "Java",       icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" },
];

const LanguageSelector = ({ activeLanguage, onLanguageChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);
  const selectedLang = languages.find((l) => l.id === activeLanguage) || languages[0];

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        id="language-selector-btn"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 14px",
          borderRadius: 8,
          border: "1px solid var(--sam-glass-border)",
          background: "var(--sam-accent-muted)",
          transition: "all 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--sam-surface-high)";
          e.currentTarget.style.borderColor = "var(--sam-text-dim)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--sam-accent-muted)";
          e.currentTarget.style.borderColor = "var(--sam-glass-border)";
        }}
      >
        <img
          src={selectedLang.icon}
          alt={selectedLang.label}
          style={{ width: 14, height: 14, objectFit: "contain", flexShrink: 0, opacity: 0.9 }}
        />
        <span style={{
          fontSize: 10,
          fontWeight: 900,
          color: "var(--sam-text)",
          textTransform: "uppercase",
          letterSpacing: "0.15em",
          fontFamily: "var(--font-body)",
        }}>
          {selectedLang.label}
        </span>
        <ChevronDown
          size={12}
          style={{
            color: "var(--sam-text-dim)",
            transform: isOpen ? "rotate(180deg)" : "none",
            transition: "transform 0.25s",
          }}
        />
      </button>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            left: 0,
            minWidth: 200,
            borderRadius: 12,
            border: "1px solid var(--sam-glass-border)",
            background: "var(--sam-surface)",
            backdropFilter: "blur(24px)",
            boxShadow: "var(--sam-glow-bloom)",
            zIndex: 60,
            padding: 6,
            animation: "fadeInDown 0.18s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {languages.map((lang) => {
            const isActive = activeLanguage === lang.id;
            return (
              <button
                key={lang.id}
                id={`lang-option-${lang.id}`}
                onClick={() => { onLanguageChange(lang.id); setIsOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: isActive ? "var(--sam-accent-muted)" : "transparent",
                  color: isActive ? "var(--sam-text)" : "var(--sam-text-dim)",
                  cursor: "pointer",
                  transition: "all 0.2s",
                  textAlign: "left",
                  fontFamily: "var(--font-body)",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "var(--sam-surface-high)";
                    e.currentTarget.style.color = "var(--sam-text)";
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = "var(--sam-text-dim)";
                  }
                }}
              >
                <img src={lang.icon} alt={lang.label} style={{ width: 16, height: 16, objectFit: "contain", opacity: isActive ? 1 : 0.6 }} />
                <span style={{ fontSize: 11, fontWeight: isActive ? 800 : 700, textTransform: "uppercase", letterSpacing: "0.1em" }}>{lang.label}</span>
                {isActive && (
                  <div style={{
                    marginLeft: "auto",
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "var(--sam-accent)",
                    boxShadow: "0 0 8px var(--sam-accent)",
                  }} />
                )}
              </button>
            );
          })}
        </div>
      )}

      <style>{`
        @keyframes fadeInDown {
          from { opacity: 0; transform: translateY(-8px); scale: 0.98; }
          to   { opacity: 1; transform: translateY(0); scale: 1; }
        }
      `}</style>
    </div>
  );
};

export default React.memo(LanguageSelector);
