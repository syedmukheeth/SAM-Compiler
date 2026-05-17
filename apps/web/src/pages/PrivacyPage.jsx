import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Shield } from "lucide-react";

export default function PrivacyPage() {
  return (
    <div className="relative min-h-screen w-full overflow-y-auto bg-sam-bg p-6 font-sans text-sam-text selection:bg-sam-text/10 md:p-20">
      <div className="bg-mesh opacity-20" />
      
      <div className="relative z-10 mx-auto max-w-3xl">
        <header className="mb-12 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="group flex h-10 w-10 items-center justify-center rounded-xl border border-sam-glass-border bg-sam-text/5 transition-all hover:bg-sam-text/10">
              <ArrowLeft className="h-5 w-5 text-sam-text-muted transition-colors group-hover:text-sam-text" />
            </Link>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-sam-text">Privacy Policy</h1>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sam-text-muted">Last updated: April 2026</p>
            </div>
          </div>
          <Shield className="h-8 w-8 text-sam-text-muted" />
        </header>

        <section className="space-y-10 text-sm leading-relaxed text-sam-text-dim">
          <div>
            <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[var(--sam-accent)]">1. Information Collection</h2>
            <p>
              SAM Compiler (&quot;we&quot;, &quot;our&quot;, or &quot;us&quot;) collects minimal personal information necessary to provide our services. This includes your email address, name, and workspace configurations when you create an account. For social logins (Google, GitHub), we receive profile data authorized by the provider.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[var(--sam-accent)]">2. Code Execution & Data</h2>
            <p>
              When you execute code via the SAM engine, your source code is temporarily transmitted to our secure execution clusters. We utilize military-grade sandboxing (gVisor) to ensure isolation. Your code is not stored permanently on execution workers and is handled in accordance with industry security standards.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[var(--sam-accent)]">3. AI Integration</h2>
            <p>
              SAM AI (powered by Google Gemini) processes code snippets for analysis and refactoring. Data sent to AI models is anonymized where possible. By using the AI features, you acknowledge that your input may be processed by third-party AI providers in compliance with their privacy policies.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[var(--sam-accent)]">4. Cookies & Tracking</h2>
            <p>
              We use essential cookies for user authentication and session persistence. We may use lightweight, privacy-focused analytics to improve platform performance. You can manage cookie preferences via our consent banner.
            </p>
          </div>

          <div>
            <h2 className="mb-4 text-xs font-black uppercase tracking-[0.2em] text-[var(--sam-accent)]">5. Security</h2>
            <p>
              We implement robust security measures including JWT encryption, rate limiting, and execution isolation to protect your data. However, no internet-based service can be guaranteed 100% secure.
            </p>
          </div>

          <div className="border-t border-sam-glass-border pt-10">
            <p className="text-xs italic text-sam-text-muted text-center">
              For privacy-related inquiries, contact <span className="text-sam-text-muted font-bold">legal@sam-compiler.io</span>
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
