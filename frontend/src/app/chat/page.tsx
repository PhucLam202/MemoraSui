'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { MessageSquarePlus, Activity, ChevronDown, ChevronRight, Loader2, SendHorizonal, X } from 'lucide-react';
import { useDAppKit } from '@mysten/dapp-kit-react';
import { Transaction } from '@mysten/sui/transactions';
import { MainLayout } from '@/components/layout/MainLayout';
import { ClayCard } from '@/components/shared/ClayCard';
import { ClayInput } from '@/components/shared/ClayInput';
import { ClayButton } from '@/components/shared/ClayButton';
import { ChatBubble } from '@/components/modules/chat/ChatBubble';
import { fetchApi, postApiStream } from '@/lib/api-client';
import { loadWalletSessionFromStorage, type WalletSession } from '@/lib/wallet-session';

type TransactionRequest = {
  amount: number;
  amountMist: string;
  recipient: string;
  network: string;
};

type BatchTransferRecipient = {
  address: string;
  amountMist: string;
  amount: number;
};

type BatchTransferRequest = {
  recipients: BatchTransferRecipient[];
  network: string;
  totalAmount: number;
  totalAmountMist: string;
};

type NFTTransferRequest = {
  objectId: string;
  recipient: string;
  network: string;
  objectType?: string;
};

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

type ChatFlowStep = {
  id: string;
  title: string;
  detail?: string;
  status: 'running' | 'completed' | 'error';
};

