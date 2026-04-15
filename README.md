<div align="center">
  <br>
  <a href="https://sam-compiler-web.vercel.app/" target="_blank">
    <img alt="SAM Compiler Logo" src="https://raw.githubusercontent.com/syedmukheeth/SAM-Compiler/main/apps/web/public/dark.svg" width="160">
  </a>
  
  <h1><b>SAM COMPILER</b></h1>
  
  <p><b><code>SYNTAX ANALYSIS MACHINE : DISTRIBUTED KERNEL EDITION</code></b></p>

  <p>
    <i>"Architected for absolute resilience. Engineered for sub-millisecond precision."</i>
  </p>

  <p align="center">
    <img src="https://img.shields.io/github/stars/syedmukheeth/syedmukheeth/Liquid-IDE?style=for-the-badge&color=white&labelColor=black" alt="Stars">
    <img src="https://img.shields.io/badge/Architecture-Distributed-white?style=for-the-badge&labelColor=black" alt="Distributed">
    <img src="https://img.shields.io/badge/Security-Hardened-white?style=for-the-badge&labelColor=black" alt="Hardened">
    <img src="https://img.shields.io/badge/Sync-CRDT_Yjs-white?style=for-the-badge&labelColor=black" alt="Yjs">
  </p>

  <br>

  <h3>
    <a href="https://sam-compiler-web.vercel.app/">► ENTER WORKSPACE</a>
  </h3>
  <br>
</div>

---

## ⚡ THE EVOLUTION OF THE CLOUD IDE

**SAM Compiler** is not just a code runner—it is a **High-Fidelity Distributed Environment** designed to mirror the workflow of Principal Engineers. Borne from the necessity of total execution safety and real-time collaboration, SAM utilizes a **Decoupled Control Plane** to manage safe, containerized code execution across isolated compute nodes.

### 🏆 THE COMPETITIVE EDGE: ARCHITECTURAL SUPERIORITY

SAM is engineered to exceed the limitations of standard web-based compilers through deep-system hardening and distributed orchestration.

| Dimension | The SAM Standard (Elite) | Industry Average (Generic) |
|---|---|---|
| **Architecture** | **Decoupled Control Plane**: Segregated API and Hardened Worker nodes for zero-leak execution. | **Monolithic Spawning**: Code runs on the same process as the API, leading to critical ACE risks. |
| **Data Consistency** | **Mathematical CRDT (Yjs)**: Conflict-free binary state sync with sub-10ms resolution. | **Naive JSON Overwrites**: Prone to race conditions and "Code Soup" during collaboration. |
| **Isolation** | **OOM-Guarded Sandboxing**: Immediate `SIGKILL` for malicious loops or log-bombs. | **Unbounded Buffering**: Vulnerable to memory exhaustion and system-wide OOM crashes. |
| **Connectivity** | **Fail-Secure Topology**: Multi-layered WebSocket heartbeats with 20s auto-polling fallbacks. | **Brittle Channels**: Disconnects result in total state loss and session expiration. |
| **Intelligence** | **Principal-Grade Prompting**: Gemini 1.5 Flash tuned for SRE/Senior coding standards. | **Basic LLM Wrappers**: Generic completions without architectural context. |

---

## 📈 OPERATIONAL EXCELLENCE

SAM's "Good" isn't just a UI—it's **Operational Integrity**:
- **Resource Gating**: We enforce a 5MB output boundary to protect multi-tenant infrastructure.
- **Latency Masking**: Optimistic UI updates combined with Yjs ensuring zero "perceived" lag.
- **Fail-Secure Routing**: If a local Docker worker is saturated, SAM instantly reroutes to high-availability Judge0/Piston clusters.

---

## 🌊 SYSTEM ARCHITECTURE (V4.0)

The SAM architecture is split between a **Vercel Edge-Optimized Frontend**, a **Node.js Control Plane**, and a **Dockerized Data Plane**.

