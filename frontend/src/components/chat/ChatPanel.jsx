import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import ChatCards from './ChatCards';
import AssistantMark from './AssistantMark';

const QUICK_REPLIES = [
  { label: 'Check scrap rates', message: 'Check scrap rates' },
  { label: 'Book a pickup', message: 'I want to book a pickup' },
  { label: 'Track my pickup', message: 'Track my pickup' },
  { label: 'What can I sell?', message: 'What can I sell?' },
  { label: 'Payment help', message: 'How do I get paid?' },
  { label: 'Talk to a human', message: 'I want to talk to a human' },
  { label: 'नेपालीमा कुरा गर्नुहोस्', message: 'नमस्ते, मलाई कबाडी बेच्नु छ' },
];

const MAX_LEN = 1000;

function Markdown({ children, onNavigate }) {
  return (
    <ReactMarkdown
      disallowedElements={['img', 'table', 'h1', 'h2', 'h3']}
      unwrapDisallowed
      components={{
        a: ({ href = '', children: text }) =>
          href.startsWith('/') ? (
            <Link to={href} onClick={onNavigate} className="text-rust-600 underline">
              {text}
            </Link>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-rust-600 underline">
              {text}
            </a>
          ),
        p: ({ children: text }) => <p className="mb-1.5 last:mb-0">{text}</p>,
        ul: ({ children: items }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{items}</ul>,
        ol: ({ children: items }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{items}</ol>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="Assistant is typing">
      {[0, 150, 300].map((d) => (
        <span key={d} className="w-1.5 h-1.5 rounded-full bg-steel-500 motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />
      ))}
    </span>
  );
}

const IconButton = ({ label, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    title={label}
    className="w-8 h-8 flex items-center justify-center rounded-lg text-steel-300 hover:text-white hover:bg-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-rust-500"
  >
    {children}
  </button>
);

export default function ChatPanel({ chat, user, whatsappHref, whatsappNumber, onMinimize, onClose, onNavigate }) {
  const { messages, config, sending, error, setError, send, clear, resolveAction } = chat;
  const [input, setInput] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  function submit(e) {
    e?.preventDefault();
    if (!input.trim() || sending) return;
    send(input);
    setInput('');
  }

  function prefill(text) {
    setInput(text);
    inputRef.current?.focus();
  }

  async function handleResolve(actionId, decision) {
    setActionBusy(true);
    await resolveAction(actionId, decision);
    setActionBusy(false);
  }

  const aiLabel = config?.aiMode === 'ai' ? 'AI assistant' : 'Quick answers';

  return (
    <section
      role="dialog"
      aria-modal="false"
      aria-labelledby="chat-title"
      className="fixed z-50 inset-0 sm:inset-auto sm:right-5 sm:bottom-[160px] sm:w-[380px] sm:h-[560px] sm:max-h-[calc(100dvh-180px)] flex flex-col bg-steel-50 sm:border sm:border-steel-300 sm:rounded-lg sm:shadow-2xl overflow-hidden motion-safe:animate-chat-in font-body"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <header className="bg-ink text-white flex items-center gap-3 px-3 py-2.5 shrink-0">
        <AssistantMark className="w-10 h-10 shrink-0 drop-shadow" />
        <div className="flex-1 min-w-0">
          <h2 id="chat-title" className="font-head font-semibold text-sm leading-tight">
            ScrapMate Assistant
          </h2>
          <p className="text-[11px] text-steel-300 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-patina-500" aria-hidden /> Online · {aiLabel}
          </p>
        </div>
        {messages.length > 0 && (
          <IconButton label="Clear chat" onClick={() => setConfirmClear(true)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
            </svg>
          </IconButton>
        )}
        <IconButton label="Minimize chat" onClick={onMinimize}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M5 12h14" />
          </svg>
        </IconButton>
        <IconButton label="Close chat" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </IconButton>
      </header>

      {confirmClear && (
        <div className="bg-rust-100 text-rust-700 text-xs px-3 py-2 flex items-center justify-between gap-2 shrink-0" role="alert">
          <span>Clear this conversation?</span>
          <span className="flex gap-2">
            <button
              type="button"
              className="font-semibold underline"
              onClick={async () => {
                setConfirmClear(false);
                await clear().catch((err) => setError(err.message));
              }}
            >
              Clear
            </button>
            <button type="button" className="underline" onClick={() => setConfirmClear(false)}>
              Cancel
            </button>
          </span>
        </div>
      )}

      <div ref={listRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 && (
          <div>
            <div className="bg-surface border border-steel-100 rounded-lg p-3 text-sm text-steel-700">
              Hi{user ? ` ${user.name.split(' ')[0]}` : ''}! I can check scrap rates, estimate your payout, book or track a
              pickup, and help with payments. Ask in English or नेपाली.
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q.label}
                  type="button"
                  onClick={() => send(q.message)}
                  disabled={sending}
                  className="text-xs border border-steel-300 bg-surface rounded-full px-3 py-1.5 hover:border-rust-600 hover:text-rust-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-patina-500"
                >
                  {q.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] bg-ink text-white text-sm rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex">
              <div className="max-w-[92%] w-full">
                {(m.content || (m.streaming && !m.cards.length)) && (
                  <div
                    className={`inline-block text-sm rounded-lg px-3 py-2 break-words ${
                      m.isError ? 'bg-rust-100 text-rust-700' : 'bg-surface border border-steel-100 text-steel-900'
                    }`}
                  >
                    {m.content ? <Markdown onNavigate={onNavigate}>{m.content}</Markdown> : <TypingDots />}
                  </div>
                )}
                <ChatCards
                  cards={m.cards || []}
                  user={user}
                  whatsappNumber={whatsappNumber}
                  onSend={send}
                  onPrefill={prefill}
                  onResolve={handleResolve}
                  onNavigate={onNavigate}
                  busy={actionBusy}
                />
              </div>
            </div>
          )
        )}
      </div>

      {error && (
        <div className="bg-rust-100 text-rust-700 text-xs px-3 py-2 flex justify-between gap-2 shrink-0" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="underline">
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={submit} className="border-t border-steel-100 bg-surface px-3 pt-2 pb-2 shrink-0">
        <div className="flex gap-2 items-end">
          <label htmlFor="chat-input" className="sr-only">
            Type your message
          </label>
          <textarea
            id="chat-input"
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={MAX_LEN}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) submit(e);
            }}
            placeholder="Ask about rates or pickups…"
            className="input resize-none text-sm max-h-28 py-2"
          />
          <button
            type="submit"
            disabled={sending || !input.trim()}
            aria-label="Send message"
            className="btn-primary px-3 py-2 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-rust-600"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
        <div className="flex justify-between items-center mt-1.5 text-[11px] text-steel-500">
          <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="hover:text-patina-700 underline">
            Talk to a human on WhatsApp
          </a>
          {input.length > MAX_LEN - 100 && (
            <span>
              {input.length}/{MAX_LEN}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
