import React, { useState, useEffect, useRef } from 'react';
import { db, addThread, addMessage, getThreads, getMessages, deleteThread, renameThread } from './db';
import {
  Plus, Trash, Archive, Shield, MessageSquare, Send, Globe, Database,
  Settings, ChevronRight, UploadCloud, FileText, Trash2, Eye,
  Settings2, Activity, RefreshCw, X, CheckCircle, AlertTriangle, Info,
  Copy, RotateCcw, Edit2, Check
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import './index.css';

const App = () => {
  // Determine mode from URL search param: ?mode=admin
  const getInitialMode = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('mode') === 'admin' ? 'admin' : 'user';
  };

  const [mode, setMode] = useState(getInitialMode());
  const [threads, setThreads] = useState([]);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState('');
  const [isWebSearchEnabled, setIsWebSearchEnabled] = useState(false);
  const [isDocSearchEnabled, setIsDocSearchEnabled] = useState(true);
  const [adminAllowedWeb, setAdminAllowedWeb] = useState(true);
  const [activeModel, setActiveModel] = useState('llama3.2:3b');
  const [models, setModels] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState({}); // { name: status }
  const [toasts, setToasts] = useState([]);
  const [modal, setModal] = useState({ show: false, title: '', message: '', onConfirm: null, variant: 'info' });
  const API_BASE = `http://${window.location.hostname}:8000`;

  // Load threads on startup
  useEffect(() => {
    refreshThreads();
    fetchModels();
    fetchDocuments();
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/settings`);
      const data = await res.json();
      if (data.active_model) setActiveModel(data.active_model);
      if (data.allow_web_search !== undefined) setAdminAllowedWeb(data.allow_web_search);
    } catch (e) {
      console.error("Failed to fetch settings", e);
    }
  };

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

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/admin/documents`);
      const data = await res.json();

      // Update uploadingFiles: if a file is now in the documents list, it's done
      setUploadingFiles(prev => {
        const next = { ...prev };
        data.forEach(d => {
          if (next[d.name]) delete next[d.name];
        });
        return next;
      });

      setDocuments(data || []);
    } catch (e) {
      console.error("Failed to fetch documents", e);
    }
  };

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 5000);
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
    const newUploading = { ...uploadingFiles };
    for (const file of files) {
      formData.append('files', file);
      newUploading[file.name] = 'Ingesting...';
    }
    setUploadingFiles(newUploading);

    try {
      const res = await fetch(`${API_BASE}/admin/upload`, {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      addToast(data.message, 'success');
      // Start polling for documents to update status
      const interval = setInterval(async () => {
        const docRes = await fetch(`${API_BASE}/admin/documents`);
        const docs = await docRes.json();
        const allDone = files.every(f => docs.some(d => d.name === f.name));
        if (allDone) {
          fetchDocuments();
          clearInterval(interval);
        }
      }, 2000);
    } catch (e) {
      addToast("Upload failed.", "error");
      const resetUploading = { ...uploadingFiles };
      for (const file of files) delete resetUploading[file.name];
      setUploadingFiles(resetUploading);
    }
  };

  const handleResetIndex = async () => {
    setModal({
      show: true,
      title: 'Reset Index?',
      message: 'Are you sure you want to clear all indexed documents? This cannot be undone.',
      variant: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`${API_BASE}/admin/reset-index`, { method: 'POST' });
          const data = await res.json();
          addToast(data.message, 'success');
          fetchDocuments();
        } catch (e) {
          addToast("Reset failed.", "error");
        } finally {
          setIsLoading(false);
          setModal(prev => ({ ...prev, show: false }));
        }
      }
    });
  };

  const handleDeleteDocument = async (filename) => {
    setModal({
      show: true,
      title: 'Delete Document',
      message: `Are you sure you want to delete ${filename}?`,
      variant: 'danger',
      onConfirm: async () => {
        setIsLoading(true);
        try {
          const res = await fetch(`${API_BASE}/admin/documents/${filename}`, { method: 'DELETE' });
          const data = await res.json();
          addToast(data.message, 'info');
          // Since it's backgrounded, we might want to poll or just wait a bit
          setTimeout(fetchDocuments, 1000);
        } catch (e) {
          addToast("Delete failed.", "error");
        } finally {
          setIsLoading(false);
          setModal(prev => ({ ...prev, show: false }));
        }
      }
    });
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    addToast("Copied to clipboard", "success");
  };

  const handleRegenerate = async () => {
    // Basic regeneration: Remove last AI message and re-send the last user message
    if (messages.length < 2) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== 'ai') return; // Should be AI message to regenerate

    // Find last user message
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg) return;

    // In a real app we might delete the last AI message from DB or just ignore it in UI
    // Here we'll just trigger the send logic with the user's text again.
    // Ideally we should visually remove the last AI message first.

    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: lastUserMsg.content,
          use_web: isWebSearchEnabled,
          use_docs: isDocSearchEnabled
        })
      });
      const data = await res.json();

      // We'll append a NEW message for now, as "regeneration"
      if (data.error) {
        await addMessage(activeThreadId, 'ai', `⚠️ ${data.error}`);
      } else {
        await addMessage(activeThreadId, 'ai', data.response, data.sources);
      }
      loadMessages(activeThreadId);
    } catch (e) {
      addToast("Regeneration failed", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const [editingThreadId, setEditingThreadId] = useState(null);
  const [editTitle, setEditTitle] = useState('');

  const startEditing = (t) => {
    setEditingThreadId(t.id);
    setEditTitle(t.title);
  };

  const cancelEditing = () => {
    setEditingThreadId(null);
    setEditTitle('');
  };

  const saveTitle = async (id) => {
    if (editTitle.trim()) {
      await renameThread(id, editTitle.trim());
      refreshThreads();
    }
    cancelEditing();
  };

  const handleUpdateModel = async (model) => {
    setActiveModel(model);
    try {
      await fetch(`${API_BASE}/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_name: model })
      });
    } catch (e) {
      console.error("Failed to update model", e);
    }
  };

  const handleUpdateWebSearch = async (allowed) => {
    setAdminAllowedWeb(allowed);
    try {
      await fetch(`${API_BASE}/admin/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allow_web_search: allowed })
      });
    } catch (e) {
      console.error("Failed to update web search", e);
    }
  };

  const ToastContainer = () => (
    <div className="toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`toast-item ${t.type}`}>
          {t.type === 'success' && <CheckCircle size={18} color="#10b981" />}
          {t.type === 'error' && <AlertTriangle size={18} color="#ef4444" />}
          {t.type === 'info' && <Info size={18} color="var(--primary)" />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );

  const Modal = () => {
    if (!modal.show) return null;
    return (
      <div className="modal-overlay" onClick={() => setModal({ ...modal, show: false })}>
        <div className="modal-content" onClick={e => e.stopPropagation()}>
          <div className="modal-title">
            {modal.variant === 'danger' ? <AlertTriangle color="#ef4444" /> : <Info color="var(--primary)" />}
            {modal.title}
          </div>
          <div className="modal-message">{modal.message}</div>
          <div className="modal-actions">
            <button className="modal-btn secondary" onClick={() => setModal({ ...modal, show: false })}>Cancel</button>
            <button
              className={`modal-btn ${modal.variant === 'danger' ? 'danger' : 'primary'}`}
              onClick={modal.onConfirm}
            >
              Confirm
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="app-container">
      <ToastContainer />
      <Modal />
      {/* Sidebar - only shown in user mode */}
      {mode === 'user' && (
        <div className="sidebar">
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
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', overflow: 'hidden' }}>
                  <MessageSquare size={16} style={{ flexShrink: 0, opacity: 0.7 }} />
                  {editingThreadId === t.id ? (
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      onBlur={() => saveTitle(t.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveTitle(t.id);
                        if (e.key === 'Escape') cancelEditing();
                        e.stopPropagation();
                      }}
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                      className="edit-title-input"
                    />
                  ) : (
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {t.title}
                    </span>
                  )}
                  <div className="thread-actions">
                    <button
                      className="action-btn"
                      onClick={(e) => { e.stopPropagation(); startEditing(t); }}
                      title="Rename"
                    >
                      <Edit2 size={12} />
                    </button>
                    <button
                      className="action-btn delete"
                      onClick={(e) => { e.stopPropagation(); deleteThread(t.id).then(refreshThreads); }}
                      title="Delete"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )
      }

      {/* Main Content */}
      <div className="chat-area">
        {mode === 'user' ? (
          <>
            <div className="messages-container">
              {messages.length === 0 && (
                <div className="hero">
                  <h1>Rag Glocal</h1>
                  <p>Sophisticated intelligence for your document knowledge base.</p>
                </div>
              )}
              {messages.map((m, idx) => (
                <div key={m.id} className={`message-wrapper ${m.role}`}>
                  <div className={`avatar ${m.role}`}>
                    {m.role === 'user' ? <Plus size={18} color="white" /> : <Activity size={18} color="var(--primary)" />}
                  </div>
                  <div className={`message ${m.role}`}>
                    <ReactMarkdown>{m.content}</ReactMarkdown>
                    {m.sources && m.sources.length > 0 && (
                      <div className="sources">
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' }}>Sources:</div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                          {m.sources.map((s, idx) => (
                            <div
                              key={idx}
                              className={`source-chip ${s.type}`}
                              title={s.content}
                              onClick={() => s.link && window.open(s.link, '_blank')}
                              style={{ cursor: s.link ? 'pointer' : 'default' }}
                            >
                              <span className="source-icon">
                                {s.type === 'doc' ? <Database size={10} /> : s.type === 'web' ? <Globe size={10} /> : <Shield size={10} />}
                              </span>
                              {s.source} {s.page ? `(Page ${s.page})` : ''}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="message-actions">
                      <button className="msg-action-btn" onClick={() => handleCopy(m.content)} title="Copy">
                        <Copy size={14} />
                      </button>
                      {/* Only show regenerate for the very last AI message */}
                      {m.role === 'ai' && idx === messages.length - 1 && !isLoading && (
                        <button className="msg-action-btn" onClick={handleRegenerate} title="Regenerate">
                          <RotateCcw size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="message-wrapper ai">
                  <div className="avatar ai"><Activity size={18} color="var(--primary)" /></div>
                  <div className="thinking">
                    <div className="dot"></div>
                    <div className="dot"></div>
                    <div className="dot"></div>
                  </div>
                </div>
              )}
            </div>

            <div className="input-area-wrapper">
              <div className="input-container">
                <textarea
                  placeholder="Ask anything..."
                  value={inputText}
                  rows="1"
                  onChange={(e) => {
                    setInputText(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSendMessage())}
                />
                <div className="input-actions">
                  <button
                    className={`toggle-btn ${isWebSearchEnabled ? 'active' : ''}`}
                    onClick={() => setIsWebSearchEnabled(!isWebSearchEnabled)}
                    title="Web Search"
                  >
                    <Globe size={18} />
                  </button>
                  <button
                    className={`toggle-btn ${isDocSearchEnabled ? 'active' : ''}`}
                    onClick={() => setIsDocSearchEnabled(!isDocSearchEnabled)}
                    title="Vector Knowledge"
                  >
                    <Database size={18} />
                  </button>
                  <button
                    className="send-btn"
                    onClick={handleSendMessage}
                    disabled={!inputText.trim() || isLoading}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="admin-view">
            <header className="admin-header">
              <div>
                <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Shield size={32} color="var(--primary)" /> Command Center
                </h1>
                <p style={{ color: 'var(--text-muted)', marginTop: '4px' }}>System configuration and knowledge management</p>
              </div>
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={fetchDocuments} className="icon-btn" title="Refresh List">
                  <RefreshCw size={18} />
                </button>
                <button onClick={handleResetIndex} className="icon-btn delete" title="Clear All Data">
                  <Trash2 size={18} />
                </button>
              </div>
            </header >

            <div className="stat-grid">
              <div className="stat-card">
                <span className="stat-label">Total Documents</span>
                <span className="stat-value">{documents.length}</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.75rem', color: '#10b981' }}>
                  <Activity size={12} /> Active nodes indexed
                </div>
              </div>
              <div className="stat-card">
                <span className="stat-label">System Model</span>
                <span className="stat-value" style={{ fontSize: '1.2rem' }}>{activeModel.split(':')[0]}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{activeModel.split(':')[1] || 'latest'}</span>
              </div>
              <div className="stat-card">
                <span className="stat-label">Knowledge Size</span>
                <span className="stat-value">{(documents.reduce((acc, d) => acc + d.size, 0) / 1024).toFixed(1)} <span style={{ fontSize: '1rem' }}>KB</span></span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Compressed vector storage</span>
              </div>
            </div>

            <main className="admin-sections">
              <section className="section-card">
                <h3 className="section-title"><Database size={20} color="var(--primary)" /> Knowledge Base</h3>
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>FILE NAME</th>
                        <th>SIZE</th>
                        <th>TYPE</th>
                        <th>ACTIONS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {documents.length === 0 && Object.keys(uploadingFiles).length === 0 ? (
                        <tr>
                          <td colSpan="4" style={{ textAlign: 'center', padding: '3rem', opacity: 0.5 }}>
                            <FileText size={48} style={{ marginBottom: '1rem' }} />
                            <p>No documents found in knowledge base.</p>
                          </td>
                        </tr>
                      ) : (
                        <>
                          {Object.entries(uploadingFiles).map(([name, status]) => (
                            <tr key={name} className="pulse">
                              <td>
                                <div className="file-info">
                                  <FileText size={18} className="file-icon" />
                                  <span>{name}</span>
                                  <span className="ingesting-tag">{status}</span>
                                </div>
                              </td>
                              <td>-</td>
                              <td>{name.split('.').pop().toUpperCase()}</td>
                              <td>
                                <div className="action-btns" style={{ opacity: 0.5 }}>
                                  <button className="icon-btn" disabled>
                                    <Eye size={16} />
                                  </button>
                                  <button className="icon-btn delete" disabled>
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {documents.map((doc, idx) => (
                            <tr key={idx}>
                              <td>
                                <div className="file-info">
                                  <FileText size={18} className="file-icon" />
                                  <span>{doc.name}</span>
                                </div>
                              </td>
                              <td>{(doc.size / 1024).toFixed(1)} KB</td>
                              <td>{doc.name.split('.').pop().toUpperCase()}</td>
                              <td>
                                <div className="action-btns">
                                  <button className="icon-btn" onClick={() => window.open(`${API_BASE}/documents/${doc.name}`, '_blank')} title="View Document">
                                    <Eye size={16} />
                                  </button>
                                  <button className="icon-btn delete" onClick={() => handleDeleteDocument(doc.name)} title="Delete Document">
                                    <Trash2 size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              <aside style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
                <section className="section-card">
                  <h3 className="section-title"><UploadCloud size={20} color="var(--primary)" /> Ingest</h3>
                  <label className="upload-dropzone">
                    <UploadCloud size={40} />
                    <span>Drop files here or click to browse</span>
                    <p style={{ fontSize: '0.7rem', opacity: 0.6 }}>Supports PDF, TXT, MD, DOCX</p>
                    <input type="file" multiple hidden onChange={handleAdminUpload} />
                  </label>
                </section>

                <section className="section-card">
                  <h3 className="section-title"><Settings2 size={20} color="var(--primary)" /> Config</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                    <div>
                      <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Active Neural Model</label>
                      <select
                        value={activeModel}
                        onChange={(e) => handleUpdateModel(e.target.value)}
                        style={{ width: '100%', padding: '0.8rem', borderRadius: '10px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border-glass)', color: 'white', outline: 'none' }}
                      >
                        {models.map(m => <option key={m.name} value={m.name} style={{ background: '#1e293b' }}>{m.name}</option>)}
                      </select>
                    </div>

                    <div className="nested-card">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.9rem' }}>Global Web Search</span>
                        <input
                          type="checkbox"
                          checked={adminAllowedWeb}
                          onChange={(e) => handleUpdateWebSearch(e.target.checked)}
                          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                        />
                      </div>
                      <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '8px' }}>Allow users to bypass local knowledge for real-time web results.</p>
                    </div>
                  </div>
                </section>
              </aside>
            </main>
          </div >
        )}
      </div >
    </div >
  );
};

export default App;
