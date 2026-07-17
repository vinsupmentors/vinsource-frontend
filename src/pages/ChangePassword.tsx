import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { AppDispatch, RootState } from '@/store';
import { fetchMe } from '@/store/slices/authSlice';
import api from '@/lib/api';
import { KeyRound, Eye, EyeOff, Loader2, CheckCircle } from 'lucide-react';

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();
  const role = useSelector((s: RootState) => s.auth.user?.role);

  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [show, setShow] = useState({ current: false, new: false, confirm: false });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (form.newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (form.newPassword !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.newPassword === form.currentPassword) {
      setError('New password must be different from your temporary password.');
      return;
    }
    setLoading(true);
    try {
      await api.put('/api/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      // Refresh user so mustChangePassword becomes false in Redux
      await dispatch(fetchMe());
      setDone(true);
      // Students go back to the student portal; employees go to onboarding setup
      setTimeout(() => navigate(role === 'STUDENT' ? '/student/dashboard' : '/setup'), 1500);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to change password.');
    } finally {
      setLoading(false);
    }
  };

  const toggle = (field: 'current' | 'new' | 'confirm') =>
    setShow(s => ({ ...s, [field]: !s[field] }));

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo + header */}
        <div className="text-center mb-8">
          <img src="/vinsup-logo.png" alt="Vinsup" className="h-16 w-auto object-contain mx-auto mb-4" />
          <h1 className="text-2xl font-bold">Set Your Password</h1>
          <p className="text-muted-foreground text-sm mt-1">
            You're using a temporary password. Please set a new one before continuing.
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl shadow-sm p-8">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle className="w-12 h-12 text-green-500" />
              <p className="font-semibold text-lg">Password updated!</p>
              <p className="text-sm text-muted-foreground">{role === 'STUDENT' ? 'Taking you to the student portal…' : 'Taking you to your onboarding wizard…'}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Current (temp) password */}
              <div>
                <label className="text-sm font-medium mb-1 block">Temporary Password</label>
                <div className="relative">
                  <input
                    type={show.current ? 'text' : 'password'}
                    value={form.currentPassword}
                    onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
                    required
                    placeholder="Enter your temporary password"
                    className="w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm bg-background"
                  />
                  <button type="button" onClick={() => toggle('current')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {show.current ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* New password */}
              <div>
                <label className="text-sm font-medium mb-1 block">New Password</label>
                <div className="relative">
                  <input
                    type={show.new ? 'text' : 'password'}
                    value={form.newPassword}
                    onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
                    required
                    placeholder="Min 8 characters"
                    className="w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm bg-background"
                  />
                  <button type="button" onClick={() => toggle('new')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {show.new ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm password */}
              <div>
                <label className="text-sm font-medium mb-1 block">Confirm New Password</label>
                <div className="relative">
                  <input
                    type={show.confirm ? 'text' : 'password'}
                    value={form.confirm}
                    onChange={e => setForm(f => ({ ...f, confirm: e.target.value }))}
                    required
                    placeholder="Re-enter new password"
                    className="w-full px-3 py-2 pr-10 border border-border rounded-lg text-sm bg-background"
                  />
                  <button type="button" onClick={() => toggle('confirm')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {show.confirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90 transition disabled:opacity-60"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {loading ? 'Updating…' : 'Set New Password & Continue'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
