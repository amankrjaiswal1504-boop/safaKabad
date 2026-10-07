import { useCallback, useEffect, useMemo, useState } from 'react';
import { Building2, FileCheck2, Search, Users } from 'lucide-react';
import api from '../../services/api';
import useApi, { useDebounce } from '../../hooks/useApi';
import { fmtDate, fmtDateTime, rupees } from '../../utils/format';
import { NUMBER_LOCALE, TAX_ID_LABEL } from '../../utils/locale';
import { Badge, Button, Card, DataTable, EmptyState, Field, Input, PageHeader, Pagination, Select, Textarea, cx } from '../../components/ui';
import { CURRENCY_SYMBOL } from '../../utils/locale';
import { Async, Callout, KeyValue, NumberInput, Toolbar, isBlank, toNumOrNull, useAction, Modal } from './_catalog/shared';

const STATUSES = [
  { value: 'new', label: 'New', tone: 'rust' },
  { value: 'contacted', label: 'Contacted', tone: 'blue' },
  { value: 'quoted', label: 'Quoted', tone: 'amber' },
  { value: 'won', label: 'Won', tone: 'patina' },
  { value: 'lost', label: 'Lost', tone: 'steel' },
];
const statusOf = (s) => STATUSES.find((x) => x.value === s) || { label: s, tone: 'steel' };
const pretty = (s) => String(s || 'other').replace(/[_-]/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

function useCounts() {
  const [counts, setCounts] = useState({});
  const load = useCallback(async () => {
    const entries = await Promise.all(
      STATUSES.map((s) =>
        api
          .get('/admin/quotes', { params: { status: s.value, limit: 1 } })
          .then((r) => [s.value, r.data.data.pagination.total])
          .catch(() => [s.value, null])
      )
    );
    setCounts(Object.fromEntries(entries));
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { counts, reloadCounts: load };
}

export default function AdminBusiness() {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const q = useDebounce(search.trim(), 300);
  useEffect(() => setPage(1), [status, q]);
  const params = useMemo(() => {
    const p = { page, limit: 20 };
    if (status) p.status = status;
    if (q) p.search = q;
    return p;
  }, [page, status, q]);
  const res = useApi('/admin/quotes', { params });
  const { counts, reloadCounts } = useCounts();
  const [open, setOpen] = useState(null);

  const columns = [
    {
      key: 'quoteId',
      header: 'Quote',
      render: (r) => (
        <div className="whitespace-nowrap">
          <div className="font-medium text-steel-900">{r.quoteId}</div>
          <div className="text-xs text-steel-500">{fmtDate(r.createdAt)}</div>
        </div>
      ),
    },
    {
      key: 'companyName',
      header: 'Company',
      render: (r) => (
        <div className="min-w-[160px]">
          <div className="font-medium text-steel-900">{r.companyName}</div>
          <div className="text-xs text-steel-500">
            {pretty(r.businessType)} · {r.city}
          </div>
        </div>
      ),
    },
    {
      key: 'contact',
      header: 'Contact',
      render: (r) => (
        <div className="min-w-[140px]">
          <div className="text-steel-900">{r.contactName}</div>
          <div className="text-xs text-steel-500">{r.phone}</div>
        </div>
      ),
    },
    {
      key: 'qty',
      header: 'Est. quantity',
      render: (r) => (
        <div className="whitespace-nowrap">
          <span className="tabular">{r.estimatedQuantityKg ? `${r.estimatedQuantityKg.toLocaleString(NUMBER_LOCALE)} kg` : '—'}</span>
          {r.wantsCertificate && (
            <div>
              <Badge tone="patina" className="mt-1">
                Certificate
              </Badge>
            </div>
          )}
        </div>
      ),
    },
    { key: 'quotedAmount', header: 'Quoted', render: (r) => <span className="tabular">{r.quotedAmount != null ? rupees(r.quotedAmount) : '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge tone={statusOf(r.status).tone} dot>
          {statusOf(r.status).label}
        </Badge>
      ),
    },
  ];

  const total = Object.values(counts).reduce((s, n) => s + (n || 0), 0);

  return (
    <div>
      <PageHeader
        title="Business quotes"
        subtitle="Bulk scrap requests from offices, shops and factories."
        actions={
          <Button variant="outline" icon={Users} to="/admin/customers?accountType=business">
            Business customers
          </Button>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6" role="group" aria-label="Pipeline">
        {STATUSES.map((s) => {
          const active = status === s.value;
          return (
            <button
              key={s.value}
              type="button"
              aria-pressed={active}
              onClick={() => setStatus(active ? '' : s.value)}
              className={cx(
                'text-left rounded-xl border p-4 bg-surface shadow-card transition-colors',
                active ? 'border-rust-500 ring-1 ring-rust-500' : 'border-steel-100 hover:border-steel-300'
              )}
            >
              <Badge tone={s.tone} dot>
                {s.label}
              </Badge>
              <div className="font-head text-2xl font-semibold text-steel-900 mt-2 tabular">{counts[s.value] ?? '–'}</div>
              <div className="text-xs text-steel-500">{total ? `${Math.round(((counts[s.value] || 0) / total) * 100)}% of quotes` : 'quotes'}</div>
            </button>
          );
        })}
      </div>

      <Toolbar>
        <Field label="Search" className="flex-1 min-w-[200px]">
          {(id) => (
            <div className="relative">
              <Search className="w-4 h-4 text-steel-400 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden />
              <Input id={id} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company, contact, city or quote ID" className="pl-9" />
            </div>
          )}
        </Field>
        <Field label="Status" className="w-full sm:w-44">
          {(id) => (
            <Select id={id} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </Toolbar>

      {res.error && !res.data ? (
        <Async {...res} onRetry={res.reload}>
          {() => null}
        </Async>
      ) : (
        <DataTable
          columns={columns}
          rows={res.data?.quotes}
          loading={res.loading}
          onRowClick={setOpen}
          empty={
            <EmptyState
              icon={Building2}
              title={q || status ? 'No quotes match' : 'No quote requests yet'}
              description={q || status ? 'Try another search or status.' : 'Requests from the business page will show up here.'}
            />
          }
        />
      )}
      <Pagination pagination={res.data?.pagination} onPage={setPage} />

      {open && (
        <QuoteModal
          quote={open}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setOpen(null);
            res.reload();
            reloadCounts();
          }}
        />
      )}
    </div>
  );
}

function QuoteModal({ quote, onClose, onSaved }) {
  const [f, setF] = useState({ status: quote.status, quotedAmount: quote.quotedAmount ?? '', adminNote: quote.adminNote || '' });
  const [errors, setErrors] = useState({});
  const { busy, run } = useAction();
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const willNotify = f.status === 'quoted' && quote.status !== 'quoted' && Boolean(quote.customer);
  const noAccount = f.status === 'quoted' && quote.status !== 'quoted' && !quote.customer;

  async function save() {
    const er = {};
    if (!isBlank(f.quotedAmount) && f.quotedAmount < 0) er.quotedAmount = 'Cannot be negative';
    if (f.status === 'quoted' && isBlank(f.quotedAmount)) er.quotedAmount = 'Enter the amount you are quoting';
    if (f.adminNote.length > 1000) er.adminNote = 'Keep it under 1000 characters';
    setErrors(er);
    if (Object.keys(er).length) return;
    const body = {};
    if (f.status !== quote.status) body.status = f.status;
    const amt = toNumOrNull(f.quotedAmount);
    if (amt !== (quote.quotedAmount ?? null)) body.quotedAmount = amt;
    if (f.adminNote !== (quote.adminNote || '')) body.adminNote = f.adminNote;
    if (!Object.keys(body).length) return onClose();
    const r = await run('save', () => api.put(`/admin/quotes/${quote._id}`, body), {
      success: willNotify ? 'Quote sent: the customer has been notified' : 'Quote updated',
    });
    if (r.ok) onSaved();
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`${quote.quoteId} · ${quote.companyName}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy === 'save'}>
            {willNotify ? 'Save & notify customer' : 'Save'}
          </Button>
        </>
      }
    >
      <div className="space-y-6">
        <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <KeyValue label="Contact">{quote.contactName}</KeyValue>
          <KeyValue label="Phone">
            <a className="text-rust-700 hover:underline" href={`tel:${quote.phone}`}>
              {quote.phone}
            </a>
          </KeyValue>
          <KeyValue label="Email">
            {quote.email ? (
              <a className="text-rust-700 hover:underline break-all" href={`mailto:${quote.email}`}>
                {quote.email}
              </a>
            ) : (
              '—'
            )}
          </KeyValue>
          <KeyValue label="City">{quote.city}</KeyValue>
          <KeyValue label="Business type">{pretty(quote.businessType)}</KeyValue>
          <KeyValue label={TAX_ID_LABEL}>{quote.panVat || '—'}</KeyValue>
          <KeyValue label="Est. quantity">{quote.estimatedQuantityKg ? `${quote.estimatedQuantityKg.toLocaleString(NUMBER_LOCALE)} kg` : '—'}</KeyValue>
          <KeyValue label="Received">{fmtDateTime(quote.createdAt)}</KeyValue>
          <KeyValue label="Certificate">
            {quote.wantsCertificate ? (
              <span className="inline-flex items-center gap-1 text-patina-700">
                <FileCheck2 className="w-4 h-4" aria-hidden /> Wants recycling certificate
              </span>
            ) : (
              'Not needed'
            )}
          </KeyValue>
        </dl>
        <Card className="bg-surface-2 !shadow-none">
          <p className="text-xs text-steel-500 mb-1">What they have</p>
          <p className="text-sm text-steel-900 whitespace-pre-line break-words">{quote.description}</p>
        </Card>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Status">
            {(id) => (
              <Select id={id} value={f.status} onChange={(e) => set('status')(e.target.value)}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={`Quoted amount (${CURRENCY_SYMBOL})`} error={errors.quotedAmount}>
            {(id) => <NumberInput id={id} min={0} value={f.quotedAmount} onChange={set('quotedAmount')} invalid={!!errors.quotedAmount} />}
          </Field>
        </div>
        <Field label="Note" error={errors.adminNote} hint={willNotify ? 'Included in the message to the customer' : 'Internal note; included in the customer message when quoted'}>
          {(id) => <Textarea id={id} rows={3} value={f.adminNote} onChange={(e) => set('adminNote')(e.target.value)} maxLength={1000} />}
        </Field>
        {willNotify && (
          <Callout tone="amber">The customer is notified in-app, by email and on WhatsApp when you mark this quote as Quoted.</Callout>
        )}
        {noAccount && <Callout>This request wasn't made from a customer account, so share the quote by phone or email.</Callout>}
      </div>
    </Modal>
  );
}
