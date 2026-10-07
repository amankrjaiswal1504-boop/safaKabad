import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { BookOpen, CheckCircle2, LifeBuoy, MessagesSquare, Pencil, Phone, Plus, Trash2 } from 'lucide-react';
import api from '../../services/api';
import useApi from '../../hooks/useApi';
import { fmtDateTime, timeAgo } from '../../utils/format';
import { BarList } from '../../components/charts';
import { Avatar, Badge, Button, Card, DataTable, EmptyState, Field, IconButton, Input, PageHeader, Pagination, SectionTitle, Segmented, Select, Spinner, Stat, Tabs, Textarea, Toggle, cx } from '../../components/ui';
import { Async, ConfirmModal, useAction, Modal } from './_catalog/shared';

const TABS = [
  { value: 'conversations', label: 'Conversations' },
  { value: 'tickets', label: 'Tickets' },
  { value: 'calls', label: 'Call requests' },
  { value: 'analytics', label: 'Analytics' },
  { value: 'faqs', label: 'FAQs' },
];
const pretty = (s) => String(s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const TICKET_TONE = { open: 'rust', in_progress: 'amber', resolved: 'patina' };

function Markdown({ children }) {
  return (
    <ReactMarkdown
      disallowedElements={['img']}
      unwrapDisallowed
      components={{
        a: ({ href = '', children: text }) =>
          href.startsWith('/') ? (
            <Link to={href} className="text-rust-700 underline">
              {text}
            </Link>
          ) : (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-rust-700 underline">
              {text}
            </a>
          ),
        p: ({ children: t }) => <p className="mb-1.5 last:mb-0">{t}</p>,
        ul: ({ children: t }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{t}</ul>,
        ol: ({ children: t }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{t}</ol>,
        table: ({ children: t }) => (
          <div className="overflow-x-auto my-1.5">
            <table className="text-xs">{t}</table>
          </div>
        ),
        th: ({ children: t }) => <th className="text-left pr-3 py-0.5 font-semibold">{t}</th>,
        td: ({ children: t }) => <td className="pr-3 py-0.5">{t}</td>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export default function AdminSupport() {
  const [tab, setTab] = useState('conversations');
  return (
    <div>
      <PageHeader title="Chat & support" subtitle="Read assistant conversations, handle escalations and teach the assistant with FAQs." />
      <Tabs className="mb-6" tabs={TABS} value={tab} onChange={setTab} />
      {tab === 'conversations' && <Conversations />}
      {tab === 'tickets' && <Tickets />}
      {tab === 'calls' && <CallRequests />}
      {tab === 'analytics' && <Analytics />}
      {tab === 'faqs' && <Faqs />}
    </div>
  );
}

// ---------------- Conversations ----------------
function Conversations() {
  const [filter, setFilter] = useState('unresolved');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [filter]);
  const res = useApi('/admin/support/conversations', { params: { filter, page } });
  const [openId, setOpenId] = useState(null);

  return (
    <>
      <div className="mb-4 overflow-x-auto">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'unresolved', label: 'Unresolved' },
            { value: 'escalated', label: 'Escalated' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      <Async
        {...res}
        onRetry={res.reload}
        isEmpty={(d) => !d.conversations.length}
        empty={<EmptyState icon={MessagesSquare} title="No conversations here" description="Chats with the assistant appear here." />}
      >
        {(d) => (
          <Card padded={false} className={cx('transition-opacity', res.loading && 'opacity-60')}>
            <ul className="divide-y divide-steel-100">
              {d.conversations.map((c) => (
                <li key={c._id}>
                  <button type="button" onClick={() => setOpenId(c._id)} className="w-full text-left px-4 sm:px-5 py-3.5 hover:bg-steel-50 flex gap-3 items-start">
                    <Avatar name={c.user?.name || '?'} size="sm" />
                    <div className="min-w-0 flex-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-steel-900 truncate">{c.user ? c.user.name : 'Anonymous visitor'}</span>
                        <span className="text-xs text-steel-500 shrink-0">{timeAgo(c.lastMessageAt)}</span>
                      </div>
                      <p className="text-sm text-steel-600 truncate mt-0.5">{c.lastUserMessage || '—'}</p>
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.escalated && <Badge tone="rust">Escalated</Badge>}
                        {c.resolved && <Badge tone="patina">Resolved</Badge>}
                        {c.ticket && <Badge tone="blue">{c.ticket.ticketId}</Badge>}
                        <Badge>{c.messageCount} msgs</Badge>
                        {c.language === 'ne' && <Badge>Nepali</Badge>}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Async>
      <Pagination pagination={res.data?.pagination} onPage={setPage} />
      {openId && (
        <Transcript
          id={openId}
          onClose={() => setOpenId(null)}
          onResolved={() => {
            setOpenId(null);
            res.reload();
          }}
        />
      )}
    </>
  );
}

function Transcript({ id, onClose, onResolved }) {
  const res = useApi(`/admin/support/conversations/${id}`);
  const { busy, run } = useAction();
  const conv = res.data?.conversation;

  async function resolve() {
    const r = await run('resolve', () => api.put(`/admin/support/conversations/${id}/resolve`), { success: 'Marked resolved' });
    if (r.ok) onResolved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={conv ? conv.user?.name || 'Anonymous visitor' : 'Conversation'}
      footer={
        conv?.escalated && !conv?.resolved ? (
          <Button icon={CheckCircle2} onClick={resolve} loading={busy === 'resolve'}>
            Mark resolved
          </Button>
        ) : undefined
      }
    >
      {res.error && !res.data ? (
        <Async {...res} onRetry={res.reload}>
          {() => null}
        </Async>
      ) : !res.data ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          {conv.user && (
            <p className="text-sm text-steel-500">
              {[conv.user.email, conv.user.phone].filter(Boolean).join(' · ')}
            </p>
          )}
          {res.data.tickets.map((t) => (
            <div key={t._id} className="text-sm rounded-lg border border-rust-100 bg-rust-50 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-steel-900">{t.ticketId}</span>
                <Badge>{pretty(t.reason)}</Badge>
                <Badge tone={TICKET_TONE[t.status] || 'steel'}>{pretty(t.status)}</Badge>
              </div>
              {t.summary && <p className="text-steel-700 mt-1.5">{t.summary}</p>}
            </div>
          ))}
          <ol className="space-y-3">
            {res.data.messages.map((m) => {
              const mine = m.role === 'user';
              return (
                <li key={m._id} className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
                  <div
                    className={cx(
                      'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-sm break-words',
                      mine ? 'bg-rust-600 text-white rounded-br-md whitespace-pre-wrap' : 'bg-surface-2 border border-steel-100 text-steel-900 rounded-bl-md'
                    )}
                  >
                    {m.content ? mine ? m.content : <Markdown>{m.content}</Markdown> : <span className="italic opacity-75">[cards only]</span>}
                    {m.cards?.length > 0 && <div className={cx('text-[11px] mt-1', mine ? 'opacity-80' : 'text-steel-500')}>Cards: {m.cards.map((c) => c.type).join(', ')}</div>}
                  </div>
                  <span className="text-[11px] text-steel-400 mt-1 px-1">
                    {fmtDateTime(m.createdAt)}
                    {m.role === 'assistant' && m.mode && ` · ${m.mode}`}
                    {m.topic && mine && ` · ${pretty(m.topic)}`}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </Modal>
  );
}

// ---------------- Tickets ----------------
function Tickets() {
  const [status, setStatus] = useState('unresolved');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status]);
  const res = useApi('/admin/support/tickets', { params: { status, page } });
  const { busy, run } = useAction();

  async function update(ticketId, body) {
    const r = await run(ticketId, () => api.put(`/admin/support/tickets/${ticketId}`, body), { success: 'Ticket updated' });
    if (r.ok) res.reload();
  }

  const columns = [
    {
      key: 'ticketId',
      header: 'Ticket',
      render: (t) => (
        <div className="whitespace-nowrap">
          <div className="font-medium text-steel-900">{t.ticketId}</div>
          {t.pickupId && <div className="text-xs text-steel-500">{t.pickupId}</div>}
        </div>
      ),
    },
    {
      key: 'user',
      header: 'Customer',
      render: (t) =>
        t.user ? (
          <div className="min-w-[120px]">
            <div className="text-steel-900">{t.user.name}</div>
            <div className="text-xs text-steel-500">{t.user.phone}</div>
          </div>
        ) : (
          <span className="text-steel-500">Anonymous</span>
        ),
    },
    { key: 'summary', header: 'Summary', render: (t) => <p className="text-steel-700 min-w-[220px] max-w-md">{t.summary}</p> },
    { key: 'reason', header: 'Reason', render: (t) => <Badge>{pretty(t.reason)}</Badge> },
    { key: 'createdAt', header: 'Created', render: (t) => <span className="text-steel-700 whitespace-nowrap">{fmtDateTime(t.createdAt)}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (t) => (
        <Select
          className="!py-1.5 text-sm w-36"
          value={t.status}
          aria-label={`Status of ${t.ticketId}`}
          disabled={busy === t.ticketId}
          onChange={(e) => update(t.ticketId, { status: e.target.value })}
        >
          <option value="open">Open</option>
          <option value="in_progress">In progress</option>
          <option value="resolved">Resolved</option>
        </Select>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 overflow-x-auto">
        <Segmented
          size="sm"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'unresolved', label: 'Unresolved' },
            { value: 'open', label: 'Open' },
            { value: 'in_progress', label: 'In progress' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
      </div>
      {res.error && !res.data ? (
        <Async {...res} onRetry={res.reload}>
          {() => null}
        </Async>
      ) : (
        <DataTable
          columns={columns}
          rows={res.data?.tickets}
          loading={res.loading}
          empty={<EmptyState icon={LifeBuoy} title="No tickets" description="Escalations from the chat assistant create tickets here." />}
        />
      )}
      <Pagination pagination={res.data?.pagination} onPage={setPage} />
    </>
  );
}

// ---------------- Call Requests ----------------
function CallRequests() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status]);
  const res = useApi('/admin/support/calls', { params: { status: status || undefined, page } });
  const { busy, run } = useAction();

  async function update(id, body) {
    const r = await run(id, () => api.put(`/admin/support/calls/${id}`, body), { success: 'Call updated' });
    if (r.ok) res.reload();
  }

  const columns = [
    {
      key: 'callId',
      header: 'ID',
      render: (c) => <span className="font-medium text-steel-900">{c.callId}</span>,
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (c) => (
        <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 font-semibold text-rust-700 hover:underline">
          <Phone className="w-3.5 h-3.5" aria-hidden /> {c.phone}
        </a>
      ),
    },
    {
      key: 'name',
      header: 'Customer',
      render: (c) => (
        <div>
          <div className="text-steel-900 font-medium">{c.name || c.user?.name || 'Visitor'}</div>
          {c.city && <div className="text-xs text-steel-500">{c.city}</div>}
        </div>
      ),
    },
    {
      key: 'createdAt',
      header: 'Requested',
      render: (c) => <span className="text-steel-700 whitespace-nowrap">{timeAgo(c.createdAt)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (c) => (
        <Select
          className="!py-1.5 text-sm w-36"
          value={c.status}
          aria-label={`Status of ${c.callId}`}
          disabled={busy === c._id}
          onChange={(e) => update(c._id, { status: e.target.value })}
        >
          <option value="pending">Pending</option>
          <option value="called">Called</option>
          <option value="resolved">Resolved</option>
          <option value="cancelled">Cancelled</option>
        </Select>
      ),
    },
  ];

  return (
    <>
      <div className="flex gap-2 mb-4">
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: '', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'called', label: 'Called' },
            { value: 'resolved', label: 'Resolved' },
          ]}
        />
      </div>
      <DataTable
        columns={columns}
        rows={res.data?.calls}
        loading={res.loading}
        empty={<EmptyState icon={Phone} title="No call requests" description="Incoming call requests and callbacks from the website will appear here." />}
      />
      <Pagination pagination={res.data?.pagination} onPage={setPage} />
    </>
  );
}

// ---------------- Analytics ----------------
function Analytics() {
  const res = useApi('/admin/support/analytics');
  return (
    <Async {...res} onRetry={res.reload} rows={3}>
      {(d) => {
        const pct = (n) => `${Math.round((n || 0) * 100)}%`;
        const stats = [
          ['Conversations', d.sessions],
          ['Escalation rate', pct(d.escalationRate)],
          ['Unresolved escalations', d.unresolvedConversations],
          ['Open tickets', d.openTickets],
          ['AI replies', d.replies?.ai || 0],
          ['Fallback replies', d.replies?.fallback || 0],
          ['Unanswered rate', pct(d.unansweredRate)],
        ];
        return (
          <div className="space-y-6">
            <p className="text-sm text-steel-500">Last {d.days} days</p>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {stats.map(([label, value]) => (
                <Stat key={label} label={label} value={value} />
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <SectionTitle title="What customers ask about" />
                <BarList data={d.topics.map((t) => ({ ...t, topic: pretty(t.topic) }))} label="topic" value="count" />
              </Card>
              <Card>
                <SectionTitle title="Most repeated questions" />
                {d.commonQuestions.length === 0 ? (
                  <p className="text-sm text-steel-500">No repeated questions yet.</p>
                ) : (
                  <ol className="space-y-2 text-sm list-decimal pl-5 text-steel-700">
                    {d.commonQuestions.map((q) => (
                      <li key={q.question}>
                        {q.question} <span className="text-steel-500 tabular">×{q.count}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </Card>
            </div>
          </div>
        );
      }}
    </Async>
  );
}

// ---------------- FAQs ----------------
const EMPTY_FAQ = { question: '', answer: '', topic: '', keywords: '', isActive: true };

function Faqs() {
  const res = useApi('/admin/faqs');
  const [form, setForm] = useState(EMPTY_FAQ);
  const [editingId, setEditingId] = useState(null);
  const [errors, setErrors] = useState({});
  const [deleting, setDeleting] = useState(null);
  const { busy, run } = useAction();
  const set = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));

  function startEdit(f) {
    setEditingId(f._id);
    setErrors({});
    setForm({ ...f, keywords: (f.keywords || []).join(', ') });
  }
  function cancel() {
    setEditingId(null);
    setErrors({});
    setForm(EMPTY_FAQ);
  }

  async function save(e) {
    e.preventDefault();
    const er = {};
    if (form.question.trim().length < 5) er.question = 'At least 5 characters';
    if (form.answer.trim().length < 5) er.answer = 'At least 5 characters';
    if (form.topic.trim().length < 2) er.topic = 'At least 2 characters';
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = await run('save', () => (editingId ? api.put(`/admin/faqs/${editingId}`, form) : api.post('/admin/faqs', form)), {
      success: editingId ? 'FAQ updated' : 'FAQ added',
    });
    if (r.ok) {
      cancel();
      res.reload();
    }
  }

  async function remove() {
    const r = await run('delete', () => api.delete(`/admin/faqs/${deleting._id}`), { success: 'FAQ deleted' });
    if (r.ok) {
      if (editingId === deleting._id) cancel();
      setDeleting(null);
      res.reload();
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
      <div>
        <p className="text-sm text-steel-500 mb-4">The chat assistant answers from these FAQs in both AI and fallback mode.</p>
        <Async
          {...res}
          onRetry={res.reload}
          isEmpty={(d) => !d.faqs.length}
          empty={<EmptyState icon={BookOpen} title="No FAQs yet" description="Add one to teach the assistant." />}
        >
          {(d) => (
            <ul className="space-y-3">
              {d.faqs.map((f) => (
                <li key={f._id}>
                  <Card className={cx(editingId === f._id && 'ring-1 ring-rust-500')}>
                    <div className="flex justify-between gap-3">
                      <h3 className="font-medium text-steel-900">{f.question}</h3>
                      <div className="flex shrink-0 -mt-1 -mr-2">
                        <IconButton label={`Edit FAQ: ${f.question}`} icon={Pencil} onClick={() => startEdit(f)} />
                        <IconButton label={`Delete FAQ: ${f.question}`} icon={Trash2} onClick={() => setDeleting(f)} className="hover:!text-danger-600" />
                      </div>
                    </div>
                    <div className="text-sm text-steel-700 mt-1">
                      <Markdown>{f.answer}</Markdown>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge tone="blue">{f.topic}</Badge>
                      {!f.isActive && <Badge tone="amber">Inactive</Badge>}
                      {(f.keywords || []).slice(0, 5).map((k) => (
                        <Badge key={k}>{k}</Badge>
                      ))}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          )}
        </Async>
      </div>

      <Card as="form" onSubmit={save} noValidate className="space-y-4 lg:sticky lg:top-4">
        <SectionTitle
          title={editingId ? 'Edit FAQ' : 'Add FAQ'}
          className="!mb-0"
          action={!editingId ? <Plus className="w-4 h-4 text-steel-400" aria-hidden /> : undefined}
        />
        <Field label="Question" required error={errors.question}>
          {(id) => <Input id={id} value={form.question} onChange={(e) => set('question')(e.target.value)} maxLength={300} invalid={!!errors.question} />}
        </Field>
        <Field label="Answer" required error={errors.answer} hint="Markdown supported: **bold**, lists and links">
          {(id) => <Textarea id={id} rows={5} value={form.answer} onChange={(e) => set('answer')(e.target.value)} maxLength={2000} invalid={!!errors.answer} />}
        </Field>
        <Field label="Topic" required error={errors.topic} hint="e.g. payment, pickup, pricing">
          {(id) => <Input id={id} value={form.topic} onChange={(e) => set('topic')(e.target.value)} maxLength={40} invalid={!!errors.topic} />}
        </Field>
        <Field label="Keywords" hint="Comma separated">
          {(id) => <Input id={id} value={form.keywords} onChange={(e) => set('keywords')(e.target.value)} />}
        </Field>
        <Toggle checked={form.isActive} onChange={set('isActive')} label="Active" />
        <div className="flex gap-2">
          <Button type="submit" loading={busy === 'save'}>
            {editingId ? 'Save changes' : 'Add FAQ'}
          </Button>
          {editingId && (
            <Button variant="ghost" onClick={cancel}>
              Cancel
            </Button>
          )}
        </div>
      </Card>

      <ConfirmModal open={!!deleting} onClose={() => setDeleting(null)} title="Delete FAQ?" confirmLabel="Delete" variant="danger" busy={busy === 'delete'} onConfirm={remove}>
        <p>
          “{deleting?.question}” will no longer be used by the assistant. To stop using it temporarily, mark it inactive instead.
        </p>
      </ConfirmModal>
    </div>
  );
}
