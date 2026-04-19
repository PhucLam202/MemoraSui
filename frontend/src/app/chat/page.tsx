'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ClayCard } from '@/components/shared/ClayCard';
import { ClayInput } from '@/components/shared/ClayInput';
import { ClayButton } from '@/components/shared/ClayButton';
import { ChatBubble } from '@/components/modules/chat/ChatBubble';
import { fetchApi, postApi } from '@/lib/api-client';
import { loadWalletSessionFromStorage, type WalletSession } from '@/lib/wallet-session';

type UiMessage = {
  id: string;
  text: string;
  isAi: boolean;
  time: string;
  sources?: Array<{
    label: string;
    summary: string;
    url?: string;
  }>;
};

type ChatSessionItem = {
  id: string;
  title: string;
  createdAt: string;
  lastMessageAt: string;
};

type ChatMessageItem = {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: string;
  toolCalls?: Array<{
    tool?: string;
    status?: string;
    summary?: string;
    links?: Array<{ label?: string; url?: string }>;
  }>;
};

type PaginationResult<T> = {
  items: T[];
};

type SendMessageResponse = {
  assistantMessage: {
    id: string;
    content: string;
    toolCalls?: Array<{
      tool?: string;
      status?: string;
      summary?: string;
      links?: Array<{ label?: string; url?: string }>;
    }>;
  };
  session: { id: string };
};

const INTRO_MESSAGE = 'Hello! Ask about portfolio, activity, gas fee, protocols, or objects.';
const CHAT_STORAGE_PREFIX = 'sui-portfolio:chat-active-session:';

