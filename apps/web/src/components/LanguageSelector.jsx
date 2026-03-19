import React, { useState, useRef, useEffect } from "react";

const languages = [
  { id: "cpp", label: "C++", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg" },
  { id: "c", label: "C", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/c/c-original.svg" },
  { id: "python", label: "Python", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" },
  { id: "javascript", label: "JavaScript", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" },
  { id: "java", label: "Java", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" }
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
        className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/5 px-4 py-1.5 transition-all hover:bg-white/10 hover:border-white/20 active:scale-95 group shadow-lg backdrop-blur-3xl"
      >
        <div className="relative h-4 w-4 transition-transform group-hover:scale-110">
          <img src={selectedLang.icon} alt={selectedLang.label} className="h-full w-full object-contain filter grayscale-[0.5] group-hover:grayscale-0 transition-all" />
        </div>
        <span className="text-[11px] font-bold tracking-tight text-white/70 group-hover:text-white transition-colors">{selectedLang.label}</span>
        <svg
          className={`h-3 w-3 text-white/20 transition-all duration-300 ${isOpen ? "rotate-180 text-blue-500" : "group-hover:text-white/40"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-3 w-48 overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-3xl z-50 animate-in fade-in duration-300">
          <div className="p-2 space-y-0.5">
            {languages.map((lang) => (
              <button
                key={lang.id}
                onClick={() => {
                  onLanguageChange(lang.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center gap-3 px-3 py-2 rounded-lg text-left transition-all hover:bg-white/5 group ${
                  activeLanguage === lang.id ? "bg-blue-500/10 text-blue-400" : "text-white/40 hover:text-white/80"
                }`}
              >
                <div className={`h-5 w-5 rounded-md p-0.5 transition-all ${activeLanguage === lang.id ? "bg-blue-500/20" : "bg-white/5 group-hover:bg-white/10"}`}>
                   <img src={lang.icon} alt={lang.label} className="h-full w-full object-contain" />
                </div>
                <span className="text-[11px] font-bold tracking-tight">{lang.label}</span>
                {activeLanguage === lang.id && (
                  <div className="ml-auto h-1 w-1 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
