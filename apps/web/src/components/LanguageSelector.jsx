import React, { useState, useRef, useEffect } from "react";

const languages = [
  { id: "cpp", label: "C++", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg" },
  { id: "python", label: "Python", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" },
  { id: "javascript", label: "JavaScript", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" },
  { id: "java", label: "Java", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" },
  { id: "go", label: "Go", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg" }
];

export default function LanguageSelector({ activeLanguage, onLanguageChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  const selectedLang = languages.find((l) => l.id === activeLanguage) || languages[0];

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium transition-all hover:bg-white/10"
      >
        <img src={selectedLang.icon} alt={selectedLang.label} className="h-4 w-4" />
        <span>{selectedLang.label}</span>
        <svg
          className={`h-4 w-4 transition-transform ${isOpen ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-48 overflow-hidden rounded-2xl border border-white/10 bg-[#0f141e] shadow-2xl backdrop-blur-3xl z-50">
          {languages.map((lang) => (
            <button
              key={lang.id}
              onClick={() => {
                onLanguageChange(lang.id);
                setIsOpen(false);
              }}
              className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-white/5 ${
                activeLanguage === lang.id ? "bg-white/10 text-blue-400" : "text-white/60"
              }`}
            >
              <img src={lang.icon} alt={lang.label} className="h-4 w-4" />
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
