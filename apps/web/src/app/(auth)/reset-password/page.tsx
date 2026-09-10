'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi, ApiClientError } from '../../../lib/api';
import { Sparkles, AlertCircle, ArrowRight, Lock, CheckCircle2, ShieldCheck, KeyRound } from 'lucide-react';

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const isLengthValid = password.length >= 8 && password.length <= 72;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  if (!token) {
    return (
      <div className="text-center space-y-6">
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3 text-left">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>
            <strong className="block text-rose-200">Invalid or Missing Reset Token</strong>
            This password reset link is invalid or incomplete. Reset links are only valid for 15 minutes.
          </div>
        </div>
        <Link
          href="/forgot-password"
          className="inline-flex items-center justify-center w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl transition-all shadow-md shadow-emerald-500/20 text-sm"
        >
          Request New Reset Link
        </Link>
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="text-center space-y-6">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20 animate-in zoom-in-95">
          <ShieldCheck className="w-8 h-8" />
        </div>
        <div className="space-y-2">
          <h3 className="text-xl font-bold text-white">Password Updated</h3>
          <p className="text-sm text-slate-400">
            Your password has been securely updated. You can now sign in with your new credentials.
          </p>
        </div>
        <Link
          id="go-to-login-btn"
          href="/login"
          className="inline-flex items-center justify-center w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold rounded-xl transition-all shadow-md shadow-emerald-500/20 text-sm gap-2"
        >
          <span>Sign in to Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password.length > 72) {
      setError('Password must not exceed 72 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please verify both fields.');
      return;
    }

    setIsSubmitting(true);

    try {
      await authApi.resetPassword({
        token,
        newPassword: password,
      });
      setIsSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'TOKEN_EXPIRED') {
          setError('This password reset link has expired (15-minute limit) or has already been used.');
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to update password. Please request a new link.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          New Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Lock className="w-4 h-4" />
          </div>
          <input
            id="new-password-input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm"
            autoComplete="new-password"
          />
        </div>

        <div className="mt-2.5 flex items-center gap-2 text-xs">
          <div className={`w-1.5 h-1.5 rounded-full ${isLengthValid ? 'bg-emerald-400' : 'bg-slate-600'}`} />
          <span className={isLengthValid ? 'text-emerald-400 font-medium' : 'text-slate-400'}>
            Between 8 and 72 characters
          </span>
          {isLengthValid && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
          Confirm New Password
        </label>
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
            <Lock className="w-4 h-4" />
          </div>
          <input
            id="confirm-password-input"
            type="password"
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
            className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm"
            autoComplete="new-password"
          />
        </div>
        {confirmPassword.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs">
            <div className={`w-1.5 h-1.5 rounded-full ${passwordsMatch ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            <span className={passwordsMatch ? 'text-emerald-400 font-medium' : 'text-rose-400'}>
              {passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
            </span>
            {passwordsMatch && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 ml-auto" />}
          </div>
        )}
      </div>

      <button
        id="submit-reset-password-btn"
        type="submit"
        disabled={isSubmitting}
        className="w-full mt-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 font-semibold rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 group text-sm"
      >
        {isSubmitting ? (
          <>
            <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            <span>Updating password...</span>
          </>
        ) : (
          <>
            <KeyRound className="w-4 h-4" />
            <span>Save New Password</span>
          </>
        )}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 font-bold text-2xl text-white tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <span>Recon</span>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Create new password
          </h2>
          <p className="text-sm text-slate-400">
            Enter your new secure password below
          </p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-xl shadow-black/40">
          <Suspense fallback={<div className="text-center text-slate-400 py-6">Loading reset form...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