type ChatStreamEvent =
  | {
      type: 'step_start';
      id: string;
      label: string;
      detail?: string;
      timestamp: number;
    }
  | {
      type: 'step_update';
      id: string;
      label?: string;
      detail: string;
      timestamp: number;
    }
  | {
      type: 'step_end';
      id: string;
      label?: string;
      detail?: string;
      status: 'completed' | 'error';
      timestamp: number;
    }
  | {
      type: 'final';
      response: SendMessageResponse & Record<string, unknown>;
      timestamp: number;
    }
  | {
      type: 'error';
      message: string;
      timestamp: number;
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

async function readSseStream(response: Response, onEvent: (event: ChatStreamEvent) => void) {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Streaming response body is not available.');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf('\n\n');
    while (separatorIndex !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex).trim();
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf('\n\n');

      if (!rawEvent) {
        continue;
      }

      const data = rawEvent
        .split('\n')
        .filter((line) => line.startsWith('data:'))
        .map((line) => line.slice(5).trimStart())
        .join('\n');

      if (!data) {
        continue;
      }

      onEvent(JSON.parse(data) as ChatStreamEvent);
    }
  }
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
  const dAppKit = useDAppKit();
  const [session, setSession] = useState<WalletSession | null>(null);
  const walletId = session?.walletId ?? session?.address ?? null;
  const [pendingTx, setPendingTx] = useState<TransactionRequest | null>(null);
  const [pendingBatchTx, setPendingBatchTx] = useState<BatchTransferRequest | null>(null);
  const [pendingNFTTx, setPendingNFTTx] = useState<NFTTransferRequest | null>(null);
  const [txStatus, setTxStatus] = useState<'idle' | 'signing' | 'success' | 'error'>('idle');
  const [txDigest, setTxDigest] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [isCompactLayout, setIsCompactLayout] = useState(false);
  const [sending, setSending] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSessionItem[]>([]);
  const [flowSteps, setFlowSteps] = useState<ChatFlowStep[]>([]);
  const [isFlowExpanded, setIsFlowExpanded] = useState(false);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'intro',
      text: INTRO_MESSAGE,
      isAi: true,
      time: formatDisplayTime(),
    },
  ]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

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
  }, [messages, flowSteps]);

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
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
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
    setFlowSteps([]);
    setIsFlowExpanded(true); // Auto-expand when starting research

    try {
      const response = await postApiStream('/chat/messages', {
        walletId,
        sessionId,
        content,
      });

      let finalResponse: SendMessageResponse & Record<string, unknown> | null = null;

      await readSseStream(response, (event) => {
        if (event.type === 'step_start') {
          setFlowSteps((prev) => {
            const nextStep: ChatFlowStep = {
              id: event.id,
              title: event.label,
              detail: event.detail,
              status: 'running',
            };
            const index = prev.findIndex((item) => item.id === event.id);
            if (index === -1) {
              return [...prev, nextStep];
            }
            const currentStep = prev[index];
            if (!currentStep) {
              return [...prev, nextStep];
            }
            const next = [...prev];
            next[index] = { ...currentStep, ...nextStep };
            return next;
          });
        }

        if (event.type === 'step_update') {
          setFlowSteps((prev) => {
            const index = prev.findIndex((item) => item.id === event.id);
            if (index === -1) {
              return [
                ...prev,
                {
                  id: event.id,
                  title: event.label ?? 'Step',
                  detail: event.detail,
                  status: 'running',
                },
              ];
            }
            const currentStep = prev[index];
            if (!currentStep) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...currentStep,
              title: event.label ?? currentStep.title,
              detail: event.detail,
            };
            return next;
          });
        }

        if (event.type === 'step_end') {
          setFlowSteps((prev) => {
            const index = prev.findIndex((item) => item.id === event.id);
            if (index === -1) {
              return [
                ...prev,
                {
                  id: event.id,
                  title: event.label ?? 'Step',
                  detail: event.detail,
                  status: event.status === 'error' ? 'error' : 'completed',
                },
              ];
            }
            const currentStep = prev[index];
            if (!currentStep) {
              return prev;
            }
            const next = [...prev];
            next[index] = {
              ...currentStep,
              title: event.label ?? currentStep.title,
              detail: event.detail ?? currentStep.detail,
              status: event.status === 'error' ? 'error' : 'completed',
            };
            return next;
          });
        }

        if (event.type === 'error') {
          setFlowSteps((prev) => [
            ...prev,
            {
              id: `error-${Date.now()}`,
              title: 'Stream error',
              detail: event.message,
              status: 'error',
            },
          ]);
          throw new Error(event.message);
        }

        if (event.type === 'final') {
          finalResponse = event.response;
        }
      });

      if (!finalResponse) {
        throw new Error('Stream ended without a final assistant response.');
      }

      const resolvedResponse = finalResponse as SendMessageResponse & Record<string, unknown>;
      const nextSessionId = resolvedResponse.session.id;
      const assistantMessage: UiMessage = {
        id: resolvedResponse.assistantMessage.id,
        text: resolvedResponse.assistantMessage.content,
        isAi: true,
        time: formatDisplayTime(),
        sources: mapToolSources(resolvedResponse.assistantMessage.toolCalls),
      };

      if (resolvedResponse.transactionRequest) {
        setPendingTx(resolvedResponse.transactionRequest as TransactionRequest);
        setTxStatus('idle');
      } else if (resolvedResponse.batchTransferRequest) {
        setPendingBatchTx(resolvedResponse.batchTransferRequest as BatchTransferRequest);
        setTxStatus('idle');
      } else if (resolvedResponse.nftTransferRequest) {
        setPendingNFTTx(resolvedResponse.nftTransferRequest as NFTTransferRequest);
        setTxStatus('idle');
        setTxDigest(null);
      }

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
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
    setChatError(null);
    setFlowSteps([]);
    setPendingTx(null);
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

  async function handleConfirmTransfer() {
    if (!pendingTx && !pendingBatchTx && !pendingNFTTx) return;
    setTxStatus('signing');

    try {
      const tx = new Transaction();

      // Handle regular transfer
      if (pendingTx) {
        const [coin] = tx.splitCoins(tx.gas, [BigInt(pendingTx.amountMist)]);
        tx.transferObjects([coin], pendingTx.recipient);
      }

      // Handle batch transfer using PTB (Programmable Transaction Block)
      if (pendingBatchTx) {
        // Split gas coin into multiple coins for each recipient
        for (let i = 0; i < pendingBatchTx.recipients.length; i++) {
          const recipient = pendingBatchTx.recipients[i];
          const [coin] = tx.splitCoins(tx.gas, [BigInt(recipient.amountMist)]);
          tx.transferObjects([coin], recipient.address);
        }
      }

      // Handle NFT transfer
      if (pendingNFTTx) {
        tx.transferObjects([pendingNFTTx.objectId], pendingNFTTx.recipient);
      }

      const result = await dAppKit.signAndExecuteTransaction({ transaction: tx });
      const digest =
        result.$kind === 'Transaction' ? (result.Transaction as unknown as Record<string, unknown>).digest as string | undefined : undefined;

      setTxStatus('success');
      setTxDigest(digest ?? 'submitted');
      setPendingTx(null);
      setPendingBatchTx(null);
      setPendingNFTTx(null);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: `Giao dịch thành công!\nDigest: \`${digest ?? 'submitted'}\``,
          isAi: true,
          time: formatDisplayTime(),
        },
      ]);
    } catch (error) {
      setTxStatus('error');
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: `Giao dịch thất bại: ${error instanceof Error ? error.message : String(error)}`,
          isAi: true,
          time: formatDisplayTime(),
        },
      ]);
    }
  }

  return (
    <MainLayout activePath="/chat">
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: isCompactLayout ? 'minmax(0, 1fr)' : '240px minmax(0, 1.55fr)',
          gridTemplateRows: isCompactLayout ? 'auto minmax(0, 1fr)' : 'minmax(0, 1fr)',
          minHeight: 'calc(100vh - 108px)',
          height: 'calc(100vh - 108px)',
          gap: '24px',
          width: '100%',
          maxWidth: '100%',
          alignItems: 'stretch',
        }}
      >
        <ClayCard
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            padding: '22px',
            overflow: 'hidden',
            width: '100%',
            minWidth: 0,
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', paddingBottom: '12px', borderBottom: '1.5px solid var(--border-color)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: '0.65rem', color: 'var(--matcha-accent)', marginBottom: '2px', fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.9 }}>Chat History</div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '1.15rem', fontWeight: 800, color: 'var(--text-primary)' }}>Sessions</div>
              </div>
            </div>
            
            <button 
              onClick={handleNewChat} 
              disabled={!walletId}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                padding: '12px 16px',
                borderRadius: '16px',
                backgroundColor: 'var(--matcha-primary)',
                color: 'white',
                fontSize: '0.85rem',
                fontWeight: 700,
                border: 'none',
                boxShadow: 'var(--shadow-outer)',
                cursor: walletId ? 'pointer' : 'not-allowed',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: walletId ? 1 : 0.5,
                width: '100%',
              }}
              className="new-chat-btn-premium"
            >
              <MessageSquarePlus size={18} />
              <span>New Conversation</span>
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
                      padding: '14px 16px',
                      borderRadius: '18px',
                      border: '1.5px solid transparent',
                      backgroundColor: isActive ? 'var(--white)' : 'transparent',
                      borderColor: isActive ? 'rgba(123, 174, 127, 0.15)' : 'transparent',
                      boxShadow: isActive ? 'var(--shadow-soft)' : 'none',
                      cursor: 'pointer',
                      transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '12px',
                      overflow: 'hidden',
                      position: 'relative',
                    }}
                  >
                    <div style={{ 
                      width: '36px', 
                      height: '36px', 
                      borderRadius: '12px', 
                      backgroundColor: isActive ? 'var(--matcha-highlight)' : 'rgba(0,0,0,0.03)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: isActive ? 'var(--matcha-accent)' : 'var(--text-secondary)',
                      flexShrink: 0,
                      transition: 'all 0.2s ease'
                    }}>
                      <Activity size={16} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <div
                        style={{
                          fontFamily: 'var(--font-heading)',
                          fontSize: '0.88rem',
                          fontWeight: 700,
                          color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                        title={item.title || 'Untitled chat'}
                      >
                        {item.title || 'Untitled chat'}
                      </div>
                      <div style={{ 
                        fontSize: '0.7rem', 
                        color: 'var(--text-secondary)',
                        fontWeight: 600,
                        opacity: 0.6
                      }}>
                        {formatSessionTime(item.lastMessageAt)}
                      </div>
                    </div>
                    {isActive && (
                      <div style={{ 
                        width: '4px', 
                        height: '16px', 
                        borderRadius: '2px', 
                        backgroundColor: 'var(--matcha-primary)',
                        position: 'absolute',
                        right: '8px'
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </ClayCard>

        <ClayCard style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0, width: '100%', minWidth: 0 }}>
          <div
            style={{
              padding: '18px 22px',
              borderBottom: '1px solid var(--border-color)',
              background: 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(247,244,235,0.72))',
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
              padding: '28px 24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '28px',
              background:
                'radial-gradient(circle at top left, rgba(190, 215, 196, 0.22), transparent 28%), linear-gradient(180deg, rgba(249,247,241,0.95), rgba(244,240,231,0.88))',
            }}
          >
            {loadingMessages ? (
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Loading conversation...</div>
            ) : (
              <>
                {messages.map((msg, index) => {
              const isLastMessage = index === messages.length - 1;
              const isLastAiMessage = isLastMessage && msg.isAi;
              const shouldShowSteps = isLastAiMessage && flowSteps.length > 0;

              const renderFlowSteps = () => (
                  <div style={{ paddingLeft: '4px', marginBottom: '8px' }}>
                  <div
                    onClick={() => setIsFlowExpanded(!isFlowExpanded)}
                    style={{
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '6px 12px',
                      borderRadius: '12px',
                      background: 'rgba(255, 255, 255, 0.72)',
                      border: '1px solid rgba(107, 143, 113, 0.16)',
                      width: 'fit-content',
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                      fontWeight: 600,
                      transition: 'all 0.2s ease',
                      userSelect: 'none',
                    }}
                    className="langgraph-toggle"
                  >
                    {isFlowExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <Activity size={14} opacity={0.7} />
                    <span>View processing steps</span>
                    {!isFlowExpanded && flowSteps.some(s => s.status === 'running') && (
                      <div className="spinning-loader" style={{ marginLeft: '4px' }}>
                        <Loader2 size={12} />
                      </div>
                    )}
                  </div>

                  {isFlowExpanded && (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '14px 16px',
                        borderRadius: '18px',
                        border: '1px solid rgba(107, 143, 113, 0.14)',
                        background: 'rgba(255,255,255,0.74)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                        maxWidth: '100%',
                        boxShadow: '0 10px 26px rgba(50, 60, 52, 0.06)',
                      }}
                    >
                      {flowSteps.map((step) => (
                        <div key={step.id} className="step-item-animate" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                          <div
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '999px',
                              marginTop: '5px',
                              backgroundColor:
                                step.status === 'running'
                                  ? 'var(--matcha-accent)'
                                  : step.status === 'completed'
                                    ? '#6B8F71'
                                    : '#C25B5B',
                              flexShrink: 0,
                            }}
                          />
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {step.title}
                              {step.status === 'running' && (
                                <span className="dot-flashing">
                                  <span></span><span></span><span></span>
                                </span>
                              )}
                            </div>
                            {step.detail && (
                              <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', opacity: 0.88, lineHeight: 1.5 }}>
                                {step.detail}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );

              return (
                <React.Fragment key={msg.id}>
                  {shouldShowSteps && renderFlowSteps()}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <ChatBubble message={msg.text} isAi={msg.isAi} timestamp={msg.time} />
                    {msg.isAi && msg.sources && msg.sources.length > 0 && (
                      <div style={{ paddingLeft: '8px', display: 'grid', gap: '8px', marginTop: '-4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', opacity: 0.7 }}>
                            Research Tools
                          </span>
                          <div style={{ flex: 1, height: '1px', background: 'var(--border-color)', opacity: 0.5 }} />
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {msg.sources.map((source, index) => {
                          const label = `${source.label} · ${source.summary}`;
                          const content = (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                padding: '6px 14px',
                                borderRadius: '12px',
                                background: 'rgba(255,255,255,0.8)',
                                border: '1px solid rgba(107, 143, 113, 0.12)',
                                color: 'var(--text-secondary)',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                lineHeight: 1.2,
                                boxShadow: '0 4px 12px rgba(50, 60, 52, 0.04)',
                                transition: 'all 0.2s ease',
                              }}
                              className="source-chip-premium"
                              title={label}
                            >
                              <span
                                style={{
                                  width: '6px',
                                  height: '6px',
                                  borderRadius: '999px',
                                  backgroundColor: source.url ? 'var(--matcha-primary)' : 'rgba(107, 143, 113, 0.3)',
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '140px' }}>
                                {source.label}
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
                      </div>
                    )}
                  </div>
                </React.Fragment>
              );
            })}

            {/* During generation, if assistant message is not yet in list */}
            {sending && flowSteps.length > 0 && (!messages.length || !messages.at(-1)?.isAi) && (
              <div style={{ paddingLeft: '4px', marginBottom: '8px' }}>
                <div
                  onClick={() => setIsFlowExpanded(!isFlowExpanded)}
                  style={{
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '6px 12px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.72)',
                    border: '1px solid rgba(107, 143, 113, 0.16)',
                    width: 'fit-content',
                    fontSize: '0.78rem',
                    color: 'var(--text-secondary)',
                    fontWeight: 600,
                    transition: 'all 0.2s ease',
                    userSelect: 'none',
                  }}
                  className="langgraph-toggle"
                >
                  {isFlowExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Activity size={14} opacity={0.7} />
                  <span>View processing steps</span>
                  {!isFlowExpanded && flowSteps.some(s => s.status === 'running') && (
                    <div className="spinning-loader" style={{ marginLeft: '4px' }}>
                      <Loader2 size={12} />
                    </div>
                  )}
                </div>

                {isFlowExpanded && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '14px 16px',
                      borderRadius: '18px',
                      border: '1px solid rgba(107, 143, 113, 0.14)',
                      background: 'rgba(255,255,255,0.74)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px',
                      maxWidth: '100%',
                      boxShadow: '0 10px 26px rgba(50, 60, 52, 0.06)',
                    }}
                  >
                    {flowSteps.map((step) => (
                      <div key={step.id} className="step-item-animate" style={{ display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
                        <div
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '999px',
                            marginTop: '5px',
                            backgroundColor:
                              step.status === 'running'
                                ? 'var(--matcha-accent)'
                                : step.status === 'completed'
                                  ? '#6B8F71'
                                  : '#C25B5B',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {step.title}
                            {step.status === 'running' && (
                              <span className="dot-flashing">
                                <span></span><span></span><span></span>
                              </span>
                            )}
                          </div>
                          {step.detail && (
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)', opacity: 0.88, lineHeight: 1.5 }}>
                              {step.detail}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
              </>
            )}

            {(pendingTx || pendingBatchTx || pendingNFTTx) && txStatus !== 'success' && (
              <div
                style={{
                  margin: '8px 0',
                  padding: '18px 20px',
                  borderRadius: '20px',
                  background: 'rgba(255,255,255,0.9)',
                  border: '1.5px solid rgba(107, 143, 113, 0.28)',
                  boxShadow: '0 8px 28px rgba(50, 60, 52, 0.1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.72rem', fontWeight: 800, color: 'var(--matcha-accent)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    {pendingBatchTx ? 'Batch Transfer' : pendingNFTTx ? 'NFT Transfer' : 'Xác nhận giao dịch'}
                  </span>
                  <button
                    onClick={() => {
                      setPendingTx(null);
                      setPendingBatchTx(null);
                      setPendingNFTTx(null);
                    }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '2px' }}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {pendingTx && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Số lượng</span>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{pendingTx.amount} SUI</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', gap: '12px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>Đến</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all', textAlign: 'right' }}>
                          {pendingTx.recipient}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Mạng</span>
                        <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{pendingTx.network}</span>
                      </div>
                    </>
                  )}

                  {pendingBatchTx && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Tổng số lượng</span>
                        <span style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{pendingBatchTx.totalAmount} SUI</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Số người nhận</span>
                        <span style={{ color: 'var(--text-primary)' }}>{pendingBatchTx.recipients.length} địa chỉ</span>
                      </div>
                      <div style={{ maxHeight: '120px', overflowY: 'auto', marginTop: '4px' }}>
                        {pendingBatchTx.recipients.map((r, idx) => (
                          <div key={idx} style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                            {r.amount} SUI → {r.address.slice(0, 8)}...{r.address.slice(-6)}
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Mạng</span>
                        <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{pendingBatchTx.network}</span>
                      </div>
                    </>
                  )}

                  {pendingNFTTx && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', gap: '12px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>Object ID</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all', textAlign: 'right' }}>
                          {pendingNFTTx.objectId}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem', gap: '12px' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600, flexShrink: 0 }}>Đến</span>
                        <span style={{ fontFamily: 'monospace', color: 'var(--text-primary)', wordBreak: 'break-all', textAlign: 'right' }}>
                          {pendingNFTTx.recipient}
                        </span>
                      </div>
                      {pendingNFTTx.objectType && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Type</span>
                          <span style={{ color: 'var(--text-primary)', fontSize: '0.7rem' }}>{pendingNFTTx.objectType}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontWeight: 600 }}>Mạng</span>
                        <span style={{ color: 'var(--text-primary)', textTransform: 'capitalize' }}>{pendingNFTTx.network}</span>
                      </div>
                    </>
                  )}
                </div>

                {txStatus === 'error' && (
                  <div style={{ fontSize: '0.82rem', color: '#B85C5C', fontWeight: 600 }}>
                    Giao dịch thất bại. Vui lòng thử lại.
                  </div>
                )}

                <div style={{ display: 'flex', gap: '10px' }}>
                  <ClayButton
                    onClick={() => void handleConfirmTransfer()}
                    disabled={txStatus === 'signing'}
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                  >
                    {txStatus === 'signing' ? (
                      <><Loader2 size={14} className="spinning-loader" /> Đang ký...</>
                    ) : (
                      <><SendHorizonal size={14} /> Xác nhận & Gửi</>
                    )}
                  </ClayButton>
                  <button
                    onClick={() => {
                      setPendingTx(null);
                      setPendingBatchTx(null);
                      setPendingNFTTx(null);
                    }}
                    disabled={txStatus === 'signing'}
                    style={{
                      padding: '8px 16px',
                      borderRadius: '14px',
                      border: '1px solid var(--border-color)',
                      background: 'transparent',
                      color: 'var(--text-secondary)',
                      fontSize: '0.85rem',
                      fontWeight: 600,
                      cursor: txStatus === 'signing' ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Huỷ
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          <div
            style={{
              padding: '24px',
              borderTop: '1px solid var(--border-color)',
              backgroundColor: 'rgba(255, 255, 255, 0.4)',
              backdropFilter: 'blur(10px)',
              width: '100%',
            }}
          >
            {chatError && (
              <div style={{ fontSize: '0.85rem', color: '#B85C5C', marginBottom: '12px', padding: '0 8px' }}>{chatError}</div>
            )}

            <div 
              style={{ 
                display: 'flex', 
                gap: '12px', 
                alignItems: 'flex-end', 
                width: '100%',
                backgroundColor: 'var(--white)',
                padding: '12px 16px',
                borderRadius: '24px',
                border: '1.5px solid rgba(123, 174, 127, 0.18)',
                boxShadow: '0 10px 40px rgba(62, 83, 62, 0.08), var(--shadow-inner)',
                transition: 'all 0.3s ease',
              }}
              className="chat-input-container-premium"
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <textarea
                  ref={textareaRef}
                  placeholder={walletId ? 'Nhập câu hỏi của bạn tại đây...' : 'Vui lòng kết nối ví để bắt đầu...'}
                  value={input}
                  onChange={(event) => {
                    setInput(event.target.value);
                    // Auto-resize
                    if (textareaRef.current) {
                      textareaRef.current.style.height = 'auto';
                      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
                    }
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault();
                      void handleSend();
                    }
                  }}
                  style={{
                    width: '100%',
                    minHeight: '44px',
                    maxHeight: '200px',
                    padding: '10px 8px',
                    border: 'none',
                    background: 'transparent',
                    fontFamily: 'var(--font-body)',
                    fontSize: '1rem',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    resize: 'none',
                    display: 'block',
                    lineHeight: '1.5',
                  }}
                  disabled={!walletId || sending}
                />
              </div>
              <button
                onClick={() => void handleSend()}
                disabled={!walletId || sending || loadingMessages || !input.trim()}
                style={{ 
                  flexShrink: 0, 
                  width: '44px',
                  height: '44px',
                  borderRadius: '16px',
                  backgroundColor: !input.trim() || sending ? 'var(--matcha-highlight)' : 'var(--matcha-primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  cursor: !input.trim() || sending ? 'not-allowed' : 'pointer',
                  boxShadow: !input.trim() || sending ? 'none' : '0 6px 16px rgba(123, 174, 127, 0.3)',
                }}
                className="send-button-premium"
              >
                {sending ? (
                  <Loader2 size={20} className="spinning-loader" />
                ) : (
                  <SendHorizonal size={20} style={{ transform: 'translateX(1px)' }} />
                )}
              </button>
            </div>
            <div style={{ 
              textAlign: 'center', 
              marginTop: '12px', 
              fontSize: '0.72rem', 
              color: 'var(--text-secondary)', 
              opacity: 0.6,
              fontWeight: 500 
            }}>
              Sử dụng Shift + Enter để xuống dòng
            </div>
          </div>
        </ClayCard>
      </div>

      <style jsx>{`
        .session-item-btn:hover {
          background-color: rgba(123, 174, 127, 0.04) !important;
          border-color: rgba(123, 174, 127, 0.1) !important;
          transform: translateX(4px);
        }
        .session-item-btn:active {
          transform: scale(0.98) translateX(4px);
        }
        .session-item-btn.active:hover {
          background-color: var(--white) !important;
          border-color: rgba(123, 174, 127, 0.2) !important;
          transform: none;
        }
        .new-chat-btn-premium:hover:not(:disabled) {
          filter: brightness(1.05);
          transform: translateY(-2px);
          box-shadow: 0 12px 28px rgba(123, 174, 127, 0.25) !important;
        }
        .new-chat-btn-premium:active:not(:disabled) {
          transform: translateY(0) scale(0.98);
        }
        .chat-input-container-premium:focus-within {
          border-color: var(--matcha-primary) !important;
          box-shadow: 0 12px 48px rgba(62, 83, 62, 0.12), var(--shadow-inner) !important;
          transform: translateY(-2px);
        }
        .send-button-premium:hover:not(:disabled) {
          transform: scale(1.08) rotate(-5deg);
          filter: brightness(1.1);
        }
        .send-button-premium:active:not(:disabled) {
          transform: scale(0.92);
        }
        .langgraph-toggle:hover {
          background-color: rgba(255, 255, 255, 0.7) !important;
          transform: translateY(-1px);
        }
        .langgraph-toggle:active {
          transform: translateY(0) scale(0.98);
        }
        .spinning-loader {
          animation: spin 1.2s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .dot-flashing {
          display: inline-flex;
          align-items: center;
          gap: 2px;
          height: 12px;
        }
        .dot-flashing span {
          width: 3px;
          height: 3px;
          border-radius: 50%;
          background-color: var(--matcha-accent);
          animation: dot-flashing 1.2s infinite ease-in-out;
          display: inline-block;
        }
        .dot-flashing span:nth-child(2) { animation-delay: 0.2s; }
        .dot-flashing span:nth-child(3) { animation-delay: 0.4s; }
        
        @keyframes dot-flashing {
          0%, 100% { opacity: 0.2; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1.1); }
        }

        .step-item-animate {
          animation: step-in 0.22s ease-out forwards;
        }
        @keyframes step-in {
          from { opacity: 0; transform: translateY(2px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </MainLayout>
  );
}
