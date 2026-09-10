'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { authApi, ApiClientError } from '../../../lib/api';
import { Sparkles, AlertCircle, ArrowRight, Mail, CheckCircle2, ArrowLeft, ExternalLink, Clock } from 'lucide-react';

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [devResetLink, setDevResetLink] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const res = await authApi.forgotPassword({ email });
      setSuccessMsg(res.message);
      setCooldown(res.cooldownSeconds || 60);
      if (res.devResetLink) {
        setDevResetLink(res.devResetLink);
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Failed to dispatch password reset link. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 bg-slate-950 text-slate-100">
      <div className="w-full max-w-md space-y-8">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <Link href="/" className="inline-flex items-center gap-2 font-bold text-2xl text-white tracking-tight">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-sm shadow-emerald-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <span>Recon</span>
          </Link>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Reset your password
          </h2>
          <p className="text-sm text-slate-400">
            Enter your email to receive a secure link valid for <strong>15 minutes</strong>
          </p>
        </div>

        {/* Card Body */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-xl shadow-black/40">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm space-y-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div>{successMsg}</div>
              </div>
              <div className="flex items-center gap-2 text-xs text-emerald-400/80 pl-8">
                <Clock className="w-3.5 h-3.5" />
                <span>Link will expire automatically in 15 minutes.</span>
              </div>
            </div>
          )}

          {/* Dev Helper Action */}
          {devResetLink && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-300 space-y-2 font-mono">
              <div className="font-semibold text-emerald-400 flex items-center gap-2">
                <ExternalLink className="w-4 h-4" />
                <span>Development Reset Link Ready:</span>
              </div>
              <a
                href={devResetLink}
                className="block text-emerald-300 underline underline-offset-2 break-all hover:text-emerald-200"
              >
                {devResetLink}
              </a>
              <button
                type="button"
                onClick={() => router.push(devResetLink.replace(/^https?:\/\/[^\/]+/, ''))}
                className="mt-2 w-full py-1.5 px-3 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-sans font-medium rounded-lg text-xs transition-colors"
              >
                Open Reset Link Now &rarr;
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Account Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="forgot-email-input"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all text-sm"
                  autoComplete="email"
                />
              </div>
            </div>

            <button
              id="submit-forgot-btn"
              type="submit"
              disabled={isSubmitting || cooldown > 0}
              className="w-full mt-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 font-semibold rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 group text-sm"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>Dispatching reset link...</span>
                </>
              ) : cooldown > 0 ? (
                <span>Resend available in {cooldown}s</span>
              ) : (
                <>
                  <span>Send 15-Min Reset Link</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-slate-800/80 text-center text-sm text-slate-400">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-slate-400 hover:text-emerald-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to sign in</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
