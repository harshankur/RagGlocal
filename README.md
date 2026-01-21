# RagGlocal System

A private, local-first Retrieval-Augmented Generation system with Admin and User modes.

## Features
- **Local-First**: Runs LLMs locally via Ollama. No data leaves your machine.
- **Admin Mode**: Upload documents to "teach" the AI. Swap models on the fly.
- **User Mode**: Modern chat interface with IndexedDB persistent history.
- **Hybrid Search**: Intelligent routing between local documents and Web Search (DuckDuckGo).
- **Citations**: Highlighting sources and page numbers for generated answers.

## Prerequisites
1.  **Ollama**: Install from [ollama.com](https://ollama.com).
    - Pull the default model: `ollama pull llama3.1:8b`
2.  **Python 3.10+**
3.  **Node.js 18+**

## Getting Started

### 1. Backend Setup
```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Usage
- Open `http://localhost:5173` (on server) or `http://SERVER_IP:5173` (on other computers).
- Switch to **Admin** mode to upload PDFs or Text files.
- Switch to **User** mode to start chatting about your data.
- Toggle the **Globe** icon for Web Search if the local docs don't have the answer.

## Multi-Device / LAN Access
To allow other computers on your network to use your LLM:

1. **Config Ollama**:
   Set `OLLAMA_HOST=0.0.0.0` in your environment variables before starting Ollama.
2. **Start Backend**:
   Run `uvicorn main:app --host 0.0.0.0 --port 8000`.
3. **Start Frontend**:
   Run `npm run dev -- --host`.
4. **Connect**:
   Find your server's IP (e.g., `192.168.1.5`) and open `http://192.168.1.5:5173` on other devices.

## Technology Stack
- **Backend**: FastAPI, LlamaIndex, ChromaDB, DuckDuckGo Search.
- **Frontend**: React, Vite, Dexie (IndexedDB), React-Markdown, Lucide Icons.
- **Aesthetics**: Premium Vanilla CSS with glassmorphism and dark mode.