```mermaid
graph TD
    classDef interface fill:#000,stroke:#fff,stroke-width:2px,color:#fff;
    classDef control fill:#111,stroke:#666,stroke-width:1px,color:#fff;
    classDef data fill:#222,stroke:#444,stroke-width:1px,color:#aaa;

    subgraph ClientLayer ["Client Layer"]
        UI["React 18 / Monaco"]:::interface -->|Secure WebSocket| Sock["Socket.IO Adapter"]:::interface
    end

    subgraph ControlPlane ["Control Plane (API)"]
        Sock -->|JWT Auth Handshake| Hub["Express Gateway"]:::control
        Hub -->|BSON Guarded State| DB[(MongoDB Atlas)]:::control
        Hub -->|Persistent Queue| Redis["Redis / BullMQ"]:::control
    end

    subgraph DataPlane ["Data Plane (Execution)"]
        Redis -->|Job Polling| Worker["Node Worker"]:::data
        Worker -->|Cgroup Restricted| Exec["Docker Container"]:::data
        Exec -->|Streamed Log| Redis
    end

    Redis -.->|Cross-Instance Broadcast| Sock
```

---

## 🛠️ THE SENIOR STACK ARSENAL

<div align="center">
  <b>FRONTEND KERNEL</b><br>
  <img src="https://img.shields.io/badge/React_18-000?style=for-the-badge&logo=react&logoColor=white" alt="React">
  <img src="https://img.shields.io/badge/Vite_Engine-000?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Monaco_Interface-000?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="Monaco">
  <img src="https://img.shields.io/badge/XTerm.js_Console-000?style=for-the-badge&logo=terminal&logoColor=white" alt="XTerm.js">
  <img src="https://img.shields.io/badge/Yjs_CRDT-000?style=for-the-badge&logo=y_combinator&logoColor=white" alt="Yjs">
  <img src="https://img.shields.io/badge/Framer_Motion_60FPS-000?style=for-the-badge&logo=framer&logoColor=white" alt="Framer">
  <img src="https://img.shields.io/badge/Tailwind_High_Fidelity-000?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind">
  <br><br>
  
  <b>DISTRIBUTED CONTROL PLANE</b><br>
  <img src="https://img.shields.io/badge/Node.js_LTS-000?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express_Gateway-000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Socket.io_Redis-000?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.io">
  <img src="https://img.shields.io/badge/BullMQ_Jobs-000?style=for-the-badge&logo=redis&logoColor=white" alt="BullMQ">
  <img src="https://img.shields.io/badge/MongoDB_Persistence-000?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB">
  <img src="https://img.shields.io/badge/JWT_Security_Layer-000?style=for-the-badge&logo=json-web-tokens&logoColor=white" alt="JWT">
  <br><br>
  
  <b>EXECUTION DATA PLANE</b><br>
  <img src="https://img.shields.io/badge/Docker_Ghost_Containers-000?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  <img src="https://img.shields.io/badge/gVisor_Isolation-000?style=for-the-badge&logo=google&logoColor=white" alt="gVisor">
  <img src="https://img.shields.io/badge/Google_Gemini_1.5_Flash-000?style=for-the-badge&logo=google-gemini&logoColor=white" alt="Gemini">
  <img src="https://img.shields.io/badge/Piston_Kernel-000?style=for-the-badge&logo=linux&logoColor=white" alt="Piston">
</div>

---

## 🎨 THE "DIGITAL OBSIDIAN" DESIGN

Built for high-focus environments, SAM features an ultra-dark, borderless interface with subtle glassmorphism—designed to get out of your way and let the code breathe.

- **Non-Blocking Execution**: Run heavy computations in the background while continuing to type.
- **Micro-Animations**: 60FPS Framer-Motion transitions across panels.
- **Global Sync**: Real-time cursor presence and typing with sub-10ms conflict resolution.

---

## 🔒 SECURITY HARDENING SPECS

SAM is hardened against the standard vulnerabilities of online compilers:
- **ACE Mitigation**: No code is ever executed on the API host.
- **OOM Guard**: Automatic `SIGKILL` for processes exceeding the 5MB log-buffer limit.
- **Socket Isolation**: Strict ownership checks prevent log-sniffing and cross-user data leaks.
- **DB Pooling**: Optimized MongoDB connection pools to support horizontal scale-out.

---

<div align="center">
  <br>
  <b>Engineered with Precision & Resilience by</b>
  <br><br>
  <a href="https://linkedin.com/in/syedmukheeth">
    <img src="https://img.shields.io/badge/-SYED_MUKHEETH-black?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn">
  </a>
  <br><br>
  <sub>v3.9.0-ULTRA | Obsidian Principal Edition</sub>
</div>
