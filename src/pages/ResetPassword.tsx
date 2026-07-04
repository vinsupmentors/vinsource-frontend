import { useState, FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { Loader2, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      await api.post('/api/auth/reset-password-token', { token, newPassword });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Something went wrong. Please request a new reset link.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card rounded-2xl shadow-xl border p-8 text-center space-y-4">
          <XCircle className="w-14 h-14 text-red-500 mx-auto" />
          <h2 className="text-lg font-semibold">Invalid reset link</h2>
          <p className="text-sm text-muted-foreground">This link is missing a reset token. Please request a new one.</p>
          <Link to="/forgot-password" className="text-blue-600 hover:underline text-sm font-medium">
            Request a new reset link →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/vinsup-logo.png" alt="Vinsup Skill Academy" className="h-24 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Vin-Source Portal</h1>
          <p className="text-muted-foreground mt-1 text-sm">Set New Password</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl border p-8">
          {success ? (
            <div className="text-center space-y-4">
              <CheckCircle2 className="w-14 h-14 text-green-500 mx-auto" />
              <h2 className="text-lg font-semibold">Password reset!</h2>
              <p className="text-sm text-muted-foreground">
                Your password has been updated. Redirecting to login…
              </p>
              <Link to="/login" className="inline-block text-sm text-blue-600 hover:underline font-medium">
                Sign In Now →
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-1">Set a new password</h2>
                <p className="text-sm text-muted-foreground">Choose a strong password of at least 6 characters.</p>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">New Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2.5 pr-10 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                    placeholder="Min. 6 characters"
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Confirm Password</label>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                  placeholder="Re-enter password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={cn(
                  'w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all',
                  'bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] shadow-sm',
                  'disabled:opacity-60 disabled:cursor-not-allowed',
                  'flex items-center justify-center gap-2'
                )}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading ? 'Saving…' : 'Reset Password'}
              </button>

              <div className="text-center">
                <Link to="/login" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Back to Sign In
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