function formatDisplayTime(value?: string | Date) {
  const date = value instanceof Date ? value : value ? new Date(value) : new Date();
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSessionTime(value: string) {
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildStorageKey(walletId: string) {
  return `${CHAT_STORAGE_PREFIX}${walletId}`;
}

function getStoredSessionId(walletId: string) {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(buildStorageKey(walletId));
}

function setStoredSessionId(walletId: string, value?: string) {
  if (typeof window === 'undefined') return;
  const key = buildStorageKey(walletId);
  if (value) {
    window.localStorage.setItem(key, value);
    return;
  }
  window.localStorage.removeItem(key);
}

function mapToolSources(
  toolCalls?: Array<{
    tool?: string;
    status?: string;
    summary?: string;
    links?: Array<{ label?: string; url?: string }>;
  }>,
) {
  return (toolCalls ?? []).map((call) => {
    const tool = call.tool ?? 'unknown-tool';
    const summary = call.summary ?? call.status ?? 'used';
    const firstLink = call.links?.find((item) => item?.url);
    return {
      label: tool,
      summary,
      url: firstLink?.url,
    };
  });
}

function getSuiScanUrl(digest: string) {
  return `https://suivision.xyz/txblock/${encodeURIComponent(digest)}`;
}

function mapMessageToUi(message: ChatMessageItem): UiMessage {
  return {
    id: message.id,
    text: message.content,
    isAi: message.role !== 'user',
    time: formatDisplayTime(message.timestamp),
    sources: mapToolSources(message.toolCalls),
  };
}

export default function ChatPage() {
  const [session, setSession] = useState<WalletSession | null>(null);
  const walletId = session?.walletId ?? session?.address ?? null;

  const [input, setInput] = useState('');
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'intro',
      text: INTRO_MESSAGE,
      isAi: true,
      time: formatDisplayTime(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const activeSession = useMemo(
    () => sessions.find((item) => item.id === sessionId) ?? null,
    [sessionId, sessions],
  );

  useEffect(() => {
    const syncSession = () => {
      setSession(loadWalletSessionFromStorage());
    };

    syncSession();
    window.addEventListener('storage', syncSession);
    window.addEventListener('wallet-session-updated', syncSession as EventListener);

    return () => {
      window.removeEventListener('storage', syncSession);
      window.removeEventListener('wallet-session-updated', syncSession as EventListener);
    };
  }, []);

  useEffect(() => {
    const syncLayout = () => {
      setIsCompactLayout(window.innerWidth < 960);
    };

    syncLayout();
    window.addEventListener('resize', syncLayout);

    return () => {
      window.removeEventListener('resize', syncLayout);
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (!walletId) {
      setSessions([]);
      setSessionId(undefined);
      setMessages([
        {
          id: 'intro',
          text: INTRO_MESSAGE,
          isAi: true,
          time: formatDisplayTime(),
        },
      ]);
      return;
    }

    const currentWalletId = walletId;
    let cancelled = false;

    async function loadSessions() {
      setLoadingSessions(true);
      setChatError(null);

      try {
        const response = await fetchApi<PaginationResult<ChatSessionItem>>('/chat/sessions', {
          walletId: currentWalletId,
          page: 1,
          limit: 50,
        });
        if (cancelled) return;

        const nextSessions = response.items ?? [];
        setSessions(nextSessions);

        const storedSessionId = getStoredSessionId(currentWalletId);
        const nextSession =
          nextSessions.find((item) => item.id === storedSessionId) ??
          nextSessions[0] ??
          null;

        setSessionId(nextSession?.id);
        if (!nextSession) {
          setMessages([
            {
              id: 'intro',
              text: INTRO_MESSAGE,
              isAi: true,
              time: formatDisplayTime(),
            },
          ]);
        }
      } catch (error) {
        if (cancelled) return;
        setChatError(error instanceof Error ? error.message : 'Failed to load chat history.');
      } finally {
        if (!cancelled) {
          setLoadingSessions(false);
        }
      }
    }

    void loadSessions();

    return () => {
      cancelled = true;
    };
  }, [walletId]);

  useEffect(() => {
    if (!walletId || !sessionId) {
      if (walletId) {
        setStoredSessionId(walletId, undefined);
      }
      setMessages([
        {
          id: 'intro',
          text: INTRO_MESSAGE,
          isAi: true,
          time: formatDisplayTime(),
        },
      ]);
      return;
    }

    const currentWalletId = walletId;
    let cancelled = false;

    async function loadConversation() {
      setLoadingMessages(true);
      setChatError(null);
      setStoredSessionId(currentWalletId, sessionId);

      try {
        const response = await fetchApi<PaginationResult<ChatMessageItem>>(`/chat/sessions/${sessionId}/messages`, {
          page: 1,
          limit: 200,
        });
        if (cancelled) return;

        const nextMessages = (response.items ?? []).map(mapMessageToUi);
        setMessages(
          nextMessages.length > 0
            ? nextMessages
            : [
                {
                  id: 'intro',
                  text: INTRO_MESSAGE,
                  isAi: true,
                  time: formatDisplayTime(),
                },
              ],
        );
      } catch (error) {
        if (cancelled) return;
        setChatError(error instanceof Error ? error.message : 'Failed to load conversation.');
      } finally {
        if (!cancelled) {
          setLoadingMessages(false);
        }
      }
    }

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [sessionId, walletId]);

  async function refreshSessions(nextActiveSessionId?: string) {
    if (!walletId) return;

    const response = await fetchApi<PaginationResult<ChatSessionItem>>('/chat/sessions', {
      walletId,
      page: 1,
      limit: 50,
    });

    const nextSessions = response.items ?? [];
    setSessions(nextSessions);

    if (!nextActiveSessionId) return;

    const matched = nextSessions.find((item) => item.id === nextActiveSessionId);
    if (matched) {
      setSessionId(matched.id);
    }
  }

  async function handleSend() {
    if (!input.trim() || !walletId || sending) return;

    const content = input.trim();
    setInput('');
    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      text: content,
      isAi: false,
      time: formatDisplayTime(),
    };

    setMessages((prev) => {
      const base =
        prev.length === 1 && prev[0]?.id === 'intro' && !sessionId
          ? []
          : prev;
      return [...base, userMessage];
    });
    setSending(true);
    setChatError(null);

    try {
      const response = await postApi<SendMessageResponse>('/chat/messages', {
        walletId,
        sessionId,
        content,
      });

      const nextSessionId = response.session.id;
      const assistantMessage: UiMessage = {
        id: response.assistantMessage.id,
        text: response.assistantMessage.content,
        isAi: true,
        time: formatDisplayTime(),
        sources: mapToolSources(response.assistantMessage.toolCalls),
      };

      setMessages((prev) => [...prev, assistantMessage]);
      setSessionId(nextSessionId);
      setStoredSessionId(walletId, nextSessionId);
      await refreshSessions(nextSessionId);
    } catch (error) {
      setChatError(error instanceof Error ? error.message : 'Failed to send message.');
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: error instanceof Error ? `Error: ${error.message}` : 'Failed to send message.',
          isAi: true,
          time: formatDisplayTime(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function handleNewChat() {
    setSessionId(undefined);
    setInput('');
    setChatError(null);
    setMessages([
      {
        id: 'intro',
        text: INTRO_MESSAGE,
        isAi: true,
        time: formatDisplayTime(),
      },
    ]);
    if (walletId) {
      setStoredSessionId(walletId, undefined);
    }
  }

  return (
    <MainLayout activePath="/chat">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompactLayout ? 'minmax(0, 1fr)' : '280px minmax(0, 1fr)',
          gridTemplateRows: isCompactLayout ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
          height: 'calc(100vh - 180px)', /* Adjusted to fit better with header and padding */
          gap: 'var(--spacing-lg)',
          width: '100%',
          maxWidth: '100%',
        }}
      >
        <ClayCard
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '20px',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', paddingBottom: '4px' }}>
            <div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-secondary)', marginBottom: '2px', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', opacity: 0.8 }}>Chat History</div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: 800 }}>Saved sessions</div>
            </div>
            <button 
              onClick={handleNewChat} 
              disabled={!walletId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 10px',
                borderRadius: '12px',
                backgroundColor: 'var(--white)',
                color: 'var(--matcha-accent)',
                fontSize: '0.75rem',
                fontWeight: 700,
                border: 'none',
                boxShadow: 'var(--shadow-outer)',
                cursor: walletId ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
                opacity: walletId ? 1 : 0.5,
              }}
              className="new-chat-btn-premium"
            >
              <MessageSquarePlus size={14} />
              <span>New chat</span>
            </button>
          </div>

          {!walletId && (
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
              Connect and authenticate a wallet to view saved chats.
            </div>
          )}

          {walletId && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', minHeight: 0, overflowY: 'auto' }}>
              {loadingSessions && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Loading sessions...</div>
              )}

              {!loadingSessions && sessions.length === 0 && (
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', lineHeight: 1.6 }}>
                  No previous chats yet. Start a new conversation and it will be saved here.
                </div>
              )}

              {sessions.map((item) => {
                const isActive = item.id === sessionId;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSessionId(item.id)}
                    className={`session-item-btn ${isActive ? 'active' : ''}`}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: '16px 20px',
                      borderRadius: '20px',
                      border: 'none',
                      backgroundColor: isActive ? 'var(--white)' : 'transparent',
                      boxShadow: isActive ? '0 10px 30px rgba(0,0,0,0.05)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '6px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'var(--font-heading)',
                        fontSize: '0.95rem',
                        fontWeight: 700,
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        width: '100%',
                      }}
                      title={item.title || 'Untitled chat'}
                    >
                      {item.title || 'Untitled chat'}
                    </div>
                    <div style={{ 
                      fontSize: '0.75rem', 
                      color: isActive ? 'var(--matcha-accent)' : 'var(--text-secondary)',
                      fontWeight: 600,
                      opacity: 0.8
                    }}>
                      {formatSessionTime(item.lastMessageAt)}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ClayCard>

        <ClayCard style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid var(--border-color)',
              backgroundColor: 'rgba(255, 255, 255, 0.4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem' }}>
                {activeSession?.title ?? 'New chat'}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                {activeSession ? `Last updated ${formatSessionTime(activeSession.lastMessageAt)}` : 'A fresh conversation will be saved after your first message.'}
              </div>
            </div>
          </div>

          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: 'var(--spacing-lg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '24px',
            }}
          >
            {loadingMessages ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Loading conversation...</div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <ChatBubble message={msg.text} isAi={msg.isAi} timestamp={msg.time} />
                  {msg.isAi && msg.sources && msg.sources.length > 0 && (
                    <div style={{ paddingLeft: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                        Sources
                      </span>
                      {msg.sources.map((source, index) => {
                        const label = `${source.label} · ${source.summary}`;
                        const content = (
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '6px',
                              padding: '6px 10px',
                              borderRadius: '999px',
                              backgroundColor: 'rgba(255,255,255,0.75)',
                              border: '1px solid var(--border-color)',
                              color: 'var(--text-primary)',
                              fontSize: '0.78rem',
                              lineHeight: 1.2,
                            }}
                            title={label}
                          >
                            <span
                              style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '999px',
                                backgroundColor: source.url ? 'var(--matcha-accent)' : 'var(--text-secondary)',
                                flexShrink: 0,
                              }}
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
                              {label}
                            </span>
                          </span>
                        );

                        return source.url ? (
                          <a
                            key={`${source.label}-${index}`}
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            style={{ textDecoration: 'none' }}
                          >
                            {content}
                          </a>
                        ) : (
                          <span key={`${source.label}-${index}`}>{content}</span>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div
            style={{
              padding: 'var(--spacing-lg)',
              borderTop: '1px solid var(--border-color)',
              backgroundColor: 'var(--matcha-bg)',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
            }}
          >
            {chatError && (
              <div style={{ fontSize: '0.85rem', color: '#B85C5C' }}>{chatError}</div>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <ClayInput
                  placeholder={walletId ? 'Type your question...' : 'Connect/auth wallet first...'}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                />
              </div>
              <ClayButton onClick={() => void handleSend()} disabled={!walletId || sending || loadingMessages}>
                {sending ? 'Sending...' : 'Send'}
              </ClayButton>
            </div>
          </div>
        </ClayCard>
      </div>

      <style jsx>{`
        .session-item-btn:hover {
          background-color: rgba(255, 255, 255, 0.5) !important;
        }
        .session-item-btn:active {
          transform: scale(0.98);
        }
        .session-item-btn.active:hover {
          background-color: var(--white) !important;
          transform: none;
        }
        .new-chat-btn-premium:hover {
          background-color: var(--matcha-highlight) !important;
          transform: translateY(-2px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.08) !important;
        }
        .new-chat-btn-premium:active {
          transform: scale(0.96);
        }
      `}</style>
    </MainLayout>
  );
}
