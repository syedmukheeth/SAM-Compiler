<div align="center">
  <br>
  <a href="https://sam-compiler-web.vercel.app/" target="_blank">
    <img alt="SAM Compiler Logo" src="https://raw.githubusercontent.com/syedmukheeth/SAM-Compiler/main/apps/web/public/dark.svg" width="200">
  </a>
  
  <h1><b>SAM COMPILER</b></h1>
  
  <p><b><code>SYNTAX ANALYSIS MACHINE : DISTRIBUTED KERNEL EDITION</code></b></p>

  <blockquote>
    <i>"Architected for absolute resilience. Engineered for sub-millisecond precision. The last IDE you'll ever need."</i>
  </blockquote>

  <p align="center">
    <img src="https://img.shields.io/github/stars/syedmukheeth/SAM-Compiler?style=for-the-badge&color=white&labelColor=black" alt="Stars">
    <img src="https://img.shields.io/badge/Architecture-Distributed-white?style=for-the-badge&labelColor=black" alt="Distributed">
    <img src="https://img.shields.io/badge/Security-Hardened-white?style=for-the-badge&labelColor=black" alt="Hardened">
    <img src="https://img.shields.io/badge/Sync-CRDT_Yjs-white?style=for-the-badge&labelColor=black" alt="Yjs">
    <img src="https://img.shields.io/badge/AI-Gemini_1.5_Flash-white?style=for-the-badge&labelColor=black" alt="Gemini AI">
  </p>

  <br>

  <a href="https://sam-compiler-web.vercel.app/">
    <img src="https://img.shields.io/badge/►_LAUNCH_WORKSPACE-000000?style=for-the-badge&logoColor=white&labelColor=111111" alt="Launch Workspace">
  </a>
  <br>
</div>

---

## ⚡ THE EVOLUTION OF THE CLOUD IDE

**SAM Compiler** is not just a code runner—it is a **High-Fidelity Distributed Environment** designed to mirror the workflow of Principal Engineers. Borne from the necessity of total execution safety and real-time collaboration, SAM utilizes a **Decoupled Control Plane** to manage safe, containerized code execution across isolated compute nodes.

### 🏆 THE COMPETITIVE EDGE: WHY SAM REIGNS SUPREME

SAM is engineered to exceed the limitations of standard web-based compilers through deep-system hardening and distributed orchestration.

| Dimension | ⚡ SAM Compiler (Elite) | 🐌 Industry Average (Generic) |
|---|---|---|
| 🏗️ **Architecture** | **Decoupled Control Plane**: Segregated API & Hardened Worker nodes. | **Monolithic**: Code runs on the API process (ACE risks). |
| 🔄 **State Sync** | **CRDT (Yjs)**: Conflict-free binary state sync with sub-10ms resolution. | **Naive JSON**: Prone to race conditions and "Code Soup". |
| 🛡️ **Isolation** | **Dockerized Sandboxing**: Cgroup-restricted ephemeral containers. | **Process-based**: Vulnerable to system-level resource exhaustion. |
| 📡 **Connectivity** | **Fail-Secure Topology**: Multi-layered WebSocket heartbeats with BullMQ persistence. | **Brittle Channels**: Disconnects result in total state loss. |
| 🧠 **Intelligence** | **Gemini 1.5 Flash**: Principal-grade context-aware diagnostics & refactoring. | **Basic Wrappers**: Generic completions without project context. |
| 🎨 **UX/UI** | **Digital Obsidian**: 60FPS glassmorphism with optimized mobile reflex. | **Bootstrap/Generic**: Cluttered interfaces with high perceived lag. |

---

## 🌊 SYSTEM ARCHITECTURE (V6.0 - ZENITH)

The SAM architecture is a masterpiece of distributed systems engineering, split between a **Vercel Edge-Optimized Frontend**, a **Node.js Control Plane**, and a **Dockerized Data Plane**.

```mermaid
graph TD
    classDef interface fill:#000,stroke:#fff,stroke-width:2px,color:#fff;
    classDef control fill:#111,stroke:#666,stroke-width:1px,color:#fff;
    classDef data fill:#222,stroke:#444,stroke-width:1px,color:#aaa;

    subgraph ClientLayer ["Client Layer (Zenith UI)"]
        UI["React 18 / Monaco"]:::interface -->|Secure WebSocket| Sock["Socket.IO Adapter"]:::interface
    end

    subgraph ControlPlane ["Control Plane (API Gateway)"]
        Sock -->|JWT Auth Handshake| Hub["Express Cluster"]:::control
        Hub -->|BSON Guarded State| DB[(MongoDB Atlas)]:::control
        Hub -->|Persistent Queue| Redis["Redis / BullMQ"]:::control
    end

    subgraph DataPlane ["Data Plane (The Foundry)"]
        Redis -->|Job Polling| Worker["Node Worker Cluster"]:::data
        Worker -->|Cgroup Restricted| Exec["Docker Container"]:::data
        Exec -->|Streamed Log| Redis
    end

    Redis -.->|Cross-Instance Broadcast| Sock
```

### 🛰️ KEY ARCHITECTURAL TENETS
- **Asynchronous Execution Pipeline**: Utilizing BullMQ and Redis to handle high-concurrency compilation without blocking the main event loop.
- **Isomorphic Shared Logic**: Shared TypeScript types and utilities between Frontend and Backend to ensure 100% type safety.
- **Heartbeat Resilience**: Custom server-side heartbeat mechanism to prevent cloud provider cold starts and maintain persistent WebSocket connections.

---

## 🛠️ THE PRINCIPAL STACK

