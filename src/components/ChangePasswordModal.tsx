import { useState } from 'react';
import { api } from '@/lib/api';
import { Lock, Eye, EyeOff, X, Check, Loader2, AlertCircle } from 'lucide-react';

interface Props {
  onClose: () => void;
}

export default function ChangePasswordModal({ onClose }: Props) {
  const [form, setForm]     = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [show, setShow]     = useState({ current: false, newPw: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const toggle = (k: keyof typeof show) => () => setShow((s) => ({ ...s, [k]: !s[k] }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.currentPassword || !form.newPassword || !form.confirmPassword) {
      setError('All fields are required'); return;
    }
    if (form.newPassword.length < 6) {
      setError('New password must be at least 6 characters'); return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match'); return;
    }
    setLoading(true);
    try {
      await api.put('/api/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setTimeout(onClose, 2000);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border rounded-2xl shadow-2xl w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="font-semibold flex items-center gap-2">
            <Lock className="w-4 h-4 text-blue-600" /> Change Password
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-red-500 text-sm bg-red-50 dark:bg-red-950/30 p-3 rounded-xl border border-red-200">
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="flex items-center gap-2 text-green-600 text-sm bg-green-50 dark:bg-green-950/30 p-3 rounded-xl border border-green-200">
              <Check className="w-4 h-4 flex-shrink-0" /> Password changed! Closing…
            </div>
          )}

          <PwField label="Current Password" value={form.currentPassword} onChange={set('currentPassword')}
            show={show.current} onToggle={toggle('current')} />
          <PwField label="New Password" value={form.newPassword} onChange={set('newPassword')}
            show={show.newPw} onToggle={toggle('newPw')} hint="Minimum 6 characters" />
          <PwField label="Confirm New Password" value={form.confirmPassword} onChange={set('confirmPassword')}
            show={show.confirm} onToggle={toggle('confirm')} />

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border rounded-lg hover:bg-muted transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading || success}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-60">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {loading ? 'Saving…' : 'Change Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PwField({ label, value, onChange, show, onToggle, hint }: {
  label: string; value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  show: boolean; onToggle: () => void; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          className="w-full px-3 py-2 pr-10 text-sm border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button type="button" onClick={onToggle}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {hint && <p className="text-[10px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}
