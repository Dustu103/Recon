'use client';

import React from 'react';
import Link from 'next/link';
import { Navbar } from '../components/ui/navbar';
import { useAuth } from '../hooks/use-auth';
import { Sparkles, ArrowRight, ShieldCheck, Terminal, BrainCircuit, CheckCircle2 } from 'lucide-react';

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar />

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <div className="max-w-3xl w-full space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI-Powered Interview Preparation</span>
          </div>

          <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white leading-tight">
            Turn Job Descriptions into{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-teal-300">
              Targeted Interview Kits
            </span>
          </h1>

          <p className="text-slate-400 text-lg sm:text-xl max-w-2xl mx-auto leading-relaxed">
            Extract company architecture, reverse-engineer requirements, and generate tailored questions with
            depth rubrics and interactive voice simulation.
          </p>

          <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
            {user ? (
              <Link
                href="/dashboard"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-base transition-all shadow-lg shadow-emerald-500/20"
              >
                <span>Go to Dashboard</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <>
                <Link
                  href="/register"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-base transition-all shadow-lg shadow-emerald-500/20"
                >
                  <span>Start Free Prep</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-base border border-slate-800 transition-colors"
                >
                  <span>Sign In</span>
                </Link>
              </>
            )}
          </div>

          {/* Feature highlights */}
          <div className="pt-16 grid grid-cols-1 sm:grid-cols-3 gap-6 text-left">
            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <BrainCircuit className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-white mb-1">Company Extraction</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Ingests company URLs and JDs to build deep domain and tech stack profiles.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center mb-4">
                <Terminal className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-white mb-1">Interactive Practice</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Simulates real-time mock interviews with adaptive follow-ups and scoring.
              </p>
            </div>

            <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-6 backdrop-blur-sm">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-white mb-1">Secure Multi-Tenancy</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Strict HttpOnly session cookies, brute-force throttles, and private kit boundaries.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


