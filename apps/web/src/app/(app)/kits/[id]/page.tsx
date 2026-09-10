'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '../../../../components/auth/protected-route';
import { Navbar } from '../../../../components/ui/navbar';
import { kitsApi, KitDetail, ApiClientError } from '../../../../lib/api';
import {
  Sparkles,
  ChevronRight,
  Calendar,
  Layers,
  HelpCircle,
  FileText,
  Building2,
  Clock,
  CheckCircle2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Edit3,
  Check,
  AlertCircle,
  Loader2,
  ArrowLeft,
  ArrowRight,
  Shuffle,
  Star,
} from 'lucide-react';

function KitWorkspaceContent() {
  const params = useParams();
  const router = useRouter();
  const kitId = params.id as string;

  const [kitDetail, setKitDetail] = useState<KitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'schedule' | 'questions' | 'flashcards' | 'role' | 'brief'>('schedule');

  // Question bank state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [candidateNotes, setCandidateNotes] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  // Flashcards state
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  // Live generation polling state for pending/in-progress kits
  const [pollProgress, setPollProgress] = useState<{
    percent: number;
    step: string;
    message: string;
    status: string;
  } | null>(null);

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;
    let cancelled = false;

    async function pollUntilReady() {
      try {
        const p = await kitsApi.getProgress(kitId);
        if (cancelled) return;

        setPollProgress({
          percent: p.percent,
          step: p.step,
          message: p.message,
          status: p.status,
        });

        if (p.completed || p.status === 'completed') {
          const freshKit = await kitsApi.get(kitId);
          if (!cancelled) {
            setKitDetail(freshKit);
          }
          return;
        }

        if (p.status === 'failed') {
          setError(
            typeof p.error === 'object' && p.error?.message
              ? p.error.message
              : typeof p.error === 'string'
              ? p.error
              : 'Kit generation failed.'
          );
          return;
        }

        timer = setTimeout(pollUntilReady, 2500);
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to poll kit generation progress.');
        }
      }
    }

    async function loadKit() {
      if (!kitId) return;
      try {
        setLoading(true);
        const data = await kitsApi.get(kitId);
        setKitDetail(data);

        if (data.status !== 'completed' && data.status !== 'failed') {
          pollUntilReady();
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load interview preparation kit.');
      } finally {
        setLoading(false);
      }
    }

    loadKit();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [kitId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <Navbar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-mono">Loading your preparation kit workspace...</p>
          </div>
        </div>
      </div>
    );
  }

  // Handle in-progress generation if opened directly
  if (kitDetail && kitDetail.status !== 'completed' && kitDetail.status !== 'failed') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <Navbar />
        <div className="flex-1 max-w-2xl mx-auto px-4 py-24 w-full">
          <div className="bg-slate-900 border border-emerald-500/30 rounded-2xl p-8 space-y-6 shadow-2xl shadow-emerald-500/5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">Kit Generation in Progress</h2>
                <p className="text-xs text-slate-400 font-mono">
                  {kitDetail.title || 'Assembling personalized interview kit'}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-400">Pipeline Status</span>
                <span className="text-emerald-400 font-bold">{pollProgress?.percent || 15}%</span>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-3 overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-emerald-500 to-teal-400 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${pollProgress?.percent || 15}%` }}
                />
              </div>
            </div>

            {/* Live Message */}
            <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-300 font-mono flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{pollProgress?.message || 'Executing reconnaissance and question synthesis...'}</span>
            </div>

            <p className="text-[11px] text-slate-500 text-center">
              This page automatically refreshes into the interactive workspace once completed.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Handle failure
  if (kitDetail?.status === 'failed') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <Navbar />
        <div className="flex-1 max-w-lg mx-auto px-4 py-24 text-center space-y-5">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Kit Generation Failed</h2>
          <p className="text-sm text-slate-400 font-mono">
            {typeof kitDetail.error === 'object' && kitDetail.error?.message
              ? kitDetail.error.message
              : typeof kitDetail.error === 'string'
              ? kitDetail.error
              : error || 'An unexpected error occurred during kit generation.'}
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              href="/kits/new"
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all"
            >
              Try Again
            </Link>
            <Link
              href="/dashboard"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-medium text-xs rounded-xl transition-all"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !kitDetail || !kitDetail.kit) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
        <Navbar />
        <div className="flex-1 max-w-4xl mx-auto px-4 py-20 text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-rose-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Kit Not Found</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto font-mono">
            {error || 'This interview kit could not be retrieved or belongs to another user.'}
          </p>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const kit = kitDetail.kit;
  const role = kit.role;
  const brief = kit.company_brief;
  const questions = kit.questions || [];
  const flashcards = kit.flashcards || [];
  const schedule = kit.schedule;
  const coverage = kit.coverage;

  const toggleExpand = (qId: string) => {
    setExpandedQuestions((prev) => ({ ...prev, [qId]: !prev[qId] }));
  };

  const handleSaveNote = async (qId: string) => {
    setSavingNoteId(qId);
    setTimeout(() => {
      setSavingNoteId(null);
    }, 600);
  };

  const filteredQuestions =
    selectedCategory === 'all'
      ? questions
      : questions.filter((q: any) => q.category.toLowerCase() === selectedCategory.toLowerCase());

  const currentCard = flashcards[currentCardIndex];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500/30">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Breadcrumb & Navigation */}
        <div className="flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <Link href="/dashboard" className="hover:text-emerald-400 transition-colors">
              Dashboard
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <Link href="/kits/new" className="hover:text-emerald-400 transition-colors">
              Kits
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-slate-200 truncate max-w-xs">{kitDetail.title}</span>
          </div>

          <Link
            href="/kits/new"
            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
          >
            <span>+ Create Another Kit</span>
          </Link>
        </div>

        {/* Kit Hero Header Card */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 sm:p-8 backdrop-blur-sm shadow-xl space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  {role?.seniority || 'Target Role'}
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-mono bg-slate-800 text-slate-300 border border-slate-700">
                  {schedule?.days_available || kitDetail.days}-Day Plan
                </span>
                {coverage && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    {coverage.uncovered_requirement_ids.length === 0
                      ? '100% Requirement Coverage'
                      : `${role?.requirements.length - coverage.uncovered_requirement_ids.length}/${role?.requirements.length} Covered`}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <span>{role?.title}</span>
                <span className="text-slate-500 font-light">@</span>
                <span className="text-emerald-400">{kit.source?.company || kitDetail.companyName}</span>
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <span>Company Source:</span>
                <a
                  href={kit.source?.company_url || kitDetail.companyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-emerald-400 hover:underline inline-flex items-center gap-1"
                >
                  <span>{kit.source?.company_url || kitDetail.companyUrl}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-3">
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-center min-w-[90px]">
                <div className="text-lg font-bold text-white">{questions.length}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Questions</div>
              </div>
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-center min-w-[90px]">
                <div className="text-lg font-bold text-white">{flashcards.length}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Flashcards</div>
              </div>
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 text-center min-w-[90px]">
                <div className="text-lg font-bold text-white">{role?.requirements.length || 0}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Requirements</div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 sm:gap-2 pt-4 border-t border-slate-800/80 overflow-x-auto">
            <button
              onClick={() => setActiveTab('schedule')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'schedule'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Study Schedule</span>
            </button>

            <button
              onClick={() => setActiveTab('questions')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'questions'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Question Bank ({questions.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('flashcards')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'flashcards'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Flashcards ({flashcards.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('role')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'role'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Role Breakdown</span>
            </button>

            <button
              onClick={() => setActiveTab('brief')}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all shrink-0 cursor-pointer ${
                activeTab === 'brief'
                  ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/20'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Company Brief</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Day-by-Day Study Schedule */}
        {activeTab === 'schedule' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-white">Day-by-Day Preparation Plan</h3>
                <p className="text-xs text-slate-400">
                  Targeted study milestones designed to cover all key competencies before your interview.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {schedule?.days.map((day: any) => (
                <div
                  key={day.day}
                  className="bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-5 space-y-4 transition-all group backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Day {day.day}
                    </span>
                    <span className="text-xs text-slate-400 font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{day.minutes} min</span>
                    </span>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                      {day.focus}
                    </h4>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                      Assigned Questions ({day.question_ids.length}):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {day.question_ids.map((qId: string) => (
                        <button
                          key={qId}
                          onClick={() => {
                            setActiveTab('questions');
                            setExpandedQuestions((prev) => ({ ...prev, [qId]: true }));
                          }}
                          className="px-2 py-0.5 bg-slate-950 hover:bg-emerald-500/20 hover:text-emerald-400 text-slate-300 border border-slate-800 rounded font-mono text-xs transition-colors cursor-pointer"
                        >
                          {qId}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 2: Question Bank */}
        {activeTab === 'questions' && (
          <div className="space-y-4">
            {/* Filter Pills */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-1.5">
                {['all', 'technical', 'behavioural', 'domain'].map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-emerald-500 text-slate-950 font-bold'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
              <span className="text-xs text-slate-400 font-mono">
                Showing {filteredQuestions.length} of {questions.length} questions
              </span>
            </div>

            {/* Questions List */}
            <div className="space-y-3">
              {filteredQuestions.map((q: any) => {
                const isExpanded = expandedQuestions[q.id];
                return (
                  <div
                    key={q.id}
                    id={`question-${q.id}`}
                    className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4 transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-emerald-400 font-mono text-xs font-bold border border-slate-800">
                            {q.id}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            {q.category}
                          </span>
                          <div className="flex items-center text-amber-400 text-xs">
                            {Array.from({ length: q.difficulty || 1 }).map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-amber-400" />
                            ))}
                          </div>
                        </div>
                        <h4 className="text-base font-semibold text-white pt-1">{q.prompt}</h4>
                      </div>

                      <button
                        onClick={() => toggleExpand(q.id)}
                        className="p-2 text-slate-400 hover:text-white bg-slate-950 rounded-xl border border-slate-800 transition-colors cursor-pointer shrink-0"
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>

                    {/* Mapped Requirements */}
                    <div className="flex items-center gap-1.5 text-xs text-slate-400">
                      <span className="text-[11px] uppercase font-semibold text-slate-500">Maps to:</span>
                      {q.requirement_ids.map((rId: string) => {
                        const reqObj = role?.requirements.find((r: any) => r.id === rId);
                        return (
                          <span
                            key={rId}
                            title={reqObj?.text}
                            className="px-2 py-0.5 bg-slate-950 text-slate-300 rounded border border-slate-800 font-mono text-[11px]"
                          >
                            {rId}: {reqObj ? reqObj.text.slice(0, 24) + '...' : ''}
                          </span>
                        );
                      })}
                    </div>

                    {/* Expanded Suggested Answer & Rubric */}
                    {isExpanded && (
                      <div className="pt-4 border-t border-slate-800 space-y-4">
                        <div className="space-y-1.5">
                          <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                            Suggested Answer Outline
                          </h5>
                          <p className="text-xs text-slate-300 leading-relaxed p-4 bg-slate-950 rounded-xl border border-slate-800 whitespace-pre-wrap font-sans">
                            {q.answer_outline || q.suggested_answer}
                          </p>
                        </div>

                        {q.evaluation_criteria && q.evaluation_criteria.length > 0 && (
                          <div className="space-y-1.5">
                            <h5 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                              Evaluation Rubric
                            </h5>
                            <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside p-3 bg-slate-950 rounded-xl border border-slate-800">
                              {q.evaluation_criteria.map((c: string, idx: number) => (
                                <li key={idx}>{c}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* In-App Practice Answer / Notes */}
                        <div className="space-y-2 pt-2">
                          <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                            <span>Your Practice Notes / STAR Response</span>
                            {savingNoteId === q.id && (
                              <span className="text-[11px] text-emerald-400 flex items-center gap-1">
                                <Check className="w-3 h-3" /> Saved
                              </span>
                            )}
                          </label>
                          <textarea
                            rows={3}
                            placeholder="Draft your talking points, real-world examples, or STAR framework response here..."
                            value={candidateNotes[q.id] || ''}
                            onChange={(e) =>
                              setCandidateNotes((prev) => ({ ...prev, [q.id]: e.target.value }))
                            }
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all font-sans"
                          />
                          <div className="flex justify-end">
                            <button
                              onClick={() => handleSaveNote(q.id)}
                              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-lg border border-slate-700 transition-colors flex items-center gap-1 cursor-pointer"
                            >
                              <Edit3 className="w-3 h-3" /> Save Notes
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 3: Interactive Flashcards */}
        {activeTab === 'flashcards' && (
          <div className="space-y-6 max-w-2xl mx-auto py-6">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">Rapid Revision Flashcard Deck</h3>
              <p className="text-xs text-slate-400">
                Click the card to flip between question and high-yield bulleted points.
              </p>
            </div>

            {flashcards.length > 0 && currentCard ? (
              <div className="space-y-4">
                {/* Flip Card Container */}
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="min-h-[260px] bg-slate-900 border-2 border-slate-800 hover:border-emerald-500/50 rounded-3xl p-8 flex flex-col justify-between cursor-pointer transition-all shadow-2xl backdrop-blur-sm select-none"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span className="font-mono font-bold text-emerald-400">{currentCard.id}</span>
                    <span className="px-2.5 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-[10px] uppercase font-semibold">
                      {isFlipped ? 'Answer Outline (Back)' : 'Core Concept (Front)'}
                    </span>
                  </div>

                  <div className="py-6 my-auto text-center">
                    {!isFlipped ? (
                      <h4 className="text-xl sm:text-2xl font-bold text-white leading-relaxed">
                        {currentCard.front}
                      </h4>
                    ) : (
                      <div className="text-left bg-slate-950/80 p-5 rounded-2xl border border-slate-800 text-sm text-emerald-200 leading-relaxed whitespace-pre-wrap font-mono">
                        {currentCard.back}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-500 pt-4 border-t border-slate-800/80">
                    <span className="flex items-center gap-1 font-mono">
                      Reqs: {currentCard.requirement_ids.join(', ')}
                    </span>
                    <span className="text-[11px] text-slate-400 flex items-center gap-1">
                      <RotateCw className="w-3 h-3 text-emerald-400" /> Click anywhere to flip
                    </span>
                  </div>
                </div>

                {/* Card Controls */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    disabled={currentCardIndex === 0}
                    onClick={() => {
                      setIsFlipped(false);
                      setCurrentCardIndex((prev) => Math.max(0, prev - 1));
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-xs font-semibold rounded-xl border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" /> Previous
                  </button>

                  <span className="text-xs font-mono font-bold text-slate-400">
                    {currentCardIndex + 1} / {flashcards.length}
                  </span>

                  <button
                    disabled={currentCardIndex === flashcards.length - 1}
                    onClick={() => {
                      setIsFlipped(false);
                      setCurrentCardIndex((prev) => Math.min(flashcards.length - 1, prev + 1));
                    }}
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-xs font-semibold rounded-xl border border-slate-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    Next <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center p-8 bg-slate-900 rounded-2xl border border-slate-800 text-xs text-slate-400">
                No flashcards in this kit.
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Role & Requirements */}
        {activeTab === 'role' && (
          <div className="space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 space-y-4">
              <h3 className="text-base font-bold text-white">Target Role Breakdown</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-500 uppercase">Role Title:</span>
                  <div className="text-white font-bold text-sm mt-0.5">{role?.title}</div>
                </div>
                <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                  <span className="text-slate-500 uppercase">Seniority Level:</span>
                  <div className="text-emerald-400 font-bold text-sm mt-0.5">{role?.seniority}</div>
                </div>
              </div>

              {role?.responsibilities && role.responsibilities.length > 0 && (
                <div className="space-y-2 pt-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Key Responsibilities
                  </h4>
                  <ul className="text-xs text-slate-300 space-y-1 list-disc list-inside p-4 bg-slate-950 rounded-xl border border-slate-800">
                    {role.responsibilities.map((resp: string, idx: number) => (
                      <li key={idx}>{resp}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Requirements Matrix */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-white">
                Extracted Requirements ({role?.requirements.length || 0})
              </h3>
              <div className="grid grid-cols-1 gap-3">
                {role?.requirements.map((req: any) => {
                  const isMust = req.priority === 'must';
                  return (
                    <div
                      key={req.id}
                      className="p-4 bg-slate-900/70 border border-slate-800 rounded-2xl flex items-start justify-between gap-4"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-950 text-emerald-400 font-mono text-xs font-bold border border-slate-800">
                            {req.id}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                              isMust
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                                : 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {req.priority}-have
                          </span>
                          <span className="text-[11px] text-slate-400 uppercase font-mono">
                            {req.kind}
                          </span>
                        </div>
                        <p className="text-sm text-slate-200 pt-1">{req.text}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Tab 5: Company Brief */}
        {activeTab === 'brief' && (
          <div className="space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-emerald-400" />
                  <span>Company Intelligence Brief</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Synthesized directly from verified company sources, engineering blogs, and public interview discussions.
                </p>
              </div>

              {/* Executive Summary */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Executive Summary</h4>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-sm text-slate-200 leading-relaxed font-sans">
                  {brief?.summary || 'No summary available.'}
                </div>
              </div>

              {/* What They Do */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">What They Do & Systems at Scale</h4>
                <div className="p-4 bg-slate-950 rounded-xl border border-slate-800 text-sm text-slate-200 leading-relaxed font-sans">
                  {brief?.what_they_do || 'No systems description available.'}
                </div>
              </div>

              {/* Verified Sources */}
              {brief?.sources && brief.sources.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-slate-800">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Verified Intelligence Sources</h4>
                  <div className="space-y-1.5">
                    {brief.sources.map((src: string, idx: number) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-mono text-slate-400">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <a
                          href={src}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-emerald-400 truncate hover:underline"
                        >
                          {src}
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function KitWorkspacePage() {
  return (
    <ProtectedRoute>
      <KitWorkspaceContent />
    </ProtectedRoute>
  );
}
