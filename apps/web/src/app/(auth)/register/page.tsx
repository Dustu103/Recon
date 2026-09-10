'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/use-auth';
import { authApi, ApiClientError } from '../../../lib/api';
import {
  Sparkles,
  AlertCircle,
  ArrowRight,
  Lock,
  Mail,
  CheckCircle2,
  KeyRound,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
} from 'lucide-react';

export default function RegisterPage() {
  const router = useRouter();
  const { user, isLoading: isAuthLoading } = useAuth();

  // Registration step: 'form' | 'otp'
  const [step, setStep] = useState<'form' | 'otp'>('form');

  // Form Inputs
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // OTP 6-box state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', '']);
  const otpInputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Feedback & Timers
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [devOtpHint, setDevOtpHint] = useState<string | null>(null);

  // If already logged in, redirect to dashboard
  useEffect(() => {
    if (!isAuthLoading && user) {
      router.replace('/dashboard');
    }
  }, [user, isAuthLoading, router]);

  // Cooldown countdown effect
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const isLengthValid = password.length >= 8 && password.length <= 72;
  const passwordsMatch = password.length > 0 && password === confirmPassword;

  // ── Step 1: Send OTP ────────────────────────────────────────────────────────
  const handleInitiateRegistration = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (password.length > 72) {
      setError('Password must not exceed 72 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await authApi.sendOtp({ email, password });
      setStep('otp');
      setCooldown(res.cooldownSeconds || 60);
      if (res.devOtp) {
        setDevOtpHint(res.devOtp);
      }
      setSuccessMsg(`Verification code dispatched to ${email}`);
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.code === 'USER_EXISTS') {
          setError('An account with this email address already exists.');
        } else if (err.code === 'AUTH_RATE_LIMITED') {
          setError(err.message || 'Too many requests. Please wait before trying again.');
        } else {
          setError(err.message);
        }
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step 2: Handle OTP Input & Paste ────────────────────────────────────────
  const handleDigitChange = (index: number, val: string) => {
    const digit = val.slice(-1); // Take last typed char
    if (digit && !/^\d$/.test(digit)) return; // Digits only

    const nextDigits = [...otpDigits];
    nextDigits[index] = digit;
    setOtpDigits(nextDigits);

    // Auto-advance focus to next input
    if (digit && index < 5) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleDigitKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(pasteData)) {
      const digits = pasteData.split('');
      setOtpDigits(digits);
      otpInputRefs.current[5]?.focus();
    }
  };

  const handleApplyDevOtp = () => {
    if (devOtpHint && devOtpHint.length === 6) {
      setOtpDigits(devOtpHint.split(''));
      otpInputRefs.current[5]?.focus();
    }
  };

  // ── Step 2: Verify OTP and Activate Session ─────────────────────────────────
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const fullOtp = otpDigits.join('');

    if (fullOtp.length !== 6) {
      setError('Please enter all 6 digits of your verification code.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await authApi.verifyOtp({ email, otp: fullOtp });
      // On success, session cookie is set; redirect to candidate dashboard
      router.push('/dashboard');
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Verification failed. Please check your code and try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Step 2: Resend OTP ───────────────────────────────────────────────────────
  const handleResendCode = async () => {
    if (cooldown > 0 || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await authApi.resendOtp({ email });
      setCooldown(res.cooldownSeconds || 60);
      if (res.devOtp) {
        setDevOtpHint(res.devOtp);
      }
      setSuccessMsg('A new verification code has been dispatched.');
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else if (err instanceof Error) {
        setError(err.message);
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
            {step === 'form' ? 'Create your account' : 'Verify your email'}
          </h2>
          <p className="text-sm text-slate-400">
            {step === 'form'
              ? 'Start generating personalized AI interview preparation kits'
              : `Enter the 6-digit code sent to ${email}`}
          </p>
        </div>

        {/* Card Body */}
        <div className="bg-slate-900/80 border border-slate-800/80 rounded-2xl p-8 backdrop-blur-xl shadow-xl shadow-black/40">
          {/* Alerts */}
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div>{error}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-6 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
              <div>{successMsg}</div>
            </div>
          )}

          {/* ── STEP 1: INITIAL REGISTRATION FORM ── */}
          {step === 'form' && (
            <form onSubmit={handleInitiateRegistration} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Email address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="register-email-input"
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

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="register-password-input"
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
                  Confirm Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    id="register-confirm-password-input"
                    type="password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter password"
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
                id="submit-register-btn"
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:bg-emerald-500/50 text-slate-950 font-semibold rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 group text-sm"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Transmitting verification code...</span>
                  </>
                ) : (
                  <>
                    <span>Continue to Verification</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* ── STEP 2: 6-DIGIT OTP VERIFICATION SCREEN ── */}
          {step === 'otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-6">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setStep('form');
                    setError(null);
                  }}
                  className="text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Change email</span>
                </button>
                <span className="text-slate-400 font-mono text-[11px]">{email}</span>
              </div>

              {/* Dev Helper Badge */}
              {devOtpHint && (
                <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 flex items-center justify-between">
                  <div className="text-xs text-emerald-300 flex items-center gap-2 font-mono">
                    <KeyRound className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>Dev OTP: <strong>{devOtpHint}</strong></span>
                  </div>
                  <button
                    type="button"
                    onClick={handleApplyDevOtp}
                    className="text-[11px] font-medium text-emerald-400 hover:underline px-2 py-0.5 rounded bg-emerald-500/10"
                  >
                    Auto-fill
                  </button>
                </div>
              )}

              {/* 6 Discrete Digit Boxes */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider text-center">
                  6-Digit Verification Code
                </label>

                <div className="flex justify-between gap-2 sm:gap-3" onPaste={handleOtpPaste}>
                  {otpDigits.map((digit, idx) => (
                    <input
                      key={idx}
                      ref={(el) => {
                        otpInputRefs.current[idx] = el;
                      }}
                      id={`otp-box-${idx}`}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(idx, e.target.value)}
                      onKeyDown={(e) => handleDigitKeyDown(idx, e)}
                      className="w-12 h-14 sm:w-14 sm:h-16 text-center text-xl sm:text-2xl font-mono font-bold bg-slate-950 border border-slate-700 rounded-xl text-white focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/40 transition-all"
                    />
                  ))}
                </div>
              </div>

              {/* Submit Verification Button */}
              <button
                id="submit-otp-btn"
                type="submit"
                disabled={isSubmitting || otpDigits.join('').length !== 6}
                className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 font-semibold rounded-xl transition-all shadow-md shadow-emerald-500/20 flex items-center justify-center gap-2 group text-sm"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Verifying with Redis...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Verify & Launch Dashboard</span>
                  </>
                )}
              </button>

              {/* Resend Cooldown Controls */}
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={cooldown > 0 || isSubmitting}
                  className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 disabled:text-slate-600 transition-colors"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isSubmitting ? 'animate-spin' : ''}`} />
                  <span>
                    {cooldown > 0
                      ? `Resend code in ${cooldown}s`
                      : 'Did not receive code? Resend'}
                  </span>
                </button>
              </div>
            </form>
          )}

          {/* Footer Navigation */}
          <div className="mt-6 pt-6 border-t border-slate-800/80 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-emerald-400 hover:text-emerald-300 underline underline-offset-4 transition-colors"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
