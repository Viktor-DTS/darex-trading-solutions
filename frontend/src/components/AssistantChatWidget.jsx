import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from '../utils/authSession';
import './AssistantChatWidget.css';

/** Плаваючий чат з асистентом — історія в асистентській MongoDB */
export default function AssistantChatWidget({ currentPanel }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [convListLoading, setConvListLoading] = useState(false);
  const [showConvList, setShowConvList] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, open, loading]);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const loadConversationList = useCallback(async () => {
    setConvListLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/assistant/conversations`, {
        headers: authHeaders(),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      setConversations(Array.isArray(data?.conversations) ? data.conversations : []);
    } catch {
      /* ignore */
    } finally {
      setConvListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadConversationList();
  }, [open, loadConversationList]);

  const loadMessages = useCallback(async (cid) => {
    if (!cid) return;
    setHistoryLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/assistant/conversations/${cid}/messages`, {
        headers: authHeaders(),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Не вдалося завантажити історію');
        return;
      }
      setMessages(
        (data?.messages || []).map((m) => ({
          role: m.role,
          content: m.content,
          createdAt: m.createdAt,
        })),
      );
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open || !conversationId) return;
    loadMessages(conversationId);
  }, [open, conversationId, loadMessages]);

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
    setInput('');
    setError('');
    loadConversationList();
  };

  const formatConvDate = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('uk-UA', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  const pickConversation = (cid) => {
    setConversationId(cid);
    setMessages([]);
    setError('');
    setShowConvList(true);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const snapshot = [...messages];

    setLoading(true);
    setError('');
    setInput('');
    setMessages([...snapshot, { role: 'user', content: text }]);

    try {
      const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          conversationId,
          message: text,
          context: {
            panelId: currentPanel || '',
            path: location.pathname || '',
          },
        }),
      });

      if (tryHandleUnauthorizedResponse(res)) {
        setMessages(snapshot);
        setLoading(false);
        return;
      }

      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setMessages(snapshot);
        setError(data?.error || 'Помилка асистента');
        setLoading(false);
        return;
      }

      const cid = data?.conversationId;
      if (cid) setConversationId(cid);

      const reply = String(data?.reply || '');
      setMessages([
        ...snapshot,
        { role: 'user', content: text },
        { role: 'assistant', content: reply },
      ]);

      loadConversationList();
    } catch (e) {
      setMessages(snapshot);
      setError(String(e.message || e));
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <>
      <button
        type="button"
        className="assistant-chat-fab"
        aria-label="Відкрити асистента"
        title="Асистент DTS"
        onClick={() => setOpen((o) => !o)}
      >
        🤖
      </button>

      {open && (
        <div className="assistant-chat-panel" role="dialog" aria-label="Чат з асистентом">
          <div className="assistant-chat-panel-header">
            <h3>Асистент DTS</h3>
            <div className="assistant-chat-actions">
              <button type="button" onClick={newChat}>
                Новий чат
              </button>
              <button type="button" onClick={() => setOpen(false)}>
                Закрити
              </button>
            </div>
          </div>

          <div className="assistant-chat-conv-toolbar">
            <button
              type="button"
              className="assistant-chat-toggle-list"
              onClick={() => setShowConvList((v) => !v)}
              aria-expanded={showConvList}
            >
              Діалоги {showConvList ? '▼' : '▶'}
              {convListLoading ? (
                <span className="assistant-chat-conv-loading"> …</span>
              ) : (
                <span className="assistant-chat-conv-count"> ({conversations.length})</span>
              )}
            </button>
            {!conversationId ? <span className="assistant-chat-draft-badge">Чернетка</span> : null}
          </div>

          {showConvList ? (
            <div className="assistant-chat-conv-list-wrap">
              {conversations.length === 0 && !convListLoading ? (
                <div className="assistant-chat-conv-empty">Ще немає збережених чатів — напишіть перше повідомлення нижче.</div>
              ) : null}
              <ul className="assistant-chat-conv-list" role="list">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      className={`assistant-chat-conv-item ${conversationId === c.id ? 'active' : ''}`}
                      onClick={() => pickConversation(c.id)}
                    >
                      <span className="assistant-chat-conv-item-title">{c.title || 'Чат'}</span>
                      <span className="assistant-chat-conv-item-meta">
                        {c.lastPanelId ? `${c.lastPanelId} · ` : ''}
                        {formatConvDate(c.updatedAt)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {error ? <div className="assistant-chat-error">{error}</div> : null}
          {historyLoading ? <div className="assistant-chat-loading">Завантаження історії…</div> : null}

          <div className="assistant-chat-messages" ref={listRef}>
            {messages.length === 0 && !historyLoading && !conversationId && (
              <div className="assistant-chat-bubble assistant-chat-bubble-ai">
                Привіт! Запитайте про роботу з DTS: панелі, заявки, обладнання — відповім текстом. Я не бачу ваші особисті
                дані без того, що ви самі опишете в повідомленні.
              </div>
            )}
            {messages.map((m, i) => (
              <div
                key={`${m.role}-${i}-${String(m.content).slice(0, 24)}`}
                className={`assistant-chat-bubble assistant-chat-bubble-${m.role === 'user' ? 'user' : 'ai'}`}
              >
                {m.content}
              </div>
            ))}
            {loading ? <div className="assistant-chat-loading">Асистент думає…</div> : null}
          </div>

          <div className="assistant-chat-compose">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Запит… (Enter — надіслати, Shift+Enter — новий рядок)"
              disabled={loading}
              maxLength={4500}
            />
            <div className="assistant-chat-send-row">
              <button type="button" className="assistant-chat-send" onClick={send} disabled={loading}>
                Надіслати
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
