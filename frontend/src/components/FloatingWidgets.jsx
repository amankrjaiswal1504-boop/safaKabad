import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import useChatAssistant from '../hooks/useChatAssistant';
import ChatPanel from './chat/ChatPanel';
import AssistantMark from './chat/AssistantMark';
import { buildWhatsAppLink, buildWhatsAppText, pickupIdFromPath, whatsappNumber } from '../utils/whatsapp';

function Tooltip({ children }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute right-full mr-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-lg bg-ink text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity hidden sm:block"
    >
      {children}
    </span>
  );
}

const ROUND_BUTTON =
  'relative w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-transform hover:scale-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 motion-safe:animate-widget-in';

// Mounted once in App.jsx, outside the route layouts, so it shows on every page.
export default function FloatingWidgets() {
  const { user } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const chatButtonRef = useRef(null);
  const page = location.pathname;
  // The collector app has a bottom tab bar; sit above it with smaller buttons.
  const appShell = page.startsWith('/collector');
  const chat = useChatAssistant({ user, isOpen: open, page });

  const pickupId = pickupIdFromPath(page);
  const number = whatsappNumber(chat.config);
  const whatsappHref = buildWhatsAppLink(number, buildWhatsAppText({ user, pickupId }));
  const support = chat.config?.support;

  const close = () => {
    setOpen(false);
    chatButtonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // On phones the panel is a full-screen sheet: close it when a card navigates.
  const onNavigate = () => {
    if (window.matchMedia('(max-width: 639px)').matches) setOpen(false);
  };

  return (
    <div className="print:hidden">
      {open && (
        <ChatPanel
          chat={chat}
          user={user}
          whatsappHref={whatsappHref}
          whatsappNumber={number}
          onMinimize={() => setOpen(false)}
          onClose={close}
          onNavigate={onNavigate}
        />
      )}

      <div
        className={`fixed z-50 flex flex-col items-end gap-3 right-[max(1rem,env(safe-area-inset-right))] ${appShell ? 'bottom-[calc(72px+env(safe-area-inset-bottom))] [&_.w-14]:w-12 [&_.h-14]:h-12' : 'bottom-[max(1rem,env(safe-area-inset-bottom))]'} sm:right-5 ${appShell ? 'sm:bottom-20' : 'sm:bottom-5'} ${
          open ? 'hidden sm:flex' : ''
        }`}
      >
        {/* AI chat on top */}
        <div className="group relative">
          <Tooltip>{open ? 'Hide chat' : 'Chat with AI'}</Tooltip>
          <button
            ref={chatButtonRef}
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Hide chat assistant' : `Chat with AI assistant${chat.unread ? ' (new reply)' : ''}`}
            aria-expanded={open}
            className={`${ROUND_BUTTON} ${open ? 'bg-rust-600 hover:bg-rust-700' : 'bg-transparent shadow-[0_10px_24px_-8px_rgb(8_56_38/0.6)]'} text-white focus-visible:ring-rust-500`}
          >
            {open ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden>
                <path d="M6 9l6 6 6-6" />
              </svg>
            ) : (
              <AssistantMark className="w-full h-full" />
            )}
            {chat.unread && !open && (
              <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 rounded-full bg-patina-500 border-2 border-white" aria-hidden />
            )}
          </button>
        </div>

        {/* WhatsApp at the bottom */}
        <div className="group relative">
          <Tooltip>
            WhatsApp us
            {support && (
              <span className="text-steel-300">
                {support.online
                  ? ` · Online · replies in ~${support.replyMinutes} min`
                  : ` · Offline · ${support.hoursLabel}`}
              </span>
            )}
          </Tooltip>
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp the SafaKabad team${support ? (support.online ? ', online now' : ', currently offline') : ''} (opens in a new tab)`}
            className={`${ROUND_BUTTON} bg-[#1F8A4C] hover:bg-[#18703D] text-white focus-visible:ring-[#1F8A4C]`}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3z" />
            </svg>
            {support && (
              <span
                className={`absolute bottom-0.5 right-0.5 w-3.5 h-3.5 rounded-full border-2 border-white ${support.online ? 'bg-patina-500' : 'bg-steel-300'}`}
                aria-hidden
              />
            )}
          </a>
        </div>
      </div>
    </div>
  );
}
