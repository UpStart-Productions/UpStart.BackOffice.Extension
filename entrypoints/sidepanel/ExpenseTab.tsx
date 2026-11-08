import { useEffect, useMemo, useState } from 'react';
import {
  ClientOption,
  Expense,
  ExpenseListOption,
  Me,
  ProjectOption,
  createExpense,
  fetchClientLookup,
  fetchExpenseCategories,
  fetchExpensePaymentMethods,
  fetchMileageRate,
  fetchProjects,
  isMileageCategory,
  uploadExpenseReceipt,
} from '../../lib/api';

// Mirrors the admin app's "New expense" dialog (admin/src/app/pages/expenses/expense-modal.component.*):
// the tenant's own category and payment-method lists, Client then Project (projects of that client),
// project defaults for Reimbursable/Billable, and mileage (miles x the organization's rate).

function todayDateInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatMoney(n: number | null | undefined): string {
  return n == null ? '' : `$${n.toFixed(2)}`;
}

export default function ExpenseTab({ me: _me }: { me: Me }) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [categories, setCategories] = useState<ExpenseListOption[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<ExpenseListOption[]>([]);
  const [mileageRate, setMileageRate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [miles, setMiles] = useState('');
  const [category, setCategory] = useState('');
  const [incurredAt, setIncurredAt] = useState(todayDateInputValue());
  const [clientId, setClientId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [isReimbursable, setIsReimbursable] = useState(false);
  const [isBillable, setIsBillable] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('');
  const [notes, setNotes] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [savedExpense, setSavedExpense] = useState<Expense | null>(null);

  useEffect(() => {
    (async () => {
      const [projectList, categoryList, methodList] = await Promise.all([
        fetchProjects().catch(() => [] as ProjectOption[]),
        fetchExpenseCategories().catch(() => [] as ExpenseListOption[]),
        fetchExpensePaymentMethods().catch(() => [] as ExpenseListOption[]),
      ]);
      const active = projectList.filter((p) => p.isActive !== false);
      setProjects(active);
      setCategories(categoryList.filter((c) => c.isActive));
      setPaymentMethods(methodList.filter((m) => m.isActive));
      try {
        setClients(await fetchClientLookup());
      } catch {
        // Same fallback as the admin dialog: the clients of the projects you can see.
        const fromProjects = new Map<string, string>();
        for (const p of active) if (p.client) fromProjects.set(p.client.id, p.client.name);
        setClients([...fromProjects].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)));
      }
      setLoading(false);
    })();
  }, []);

  const isMileage = isMileageCategory(category, categories);
  const milesNum = Number(miles);
  const mileageAmount =
    isMileage && milesNum > 0 && mileageRate != null ? Math.round(milesNum * mileageRate * 100) / 100 : null;

  const projectsForClient = useMemo(
    () => (clientId ? projects.filter((p) => p.client?.id === clientId) : []),
    [clientId, projects],
  );

  function applyProjectDefaults(id: string, mileage = isMileage) {
    const project = id ? projects.find((p) => p.id === id) : null;
    setIsBillable(project?.defaultExpenseBillable ?? false);
    setIsReimbursable(mileage ? true : (project?.defaultExpenseReimbursable ?? false));
  }

  function onClientChange(next: string) {
    setClientId(next);
    if (projectId && !projects.some((p) => p.id === projectId && p.client?.id === next)) {
      setProjectId('');
      applyProjectDefaults('');
    }
  }

  function onProjectChange(id: string) {
    setProjectId(id);
    const project = id ? projects.find((p) => p.id === id) : null;
    if (project?.client?.id) setClientId(project.client.id);
    applyProjectDefaults(id);
  }

  /** Mileage is almost always paid back, so a new mileage expense starts as reimbursable. */
  async function onCategoryChange(value: string) {
    const wasMileage = isMileage;
    const nowMileage = isMileageCategory(value, categories);
    setCategory(value);
    if (wasMileage && !nowMileage) setMiles('');
    if (!wasMileage && nowMileage) {
      setIsReimbursable(true);
      if (mileageRate == null) setMileageRate(await fetchMileageRate().catch(() => null));
    }
  }

  function resetForm() {
    setDescription('');
    setAmount('');
    setMiles('');
    setCategory('');
    setIncurredAt(todayDateInputValue());
    setClientId('');
    setProjectId('');
    setIsReimbursable(false);
    setIsBillable(false);
    setPaymentMethod('');
    setNotes('');
    setReceiptFile(null);
    setError('');
    setStatus('idle');
    setSavedExpense(null);
  }

  async function handleSave() {
    const amountNum = Number(amount);
    if (!description.trim()) {
      setError(isMileage ? 'Description and miles are required.' : 'Description and a positive amount are required.');
      setStatus('error');
      return;
    }
    if (isMileage) {
      if (mileageRate == null) {
        setError('Set a mileage rate in Settings → Expenses and Invoicing before adding mileage.');
        setStatus('error');
        return;
      }
      if (!(milesNum > 0)) {
        setError('Description and miles are required.');
        setStatus('error');
        return;
      }
    } else if (!(amountNum > 0)) {
      setError('Description and a positive amount are required.');
      setStatus('error');
      return;
    }

    setStatus('saving');
    setError('');
    try {
      const expense = await createExpense({
        description: description.trim(),
        amount: isMileage ? undefined : amountNum,
        miles: isMileage ? milesNum : null,
        category: category.trim() || undefined,
        incurredAt: new Date(`${incurredAt}T00:00:00`).toISOString(),
        projectId: projectId || undefined,
        isReimbursable,
        isBillable,
        paymentMethod: paymentMethod.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      if (receiptFile) {
        await uploadExpenseReceipt(expense.id, receiptFile);
      }
      setSavedExpense(expense);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  if (loading) {
    return <div className="panel-body">Loading…</div>;
  }

  if (status === 'success') {
    return (
      <div className="success-wrap">
        <div className="success-check">✓</div>
        <p className="success-title">Expense logged</p>
        <p className="success-sub">
          {savedExpense ? `${formatMoney(savedExpense.amount)} for ${savedExpense.description}` : ''}
        </p>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={resetForm}>
          Log another
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="panel-body">
        <div className="field-group">
          <label className="field-label">Description</label>
          <input
            className="field-input"
            placeholder="What was this for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="field-row">
          <div className="field-group">
            <label className="field-label">Date incurred</label>
            <input
              className="field-input"
              type="date"
              value={incurredAt}
              onChange={(e) => setIncurredAt(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label className="field-label">Amount</label>
            {isMileage ? (
              <div className="computed-amount">{mileageAmount != null ? formatMoney(mileageAmount) : '$0.00'}</div>
            ) : (
              <input
                className="field-input"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            )}
          </div>
        </div>

        <div className="field-group">
          <label className="field-label">Category</label>
          <select className="field-select" value={category} onChange={(e) => void onCategoryChange(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {isMileage && (
          <div className="field-group">
            <label className="field-label">Miles</label>
            <input
              className="field-input"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              placeholder="0"
              value={miles}
              onChange={(e) => setMiles(e.target.value)}
            />
            {mileageRate == null ? (
              <p className="helper-text" style={{ textAlign: 'left' }}>
                No mileage rate is set. An admin can set it in Settings → Expenses and Invoicing.
              </p>
            ) : (
              milesNum > 0 && (
                <p className="helper-text" style={{ textAlign: 'left' }}>
                  {milesNum} mi × {formatMoney(mileageRate)}/mi
                </p>
              )
            )}
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Client</label>
          <select className="field-select" value={clientId} onChange={(e) => onClientChange(e.target.value)}>
            <option value="">No client</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {projectsForClient.length > 0 && (
          <div className="field-group">
            <label className="field-label">Project</label>
            <select className="field-select" value={projectId} onChange={(e) => onProjectChange(e.target.value)}>
              <option value="">No project</option>
              {projectsForClient.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field-group">
          <label className="field-label">Payment method</label>
          <select className="field-select" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
            <option value="">No payment method</option>
            {paymentMethods.map((m) => (
              <option key={m.id} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>

        <div className="field-group" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label className="checkbox-row">
            <input type="checkbox" checked={isReimbursable} onChange={(e) => setIsReimbursable(e.target.checked)} />
            Reimbursable
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={isBillable} onChange={(e) => setIsBillable(e.target.checked)} />
            Billable to client
          </label>
        </div>

        <div className="field-group">
          <label className="field-label">Notes</label>
          <textarea className="field-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        <div className="field-group">
          <label className="field-label">Receipt</label>
          <input
            className="field-input"
            type="file"
            accept="image/*,.pdf,application/pdf"
            onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
          />
        </div>
      </div>
      <div className="panel-footer">
        <button className="btn-primary" onClick={handleSave} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Log expense'}
        </button>
        {status === 'error' && <div className="form-error">{error}</div>}
      </div>
    </>
  );
}
