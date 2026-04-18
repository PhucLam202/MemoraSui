'use client';

import React, { useMemo, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ClayCard } from '@/components/shared/ClayCard';
import { ClayInput } from '@/components/shared/ClayInput';
import { ClayButton } from '@/components/shared/ClayButton';
import { ChatBubble } from '@/components/modules/chat/ChatBubble';
import { loadWalletSessionFromStorage } from '@/lib/wallet-session';
import { postApi } from '@/lib/api-client';

type UiMessage = {
  id: string;
  text: string;
  isAi: boolean;
  time: string;
  sources?: string[];
};

type SendMessageResponse = {
  assistantMessage: {
    id: string;
    content: string;
    toolCalls?: Array<{ tool?: string; status?: string; summary?: string }>;
  };
  session: { id: string };
};

export default function ChatPage() {

  const session = useMemo(() => loadWalletSessionFromStorage(), []);
  const walletId = session?.walletId ?? session?.address ?? null;

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>(undefined);
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'intro',
      text: 'Hello! Ask about portfolio, activity, gas fee, protocols, or objects.',
      isAi: true,
      time: new Date().toLocaleTimeString(),
    },
  ]);

  async function handleSend() {
    if (!input.trim() || !walletId || sending) return;

    const content = input.trim();
    const userMessage: UiMessage = {
      id: crypto.randomUUID(),
      text: content,
      isAi: false,
      time: new Date().toLocaleTimeString(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setSending(true);

    try {
      const response = await postApi<SendMessageResponse>('/chat/messages', {
        walletId,
        sessionId,
        content,
      });

      const sources = (response.assistantMessage.toolCalls ?? []).map((call) => {
        const tool = call.tool ?? 'unknown-tool';
        const summary = call.summary ?? call.status ?? 'used';
        return `${tool}: ${summary}`;
      });

      setMessages((prev) => [
        ...prev,
        {
          id: response.assistantMessage.id,
          text: response.assistantMessage.content,
          isAi: true,
          time: new Date().toLocaleTimeString(),
          sources,
        },
      ]);
      setSessionId(response.session.id);
    } catch (e) {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          text: e instanceof Error ? `Error: ${e.message}` : 'Failed to send message.',
          isAi: true,
          time: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  return (
    <MainLayout activePath="/chat">
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', height: 'calc(100vh - 120px)', gap: 'var(--spacing-lg)' }}>
        <ClayCard style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-lg)', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {messages.map((msg) => (
              <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <ChatBubble message={msg.text} isAi={msg.isAi} timestamp={msg.time} />
                {msg.isAi && msg.sources && msg.sources.length > 0 && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '12px' }}>
                    Source: {msg.sources.join(' | ')}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ padding: 'var(--spacing-lg)', borderTop: '1px solid var(--border-color)', backgroundColor: 'var(--matcha-bg)', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <ClayInput placeholder={walletId ? 'Type your question...' : 'Connect/auth wallet first...'} value={input} onChange={(event) => setInput(event.target.value)} />
            </div>
            <ClayButton onClick={handleSend} disabled={!walletId || sending}>
              {sending ? 'Sending...' : 'Send'}
            </ClayButton>
          </div>
        </ClayCard>
      </div>
    </MainLayout>
  );
}
