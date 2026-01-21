import React, { useState, useEffect, useRef } from 'react';
import { db, addThread, addMessage, getThreads, getMessages, deleteThread } from './db';
import { Plus, Trash, Archive, Shield, MessageSquare, Send, Globe, Database, Settings, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './index.css';

const App = () => {
  const [mode, setMode] = useState('user'); // 'user' or 'admin'
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [isDocSearchEnabled, setIsDocSearchEnabled] = useState(true);
  const [adminAllowedWeb, setAdminAllowedWeb] = useState(true);
  const [activeModel, setActiveModel] = useState('qwen2.5-coder:1.5b');
  const [models, setModels] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const API_BASE = `http://${window.location.hostname}:8000`;

  // Load threads on startup
  useEffect(() => {
    refreshThreads();
    fetchModels();
  }, []);

  // Load messages when thread changes
  useEffect(() => {
    if (activeThreadId) {
      loadMessages(activeThreadId);
    } else {
      setMessages([]);
    }
  }, [activeThreadId]);

  const refreshThreads = async () => {
    const t = await getThreads();
    setThreads(t);
  };

  const loadMessages = async (id) => {
    const m = await getMessages(id);
    setMessages(m);
  };

  const handleNewChat = async () => {
    const id = await addThread();
    setActiveThreadId(id);
    refreshThreads();
  };

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/models`);
      const data = await res.json();
      setModels(data.models || []);
    } catch (e) {
      console.error("Failed to fetch models", e);
    }
  };

  const handleSendMessage = async () => {
    if (!inputText.trim()) return;

    let threadId = activeThreadId;
    if (!threadId) {
      threadId = await addThread(inputText.substring(0, 30));
      setActiveThreadId(threadId);
      refreshThreads();
    }

    const userMsg = inputText;
    setInputText('');
    await addMessage(threadId, 'user', userMsg);
    loadMessages(threadId);

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: userMsg,
          use_web: isWebSearchEnabled,
          use_docs: isDocSearchEnabled
        })
      });
      const data = await res.json();

      if (data.error) {
        await addMessage(threadId, 'ai', `⚠️ ${data.error}`);
      } else {
        await addMessage(threadId, 'ai', data.response, data.sources);
      }
    } catch (e) {
      await addMessage(threadId, 'ai', "⚠️ Backend error. Ensure Ollama and Backend are running.");
    } finally {
      setIsLoading(false);
      loadMessages(threadId);
    }
  };

  const handleAdminUpload = async (e) => {
    const files = e.target.files;
    if (!files.length) return;

    const formData = new FormData();
    for (const file of files) {
      formData.append('files', file);
    }

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      alert(data.message);
    } catch (e) {
      alert("Upload failed.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetIndex = async () => {
    if (!confirm("Are you sure you want to clear all indexed documents? This cannot be undone.")) return;

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/reset-index`, { method: 'POST' });
      const data = await res.json();
      alert(data.message);
    } catch (e) {
      alert("Reset failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <div style={{ display: 'flex', gap: '10px', marginBottom: '1.5rem' }}>
          <button
            className={`mode-toggle ${mode === 'user' ? 'active' : ''}`}
            onClick={() => setMode('user')}
            style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: mode === 'user' ? '#6366f1' : '#334155', color: 'white' }}
          >
            User
          </button>
          <button
            className={`mode-toggle ${mode === 'admin' ? 'active' : ''}`}
            onClick={() => setMode('admin')}
            style={{ flex: 1, padding: '8px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: mode === 'admin' ? '#6366f1' : '#334155', color: 'white' }}
          >
            Admin
          </button>
        </div>

        {mode === 'user' && (
          <>
            <button className="new-chat-btn" onClick={handleNewChat}>
              <Plus size={20} /> New Chat
            </button>
            <div className="thread-list">
              {threads.map(t => (
                <div
                  key={t.id}
                  className={`thread-item ${activeThreadId === t.id ? 'active' : ''}`}
                  onClick={() => setActiveThreadId(t.id)}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {t.title}
                  </span>
                  <Trash size={14} onClick={(e) => { e.stopPropagation(); deleteThread(t.id).then(refreshThreads); }} style={{ color: '#94a3b8' }} />
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="chat-area">
        {mode === 'user' ? (
          <>
            <div className="messages-container">
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', marginTop: '10rem', opacity: 0.5 }}>
                  <h1>Rag Glocal</h1>
                  <p>Ask anything about your documents...</p>
                </div>
              )}
              {messages.map(m => (
                <div key={m.id} className={`message ${m.role}`}>
                  <ReactMarkdown>{m.content}</ReactMarkdown>
                  {m.sources && m.sources.length > 0 && (
                    <div className="sources">
                      {m.sources.map((s, idx) => (
                        <div key={idx} className="source-tag" title={s.content}>
                          {s.source || 'Doc'}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {isLoading && <div className="message ai">Thinking...</div>}
            </div>

            <div className="input-container">
              <textarea
                placeholder="Message RAG Glocal..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
              />
              <button
                className={`web-toggle ${isWebSearchEnabled ? 'active' : ''}`}
                onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
                style={{ border: 'none', background: 'transparent', color: isWebSearchEnabled ? '#38bdf8' : '#64748b', cursor: 'pointer' }}
                title="Toggle Web Search"
              >
                <Globe size={20} />
              </button>
              <button
                className={`doc-toggle ${isDocSearchEnabled ? 'active' : ''}`}
                onClick={() => setIsDocSearchEnabled(!isDocSearchEnabled)}
                style={{ border: 'none', background: 'transparent', color: isDocSearchEnabled ? '#818cf8' : '#64748b', cursor: 'pointer', marginRight: '10px' }}
                title="Toggle Document Search"
              >
                <Database size={20} />
              </button>
              <button className="send-btn" onClick={handleSendMessage}>
                <Send size={18} />
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: '4rem', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <div className="admin-overlay">
              <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Shield size={24} color="#6366f1" /> Admin Settings
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
                <div style={{ background: 'var(--glass)', padding: '1.5rem', borderRadius: '16px' }}>
                  <h3>Learning Center</h3>
                  <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '1rem' }}>
                    Upload documents to teach your AI.
                  </p>
                  <label style={{ display: 'block', padding: '1rem', border: '2px dashed var(--border-glass)', borderRadius: '12px', textAlign: 'center', cursor: 'pointer' }}>
                    Click to Upload Documents
                    <input type="file" multiple hidden onChange={handleAdminUpload} />
                  </label>
                  <button
                    onClick={handleResetIndex}
                    style={{ marginTop: '1rem', width: '100%', padding: '0.8rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer' }}
                  >
                    Reset Index / Clear All Docs
                  </button>
                </div>

                <div style={{ background: 'var(--glass)', padding: '1.5rem', borderRadius: '16px' }}>
                  <h3>System Config</h3>
                  <div style={{ marginTop: '1rem' }}>
                    <label style={{ display: 'block', marginBottom: '0.5rem' }}>Active Model</label>
                    <select
                      value={activeModel}
                      onChange={(e) => setActiveModel(e.target.value)}
                      style={{ width: '100%', padding: '0.5rem', borderRadius: '8px', background: '#334155', border: 'none', color: 'white' }}
                    >
                      {models.map(m => <option key={m.name} value={m.name}>{m.name}</option>)}
                      <option value="llama3.1:8b">llama3.1:8b</option>
                    </select>
                  </div>

                  <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <input type="checkbox" checked={adminAllowedWeb} onChange={(e) => setAdminAllowedWeb(e.target.checked)} />
                    <label>Globally Enable Web Search</label>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
