'use client';
import { useState, useRef, useEffect, useCallback } from 'react';
import { useAuth } from '@/app/context/AuthContext';
import { Button } from '@/app/components/ui';

const WELCOME = {
  id: 'welcome',
  role: 'bot',
  text: "Hello! I'm **Veyn AI**, your intelligent call analytics assistant. Ask me anything about your call data — agent performance, trends, customer sentiment, or specific calls.",
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
  const { apiFetch, token } = useAuth();
  const [messages, setMessages] = useState([WELCOME]);
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
      const data = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history }),
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
    <div className="flex flex-col" style={{ height: 'calc(100vh - 120px)' }}>
      {/* Page header */}
      <div className="flex-shrink-0 mb-4">
        <h1 className="text-2xl font-bold text-text-main tracking-tight">AI Chat</h1>
        <p className="text-sm text-text-muted mt-0.5">Ask Veyn AI about your call analytics</p>
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
      <div className="flex-1 overflow-y-auto rounded-xl border border-border bg-surface/50 p-5 space-y-5 min-h-0">
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
          placeholder="Ask anything about your call data… (Enter to send, Shift+Enter for new line)"
          rows={2}
          disabled={typing}
          className="flex-1 resize-none bg-surface border border-border2 rounded-xl py-3 px-4 text-sm text-text-main placeholder-text-muted outline-none transition-colors focus:border-primary disabled:opacity-50"
          style={{ maxHeight: 140 }}
        />
        <Button
          id="chat-send-btn"
          variant="primary"
          onClick={sendMessage}
          disabled={typing || !input.trim()}
          className="h-12 px-5 rounded-xl flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {typing ? (
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            'Send'
          )}
        </Button>
      </div>

      {/* Bounce animation keyframes injected inline */}
      <style>{`
        @keyframes bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
