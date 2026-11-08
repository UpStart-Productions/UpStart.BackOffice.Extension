import { useState } from 'react';
import { Me, OrganizationCreated, createOrganization } from '../../lib/api';

type OrgType = 'partner' | 'client';

export default function OrganizationTab({ me: _me }: { me: Me }) {
  const [name, setName] = useState('');
  const [orgType, setOrgType] = useState<OrgType>('partner');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<OrganizationCreated | null>(null);

  function resetForm() {
    setName('');
    setOrgType('partner');
    setEmail('');
    setPhone('');
    setWebsite('');
    setError('');
    setStatus('idle');
    setSaved(null);
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('Organization name is required.');
      setStatus('error');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const created = await createOrganization({
        name: name.trim(),
        journey: orgType === 'client' ? 'CLIENT' : 'NONE',
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        website: website.trim() || undefined,
      });
      setSaved(created);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="success-wrap">
        <div className="success-check">✓</div>
        <p className="success-title">Organization added</p>
        <p className="success-sub">{saved?.name ?? name.trim()}</p>
        <button className="btn-secondary" style={{ marginTop: 0 }} onClick={resetForm}>
          Add another
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="panel-body">
        <div className="field-group">
          <label className="field-label">Name</label>
          <input
            className="field-input"
            placeholder="Organization name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Type</label>
          <select className="field-select" value={orgType} onChange={(e) => setOrgType(e.target.value as OrgType)}>
            <option value="partner">Partner / other</option>
            <option value="client">Client</option>
          </select>
        </div>
        <div className="field-group">
          <label className="field-label">Email</label>
          <input
            className="field-input"
            type="email"
            placeholder="Optional"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Phone</label>
          <input
            className="field-input"
            type="tel"
            placeholder="Optional"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Website</label>
          <input
            className="field-input"
            type="url"
            placeholder="https://…"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>
      </div>
      <div className="panel-footer">
        <button className="btn-primary" onClick={() => void handleSave()} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Add organization'}
        </button>
        {status === 'error' && <div className="form-error">{error}</div>}
      </div>
    </>
  );
}
