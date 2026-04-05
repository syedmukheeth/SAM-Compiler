<div align="center">
  <img alt="SAM Compiler Logo" src="https://raw.githubusercontent.com/syedmukheeth/SAM-Compiler/main/apps/web/public/favicon.svg" width="120">
  <br>
  <h1>SAM Compiler - The Monolith Kernel</h1>
  <p><b>An Enterprise-Grade, Multi-Language Cloud IDE & Execution Sandbox</b></p>

  <p>
    <a href="https://sam-compiler-web.vercel.app/" target="_blank">
      <img src="https://img.shields.io/badge/LIVE--DEMO-OBSIDIAN-black?style=for-the-badge&logo=vercel" alt="Live Demo">
    </a>
    <img src="https://img.shields.io/badge/Architecture-Distributed--Core-black?style=for-the-badge" alt="Architecture">
    <img src="https://img.shields.io/badge/Security-gVisor--Hardened-black?style=for-the-badge&logo=docker" alt="Security">
  </p>

  <i>"Precision engineering meets absolute minimalism. Built for impact, designed for the modern polyglot."</i>
</div>

---

## 🎯 At a Glance
**SAM (Syntax Analysis Machine)** is a high-performance, web-based code compiler and collaborative editor. It completely decouples the user interface from backend code execution, resulting in zero-lag typing combined with secure, server-side compilation.

- ⚡ **Zero-Setup Execution:** Run C++, C, Java, Python, and Node.js instantly in your browser.
- 🤖 **Context-Aware AI Assistant:** Integrated Gemini Pro AI that can view your code, find bugs, and auto-refactor.
- 🛡️ **Military-Grade Isolation:** All code runs inside secure `gVisor` containers, protecting the server.
- 🔄 **Real-Time Collaboration:** Edit code simultaneously with teammates with zero lockstep lag.
- 💾 **Global State Persistence:** Your code, history, and active sessions are saved automatically to the cloud.

---

## 📖 The Problem vs. The Solution

### ❌ The Problem
* **Latency Bottlenecks:** Traditional Cloud IDEs feel sluggish because they block the UI while waiting for the server.
* **Race Conditions:** Multiple users typing at once causes massive state conflicts and code deletions.
* **Security Vulnerabilities:** Executing untrusted user code (like endless Python `while` loops) crashes backend servers.
* **Complex Auth Protocols:** Cross-domain setups (Vercel Frontend + AWS Backend) break due to 3rd-party cookie blocking.

### ✅ The SAM Solution
* **Micro-Frontend Architecture:** The UI explicitly renders on Vercel's Edge network for instant 60FPS responsiveness, while heavy compilation is piped to an Express monolith.
* **CRDT Integration:** We use **Conflict-free Replicated Data Types (CRDTs)** via the Yjs Engine. This mathematically guarantees real-time text merging without overwriting other users.
* **Hard Resource Quotas:** Every execution runs in a Dockerized Piston environment strictly capped at **128MB RAM** and **0.5 vCPUs**. Endless loops are automatically killed.
* **Passport.js OAuth Bridge:** A custom bridging protocol allows secure Google/GitHub Single Sign-On (SSO) without relying on blocked cross-site cookies.

---

## 🛠️ The Tech Stack Arsenal

### 🌐 Edge Frontend Layer
* **React 18 & Vite:** For lightning-fast hot reloading and UI rendering.
* **TailwindCSS & Framer Motion:** For the "Obsidian Monolith" design system and 60FPS hardware-accelerated animations.
* **Monaco Editor:** The exact same internal engine that powers Microsoft VS Code, providing intelligent syntax highlighting and autocomplete.
* **XTerm.js:** For rendering a genuine, high-fidelity terminal interface in the browser.
* **Socket.io Client:** Maintains persistent, bi-directional WebSockets for streaming terminal outputs live.

### ⚙️ Control Plane & Kernel (Backend)
* **Node.js & Express.js:** The monolithic routing and API gateway.
* **Passport.js:** Hands-free session validation and OAuth strategies (Google/GitHub).
* **Piston Execution Engine:** Highly-scalable, Docker-based code runner API.
* **MongoDB Atlas + Mongoose ODM:** The global data lake for storing user profiles, execution histories, and environment states.

---

## 🎨 Interface & Capabilities

> **Screenshot Placement:** *Ensure your 5 screenshots are uploaded to `docs/assets/` in your repository to show here!*

<div align="center">
  <h3>The Dual-Themed Editor</h3>
  <img src="docs/assets/editor-dark.png" alt="SAM Compiler - Dark Mode IDE" width="48%" style="border-radius:12px; border: 1px solid #333; margin-right: 1%;">
  <img src="docs/assets/editor-light.png" alt="SAM Compiler - Light Mode IDE" width="48%" style="border-radius:12px; border: 1px solid #ccc;">
</div>
<br>
<div align="center">
  <h3>Deep System Integration</h3>
  <img src="docs/assets/ai-panel.png" alt="Sam AI Output Panel" width="32%" style="border-radius:12px; border: 1px solid #333;">
  <img src="docs/assets/history.png" alt="Persistent Global History" width="32%" style="border-radius:12px; border: 1px solid #333; margin: 0 1%;">
  <img src="docs/assets/shortcuts.png" alt="Terminal Command Shortcuts" width="32%" style="border-radius:12px; border: 1px solid #333;">
</div>

---

## 🏛️ System Node Topology

```mermaid
graph TD
    subgraph "Interface (Vercel Edge)"
        UI[React 18 / Monaco] -->|CRDT State| CRDT[Yjs Engine WebRTC]
        UI -->|IO Multiplexing| Term[XTerm.js Buffer]
    end

    subgraph "Control Plane (Render Monolith)"
        API[Express Gateway] -->|Verification| OAuth[Google / GitHub]
        API -->|Task Orchestration| Queue[Event Loop / Throttler]
        CRDT -->|Recovery Backup| DB[(MongoDB Atlas)]
    end

    subgraph "Isolated Execution"
        Queue -->|Execute| Docker[Piston Runtime Sandbox]
        Docker -->|Binary Eval| Bin[stdout / stderr Pipe]
        AI[Gemini Pro] -->|Syntax Evaluation| UI
    end
```

---

## 💼 Engineer & Architect
**[Syed Mukheeth](https://linkedin.com/in/syedmukheeth)**

<div align="center">
  <br>
  <img src="https://img.shields.io/badge/License-MIT-black.svg?style=for-the-badge" alt="License">
  <br>
  <sub>v3.0.0-OBSIDIAN | Compiled in 2026</sub>
</div>
