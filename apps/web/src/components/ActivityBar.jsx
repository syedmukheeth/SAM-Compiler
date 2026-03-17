import React from "react";

const languages = [
  { id: "cpp", label: "C++", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/cplusplus/cplusplus-original.svg" },
  { id: "python", label: "Python", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/python/python-original.svg" },
  { id: "javascript", label: "JS", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/javascript/javascript-original.svg" },
  { id: "java", label: "Java", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/java/java-original.svg" },
  { id: "go", label: "Go", icon: "https://cdn.jsdelivr.net/gh/devicons/devicon/icons/go/go-original.svg" }
];

export default function ActivityBar({ activeLanguage, onLanguageChange }) {
  return (
    <div className="flux-glass m-4 flex w-[70px] flex-col items-center rounded-3xl py-6 shadow-2xl">
      <div className="mb-8 flex h-10 w-10 animate-pulse items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/20">
        <span className="text-sm font-black text-white">L</span>
      </div>
      
      <div className="flex flex-1 flex-col gap-4">
        {languages.map((lang) => {
          const active = lang.id === activeLanguage;
          return (
            <button
              key={lang.id}
              onClick={() => onLanguageChange?.(lang.id)}
              className="group relative flex h-12 w-12 items-center justify-center"
            >
              {active && (
                <div className="absolute inset-0 animate-glow rounded-xl bg-blue-500/10" />
              )}
              <img
                src={lang.icon}
                alt={lang.label}
                className={[
                  "z-10 h-6 w-6 transition-all duration-500 ease-out group-hover:scale-125 group-hover:rotate-6",
                  active ? "scale-110 grayscale-0 brightness-110" : "opacity-40 grayscale group-hover:opacity-80 group-hover:grayscale-0"
                ].join(" ")}
              />
              {active && (
                <div className="absolute -right-2 h-1 w-1 rounded-full bg-blue-400 shadow-[0_0_10px_#60a5fa]" />
              )}
            </button>
          );
        })}
      </div>

      <button className="mt-auto text-white/20 transition-colors hover:text-white/60">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );
}

