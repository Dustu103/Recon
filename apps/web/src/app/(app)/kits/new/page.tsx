'use client';

import React, { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '../../../../components/auth/protected-route';
import { Navbar } from '../../../../components/ui/navbar';
import { kitsApi, researchApi, ApiClientError } from '../../../../lib/api';
import {
  Globe,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Search,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Cpu,
  HeartHandshake,
  MessageSquare,
  ChevronRight,
  Loader2,
  Calendar,
  Layers,
  HelpCircle,
  Clock,
  ExternalLink,
  Briefcase,
} from 'lucide-react';

interface GenerationProgress {
  step: string;
  percent: number;
  message: string;
}

function NewKitPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [roleTitle, setRoleTitle] = useState('Software Developer Intern');
  const [companyUrl, setCompanyUrl] = useState('https://www.amazon.in/');
  const [jobUrl, setJobUrl] = useState('');
  const [days, setDays] = useState(7);

  useEffect(() => {
    const paramCompanyUrl = searchParams.get('companyUrl');
    const paramRoleTitle = searchParams.get('roleTitle');
    const paramJobUrl = searchParams.get('jobUrl');

    if (paramCompanyUrl) setCompanyUrl(paramCompanyUrl);
    if (paramRoleTitle) setRoleTitle(paramRoleTitle);
    if (paramJobUrl) setJobUrl(paramJobUrl);
  }, [searchParams]);
  const [jobDescription, setJobDescription] = useState(
    `We are seeking a Software Developer Intern to build high-throughput microservices and customer-facing web infrastructure.
Requirements:
- Strong problem-solving skills and foundations in Data Structures & Algorithms
- Proficiency in at least one modern language: TypeScript, JavaScript, Python, Java, or C++
- Familiarity with RESTful APIs, relational/NoSQL databases, and cloud services (AWS)
- Understanding of Object-Oriented Design and clean code principles
- Passion for customer obsession and ownership in a fast-paced environment.`
  );

  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [errorState, setErrorState] = useState<{
    code: string;
    message: string;
  } | null>(null);

  // Diagnostic Drawer State (for testing crawler directly)
  const [showDiagnostic, setShowDiagnostic] = useState(false);
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticResult, setDiagnosticResult] = useState<any | null>(null);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!jobDescription.trim() || !companyUrl.trim()) return;

    setGenerating(true);
    setErrorState(null);
    setProgress({
      step: 'init',
      percent: 5,
      message: 'Initializing AI research & generation pipeline...',
    });

    try {
      const result = await kitsApi.generate(
        {
          jd: jobDescription.trim(),
          companyUrl: companyUrl.trim(),
          days,
          roleTitle: roleTitle.trim() || undefined,
          jobUrl: jobUrl.trim() || undefined,
        },
        (p) => {
          setProgress(p);
        }
      );

      // Short delay for visual polish then redirect to kit workspace
      setProgress({
        step: 'complete',
        percent: 100,
        message: 'Kit generated! Opening your personalized workspace...',
      });

      setTimeout(() => {
        router.push(`/kits/${result.kitId}`);
      }, 750);
    } catch (err: any) {
      setErrorState({
        code: err.code || 'GENERATION_FAILED',
        message: err.message || 'Failed to generate preparation kit. Please try again.',
      });
      setGenerating(false);
    }
  };

  const handleRunDiagnostic = async () => {
    if (!companyUrl.trim()) return;
    setDiagnosticLoading(true);
    setDiagnosticResult(null);
    try {
      const res = await researchApi.crawl(companyUrl.trim());
      setDiagnosticResult(res.data);
    } catch (err: any) {
      setDiagnosticResult({ error: err.message });
    } finally {
      setDiagnosticLoading(false);
    }
  };

  const setPreset = (url: string, role: string) => {
    setCompanyUrl(url);
    setRoleTitle(role);
    setErrorState(null);
  };

  const dayPresets = [3, 5, 7, 14, 30];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Link href="/dashboard" className="hover:text-emerald-400 transition-colors">
            Dashboard
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
          <span className="text-slate-200">New Kit</span>
        </div>

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              <span>AI Preparation Engine</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Create Personalized Interview Prep Kit
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Paste your target Job Description, specify the company site, and set your timeline. Recon automatically researches the company, extracts requirements, and builds your custom study plan.
            </p>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Form Column */}
          <div className="lg:col-span-7 space-y-6">
            <form
              onSubmit={handleGenerate}
              className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6 backdrop-blur-sm shadow-xl"
            >
              <h2 className="text-base font-semibold text-white flex items-center gap-2">
                <Search className="w-4 h-4 text-emerald-400" />
                <span>Job & Company Specifications</span>
              </h2>

              {/* Target Role */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Target Role Title
                </label>
                <input
                  id="target-role-input"
                  type="text"
                  value={roleTitle}
                  onChange={(e) => setRoleTitle(e.target.value)}
                  placeholder="e.g. Software Developer Intern"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                  required
                  disabled={generating}
                />
              </div>

              {/* Company URL */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Company Website URL</span>
                  <span className="text-[10px] text-slate-400 normal-case font-normal flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-400" /> SSRF & GZIP Decompression Protected
                  </span>
                </label>
                <input
                  id="company-url-input"
                  type="text"
                  value={companyUrl}
                  onChange={(e) => setCompanyUrl(e.target.value)}
                  placeholder="https://company.com"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                  required
                  disabled={generating}
                />

                {/* Quick Presets */}
                <div className="pt-2">
                  <div className="text-[11px] text-slate-400 font-medium mb-1.5">Quick Presets:</div>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => setPreset('https://www.amazon.in/', 'Software Developer Intern')}
                      className="px-2.5 py-1 text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
                    >
                      Amazon (SDE Intern)
                    </button>
                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => setPreset('https://stripe.com', 'Backend Infrastructure Engineer')}
                      className="px-2.5 py-1 text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
                    >
                      Stripe (Backend Infra)
                    </button>
                    <button
                      type="button"
                      disabled={generating}
                      onClick={() => setPreset('https://github.com', 'Senior Full Stack Engineer')}
                      className="px-2.5 py-1 text-xs bg-slate-800/80 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition-colors"
                    >
                      GitHub (Senior Full Stack)
                    </button>
                  </div>
                </div>
              </div>

              {/* Job Posting URL (Optional / Community Share) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Job Posting URL (Optional)</span>
                  <span className="text-[10px] text-slate-400 normal-case font-normal flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-emerald-400" /> Sanitized & Shared with Community
                  </span>
                </label>
                <input
                  id="job-url-input"
                  type="url"
                  value={jobUrl}
                  onChange={(e) => setJobUrl(e.target.value)}
                  placeholder="https://jobs.lever.co/company/role or https://amazon.jobs/..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono placeholder:text-slate-600"
                  disabled={generating}
                />
              </div>

              {/* Days Timeline Selection */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Interview Timeline (Days Available)</span>
                  </label>
                  <span className="text-xs font-bold text-emerald-400 px-2 py-0.5 bg-emerald-500/10 rounded-md border border-emerald-500/20">
                    {days} {days === 1 ? 'Day' : 'Days'} Schedule
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {dayPresets.map((d) => (
                    <button
                      key={d}
                      type="button"
                      disabled={generating}
                      onClick={() => setDays(d)}
                      className={`flex-1 py-1.5 text-xs font-medium rounded-lg border transition-all ${
                        days === d
                          ? 'bg-emerald-500 text-slate-950 font-bold border-emerald-400 shadow-md shadow-emerald-500/20'
                          : 'bg-slate-950/60 hover:bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {d}d
                    </button>
                  ))}
                </div>

                <div className="pt-2 flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={30}
                    value={days}
                    onChange={(e) => setDays(parseInt(e.target.value, 10))}
                    disabled={generating}
                    className="w-full accent-emerald-500 cursor-pointer"
                  />
                  <span className="text-xs text-slate-400 font-mono w-10 text-right">{days}d</span>
                </div>
              </div>

              {/* Target Job Description */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                  <span>Target Job Description</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {jobDescription.length} characters
                  </span>
                </label>
                <textarea
                  id="job-description-input"
                  rows={6}
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder="Paste the full job posting text here..."
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3.5 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans leading-relaxed"
                  required
                  disabled={generating}
                />
              </div>

              {/* Submit Primary CTA */}
              <button
                id="generate-kit-btn"
                type="submit"
                disabled={generating || !jobDescription.trim() || !companyUrl.trim()}
                className="w-full py-4 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 font-bold text-base rounded-xl transition-all shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Building Your Prep Kit...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    <span>Generate My Interview Prep Kit</span>
                    <ArrowRight className="w-4 h-4 ml-1" />
                  </>
                )}
              </button>

              {/* Collapsible Diagnostics Trigger */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                <span>Need raw network checks?</span>
                <button
                  type="button"
                  onClick={() => setShowDiagnostic(!showDiagnostic)}
                  className="text-slate-400 hover:text-emerald-400 underline underline-offset-2 transition-colors"
                >
                  {showDiagnostic ? 'Hide' : 'Show'} Crawler & SSRF Diagnostics
                </button>
              </div>

              {/* Diagnostics Drawer */}
              {showDiagnostic && (
                <div className="p-4 bg-slate-950/90 rounded-xl border border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-300">Crawler Socket-Pinning Test</span>
                    <button
                      type="button"
                      onClick={handleRunDiagnostic}
                      disabled={diagnosticLoading}
                      className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1.5"
                    >
                      {diagnosticLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                      <span>Test Crawl Only</span>
                    </button>
                  </div>
                  {diagnosticResult && (
                    <pre className="text-[11px] font-mono p-3 bg-slate-900 rounded-lg text-slate-300 max-h-40 overflow-y-auto">
                      {JSON.stringify(diagnosticResult, null, 2)}
                    </pre>
                  )}
                </div>
              )}
            </form>
          </div>

          {/* Right Status / Visual Pipeline Column */}
          <div className="lg:col-span-5 space-y-6">
            {/* Live Progress Card */}
            {generating && (
              <div className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-6 space-y-6 shadow-xl shadow-emerald-500/5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-white">Generating Your Kit</h3>
                      <p className="text-[11px] text-slate-400">Multi-stage pipeline in execution</p>
                    </div>
                  </div>
                  <span className="text-sm font-mono font-bold text-emerald-400">
                    {progress?.percent || 0}%
                  </span>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-teal-400 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${progress?.percent || 5}%` }}
                  />
                </div>

                {/* Live Message */}
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 text-xs text-slate-300 font-mono flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>{progress?.message || 'Processing...'}</span>
                </div>

                {/* Pipeline Milestones */}
                <div className="space-y-2.5 text-xs text-slate-400 font-mono">
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${(progress?.percent || 0) >= 15 ? 'text-emerald-400' : 'text-slate-600'}`}
                    />
                    <span>1. Parse JD & extract monotonic requirements (r1..rn)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${(progress?.percent || 0) >= 35 ? 'text-emerald-400' : 'text-slate-600'}`}
                    />
                    <span>2. SSRF-shielded crawl & interview discussion retrieval</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${(progress?.percent || 0) >= 55 ? 'text-emerald-400' : 'text-slate-600'}`}
                    />
                    <span>3. Synthesize company brief (discarding retail fluff)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${(progress?.percent || 0) >= 75 ? 'text-emerald-400' : 'text-slate-600'}`}
                    />
                    <span>4. Generate targeted question bank mapped to requirements</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${(progress?.percent || 0) >= 88 ? 'text-emerald-400' : 'text-slate-600'}`}
                    />
                    <span>5. Synthesize flashcard deck & Day-by-Day schedule</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2
                      className={`w-3.5 h-3.5 ${(progress?.percent || 0) >= 100 ? 'text-emerald-400' : 'text-slate-600'}`}
                    />
                    <span>6. Pre-D4 validation gate & multi-tenant persistence</span>
                  </div>
                </div>
              </div>
            )}

            {/* Error Card */}
            {errorState && (
              <div className="p-6 bg-rose-950/30 border border-rose-500/40 rounded-2xl space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base text-white">Kit Generation Halted</h3>
                    <p className="text-xs text-slate-300 font-mono">Code: {errorState.code}</p>
                  </div>
                </div>
                <p className="text-xs text-rose-200 bg-slate-950/80 p-3 rounded-xl border border-slate-800 font-mono">
                  {errorState.message}
                </p>
              </div>
            )}

            {/* Overview / Value Card */}
            {!generating && !errorState && (
              <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
                <div className="space-y-2">
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Layers className="w-4 h-4 text-emerald-400" />
                    <span>What Your Prep Kit Delivers</span>
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Rather than generic trivia, Recon builds a complete, role-grounded study system:
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg border border-emerald-500/20 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Role Breakdown</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Seniority level, discrete requirements tagged as Must-Have vs Nice-to-Have, and core responsibilities.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-blue-500/10 text-blue-400 rounded-lg border border-blue-500/20 shrink-0">
                      <HelpCircle className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Targeted Question Bank</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Technical, behavioural, and domain questions strictly linked to your job requirements with suggested answers.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-purple-500/10 text-purple-400 rounded-lg border border-purple-500/20 shrink-0">
                      <Cpu className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Interactive Flashcards</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        High-yield bulleted flip cards for fast recall during crunch study sessions.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-500/10 text-amber-400 rounded-lg border border-amber-500/20 shrink-0">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-white">Day-by-Day Study Schedule</h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Structured timeline balanced across your available days with daily focus themes and estimated minutes.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Optional Job Application URL */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Job Application URL (Optional)</span>
                    </span>
                    <span className="text-[11px] text-emerald-400 font-mono">Sanitizer Active</span>
                  </label>
                  <input
                    id="job-url-input"
                    type="text"
                    value={jobUrl}
                    onChange={(e) => setJobUrl(e.target.value)}
                    placeholder="https://amazon.jobs/jobs/12345 or Greenhouse / Lever URL"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-mono"
                    disabled={generating}
                  />
                  <p className="text-[11px] text-slate-500">
                    Recon strips private referral tracking tokens and shares verified opportunities with the candidate community.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default function NewKitPage() {
  return (
    <ProtectedRoute>
      <Suspense fallback={<div className="min-h-screen bg-slate-950 text-slate-400 flex items-center justify-center">Loading kit builder...</div>}>
        <NewKitPageContent />
      </Suspense>
    </ProtectedRoute>
  );
}