<div align="center">
  <h3>Frontend Kernel</h3>
  <img src="https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React">
  <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite">
  <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind">
  <img src="https://img.shields.io/badge/Framer_Motion-0055FF?style=for-the-badge&logo=framer&logoColor=white" alt="Framer">
  <img src="https://img.shields.io/badge/Monaco_Editor-007ACC?style=for-the-badge&logo=visual-studio-code&logoColor=white" alt="Monaco">
  
  <br><br>
  
  <h3>Backend & Orchestration</h3>
  <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" alt="Express">
  <img src="https://img.shields.io/badge/Redis-DC382D?style=for-the-badge&logo=redis&logoColor=white" alt="Redis">
  <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" alt="MongoDB">
  <img src="https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socket.io&logoColor=white" alt="Socket.io">
  <img src="https://img.shields.io/badge/Docker-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker">
  
  <br><br>
  
  <h3>Intelligence & Infrastructure</h3>
  <img src="https://img.shields.io/badge/Google_Gemini-8E75C2?style=for-the-badge&logo=googlegemini&logoColor=white" alt="Gemini">
  <img src="https://img.shields.io/badge/Vercel-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel">
  <img src="https://img.shields.io/badge/GitHub_Actions-2088FF?style=for-the-badge&logo=github-actions&logoColor=white" alt="GitHub Actions">
</div>

---

## 📂 REPOSITORY DNA (PROJECT STRUCTURE)

SAM follows a modern Monorepo structure, ensuring separation of concerns and maximum reusability.

```text
.
├── apps/
│   ├── api/            # Control Plane (Express, Socket.io, BullMQ)
│   ├── web/            # Zenith UI (React, Monaco, Framer Motion)
│   └── worker/         # Data Plane (Docker Orchestration, Code Execution)
├── packages/
│   └── shared/         # Shared Logic, Types, and Constants
├── docs/               # Technical Documentation & Diagrams
├── scripts/            # Infrastructure & Deployment Automation
└── docker-compose.yml  # Local Environment Orchestration
```

---

## 🚀 GETTING STARTED: THE PRO FLOW

Follow these steps to spin up your own instance of SAM Compiler.

### 1. Clone the Arsenal
```bash
git clone https://github.com/syedmukheeth/SAM-Compiler.git
cd SAM-Compiler
```

### 2. Fork and Configure Environment
Copy the example environment files and populate them with your secrets.

**For API (`apps/api/.env`):**
| Variable | Description | Default |
|---|---|---|
| `PORT` | API Listening Port | `8080` |
| `MONGO_URI` | MongoDB Connection String | `mongodb://root:rootpassword@localhost:27017` |
| `REDIS_URL` | Redis Connection String | `redis://localhost:6379` |
| `GEMINI_API_KEY` | Google Gemini API Key | `REQUIRED` |
| `JWT_SECRET` | Secret for Authentication | `at_least_32_chars` |

**For Worker (`apps/worker/.env`):**
| Variable | Description | Default |
|---|---|---|
| `RUN_TIMEOUT_MS` | Max execution time per job | `8000` |
| `RUN_MEMORY` | Max memory per container | `256m` |
| `WORKER_CONCURRENCY` | Parallel jobs per worker | `3` |

### 3. Launch the Ecosystem
We recommend using Docker Compose for a seamless experience.

```bash
# Start all services (API, Worker, Redis, MongoDB)
docker-compose up -d

# Install dependencies for local development
npm install

# Start development mode (Concurrent UI + API + Worker)
npm run dev
```

---

## 🎨 THE "DIGITAL OBSIDIAN" EXPERIENCE

SAM features an ultra-dark, borderless interface with subtle glassmorphism—designed to get out of your way and let the code breathe.

- **Responsive Reflex Architecture**: Dynamically stacks from a 3-column diagnostic IDE (Desktop) to a vertical fluid stream (Mobile).
- **60FPS Micro-Animations**: Powered by Framer Motion, providing tactile feedback for every interaction.
- **Intelligent Diagnostics**: Built-in SAM AI (Gemini 1.5 Flash) provides instant refactoring suggestions and bug fixes.
- **Sticky Execution**: A globally accessible "Run Code" FAB on mobile, ensuring triggers are always within thumb's reach.

---

## 🔒 SECURITY & ISOLATION SPECS

- **Sandboxed Execution**: Code is executed in ephemeral Docker containers with zero network access and restricted syscalls.
- **Resource Gating**: Strict limits on CPU, Memory, and PIDs to prevent malicious code from destabilizing the host.
- **BSON Guarded State**: All incoming data is sanitized and validated against strict schemas before persistence.

## 📚 DOCUMENTATION & GUIDES

For deeper dives into the system, refer to our specialized documentation:

- **[System Design & Architecture](docs/SYSTEM_DESIGN.md)**: A detailed breakdown of the control/data plane and security kernel.
- **[Contribution Handbook](CONTRIBUTING.md)**: Instructions for setting up the dev environment and submitting pull requests.
- **[Deployment Guide](DEPLOYMENT.md)**: Production deployment strategies for Vercel and AWS/GCP.

---

<div align="center">
  <br>
  <b>Engineered with Precision & Resilience by</b>
  <br><br>
  <a href="https://linkedin.com/in/syedmukheeth">
    <img src="https://img.shields.io/badge/-SYED_MUKHEETH-black?style=for-the-badge&logo=linkedin&logoColor=white" alt="LinkedIn">
  </a>
  <br><br>
  <sub>v6.0.0-ZENITH | Obsidian Principal Edition</sub>
</div>
