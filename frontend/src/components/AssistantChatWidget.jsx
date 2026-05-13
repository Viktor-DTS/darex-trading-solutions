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
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

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
    if (open && conversationId) {
      loadMessages(conversationId);
    }
  }, [open, conversationId, loadMessages]);

  const newChat = () => {
    setConversationId(null);
    setMessages([]);
    setInput('');
    setError('');
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

          {error ? <div className="assistant-chat-error">{error}</div> : null}
          {historyLoading ? <div className="assistant-chat-loading">Завантаження історії…</div> : null}

          <div className="assistant-chat-messages" ref={listRef}>
            {messages.length === 0 && !historyLoading && (
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
