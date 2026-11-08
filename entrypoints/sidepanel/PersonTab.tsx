import { useEffect, useState } from 'react';
import {
  ContactCreated,
  Me,
  OrganizationListItem,
  createContact,
  fetchOrganizations,
  uploadContactAvatar,
} from '../../lib/api';
import AvatarDropzone from './ui/AvatarDropzone';

export default function PersonTab({ me: _me }: { me: Me }) {
  const [organizations, setOrganizations] = useState<OrganizationListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [title, setTitle] = useState('');
  const [clientId, setClientId] = useState('');
  const [role, setRole] = useState('');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<ContactCreated | null>(null);

  useEffect(() => {
    void fetchOrganizations()
      .then(setOrganizations)
      .catch(() => setOrganizations([]))
      .finally(() => setLoading(false));
  }, []);

  function displayPerson(c: ContactCreated): string {
    const parts = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
    return parts || c.email || 'Person';
  }

  function resetForm() {
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setTitle('');
    setClientId('');
    setRole('');
    setAvatarFile(null);
    setError('');
    setStatus('idle');
    setSaved(null);
  }

  async function handleSave() {
    if (!firstName.trim()) {
      setError('First name is required.');
      setStatus('error');
      return;
    }
    setStatus('saving');
    setError('');
    try {
      const created = await createContact({
        firstName: firstName.trim(),
        lastName: lastName.trim() || undefined,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        title: title.trim() || undefined,
        clientId: clientId || undefined,
        role: clientId && role.trim() ? role.trim() : undefined,
      });
      if (avatarFile) {
        await uploadContactAvatar(created.id, avatarFile);
      }
      setSaved(created);
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
        <p className="success-title">Person added</p>
        <p className="success-sub">{saved ? displayPerson(saved) : ''}</p>
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
          <label className="field-label">Photo</label>
          <AvatarDropzone
            file={avatarFile}
            onFileChange={(f) => {
              setAvatarFile(f);
              if (f) setError('');
            }}
            onInvalidFile={(msg) => {
              setError(msg);
              setStatus('error');
            }}
          />
        </div>
        <div className="field-row">
          <div className="field-group">
            <label className="field-label">First name</label>
            <input className="field-input" value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">Last name</label>
            <input className="field-input" value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
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
          <label className="field-label">Title</label>
          <input
            className="field-input"
            placeholder="e.g. Executive Director"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="field-group">
          <label className="field-label">Organization</label>
          <select className="field-select" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">None</option>
            {organizations.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
        {clientId && (
          <div className="field-group">
            <label className="field-label">Role at organization</label>
            <input
              className="field-input"
              placeholder="e.g. Board member"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
        )}
      </div>
      <div className="panel-footer">
        <button className="btn-primary" onClick={() => void handleSave()} disabled={status === 'saving'}>
          {status === 'saving' ? 'Saving…' : 'Add person'}
        </button>
        {status === 'error' && <div className="form-error">{error}</div>}
      </div>
    </>
  );
}
