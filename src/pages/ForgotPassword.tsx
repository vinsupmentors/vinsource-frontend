import { useState, FormEvent } from 'react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { Loader2, ArrowLeft, Mail, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <img src="/vinsup-logo.png" alt="Vinsup Skill Academy" className="h-24 w-auto object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Vin-Source Portal</h1>
          <p className="text-muted-foreground mt-1 text-sm">Password Recovery</p>
        </div>

        <div className="bg-card rounded-2xl shadow-xl border p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <CheckCircle2 className="w-14 h-14 text-green-500" />
              </div>
              <h2 className="text-lg font-semibold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                If <strong>{email}</strong> is registered, you will receive a password reset link shortly.
                The link expires in 1 hour.
              </p>
              <p className="text-xs text-muted-foreground">
                Didn't receive it? Check your spam folder or{' '}
                <button
                  onClick={() => setSent(false)}
                  className="text-blue-600 hover:underline font-medium"
                >
                  try again
                </button>.
              </p>
              <Link
                to="/login"
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:underline mt-4"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Sign In
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <h2 className="text-lg font-semibold mb-1">Forgot your password?</h2>
                <p className="text-sm text-muted-foreground">
                  Enter your registered email and we'll send you a reset link.
                </p>
              </div>

              {error && (
                <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-600 dark:text-red-400">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-sm font-medium mb-1.5">Email address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                    placeholder="you@vinsupskillacademy.com"
                    required
                    autoFocus
                  />
                </div>
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
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>

              <div className="text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
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
