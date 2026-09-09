'use client';

import React from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '../../../components/auth/protected-route';
import { Navbar } from '../../../components/ui/navbar';
import { useAuth } from '../../../hooks/use-auth';
import { Sparkles, Plus, BookOpen, Clock, ShieldCheck, CheckCircle } from 'lucide-react';

function DashboardContent() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
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
              Manage your customized interview kits and start focused mock practice.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/kits/new"
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm rounded-xl transition-all shadow-md shadow-emerald-500/20"
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
            <div className="text-3xl font-bold text-white">0</div>
            <p className="text-xs text-slate-500 mt-2">Ready to generate your first kit</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Practice Sessions</span>
              <Clock className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-3xl font-bold text-white">0</div>
            <p className="text-xs text-slate-500 mt-2">Interactive voice & text simulations</p>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between text-slate-400 mb-3">
              <span className="text-xs font-semibold uppercase tracking-wider">Auth Status</span>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-base font-semibold text-emerald-400">Secure HttpOnly Cookie</div>
            <p className="text-xs text-slate-500 mt-2">Zero Bearer token leakage</p>
          </div>
        </div>

        {/* Empty State / Getting Started */}
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl p-12 text-center max-w-2xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
            <Sparkles className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold text-white">No interview kits generated yet</h3>
          <p className="text-sm text-slate-400 leading-relaxed">
            Provide a target job description and company URL. Recon will extract requirements,
            cross-reference company engineering culture, and build a tailored question rubric.
          </p>
          <div className="pt-2">
            <Link
              href="/kits/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-xl border border-slate-700 transition-colors"
            >
              <Plus className="w-4 h-4 text-emerald-400" />
              <span>Get Started with Your First Kit</span>
            </Link>
          </div>
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
