import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import API_BASE_URL from '../config';
import { tryHandleUnauthorizedResponse } from '../utils/authSession';
import { getPanelById } from '../constants/panelsCatalog';
import { computeTaskModalReadOnly } from '../utils/taskModalAccess';
import AddTaskModal from './AddTaskModal';
import { AssistantMessageContent } from './assistantChatFormat';
import './AssistantChatWidget.css';

/** panelType для AddTaskModal залежить від вкладки; невідомі id зводимо до сервісу. */
function taskModalPanelType(navPanelId) {
  const id = String(navPanelId || 'service').toLowerCase();
  const direct = ['service', 'operator', 'warehouse', 'regional', 'accountant'];
  if (direct.includes(id)) return id;
  if (id === 'accountantapproval') return 'accountant';
  return 'service';
}

/** Плаваючий чат з асистентом — історія в асистентській MongoDB */
export default function AssistantChatWidget({ currentPanel, assistantPanelType, user }) {
  const location = useLocation();
  const modalPanelId = assistantPanelType || currentPanel || 'service';
  const [open, setOpen] = useState(false);
  const [panelWide, setPanelWide] = useState(false);
  const [conversationId, setConversationId] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [convListLoading, setConvListLoading] = useState(false);
  const [deletingConversationId, setDeletingConversationId] = useState(null);
  const [purgeBusy, setPurgeBusy] = useState(false);
  const [showConvList, setShowConvList] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');
  const [taskContextHint, setTaskContextHint] = useState(null);
  const [assistantTaskModalOpen, setAssistantTaskModalOpen] = useState(false);
  const [assistantTaskInitial, setAssistantTaskInitial] = useState(null);
  const [assistantTaskReadOnly, setAssistantTaskReadOnly] = useState(false);
  /** Пропозиція відкрити картку після перевірки номера й підписів (без автозапуску). */
  const [pendingTaskProposal, setPendingTaskProposal] = useState(null);
  /** Безготівка на бухгалтерії без рахунку / заявки на рахунок (перевірка кожні 3 дні). */
  const [cashlessAlert, setCashlessAlert] = useState(null);
  /** Тестовий режим / чесний опис пам’яті (GET /api/assistant/info). */
  const [assistantInfo, setAssistantInfo] = useState({ testMode: true, badge: 'Тестовий режим', lines: [] });
  /** id повідомлення, для якого відкрито поле коментаря до 👎 */
  const [feedbackDraftId, setFeedbackDraftId] = useState(null);
  const [feedbackDraftComment, setFeedbackDraftComment] = useState('');
  const [feedbackSubmittingId, setFeedbackSubmittingId] = useState(null);
  /** Звіт негативних оцінок (лише admin). */
  const [feedbackReportOpen, setFeedbackReportOpen] = useState(false);
  const [feedbackReport, setFeedbackReport] = useState(null);
  const [feedbackReportLoading, setFeedbackReportLoading] = useState(false);
  /** Очікування Так/Ні щодо теми діалогу. */
  const [topicMeta, setTopicMeta] = useState(null);
  const [ratingPrompt, setRatingPrompt] = useState('');
  /** Заявка, до якої прив’язується пояснення для бухгалтерії (кнопка «Пояснити»). */
  const [relayTaskContext, setRelayTaskContext] = useState(null);
  const panelScrollRef = useRef(null);
  const abortRef = useRef(null);

  const abortSend = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const copyAssistantReply = useCallback((text) => {
    const t = String(text || '');
    if (!t) return;
    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = t;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        /* ignore */
      }
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(t).catch(fallback);
    } else {
      fallback();
    }
  }, []);

  useEffect(() => {
    const el = panelScrollRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, open, loading, pendingTaskProposal, taskContextHint]);

  const authHeaders = () => {
    const token = localStorage.getItem('token');
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };

  const openTaskFromAssistant = useCallback(
    async (taskId) => {
      const id = String(taskId || '').trim();
      if (!id) return;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch(`${API_BASE_URL}/tasks/${encodeURIComponent(id)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (tryHandleUnauthorizedResponse(res)) return;
        if (!res.ok) {
          setError('Не вдалося завантажити заявку для модального вікна.');
          return;
        }
        const task = await res.json();
        setAssistantTaskInitial(task);
        setAssistantTaskReadOnly(computeTaskModalReadOnly(user, task));
        setAssistantTaskModalOpen(true);
      } catch {
        setError('Помилка мережі при відкритті заявки.');
      }
    },
    [user],
  );

  const selectRelayTask = useCallback((row) => {
    const taskId = String(row?.taskId || '').trim();
    if (!taskId) return;
    setRelayTaskContext({
      taskId,
      requestNumber: String(row?.requestNumber || '').trim(),
    });
  }, []);

  const isAssistantAdmin = ['admin', 'administrator', 'mgradm'].includes(
    String(user?.role || '').toLowerCase(),
  );

  const mapApiMessage = (m) => ({
    id: m.id || null,
    role: m.role,
    content: m.content,
    createdAt: m.createdAt,
    feedback: m.feedback || null,
  });

  const patchMessageFeedback = useCallback((messageId, feedback) => {
    const mid = String(messageId || '');
    if (!mid) return;
    setMessages((prev) =>
      prev.map((m) => (String(m.id) === mid ? { ...m, feedback } : m)),
    );
  }, []);

  const submitMessageFeedback = useCallback(
    async (messageId, helpful, comment = '') => {
      const mid = String(messageId || '').trim();
      if (!mid || feedbackSubmittingId) return;
      setFeedbackSubmittingId(mid);
      setError('');
      try {
        const res = await fetch(`${API_BASE_URL}/assistant/messages/${encodeURIComponent(mid)}/feedback`, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ helpful, comment: String(comment || '').trim() }),
        });
        if (tryHandleUnauthorizedResponse(res)) return;
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          setError(data?.error || 'Не вдалося зберегти оцінку');
          return;
        }
        if (data?.feedback) {
          patchMessageFeedback(mid, data.feedback);
        }
        setFeedbackDraftId(null);
        setFeedbackDraftComment('');
      } catch (e) {
        setError(String(e.message || e));
      } finally {
        setFeedbackSubmittingId(null);
      }
    },
    [feedbackSubmittingId, patchMessageFeedback],
  );

  const loadFeedbackReport = useCallback(async () => {
    if (!isAssistantAdmin) return;
    setFeedbackReportLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/assistant/feedback/report?days=7&limit=30`, {
        headers: authHeaders(),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || 'Не вдалося завантажити звіт');
        return;
      }
      setFeedbackReport(data);
      setFeedbackReportOpen(true);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setFeedbackReportLoading(false);
    }
  }, [isAssistantAdmin]);

  const loadAssistantInfo = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/assistant/info`, {
        headers: authHeaders(),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) return;
      setAssistantInfo(data);
      if (data.ratingPrompt) setRatingPrompt(data.ratingPrompt);
    } catch {
      /* ignore — залишаємо дефолт testMode */
    }
  }, []);

  const loadCashlessAlerts = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/assistant/alerts/cashless-pending`, {
        headers: authHeaders(),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      if (Array.isArray(data?.tasks) && data.tasks.length > 0) {
        setCashlessAlert({
          tasks: data.tasks,
          summaryUk: data.summaryUk || '',
          openActions: data.tasks.map((t) => ({
            taskId: t.taskId,
            requestNumber: t.requestNumber,
          })),
        });
      } else {
        setCashlessAlert(null);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadCashlessAlerts();
    loadAssistantInfo();
  }, [open, loadCashlessAlerts, loadAssistantInfo]);

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
      setMessages((data?.messages || []).map(mapApiMessage));
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

  const refreshAfterPurgeAndResetIfMissing = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/assistant/conversations`, {
        headers: authHeaders(),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const data = await res.json().catch(() => null);
      if (!res.ok) return;
      const rows = Array.isArray(data?.conversations) ? data.conversations : [];
      setConversations(rows);
      const cid = conversationId ? String(conversationId) : '';
      const stillOpen = cid && rows.some((r) => String(r.id) === cid);
      if (cid && !stillOpen) {
        abortSend();
        setConversationId(null);
        setMessages([]);
        setInput('');
        setError('');
        setTaskContextHint(null);
        setAssistantTaskModalOpen(false);
        setAssistantTaskInitial(null);
        setAssistantTaskReadOnly(false);
        setPendingTaskProposal(null);
      }
    } catch {
      await loadConversationList();
    }
  };

  const deleteConversationPermanently = async (cid) => {
    const id = String(cid || '').trim();
    if (!id || deletingConversationId || purgeBusy || loading) return;
    const ok = window.confirm(
      'Видалити цей діалог з бази DTS? Усі повідомлення буде стерто з асистентської MongoDB без відновлення.',
    );
    if (!ok) return;
    setDeletingConversationId(id);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/assistant/conversations/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (tryHandleUnauthorizedResponse(res)) return;
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error || 'Не вдалося видалити діалог');
        return;
      }
      if (String(conversationId) === id) {
        newChat();
      } else {
        loadConversationList();
      }
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setDeletingConversationId(null);
    }
  };

  const purgeInactiveConversations = async (days) => {
    const d = Number(days);
    if (!Number.isFinite(d) || d < 1 || d > 730 || purgeBusy || loading || deletingConversationId) return;
    const ok = window.confirm(
      `Будуть остаточно видалені з асистентської бази ваші збережені діалоги, не оновлювані більш ніж ${d} діб (за полем останнього оновлення). Продовжити?`,
    );
    if (!ok) return;
    setPurgeBusy(true);
    setError('');
    try {
      const res = await fetch(
        `${API_BASE_URL}/assistant/conversations/purge-old?days=${encodeURIComponent(String(d))}`,
        { method: 'DELETE', headers: authHeaders() },
      );
      if (tryHandleUnauthorizedResponse(res)) return;
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error || 'Не вдалося прибрати старі діалоги');
        return;
      }
      await refreshAfterPurgeAndResetIfMissing();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setPurgeBusy(false);
    }
  };

  const newChat = () => {
    abortSend();
    setConversationId(null);
    setMessages([]);
    setInput('');
    setError('');
    setTaskContextHint(null);
    setTopicMeta(null);
    setAssistantTaskModalOpen(false);
    setAssistantTaskInitial(null);
    setAssistantTaskReadOnly(false);
    setPendingTaskProposal(null);
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
    abortSend();
    setConversationId(cid);
    setMessages([]);
    setError('');
    setTaskContextHint(null);
    setTopicMeta(null);
    setAssistantTaskModalOpen(false);
    setAssistantTaskInitial(null);
    setAssistantTaskReadOnly(false);
    setPendingTaskProposal(null);
    setShowConvList(true);
  };

  const sendTopicAnswer = (yes) => {
    send(yes ? 'Так' : 'Ні');
  };

  const send = async (overrideText) => {
    const text = String(overrideText ?? input).trim();
    if (!text || loading) return;

    const snapshot = [...messages];
    const relayCtxSnapshot = relayTaskContext;

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    setLoading(true);
    setError('');
    setTaskContextHint(null);
    setInput('');
    setMessages([...snapshot, { role: 'user', content: text }]);

    try {
      const panelMeta = getPanelById(currentPanel);
      const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
        method: 'POST',
        headers: authHeaders(),
        signal: ac.signal,
        body: JSON.stringify({
          conversationId,
          message: text,
          relayTaskContext: relayCtxSnapshot?.taskId ? relayCtxSnapshot : undefined,
          context: {
            panelId: currentPanel || '',
            panelLabel: panelMeta?.label || '',
            panelHint: panelMeta?.assistHint || '',
            path: location.pathname || '',
            userRole: user?.role || '',
            userName: user?.name || user?.login || '',
            userRegion: user?.region || '',
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
      const assistantMessageId = data?.assistantMessageId ? String(data.assistantMessageId) : null;
      setMessages([
        ...snapshot,
        { role: 'user', content: text },
        {
          role: 'assistant',
          content: reply,
          id: assistantMessageId,
          feedback: null,
        },
      ]);

      const relayMeta = data?.relayMeta;
      if (relayMeta?.completed) {
        setRelayTaskContext(null);
      } else if (relayMeta?.awaitingConfirm && relayMeta?.taskId) {
        setRelayTaskContext({
          taskId: String(relayMeta.taskId),
          requestNumber: String(relayMeta.requestNumber || ''),
        });
      }

      const tc = data?.taskContext;
      const cashlessFromServer = data?.cashlessAlert || tc?.cashlessPending;
      if (cashlessFromServer?.openActions?.length) {
        setCashlessAlert(cashlessFromServer);
      } else {
        loadCashlessAlerts();
      }

      const showTaskCtxHint =
        tc &&
        ((tc.requestNumbers?.length ?? 0) > 0 ||
          Boolean(tc.taskModal) ||
          Boolean(tc.discovery) ||
          Boolean(tc.cashlessPending));
      if (showTaskCtxHint && tc) {
        setTaskContextHint({
          matched: Number(tc.matched) || 0,
          requestNumbers: Array.isArray(tc.requestNumbers) ? tc.requestNumbers : [],
          elevated: Boolean(tc.elevated),
          taskModal: tc.taskModal ?? null,
          discovery: tc.discovery ?? null,
          cashlessPending: tc.cashlessPending ?? null,
        });
      } else {
        setTaskContextHint(null);
      }

      const proposal = data?.taskContext?.taskModal?.proposal;
      if (proposal?.taskId) {
        setPendingTaskProposal(proposal);
      } else {
        setPendingTaskProposal(null);
      }

      if (data?.ratingPrompt) {
        setRatingPrompt(data.ratingPrompt);
      }

      const tm = data?.topicMeta;
      if (tm?.awaitingTopicConfirm) {
        setTopicMeta(tm);
      } else if (tm?.completed) {
        setTopicMeta(null);
      } else if (!tm?.awaitingTopicConfirm) {
        setTopicMeta(null);
      }

      loadConversationList();
    } catch (e) {
      if (e?.name === 'AbortError') {
        setMessages(snapshot);
        setInput(text);
        setError('');
        return;
      }
      setMessages(snapshot);
      setError(String(e.message || e));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
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
        title={assistantInfo?.testMode ? 'Асистент DTS — тестовий режим (beta)' : 'Асистент DTS'}
        onClick={() => setOpen((o) => !o)}
      >
        🤖
      </button>

      {open && (
        <div
          className={`assistant-chat-panel${panelWide ? ' assistant-chat-panel--wide' : ''}`}
          role="dialog"
          aria-label="Чат з асистентом"
        >
          <div className="assistant-chat-panel-header">
            <h3>
              Асистент DTS
              {assistantInfo?.badge ? (
                <span className="assistant-chat-beta-badge" title="Асистент у розробці">
                  {assistantInfo.badge}
                </span>
              ) : null}
            </h3>
            <div className="assistant-chat-actions">
              <button
                type="button"
                className="assistant-chat-toggle-wide"
                aria-pressed={panelWide}
                title={panelWide ? 'Звичний розмір вікна' : 'Ширший і вищий — зручніше читати'}
                onClick={() => setPanelWide((w) => !w)}
              >
                {panelWide ? 'Компактно' : 'Ширше'}
              </button>
              <button type="button" onClick={newChat}>
                Новий чат
              </button>
              {isAssistantAdmin ? (
                <button
                  type="button"
                  className="assistant-chat-feedback-report-btn"
                  title="Звіт оцінок асистента за 7 днів"
                  disabled={feedbackReportLoading}
                  onClick={() => {
                    if (feedbackReportOpen) {
                      setFeedbackReportOpen(false);
                    } else {
                      loadFeedbackReport();
                    }
                  }}
                >
                  {feedbackReportLoading ? '…' : feedbackReportOpen ? 'Звіт ▲' : 'Звіт 👎'}
                </button>
              ) : null}
              <button type="button" onClick={() => setOpen(false)}>
                Закрити
              </button>
            </div>
          </div>

          {assistantInfo?.testMode ? (
            <div className="assistant-chat-beta-banner" role="note" aria-label="Про тестовий режим асистента">
              <div className="assistant-chat-beta-banner-title">
                {assistantInfo.title || 'Асистент у тестовому режимі'}
              </div>
              <ul className="assistant-chat-beta-banner-list">
                {(assistantInfo.lines?.length
                  ? assistantInfo.lines
                  : [
                      'Асистент ще невеликий і в розробці — можливі помилки.',
                      'Не навчається сам на ваших листуваннях; пам’ять лише в цьому збереженому чаті.',
                    ]
                ).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {ratingPrompt ? (
            <div className="assistant-chat-rating-banner" role="note">
              {ratingPrompt}
            </div>
          ) : null}

          {feedbackReportOpen && feedbackReport ? (
            <div className="assistant-chat-feedback-report" role="region" aria-label="Звіт зворотного зв’язку">
              <div className="assistant-chat-feedback-report-head">
                <strong>Зворотний зв’язок за {feedbackReport.periodDays} д.</strong>
                <span>
                  👍 {feedbackReport.summary?.positive ?? 0} · 👎 {feedbackReport.summary?.negative ?? 0}
                  {feedbackReport.summary?.positiveRate != null
                    ? ` · ${feedbackReport.summary.positiveRate}% корисних`
                    : ''}
                </span>
              </div>
              {(feedbackReport.negativeItems || []).length === 0 ? (
                <p className="assistant-chat-feedback-report-empty">Негативних оцінок за період немає.</p>
              ) : (
                <ul className="assistant-chat-feedback-report-list" role="list">
                  {(feedbackReport.negativeItems || []).map((row) => (
                    <li key={row.messageId}>
                      <div className="assistant-chat-feedback-report-meta">
                        {row.userLogin || '—'} · {formatConvDate(row.ratedAt)}
                        {row.conversationTitle ? ` · ${row.conversationTitle}` : ''}
                      </div>
                      {row.userQuestionPreview ? (
                        <div className="assistant-chat-feedback-report-q">
                          <span>Питання:</span> {row.userQuestionPreview}
                        </div>
                      ) : null}
                      <div className="assistant-chat-feedback-report-a">
                        <span>Відповідь:</span> {row.assistantPreview}
                      </div>
                      {row.comment ? (
                        <div className="assistant-chat-feedback-report-c">
                          <span>Коментар:</span> {row.comment}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {feedbackReport.knowledge ? (
                <div className="assistant-chat-feedback-report-knowledge">
                  <strong>База знань (👍):</strong> {feedbackReport.knowledge.total ?? 0} записів
                  {feedbackReport.topicDecisions != null ? (
                    <span> · рішень про тему: {feedbackReport.topicDecisions}</span>
                  ) : null}
                  {(feedbackReport.knowledge.top || []).length > 0 ? (
                    <ul className="assistant-chat-feedback-report-list" role="list">
                      {(feedbackReport.knowledge.top || []).map((k) => (
                        <li key={`${k.questionPreview}-${k.helpfulCount}`}>
                          👍×{k.helpfulCount} · {k.questionPreview}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

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
                  <li key={c.id} className="assistant-chat-conv-row">
                    <button
                      type="button"
                      className={`assistant-chat-conv-item ${conversationId === c.id ? 'active' : ''}`}
                      disabled={String(deletingConversationId) === String(c.id)}
                      onClick={() => pickConversation(c.id)}
                    >
                      <span className="assistant-chat-conv-item-title">{c.title || 'Чат'}</span>
                      <span className="assistant-chat-conv-item-meta">
                        {c.lastPanelId ? `${c.lastPanelId} · ` : ''}
                        {formatConvDate(c.updatedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="assistant-chat-conv-delete"
                      aria-label="Видалити діалог з бази"
                      title="Видалити діалог і повідомлення з MongoDB"
                      disabled={purgeBusy || loading || Boolean(deletingConversationId)}
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        deleteConversationPermanently(c.id);
                      }}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              {conversations.length > 0 ? (
                <div className="assistant-chat-conv-purge" role="group" aria-label="Очистити старі збережені діалоги">
                  <span className="assistant-chat-conv-purge-label">Неактивні в MongoDB:</span>
                  <button
                    type="button"
                    className="assistant-chat-conv-purge-btn"
                    title="Видалити з асистентської бази ваші чати без оновлень понад 30 діб"
                    disabled={purgeBusy || Boolean(deletingConversationId) || loading}
                    onClick={() => purgeInactiveConversations(30)}
                  >
                    &gt;30 д.
                  </button>
                  <button
                    type="button"
                    className="assistant-chat-conv-purge-btn"
                    title="Видалити з асистентської бази ваші чати без оновлень понад 90 діб"
                    disabled={purgeBusy || Boolean(deletingConversationId) || loading}
                    onClick={() => purgeInactiveConversations(90)}
                  >
                    &gt;90 д.
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {cashlessAlert?.openActions?.length > 0 ? (
            <div className="assistant-chat-cashless-alert" role="region" aria-label="Заявки без рахунку">
              <div className="assistant-chat-cashless-alert-title">Безготівка без рахунку</div>
              <p className="assistant-chat-cashless-alert-text">
                {cashlessAlert.summaryUk ||
                  'Є заявки на затвердженні у бухгалтера з безготівковою оплатою без рахунку та без заявки на рахунок. Перевірте та запросіть рахунок.'}
              </p>
              <p className="assistant-chat-cashless-alert-hint">
                «Відкрити» — перегляд картки. «Пояснити» — прив’язати наступне повідомлення в чаті до цієї заявки (передача бухгалтеру після підтвердження Так/Ні).
              </p>
              <ul className="assistant-chat-cashless-task-list" role="list">
                {cashlessAlert.openActions.map((row) => {
                  const label = row.requestNumber || row.taskId;
                  const selected = relayTaskContext?.taskId === row.taskId;
                  return (
                    <li key={row.taskId} className={`assistant-chat-cashless-task-row${selected ? ' selected' : ''}`}>
                      <span className="assistant-chat-cashless-task-label">{label}</span>
                      <div className="assistant-chat-cashless-task-actions">
                        <button
                          type="button"
                          className="assistant-chat-cashless-open-btn"
                          title={`Відкрити заявку ${label}`}
                          onClick={() => openTaskFromAssistant(row.taskId)}
                        >
                          Відкрити
                        </button>
                        <button
                          type="button"
                          className={`assistant-chat-cashless-explain-btn${selected ? ' active' : ''}`}
                          title={`Пояснення для ${label} — опишіть причину в полі нижче`}
                          onClick={() => selectRelayTask(row)}
                        >
                          Пояснити
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          <div className="assistant-chat-panel-main" ref={panelScrollRef}>
            {error ? <div className="assistant-chat-error">{error}</div> : null}
            {historyLoading ? <div className="assistant-chat-loading">Завантаження історії…</div> : null}

          <div className="assistant-chat-messages">
            {messages.length === 0 && !historyLoading && !conversationId && (
              <div className="assistant-chat-msg assistant-chat-msg--ai">
                <span className="assistant-chat-msg-label">Асистент</span>
                <div className="assistant-chat-bubble assistant-chat-bubble-ai assistant-chat-welcome">
                  Привіт! Я асистент DTS у <strong>тестовому режимі</strong>.
                  <strong> Оцінюйте відповіді 👍</strong> — так я навчаюся для всієї команди DTS.
                  Бачу ваші інші збережені чати; якщо зміните тему в одному чаті — запитаю «Так/Ні», чи це продовження попереднього.
                  Фінанси та ПІБ маскуються перед GPT; <strong>ЄДРПОУ</strong> — відкрито. Номер заявки (KV-1022) можна вписати тут або раніше.                </div>
              </div>
            )}
            {messages.map((m, i) => {
              const panelHint = getPanelById(currentPanel)?.label || currentPanel || '';
              const userMetaLine = m.createdAt
                ? formatConvDate(m.createdAt)
                : [panelHint, 'щойно'].filter(Boolean).join(' · ');
              const msgKey = m.id || `${m.role}-${i}-${String(m.content).slice(0, 24)}`;
              const canRate = Boolean(m.id) && m.role === 'assistant';
              const ratedUp = m.feedback?.helpful === true;
              const ratedDown = m.feedback?.helpful === false;
              const draftOpen = feedbackDraftId === m.id;
              const submitting = feedbackSubmittingId === m.id;

              return m.role === 'user' ? (
                <div key={msgKey} className="assistant-chat-msg assistant-chat-msg--user">
                  <span className="assistant-chat-msg-label">Ви</span>
                  <div className="assistant-chat-bubble assistant-chat-bubble-user">{m.content}</div>
                  <div className="assistant-chat-msg-meta">{userMetaLine}</div>
                </div>
              ) : (
                <div key={msgKey} className="assistant-chat-msg assistant-chat-msg--ai">
                  <div className="assistant-chat-msg-head">
                    <span className="assistant-chat-msg-label">Асистент</span>
                    <div className="assistant-chat-msg-actions">
                      {canRate ? (
                        <>
                          <button
                            type="button"
                            className={`assistant-chat-feedback-btn${ratedUp ? ' active-up' : ''}`}
                            title="Корисна відповідь — додає її в базу знань для всієї команди DTS"
                            disabled={submitting}
                            aria-pressed={ratedUp}
                            onClick={() => submitMessageFeedback(m.id, true)}
                          >
                            👍
                          </button>
                          <button
                            type="button"
                            className={`assistant-chat-feedback-btn${ratedDown ? ' active-down' : ''}`}
                            title="Не те — додати коментар (необов’язково)"
                            disabled={submitting}
                            aria-pressed={ratedDown}
                            onClick={() => {
                              setFeedbackDraftId(m.id);
                              setFeedbackDraftComment(m.feedback?.comment || '');
                            }}
                          >
                            👎
                          </button>
                        </>
                      ) : null}
                      <button
                        type="button"
                        className="assistant-chat-copy"
                        onClick={() => copyAssistantReply(m.content)}
                      >
                        Копіювати
                      </button>
                    </div>
                  </div>
                  <div className="assistant-chat-bubble assistant-chat-bubble-ai">
                    <div className="assistant-chat-bubble-text">
                      <AssistantMessageContent text={m.content} />
                    </div>
                  </div>
                  {canRate && draftOpen ? (
                    <div className="assistant-chat-feedback-draft">
                      <textarea
                        className="assistant-chat-feedback-comment"
                        rows={2}
                        maxLength={500}
                        placeholder="Що не так або чого бракує? (необов’язково)"
                        value={feedbackDraftComment}
                        onChange={(e) => setFeedbackDraftComment(e.target.value)}
                      />
                      <div className="assistant-chat-feedback-draft-actions">
                        <button
                          type="button"
                          className="assistant-chat-feedback-send"
                          disabled={submitting}
                          onClick={() => submitMessageFeedback(m.id, false, feedbackDraftComment)}
                        >
                          Надіслати 👎
                        </button>
                        <button
                          type="button"
                          className="assistant-chat-feedback-cancel"
                          disabled={submitting}
                          onClick={() => {
                            setFeedbackDraftId(null);
                            setFeedbackDraftComment('');
                          }}
                        >
                          Скасувати
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {ratedDown && m.feedback?.comment && !draftOpen ? (
                    <div className="assistant-chat-feedback-note">Ваш коментар: {m.feedback.comment}</div>
                  ) : null}
                </div>
              );
            })}
            {loading ? <div className="assistant-chat-loading">Асистент думає…</div> : null}
          </div>

          {taskContextHint?.requestNumbers?.length > 0 ||
          taskContextHint?.taskModal ||
          (Array.isArray(taskContextHint?.discovery?.openActions) &&
            taskContextHint.discovery.openActions.length >= 1) ? (
            <div className="assistant-chat-context-hint" role="status">
              {(taskContextHint.requestNumbers || []).length > 0 ? (
                <span>
                  {taskContextHint.matched > 0
                    ? `Підставлено дані із DTS для: ${(taskContextHint.requestNumbers || []).join(', ')}. `
                    : taskContextHint.elevated
                      ? `У базі DTS не знайдено заявок з номерами: ${(taskContextHint.requestNumbers || []).join(', ')} (повний доступ адміністратора — перевірте номер або глобальний пошук у системі). `
                      : `У межах вашого доступу не видно заявок: ${(taskContextHint.requestNumbers || []).join(', ')}. `}
                </span>
              ) : null}
              {Array.isArray(taskContextHint?.discovery?.openActions) &&
              taskContextHint.discovery.openActions.length > 1 ? (
                <span>
                  Кілька заявок за результатом пошуку — оберіть кнопку «Відкрити форму» біля потрібного номера нижче.
                </span>
              ) : null}
              {pendingTaskProposal?.taskId ? (
                <span>Перевірте номер і підписи нижче, потім натисніть «Відкрити форму заявки».</span>
              ) : null}
              {!pendingTaskProposal?.taskId &&
              taskContextHint.taskModal &&
              taskContextHint.taskModal.reason === 'multiple_matches' ? (
                <span>Знайдено кілька заявок за запитом — оберіть конкретний номер у таблиці або уточніть у чаті.</span>
              ) : null}
              {!pendingTaskProposal?.taskId &&
              taskContextHint.taskModal &&
              taskContextHint.taskModal.reason === 'no_request_number_in_thread' ? (
                <span>Укажіть номер заявки (наприклад KV-1022), щоб відкрити картку з чату.</span>
              ) : null}
            </div>
          ) : null}

          {Array.isArray(taskContextHint?.discovery?.openActions) &&
          taskContextHint.discovery.openActions.length >= 1 ? (
            <div
              className="assistant-chat-discovery-open-list"
              role="group"
              aria-label="Відкрити заявку з результатів пошуку асистента"
            >
              <div className="assistant-chat-discovery-open-head">
                <div className="assistant-chat-discovery-open-title">Заявки</div>
                <p className="assistant-chat-discovery-open-hint">Оберіть номер — відкриється картка в модальному вікні.</p>
              </div>
              <div className="assistant-chat-discovery-open-grid">
                {taskContextHint.discovery.openActions.map((row) => {
                  const label = row.requestNumber || row.taskId;
                  return (
                    <button
                      key={row.taskId}
                      type="button"
                      className="assistant-chat-discovery-open-btn"
                      title={`Відкрити форму заявки ${label}`}
                      aria-label={`Відкрити форму заявки ${label}`}
                      onClick={() => openTaskFromAssistant(row.taskId)}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {pendingTaskProposal?.taskId ? (
            <div className="assistant-chat-task-proposal" role="region" aria-labelledby="assistant-proposal-heading">
              <div id="assistant-proposal-heading" className="assistant-chat-task-proposal-title">
                Відкрити форму заявки?
              </div>
              <dl className="assistant-chat-task-proposal-dl">
                <dt>Номер у базі DTS</dt>
                <dd>{pendingTaskProposal.requestNumberInDb || '—'}</dd>
                <dt>Згадано у чаті</dt>
                <dd>{(pendingTaskProposal.mentionedNumbers || []).join(', ') || '—'}</dd>
                {pendingTaskProposal.statusInDb ? (
                  <>
                    <dt>Статус у записі</dt>
                    <dd>{pendingTaskProposal.statusInDb}</dd>
                  </>
                ) : null}
                <dt>Узгодження номера</dt>
                <dd>{pendingTaskProposal.numberAlignmentNoteUk}</dd>
                <dt>Підтвердження (зведення)</dt>
                <dd>{pendingTaskProposal.confirmationsSummaryUk}</dd>
                <dt>Доступ після відкриття</dt>
                <dd>{pendingTaskProposal.accessHintUk}</dd>
              </dl>
              <div className="assistant-chat-task-proposal-actions">
                <button
                  type="button"
                  className="assistant-chat-proposal-open"
                  onClick={() => {
                    const id = pendingTaskProposal.taskId;
                    setPendingTaskProposal(null);
                    openTaskFromAssistant(id);
                  }}
                >
                  Відкрити форму заявки
                </button>
                <button type="button" className="assistant-chat-proposal-dismiss" onClick={() => setPendingTaskProposal(null)}>
                  Скасувати
                </button>
              </div>
            </div>
          ) : null}
          </div>

          <div className="assistant-chat-compose">
            {topicMeta?.awaitingTopicConfirm ? (
              <div className="assistant-chat-topic-confirm" role="group" aria-label="Підтвердження теми діалогу">
                <p className="assistant-chat-topic-confirm-text">Це стосується попередньої теми в цьому чаті?</p>
                {topicMeta.pendingMessagePreview ? (
                  <p className="assistant-chat-topic-confirm-preview">«{topicMeta.pendingMessagePreview}»</p>
                ) : null}
                <div className="assistant-chat-topic-confirm-actions">
                  <button type="button" className="assistant-chat-topic-yes" disabled={loading} onClick={() => sendTopicAnswer(true)}>
                    Так
                  </button>
                  <button type="button" className="assistant-chat-topic-no" disabled={loading} onClick={() => sendTopicAnswer(false)}>
                    Ні
                  </button>
                </div>
              </div>
            ) : null}
            {relayTaskContext?.taskId ? (
              <div className="assistant-chat-relay-task-chip" role="status">
                <span>
                  Пояснення для:{' '}
                  <strong>{relayTaskContext.requestNumber || relayTaskContext.taskId}</strong>
                </span>
                <button type="button" className="assistant-chat-relay-task-clear" onClick={() => setRelayTaskContext(null)}>
                  ×
                </button>
              </div>
            ) : null}
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={
                topicMeta?.awaitingTopicConfirm
                  ? 'Або введіть Так / Ні…'
                  : relayTaskContext?.requestNumber
                  ? `Пояснення для ${relayTaskContext.requestNumber}… (Enter — надіслати)`
                  : 'Запит… (Enter — надіслати, Shift+Enter — новий рядок)'
              }
              disabled={loading}
              maxLength={4500}
            />
            <div className="assistant-chat-send-row">
              {loading ? (
                <button type="button" className="assistant-chat-stop" onClick={abortSend}>
                  Зупинити
                </button>
              ) : null}
              <button type="button" className="assistant-chat-send" onClick={() => send()} disabled={loading}>
                Надіслати
              </button>
            </div>
          </div>
        </div>
      )}
      {assistantTaskModalOpen && assistantTaskInitial ? (
        <AddTaskModal
          open={assistantTaskModalOpen}
          overlayStyle={{ zIndex: 10008 }}
          onClose={() => {
            setAssistantTaskModalOpen(false);
            setAssistantTaskInitial(null);
            setAssistantTaskReadOnly(false);
          }}
          user={user}
          initialData={assistantTaskInitial}
          panelType={taskModalPanelType(modalPanelId)}
          readOnly={assistantTaskReadOnly}
          onSave={(savedTask, options) => {
            if (!options?.keepModalOpen) {
              setAssistantTaskModalOpen(false);
              setAssistantTaskInitial(null);
              setAssistantTaskReadOnly(false);
              setTimeout(() => window.location.reload(), 500);
            }
          }}
        />
      ) : null}
    </>
  );
}
