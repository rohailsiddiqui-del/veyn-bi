'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { Button } from '@/app/components/ui';

const WELCOME_STANDARD = {
  id: 'welcome',
  role: 'bot',
  text: "Hello! I'm **Veyn AI**, your intelligent call analytics assistant. Ask me anything about your call data — agent performance, trends, customer sentiment, or specific calls.",
  ts: Date.now(),
};

const WELCOME_CASE = {
  id: 'welcome',
  role: 'bot',
  text: "Hello! I'm **Veyn AI**, your Almosafer CX analytics assistant. I have access to your **57 cases** and **188 interactions** across voice and WhatsApp.\n\nYou can ask me things like:\n- Which agents have the most escalations?\n- What are the top customer complaints?\n- How does sentiment compare between voice and WhatsApp?\n- What is our FCR rate?\n- Which case type has the worst sentiment?",
  ts: Date.now(),
};

function parseSimpleMd(text) {
  // Very lightweight: bold only
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br/>');
}

function BotBubble({ text }) {
  return (
    <div className="flex items-start gap-3 max-w-[80%]">
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-violet-700 flex items-center justify-center text-white text-xs font-bold shadow">
        V
      </div>
      <div className="space-y-1">
        <div className="text-[10px] font-semibold text-primary-soft uppercase tracking-widest">Veyn AI</div>
        <div
          className="bg-surface border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-text-main leading-relaxed shadow-sm"
          dangerouslySetInnerHTML={{ __html: parseSimpleMd(text) }}
        />
      </div>
    </div>
  );
}

function UserBubble({ text }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] bg-primary rounded-2xl rounded-tr-sm px-4 py-3 text-sm text-white shadow-sm leading-relaxed whitespace-pre-wrap">
        {text}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-start gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-primary to-violet-700 flex items-center justify-center text-white text-xs font-bold shadow">
        V
      </div>
      <div className="bg-surface border border-border rounded-2xl rounded-tl-sm px-4 py-3 flex gap-1.5 items-center shadow-sm">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-2 h-2 rounded-full bg-text-muted"
            style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
          />
        ))}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const { apiFetch, token, user, globalDateFrom, globalDateTo } = useAuth();
  const isCaseMode = user?.dashboard_mode === 'case';
  const [messages, setMessages] = useState([isCaseMode ? WELCOME_CASE : WELCOME_STANDARD]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [geminiError, setGeminiError] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  // Auto-scroll to bottom whenever messages or typing changes
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if (!text || typing) return;

    const userMsg = { id: Date.now(), role: 'user', text, ts: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setTyping(true);
    setGeminiError(false);

    // Build history from the last 6 messages (excluding the new one we just added)
    const history = messages
      .slice(-6)
      .filter((m) => m.id !== 'welcome')
      .map((m) => ({ role: m.role === 'bot' ? 'assistant' : 'user', content: m.text }));

    try {
      const endpoint = isCaseMode ? '/api/cases/chat' : '/api/chat';
      const bodyPayload = isCaseMode
        ? { message: text, history }
        : { message: text, history, dateFrom: globalDateFrom || null, dateTo: globalDateTo || null };

      const data = await apiFetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bodyPayload),
      });

      const reply = data.reply ?? data.message ?? data.text ?? JSON.stringify(data);
      setMessages((prev) => [
        ...prev,
        { id: Date.now() + 1, role: 'bot', text: reply, ts: Date.now() },
      ]);
    } catch (err) {
      const errText = err.message || '';
      const isGeminiKey =
        errText.toLowerCase().includes('api key') ||
        errText.toLowerCase().includes('gemini') ||
        errText.toLowerCase().includes('not configured');

      if (isGeminiKey) {
        setGeminiError(true);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          role: 'bot',
          text: isGeminiKey
            ? 'The AI service is not configured yet. Please check the Gemini API key.'
            : `Sorry, I encountered an error: ${errText || 'Unknown error.'}`,
          ts: Date.now(),
        },
      ]);
    } finally {
      setTyping(false);
    }
  }, [apiFetch, input, messages, typing]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 160px)', minHeight: 400 }}>
      {/* Page header */}
      <div className="flex-shrink-0 mb-4 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-main tracking-tight">AI Chat</h1>
          <p className="text-sm text-text-muted mt-0.5">
            {isCaseMode
              ? 'Ask about cases, interactions, agent performance, and CX insights — answers are grounded in your actual data'
              : 'Ask Veyn AI about your call analytics'}
          </p>
        </div>
        {(globalDateFrom || globalDateTo) && (
          <div className="text-xs px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary-soft">
            Filtered: {globalDateFrom || '…'} → {globalDateTo || '…'}
            <span className="block text-text-muted font-normal">upload date range active</span>
          </div>
        )}
      </div>

      {/* Gemini API key warning banner */}
      {geminiError && (
        <div className="flex-shrink-0 mb-3 flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
          <span className="text-lg leading-none">⚠️</span>
          <div>
            <strong>Gemini API Key Not Configured.</strong> The AI backend could not process your
            request because the Gemini API key is missing or invalid. Please configure it in your
            server environment and restart.
          </div>
        </div>
      )}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-bg p-5 space-y-5 min-h-0">
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <UserBubble key={msg.id} text={msg.text} />
          ) : (
            <BotBubble key={msg.id} text={msg.text} />
          )
        )}
        {typing && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 mt-3 flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isCaseMode
            ? "Ask about cases, agents, complaints, FCR, or sentiment… (Enter to send)"
            : "Ask anything about your call data… (Enter to send, Shift+Enter for new line)"
          }
          rows={2}
          disabled={typing}
          style={{ maxHeight: 140, backgroundColor: '#1e2130', color: '#e2e8f0', border: '1px solid #334155', borderRadius: 12, padding: '12px 16px', fontSize: 14, resize: 'none', outline: 'none', flex: 1 }}
        />
        <button
          id="chat-send-btn"
          onClick={sendMessage}
          disabled={typing || !input.trim()}
          style={{
            height: 48, padding: '0 24px', borderRadius: 12, flexShrink: 0,
            backgroundColor: typing || !input.trim() ? '#334155' : '#6366f1',
            color: '#ffffff', border: 'none', cursor: typing || !input.trim() ? 'not-allowed' : 'pointer',
            fontWeight: 600, fontSize: 14, transition: 'background-color 0.15s',
          }}
        >
          {typing ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" style={{ display: 'inline' }}>
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : 'Send'}
        </button>
      </div>

      {/* Bounce animation keyframes injected inline */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
        #chat-input:focus { border-color: #6366f1 !important; }
        #chat-input::placeholder { color: #64748b; }
      `}</style>
    </div>
  );
}
