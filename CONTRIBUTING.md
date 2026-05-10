# 🚀 SAM Compiler - Official Guide & Contribution Handbook

Welcome to the **SAM Compiler**! Whether you are a user looking to maximize your productivity or a developer wanting to contribute to this cutting-edge IDE, this guide contains absolutely everything you need.

## 📖 Table of Contents
1. [How to Use the SAM Compiler](#-how-to-use-the-sam-compiler)
2. [Developer Setup & Architecture](#-developer-setup--architecture)
3. [How to Contribute](#-how-to-contribute)
4. [Code of Conduct](#-code-of-conduct)

---

## 🛠 How to Use the SAM Compiler

SAM Compiler is designed to be a frictionless, zero-setup collaborative coding environment with deep AI integration.

### Core Features
- **Multi-Language Support**: Drop down the language selector in the top left to instantly switch between JavaScript, Python, C++, Java, and more.
- **The AI Panel**: Click the **✨ Sparkles** icon in the header to awaken Sam AI. Sam can explain complex bugs, optimize your current logic, or write entirely new functions directly into your editor context.
- **Global Execution History**: Click the **🕒 History** icon to view past code runs. If you accidentally delete a working iteration of your script, you can easily load it back from the cloud.
- **Keyboard Shortcuts**: Power users should leverage our custom keybindings. Press `Ctrl + /` to instantly toggle the AI. Press `Ctrl + Enter` to compile.

### Authentication
To save your code history or increase your execution rate limits, sign in via your Google or GitHub account using the **Sign In** button in the header. All sessions are securely tokenized with HTTP-Only cookies.

---

## 💻 Developer Setup & Architecture

### The Zenith Stack
- **Frontend**: React 18, Vite, TailwindCSS, Framer Motion, Monaco Editor.
- **Backend (API)**: Node.js, Express, Socket.io, BullMQ, Redis.
- **Worker**: Node.js, Docker, gVisor.
- **Database**: MongoDB Atlas.

### Local Installation (The Pro Flow)
To get a local instance of the SAM Compiler running on your machine:

1. **Clone the Repository**
   ```bash
   git clone https://github.com/syedmukheeth/SAM-Compiler.git
   cd SAM-Compiler
   ```

2. **Install Dependencies**
   We use a monorepo structure. You can install all dependencies from the root.
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Populate the `.env` files in `apps/api`, `apps/web`, and `apps/worker` using the provided `.env.example` templates. 

   **Required Secrets**:
   - `GEMINI_API_KEY`: Get from [Google AI Studio](https://aistudio.google.com/).
   - `MONGO_URI`: A running MongoDB instance.
   - `REDIS_URL`: A running Redis instance.

4. **Booting the Engines**
   The fastest way to start is using Docker Compose:
   ```bash
   docker-compose up -d
   ```

   Alternatively, run the development server locally:
   ```bash
   npm run dev
   ```
   This will concurrently start the API, Worker, and Web services.

---

## 🤝 How to Contribute

We actively welcome pull requests from the community! From bug fixes to feature additions, we want SAM to be built by developers, for developers.

### Contribution Workflow
1. **Fork the Repository**: Click the 'Fork' button at the top right of this page.
2. **Create a Branch**: 
   ```bash
   git checkout -b feat/amazing-new-idea
   ```
3. **Make Your Changes**: Adhere to the "Digital Obsidian" design principles.
4. **Test Thoroughly**: Ensure that the compiler correctly executes code and websocket connections are stable.
5. **Commit Your Changes**: We prefer conventional commits!
   ```bash
   git commit -m "feat(ui): add amazing new idea directly to the engine"
   ```
6. **Push to Your Fork**:
   ```bash
   git push origin feat/amazing-new-idea
   ```
7. **Open a Pull Request**: Submit the PR against our `main` branch.

### UI/UX Design System Rules
If you are contributing to the frontend, please adhere strictly to our **Digital Obsidian** design system:
- **Colors**: Use the Tailwind classes or CSS variables provided in `index.css`.
- **Glassmorphism**: Use the `.glass-panel` and `.noise-background` utility classes.
- **Responsiveness**: SAM is "Mobile-First". Ensure all components stack beautifully on small screens.

---

## 🛡 Code of Conduct
We expect all community members to interact with respect and professionalism. Constructive feedback in issues and PRs is encouraged, but toxic behavior will not be tolerated. Keep the code clean and the discussions highly technical.
