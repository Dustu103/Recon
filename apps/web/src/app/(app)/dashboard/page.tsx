'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '../../../components/auth/protected-route';
import { Navbar } from '../../../components/ui/navbar';
import { useAuth } from '../../../hooks/use-auth';
import { kitsApi, jobsApi, KitListItem, JobOpportunityItem } from '../../../lib/api';
import {
  Sparkles,
  Plus,
  BookOpen,
  Clock,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Building2,
  Calendar,
  Layers,
  Loader2,
  Briefcase,
  MapPin,
  ExternalLink,
  AlertTriangle,
  Check,
} from 'lucide-react';

function DashboardContent() {
  const { user } = useAuth();
  const [kits, setKits] = useState<KitListItem[]>([]);
  const [jobs, setJobs] = useState<JobOpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [jobsLoading, setJobsLoading] = useState(true);
  const [reportedJobIds, setReportedJobIds] = useState<Set<string>>(new Set());
  const [reportingId, setReportingId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [kitsData, jobsData] = await Promise.allSettled([
          kitsApi.list(),
          jobsApi.list({ limit: 6 }),
        ]);

        if (kitsData.status === 'fulfilled') {
          setKits(kitsData.value);
        }
        if (jobsData.status === 'fulfilled') {
          setJobs(jobsData.value.jobs);
        }
      } finally {
        setLoading(false);
        setJobsLoading(false);
      }
    }
    loadData();
  }, []);

  const handleReportClosed = async (jobId: string) => {
    if (reportedJobIds.has(jobId) || reportingId) return;
    setReportingId(jobId);
    try {
      await jobsApi.reportClosed(jobId);
      setReportedJobIds((prev) => new Set(prev).add(jobId));
      // Filter out immediately if closed
      setJobs((prev) => prev.filter((j) => j.id !== jobId));
    } catch {
      // ignore
    } finally {
      setReportingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
        {/* Header greeting */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-2">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Authenticated Session</span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Welcome, <span className="text-emerald-400">{user?.email}</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Manage your customized interview kits, track study schedules, and discover verified opportunities.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/kits/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl transition-all shadow-md shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Kit</span>
            </Link>
          </div>
        </div>

        {/* Overview Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Active Kits</span>
              <BookOpen className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-white">{kits.length}</div>
            <p className="text-xs text-slate-500 mt-2">
              {kits.length === 1 ? '1 kit ready for practice' : `${kits.length} kits ready for practice`}
            </p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Hybrid Intelligence</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-base font-semibold text-white">Curated DB + LLM Synergy</div>
            <p className="text-xs text-slate-500 mt-2">Fast template matching + bespoke gap filling</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Public Opportunities</span>
              <Briefcase className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-base font-semibold text-emerald-400">
              {jobs.length} Active Verified {jobs.length === 1 ? 'Role' : 'Roles'}
            </div>
            <p className="text-xs text-slate-500 mt-2">Sanitized links with 7-day liveness tracking</p>
          </div>
        </div>

        {/* Kits Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-emerald-400" />
              <span>Your Interview Preparation Kits</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">{kits.length} total</span>
          </div>

          {loading ? (
            <div className="text-center py-16">
              <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
              <p className="text-xs text-slate-400 mt-2 font-mono">Loading your interview kits...</p>
            </div>
          ) : kits.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {kits.map((kit) => (
                <Link
                  key={kit._id}
                  href={`/kits/${kit._id}`}
                  className="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-6 space-y-4 transition-all group backdrop-blur-sm shadow-lg hover:shadow-emerald-500/10 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        {kit.days} Days Timeline
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {new Date(kit.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h3 className="text-lg font-bold text-white group-hover:text-emerald-400 transition-colors">
                      {kit.roleTitle || kit.title}
                    </h3>

                    <div className="text-xs text-slate-400 flex items-center gap-1.5 font-medium">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>{kit.companyName || 'Target Company'}</span>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-800/80 flex items-center justify-between text-xs text-emerald-400 font-semibold">
                    <span>Open Kit Workspace</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            /* Empty Kits State */
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <Sparkles className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-semibold text-white">No interview kits generated yet</h3>
              <p className="text-sm text-slate-400 leading-relaxed">
                Paste a target job description and company website URL. Recon will automatically extract requirements, research company engineering culture, and build your personalized prep kit.
              </p>
              <div className="pt-2">
                <Link
                  href="/kits/new"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-sm font-bold rounded-xl transition-all shadow-md shadow-emerald-500/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Create Your First Prep Kit</span>
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Community Verified Opportunities Section */}
        <div className="space-y-4 pt-6 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-emerald-400" />
                <span>Active Verified Opportunities & Community Recommendations</span>
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Sanitized ATS job postings automatically discovered and verified by Recon candidates.
              </p>
            </div>
          </div>

          {jobsLoading ? (
            <div className="text-center py-10">
              <Loader2 className="w-6 h-6 text-emerald-400 animate-spin mx-auto" />
            </div>
          ) : jobs.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {jobs.map((job) => (
                <div
                  key={job.id}
                  className="bg-slate-900/60 border border-slate-800 hover:border-slate-700 rounded-2xl p-6 flex flex-col justify-between space-y-4 backdrop-blur-sm transition-all shadow-md"
                >
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
                        <Building2 className="w-3 h-3" />
                        <span>{job.companyName}</span>
                      </span>

                      {job.location && (
                        <span className="text-[11px] text-slate-400 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-slate-500" />
                          <span>{job.location}</span>
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-white">
                      {job.title}
                    </h3>

                    {job.descriptionSnippet && (
                      <p className="text-xs text-slate-400 line-clamp-3 leading-relaxed">
                        {job.descriptionSnippet}
                      </p>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-800 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/kits/new?companyUrl=${encodeURIComponent(job.companyUrl)}&roleTitle=${encodeURIComponent(job.title)}&jobUrl=${encodeURIComponent(job.jobUrl)}`}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg transition-all"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Prep for this Role</span>
                      </Link>

                      <a
                        href={job.jobUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
                      >
                        <span>Original ATS</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Verified Active</span>
                      <button
                        type="button"
                        onClick={() => handleReportClosed(job.id)}
                        disabled={reportedJobIds.has(job.id) || reportingId === job.id}
                        className="text-slate-500 hover:text-amber-400 transition-colors flex items-center gap-1 disabled:opacity-50"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>{reportedJobIds.has(job.id) ? 'Reported' : 'Report Closed'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-slate-900/30 border border-slate-800/80 rounded-2xl p-8 text-center max-w-xl mx-auto space-y-2">
              <Briefcase className="w-8 h-8 text-slate-500 mx-auto" />
              <h4 className="text-sm font-semibold text-slate-300">No community jobs listed yet</h4>
              <p className="text-xs text-slate-400">
                Whenever you or other candidates create a prep kit with a job link, verified active roles will automatically appear here to help the community discover opportunities!
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
