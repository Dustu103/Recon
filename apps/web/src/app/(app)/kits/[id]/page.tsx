'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '../../../../components/auth/protected-route';
import { Navbar } from '../../../../components/ui/navbar';
import { kitsApi, KitDetail, ApiClientError } from '../../../../lib/api';
import { kitBuilderApi } from '../../../../lib/kit-builder';
import { QuestionCategory } from '@taro/shared';
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
  Plus,
  Trash2,
  MoveUp,
  MoveDown,
  AlertTriangle,
  X,
  RefreshCw,
  CheckSquare,
  Square,
} from 'lucide-react';

function KitWorkspaceContent() {
  const params = useParams();
  const router = useRouter();
  const kitId = params.id as string;

  const [kitDetail, setKitDetail] = useState<KitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'schedule' | 'questions' | 'flashcards' | 'role' | 'brief'>('schedule');

  // Question bank state
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedQuestions, setExpandedQuestions] = useState<Record<string, boolean>>({});
  const [candidateNotes, setCandidateNotes] = useState<Record<string, string>>({});
  const [savingNoteId, setSavingNoteId] = useState<string | null>(null);

  // Candidate Progress tracking (D6-B)
  const [starredQuestions, setStarredQuestions] = useState<Set<string>>(new Set());
  const [completedDays, setCompletedDays] = useState<Set<number>>(new Set());
  const [flashcardMastery, setFlashcardMastery] = useState<Record<string, boolean>>({});

  // Question Editing & Modal states
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editAnswerOutline, setEditAnswerOutline] = useState('');
  const [editDifficulty, setEditDifficulty] = useState<1 | 2 | 3>(2);
  const [editCategory, setEditCategory] = useState<QuestionCategory>('technical');
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);

  // Add Question Modal
  const [showAddQuestionModal, setShowAddQuestionModal] = useState(false);
  const [newQuestionCategory, setNewQuestionCategory] = useState<QuestionCategory>('technical');
  const [newQuestionPrompt, setNewQuestionPrompt] = useState('');
  const [newQuestionAnswer, setNewQuestionAnswer] = useState('');
  const [newQuestionDifficulty, setNewQuestionDifficulty] = useState<1 | 2 | 3>(2);
  const [newQuestionReqs, setNewQuestionReqs] = useState<string[]>([]);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);

  // Delete Question Confirmation
  const [questionToDelete, setQuestionToDelete] = useState<string | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);

  // Company Brief Editing & Overwrite Confirmation
  const [showBriefEdit, setShowBriefEdit] = useState(false);
  const [editBriefSummary, setEditBriefSummary] = useState('');
  const [editBriefWhatTheyDo, setEditBriefWhatTheyDo] = useState('');
  const [isSavingBrief, setIsSavingBrief] = useState(false);
  const [showBriefOverwriteModal, setShowBriefOverwriteModal] = useState(false);

  // Flashcard state & mutations
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [newCardFront, setNewCardFront] = useState('');
  const [newCardBack, setNewCardBack] = useState('');
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editCardFront, setEditCardFront] = useState('');
  const [editCardBack, setEditCardBack] = useState('');
  const [isSavingCard, setIsSavingCard] = useState(false);
  const [cardToDelete, setCardToDelete] = useState<string | null>(null);

  // Section Regeneration Progress Overlay
  const [regenerationState, setRegenerationState] = useState<{
    inProgress: boolean;
    section: string;
    category?: string;
    percent: number;
    message: string;
  } | null>(null);

  // Initial kit generation polling state for pending kits
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
            initProgressState(freshKit);
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
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    async function loadKit() {
      try {
        setLoading(true);
        const data = await kitsApi.get(kitId);
        if (cancelled) return;

        setKitDetail(data);
        initProgressState(data);

        if (data.status === 'pending') {
          pollUntilReady();
        } else {
          setLoading(false);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message || 'Failed to load kit details.');
          setLoading(false);
        }
      }
    }

    loadKit();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [kitId]);

  function initProgressState(detail: KitDetail) {
    if (detail.progress) {
      if (detail.progress.notes) {
        setCandidateNotes(detail.progress.notes);
      }
      if (Array.isArray(detail.progress.starred)) {
        setStarredQuestions(new Set(detail.progress.starred));
      }
      if (Array.isArray(detail.progress.completedDays)) {
        setCompletedDays(new Set(detail.progress.completedDays));
      }
      if (detail.progress.flashcardMastery) {
        setFlashcardMastery(detail.progress.flashcardMastery);
      }
    }
  }

  // Poll section regeneration until completed
  async function pollSectionRegeneration(sectionName: string, categoryName?: string) {
    let completed = false;
    let attempts = 0;

    while (!completed && attempts < 30) {
      attempts++;
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const p = await kitsApi.getProgress(kitId);
        setRegenerationState({
          inProgress: true,
          section: sectionName,
          category: categoryName,
          percent: p.percent || Math.min(attempts * 15, 95),
          message: p.message || `Regenerating ${sectionName}...`,
        });

        if (p.completed || p.status === 'completed') {
          completed = true;
          break;
        }
      } catch {
        // Continue loop
      }
    }

    // Refresh fresh kit data
    const fresh = await kitsApi.get(kitId);
    setKitDetail(fresh);
    initProgressState(fresh);
    setRegenerationState(null);
    setActionNotice(`Successfully regenerated ${sectionName}! Hand-edits were preserved.`);
    setTimeout(() => setActionNotice(null), 4000);
  }

  // --- Handlers: Question Editing ---
  function startEditQuestion(q: any) {
    setEditingQuestionId(q.id);
    setEditPrompt(q.prompt);
    setEditAnswerOutline(q.answer_outline || q.suggested_answer || '');
    setEditDifficulty(q.difficulty || 2);
    setEditCategory(q.category || 'technical');
  }

  async function handleSaveQuestionEdit() {
    if (!editingQuestionId) return;
    try {
      setIsSavingQuestion(true);
      await kitBuilderApi.patchQuestion(kitId, editingQuestionId, {
        prompt: editPrompt,
        answer_outline: editAnswerOutline,
        difficulty: editDifficulty,
        category: editCategory,
      });

      // Refetch whole kit to keep schedule & coverage in sync
      const fresh = await kitsApi.get(kitId);
      setKitDetail(fresh);
      setEditingQuestionId(null);
      setActionNotice('Question updated successfully.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update question.');
    } finally {
      setIsSavingQuestion(false);
    }
  }

  // --- Handlers: Manual Question Addition ---
  async function handleAddManualQuestion() {
    if (!newQuestionPrompt.trim() || !newQuestionAnswer.trim()) {
      alert('Please fill in both prompt and answer outline.');
      return;
    }
    try {
      setIsAddingQuestion(true);
      await kitBuilderApi.addManualQuestion(kitId, {
        category: newQuestionCategory,
        prompt: newQuestionPrompt.trim(),
        answer_outline: newQuestionAnswer.trim(),
        difficulty: newQuestionDifficulty,
        requirement_ids: newQuestionReqs,
      });

      const fresh = await kitsApi.get(kitId);
      setKitDetail(fresh);
      setShowAddQuestionModal(false);
      setNewQuestionPrompt('');
      setNewQuestionAnswer('');
      setNewQuestionReqs([]);
      setActionNotice('Manual question added to kit!');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to add manual question.');
    } finally {
      setIsAddingQuestion(false);
    }
  }

  // --- Handlers: Delete Question ---
  async function handleDeleteQuestion() {
    if (!questionToDelete) return;
    try {
      setIsDeletingQuestion(true);
      await kitBuilderApi.deleteQuestion(kitId, questionToDelete);

      const fresh = await kitsApi.get(kitId);
      setKitDetail(fresh);
      setQuestionToDelete(null);
      setActionNotice('Question deleted. Schedule & coverage recomputed.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to delete question.');
    } finally {
      setIsDeletingQuestion(false);
    }
  }

  // --- Handlers: Reorder Questions ---
  async function handleMoveQuestion(category: QuestionCategory, questionId: string, direction: 'up' | 'down') {
    if (!kitDetail?.kit?.questions) return;
    const catQuestions = kitDetail.kit.questions.filter((q: any) => q.category === category);
    const index = catQuestions.findIndex((q: any) => q.id === questionId);
    if (index < 0) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === catQuestions.length - 1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const reordered = [...catQuestions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);

    const orderedIds = reordered.map((q: any) => q.id);

    try {
      await kitBuilderApi.reorderQuestions(kitId, category, orderedIds);
      const fresh = await kitsApi.get(kitId);
      setKitDetail(fresh);
    } catch (err: any) {
      alert(err.message || 'Failed to reorder questions.');
    }
  }

  // --- Handlers: Candidate Progress (D6-B) ---
  async function handleToggleStar(questionId: string) {
    const isCurrentlyStarred = starredQuestions.has(questionId);
    const nextStarred = !isCurrentlyStarred;

    // Optimistic UI update
    setStarredQuestions((prev) => {
      const next = new Set(prev);
      if (nextStarred) next.add(questionId);
      else next.delete(questionId);
      return next;
    });

    try {
      await kitBuilderApi.updateCandidateProgress(kitId, {
        questionId,
        starred: nextStarred,
      });
    } catch {
      // Revert on error
      setStarredQuestions((prev) => {
        const next = new Set(prev);
        if (isCurrentlyStarred) next.add(questionId);
        else next.delete(questionId);
        return next;
      });
    }
  }

  async function handleSaveNote(questionId: string) {
    const text = candidateNotes[questionId] || '';
    setSavingNoteId(questionId);
    try {
      await kitBuilderApi.updateCandidateProgress(kitId, {
        questionId,
        note: text,
      });
      setTimeout(() => setSavingNoteId(null), 1500);
    } catch {
      setSavingNoteId(null);
    }
  }

  async function handleToggleDayCompletion(dayNumber: number) {
    const isDone = completedDays.has(dayNumber);
    const nextState = !isDone;

    setCompletedDays((prev) => {
      const next = new Set(prev);
      if (nextState) next.add(dayNumber);
      else next.delete(dayNumber);
      return next;
    });

    try {
      await kitBuilderApi.updateCandidateProgress(kitId, {
        completedDay: { dayNumber, isCompleted: nextState },
      });
    } catch {
      // Revert on error
      setCompletedDays((prev) => {
        const next = new Set(prev);
        if (isDone) next.add(dayNumber);
        else next.delete(dayNumber);
        return next;
      });
    }
  }

  // --- Handlers: Flashcards ---
  async function handleToggleFlashcardMastery(cardId: string) {
    const current = flashcardMastery[cardId] || false;
    const nextState = !current;

    setFlashcardMastery((prev) => ({ ...prev, [cardId]: nextState }));

    try {
      await kitBuilderApi.updateCandidateProgress(kitId, {
        flashcardId: cardId,
        mastered: nextState,
      });
    } catch {
      setFlashcardMastery((prev) => ({ ...prev, [cardId]: current }));
    }
  }

  async function handleAddFlashcard() {
    if (!newCardFront.trim() || !newCardBack.trim()) {
      alert('Please fill in both front and back content.');
      return;
    }
    try {
      setIsAddingCard(true);
      await kitBuilderApi.addManualFlashcard(kitId, {
        front: newCardFront.trim(),
        back: newCardBack.trim(),
      });
      const fresh = await kitsApi.get(kitId);
      setKitDetail(fresh);
      setShowAddCardModal(false);
      setNewCardFront('');
      setNewCardBack('');
      setActionNotice('Flashcard added to deck!');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to add flashcard.');
    } finally {
      setIsAddingCard(false);
    }
  }

  async function handleSaveFlashcardEdit() {
    if (!editingCardId) return;
    try {
      setIsSavingCard(true);
      await kitBuilderApi.patchFlashcard(kitId, editingCardId, {
        front: editCardFront.trim(),
        back: editCardBack.trim(),
      });
      const fresh = await kitsApi.get(kitId);
      setKitDetail(fresh);
      setEditingCardId(null);
      setActionNotice('Flashcard updated successfully.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update flashcard.');
    } finally {
      setIsSavingCard(false);
    }
  }

  async function handleDeleteFlashcard() {
    if (!cardToDelete) return;
    try {
      await kitBuilderApi.deleteFlashcard(kitId, cardToDelete);
      const fresh = await kitsApi.get(kitId);
      setKitDetail(fresh);
      setCardToDelete(null);
      setCurrentCardIndex(0);
      setActionNotice('Flashcard removed.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to delete flashcard.');
    }
  }

  // --- Handlers: Single-Section Regeneration ---
  async function handleRegenerateQuestions(category: QuestionCategory) {
    try {
      setRegenerationState({
        inProgress: true,
        section: `${category} questions`,
        category,
        percent: 10,
        message: `Analyzing role requirements & drafting fresh ${category} questions...`,
      });

      await kitBuilderApi.regenerateSection(kitId, {
        section: 'questions',
        category,
      });

      await pollSectionRegeneration(`${category} questions`, category);
    } catch (err: any) {
      setRegenerationState(null);
      alert(err.message || 'Failed to start question regeneration.');
    }
  }

  async function handleRegenerateBrief(force = false) {
    try {
      const brief = kitDetail?.kit?.company_brief;
      // If brief was edited and force is not provided, trigger confirmation modal directly
      if (brief?._edited && !force) {
        setShowBriefOverwriteModal(true);
        return;
      }

      setRegenerationState({
        inProgress: true,
        section: 'company brief',
        percent: 15,
        message: 'Synthesizing live company intelligence from verified sources...',
      });

      await kitBuilderApi.regenerateSection(kitId, {
        section: 'company_brief',
        force,
      });

      setShowBriefOverwriteModal(false);
      await pollSectionRegeneration('company brief');
    } catch (err: any) {
      setRegenerationState(null);
      if (err instanceof ApiClientError && err.status === 428) {
        setShowBriefOverwriteModal(true);
      } else {
        alert(err.message || 'Failed to regenerate company brief.');
      }
    }
  }

  async function handleSaveBriefEdit() {
    try {
      setIsSavingBrief(true);
      await kitBuilderApi.patchCompanyBrief(kitId, {
        summary: editBriefSummary.trim(),
        what_they_do: editBriefWhatTheyDo.trim(),
      });
      const fresh = await kitsApi.get(kitId);
      setKitDetail(fresh);
      setShowBriefEdit(false);
      setActionNotice('Company brief updated. Marked as customized.');
      setTimeout(() => setActionNotice(null), 3000);
    } catch (err: any) {
      alert(err.message || 'Failed to update company brief.');
    } finally {
      setIsSavingBrief(false);
    }
  }

  // --- Render Fallbacks ---
  if (loading && !pollProgress) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mb-4" />
          <h2 className="text-lg font-semibold">Loading Preparation Kit...</h2>
          <p className="text-xs text-slate-400 mt-1">Retrieving verified interview intelligence</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
        <Navbar />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-6 max-w-md text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto" />
            <h3 className="text-base font-bold text-white">Kit Generation Notice</h3>
            <p className="text-xs text-red-200">{error}</p>
            <div className="pt-2">
              <Link
                href="/kits"
                className="inline-block px-4 py-2 bg-slate-900 hover:bg-slate-800 text-xs font-semibold rounded-xl border border-slate-700 transition-colors"
              >
                Return to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isPending = kitDetail?.status === 'pending' || (pollProgress && pollProgress.status === 'pending');
  const kit = kitDetail?.kit;
  const questions = kit?.questions || [];
  const flashcards = kit?.flashcards || [];
  const schedule = kit?.schedule;
  const role = kit?.role;
  const brief = kit?.company_brief;

  const categories = ['all', 'technical', 'behavioural', 'system-design', 'company-fit'];
  const filteredQuestions =
    selectedCategory === 'all'
      ? questions
      : questions.filter((q: any) => q.category === selectedCategory);

  const currentCard = flashcards[currentCardIndex];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col antialiased">
      <Navbar />

      {/* Floating Action Notice / Toast */}
      {actionNotice && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-500 text-slate-950 font-bold px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2 text-xs animate-in fade-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="w-4 h-4" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Full-Page Regeneration / Progress Overlay */}
      {regenerationState?.inProgress && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 max-w-md w-full text-center space-y-5 shadow-2xl">
            <div className="relative w-16 h-16 mx-auto flex items-center justify-center">
              <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20 animate-ping" />
              <div className="w-14 h-14 rounded-full bg-emerald-500/10 border-2 border-emerald-400 flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
              </div>
            </div>

            <div className="space-y-1">
              <h3 className="text-lg font-bold text-white">Regenerating {regenerationState.section}</h3>
              <p className="text-xs text-slate-400 leading-relaxed">{regenerationState.message}</p>
            </div>

            <div className="space-y-1.5 text-left">
              <div className="flex justify-between text-xs font-mono font-bold text-slate-400">
                <span>Preserving customized items</span>
                <span className="text-emerald-400">{regenerationState.percent}%</span>
              </div>
              <div className="w-full h-2 bg-slate-950 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="h-full bg-emerald-400 transition-all duration-500 rounded-full shadow-sm shadow-emerald-400"
                  style={{ width: `${regenerationState.percent}%` }}
                />
              </div>
            </div>
            <p className="text-[11px] text-slate-500 italic">
              Your hand-edited and manually crafted questions are strictly protected.
            </p>
          </div>
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 space-y-6">
        {/* Breadcrumb Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-800/60">
          <div className="flex items-center gap-2 text-xs font-mono text-slate-400">
            <Link href="/kits" className="hover:text-white transition-colors">
              Kits
            </Link>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-white font-bold truncate max-w-[240px]">
              {kitDetail?.companyName || 'Workspace'}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
            <span className="text-emerald-400 font-bold">{kitDetail?.roleTitle || 'Kit Builder'}</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              <span>Interactive Workspace</span>
            </span>
          </div>
        </div>

        {/* Kit Hero Banner */}
        <div className="bg-slate-900/50 border border-slate-800/80 rounded-3xl p-6 sm:p-8 space-y-6 backdrop-blur-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                  {kitDetail?.title || `${kitDetail?.companyName} Interview Preparation Kit`}
                </h1>
                {brief?._edited && (
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30">
                    Customized
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-200 font-semibold">{kitDetail?.companyName}</span>
                </span>
                <span>•</span>
                <span className="flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span>{kitDetail?.days}-Day Structured Plan</span>
                </span>
                {kitDetail?.companyUrl && (
                  <>
                    <span>•</span>
                    <a
                      href={kitDetail.companyUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-slate-400 hover:text-emerald-400 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Verified Sources</span>
                    </a>
                  </>
                )}
              </div>
            </div>

            {/* Quick Stats Pill */}
            <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 p-3 rounded-2xl shrink-0">
              <div className="text-center px-3 border-r border-slate-800">
                <div className="text-base font-bold text-white">{questions.length}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Questions</div>
              </div>
              <div className="text-center px-3 border-r border-slate-800">
                <div className="text-base font-bold text-emerald-400">{starredQuestions.size}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Starred</div>
              </div>
              <div className="text-center px-3 border-r border-slate-800">
                <div className="text-base font-bold text-white">{flashcards.length}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Cards</div>
              </div>
              <div className="text-center px-3">
                <div className="text-base font-bold text-white">{completedDays.size} / {schedule?.days?.length || kitDetail?.days || 0}</div>
                <div className="text-[10px] uppercase font-semibold text-slate-400">Days Done</div>
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
              {brief?._edited && <span className="w-2 h-2 rounded-full bg-amber-400" />}
            </button>
          </div>
        </div>

        {/* Tab 1: Day-by-Day Study Schedule (with D6-B Checkoffs) */}
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
              {schedule?.days.map((day: any) => {
                const isCompleted = completedDays.has(day.day);
                return (
                  <div
                    key={day.day}
                    className={`bg-slate-900/70 border rounded-2xl p-5 space-y-4 transition-all group backdrop-blur-sm ${
                      isCompleted
                        ? 'border-emerald-500/40 bg-slate-900/90'
                        : 'border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                          isCompleted
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                        }`}
                      >
                        Day {day.day}
                      </span>
                      <button
                        onClick={() => handleToggleDayCompletion(day.day)}
                        className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-lg transition-colors cursor-pointer ${
                          isCompleted
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <CheckSquare className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </>
                        ) : (
                          <>
                            <Square className="w-3.5 h-3.5" />
                            <span>Mark Done</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div>
                      <h4 className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                        {day.focus}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{day.minutes} min focused prep</span>
                      </p>
                    </div>

                    <div className="space-y-1.5 pt-2 border-t border-slate-800">
                      <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        Assigned Questions ({day.question_ids.length})
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {day.question_ids.map((qId: string) => (
                          <span
                            key={qId}
                            className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300"
                          >
                            {qId}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: Question Bank (with D6-A Inline Edit, Reorder, Add, Delete & Single-Section Regenerate) */}
        {activeTab === 'questions' && (
          <div className="space-y-6">
            {/* Action Bar: Category Filters, Regenerate Button & Add Question */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/80">
              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold capitalize transition-all shrink-0 cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                {selectedCategory !== 'all' && (
                  <button
                    onClick={() => handleRegenerateQuestions(selectedCategory as QuestionCategory)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-bold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                    title="Regenerates unprotected questions in this category. Keeps hand-edits."
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Regenerate {selectedCategory}</span>
                  </button>
                )}

                <button
                  onClick={() => setShowAddQuestionModal(true)}
                  className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Question</span>
                </button>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-3">
              {filteredQuestions.map((q: any) => {
                const isExpanded = expandedQuestions[q.id];
                const isEditing = editingQuestionId === q.id;
                const isStarred = starredQuestions.has(q.id);

                return (
                  <div
                    key={q.id}
                    id={`question-${q.id}`}
                    className={`bg-slate-900/70 border rounded-2xl p-5 space-y-4 transition-all ${
                      isStarred ? 'border-amber-500/40 bg-slate-900/90' : 'border-slate-800'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
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

                          {/* D6-A Metadata Badges */}
                          {q._edited && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                              <Edit3 className="w-2.5 h-2.5" /> Customized
                            </span>
                          )}

                          {q._manual && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30 flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5" /> Hand-Crafted
                            </span>
                          )}
                        </div>

                        {!isEditing ? (
                          <h4 className="text-base font-semibold text-white pt-1">{q.prompt}</h4>
                        ) : null}
                      </div>

                      {/* Top Right Action Icons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Star Button */}
                        <button
                          onClick={() => handleToggleStar(q.id)}
                          className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                            isStarred
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                              : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-amber-400'
                          }`}
                          title={isStarred ? 'Unstar question' : 'Star question'}
                        >
                          <Star className={`w-4 h-4 ${isStarred ? 'fill-amber-400' : ''}`} />
                        </button>

                        {/* Reorder Up / Down (active when filtered by category) */}
                        {selectedCategory !== 'all' && (
                          <div className="flex items-center bg-slate-950 rounded-xl border border-slate-800 p-0.5">
                            <button
                              onClick={() => handleMoveQuestion(q.category, q.id, 'up')}
                              className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title="Move question up"
                            >
                              <MoveUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleMoveQuestion(q.category, q.id, 'down')}
                              className="p-1.5 text-slate-400 hover:text-white transition-colors cursor-pointer"
                              title="Move question down"
                            >
                              <MoveDown className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Edit Button */}
                        {!isEditing && (
                          <button
                            onClick={() => startEditQuestion(q)}
                            className="p-2 text-slate-400 hover:text-white bg-slate-950 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                            title="Edit question prompt, outline or category"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                        )}

                        {/* Delete Button */}
                        <button
                          onClick={() => setQuestionToDelete(q.id)}
                          className="p-2 text-slate-400 hover:text-red-400 bg-slate-950 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                          title="Delete question"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        {/* Expand / Collapse Button */}
                        <button
                          onClick={() =>
                            setExpandedQuestions((prev) => ({ ...prev, [q.id]: !prev[q.id] }))
                          }
                          className="p-2 text-slate-400 hover:text-white bg-slate-950 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Inline Editor Form */}
                    {isEditing && (
                      <div className="p-4 bg-slate-950 rounded-2xl border border-emerald-500/40 space-y-4 animate-in fade-in duration-200">
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Interview Prompt
                          </label>
                          <textarea
                            rows={2}
                            value={editPrompt}
                            onChange={(e) => setEditPrompt(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                            Suggested Answer Outline
                          </label>
                          <textarea
                            rows={4}
                            value={editAnswerOutline}
                            onChange={(e) => setEditAnswerOutline(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Category
                            </label>
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value as QuestionCategory)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                            >
                              <option value="technical">Technical</option>
                              <option value="behavioural">Behavioural</option>
                              <option value="system-design">System Design</option>
                              <option value="company-fit">Company Fit</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                              Difficulty
                            </label>
                            <select
                              value={editDifficulty}
                              onChange={(e) => setEditDifficulty(Number(e.target.value) as 1 | 2 | 3)}
                              className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                            >
                              <option value={1}>1 - Foundational</option>
                              <option value={2}>2 - Intermediate</option>
                              <option value={3}>3 - Advanced / Staff</option>
                            </select>
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-2">
                          <button
                            onClick={() => setEditingQuestionId(null)}
                            className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            disabled={isSavingQuestion}
                            onClick={handleSaveQuestionEdit}
                            className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            {isSavingQuestion ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            <span>Save Changes</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Mapped Requirements */}
                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                      <span className="text-[11px] uppercase font-semibold text-slate-500">Maps to:</span>
                      {q.requirement_ids && q.requirement_ids.length > 0 ? (
                        q.requirement_ids.map((rId: string) => {
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
                        })
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">General competency</span>
                      )}
                    </div>

                    {/* Expanded Suggested Answer & Rubric */}
                    {isExpanded && !isEditing && (
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

        {/* Tab 3: Interactive Flashcards (with D6-A Edit, Add, Delete & D6-B Mastery) */}
        {activeTab === 'flashcards' && (
          <div className="space-y-6 max-w-2xl mx-auto py-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="text-lg font-bold text-white">Rapid Revision Flashcard Deck</h3>
                <p className="text-xs text-slate-400">
                  Click the card to flip between core concept and high-yield bulleted points.
                </p>
              </div>

              <button
                onClick={() => setShowAddCardModal(true)}
                className="px-3.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Card</span>
              </button>
            </div>

            {flashcards.length > 0 && currentCard ? (
              <div className="space-y-4">
                {/* Flip Card Container */}
                <div
                  onClick={() => setIsFlipped(!isFlipped)}
                  className="min-h-[260px] bg-slate-900 border-2 border-slate-800 hover:border-emerald-500/50 rounded-3xl p-8 flex flex-col justify-between cursor-pointer transition-all shadow-2xl backdrop-blur-sm select-none relative group"
                >
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-emerald-400">{currentCard.id}</span>
                      {currentCard._edited && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Customized
                        </span>
                      )}
                      {currentCard._manual && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-500/15 text-purple-300 border border-purple-500/30">
                          Hand-Crafted
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* Mastery Toggle */}
                      <button
                        onClick={() => handleToggleFlashcardMastery(currentCard.id)}
                        className={`px-2.5 py-1 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                          flashcardMastery[currentCard.id]
                            ? 'bg-emerald-500 text-slate-950 font-bold'
                            : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-emerald-400'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{flashcardMastery[currentCard.id] ? 'Mastered' : 'Mark Mastered'}</span>
                      </button>

                      {/* Edit Card */}
                      <button
                        onClick={() => {
                          setEditingCardId(currentCard.id);
                          setEditCardFront(currentCard.front);
                          setEditCardBack(currentCard.back);
                        }}
                        className="p-1.5 bg-slate-950 border border-slate-800 hover:text-white text-slate-400 rounded-lg cursor-pointer"
                        title="Edit flashcard"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {/* Delete Card */}
                      <button
                        onClick={() => setCardToDelete(currentCard.id)}
                        className="p-1.5 bg-slate-950 border border-slate-800 hover:text-red-400 text-slate-400 rounded-lg cursor-pointer"
                        title="Delete flashcard"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                      Reqs: {currentCard.requirement_ids?.join(', ') || 'Core'}
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

        {/* Tab 5: Company Brief (with D6-A Edit, Confirmation Modal on Regenerate) */}
        {activeTab === 'brief' && (
          <div className="space-y-6">
            <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 sm:p-8 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-white flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-emerald-400" />
                      <span>Company Intelligence Brief</span>
                    </h3>
                    {brief?._edited && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-amber-500/15 text-amber-300 border border-amber-500/30">
                        Customized
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400">
                    Synthesized directly from verified company sources, engineering blogs, and public interview discussions.
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {!showBriefEdit ? (
                    <button
                      onClick={() => {
                        setShowBriefEdit(true);
                        setEditBriefSummary(brief?.summary || '');
                        setEditBriefWhatTheyDo(brief?.what_they_do || '');
                      }}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-white rounded-xl border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit Brief</span>
                    </button>
                  ) : null}

                  <button
                    onClick={() => handleRegenerateBrief(false)}
                    className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-emerald-400 hover:text-emerald-300 rounded-xl text-xs font-bold border border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>Regenerate Brief</span>
                  </button>
                </div>
              </div>

              {/* Edit Brief Inline View */}
              {showBriefEdit ? (
                <div className="space-y-4 p-5 bg-slate-950 rounded-2xl border border-emerald-500/40 animate-in fade-in duration-200">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      Executive Summary
                    </label>
                    <textarea
                      rows={3}
                      value={editBriefSummary}
                      onChange={(e) => setEditBriefSummary(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500 font-sans"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                      What They Do & Systems at Scale
                    </label>
                    <textarea
                      rows={3}
                      value={editBriefWhatTheyDo}
                      onChange={(e) => setEditBriefWhatTheyDo(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500 font-sans"
                    />
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => setShowBriefEdit(false)}
                      className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-xs font-semibold text-slate-300 rounded-xl border border-slate-800 transition-colors cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      disabled={isSavingBrief}
                      onClick={handleSaveBriefEdit}
                      className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      {isSavingBrief ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                      <span>Save Brief</span>
                    </button>
                  </div>
                </div>
              ) : (
                <>
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
                </>
              )}

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

      {/* --- MODAL: Add Manual Question --- */}
      {showAddQuestionModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-lg w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Add Hand-Crafted Question</span>
              </h3>
              <button
                onClick={() => setShowAddQuestionModal(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Question Prompt
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. How do you design an idempotent payment processing pipeline?"
                  value={newQuestionPrompt}
                  onChange={(e) => setNewQuestionPrompt(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Suggested Answer Outline
                </label>
                <textarea
                  rows={3}
                  placeholder="1. Idempotency keys in Redis\n2. Atomic write-ahead ledger\n3. Outbox pattern"
                  value={newQuestionAnswer}
                  onChange={(e) => setNewQuestionAnswer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Category
                  </label>
                  <select
                    value={newQuestionCategory}
                    onChange={(e) => setNewQuestionCategory(e.target.value as QuestionCategory)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value="technical">Technical</option>
                    <option value="behavioural">Behavioural</option>
                    <option value="system-design">System Design</option>
                    <option value="company-fit">Company Fit</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                    Difficulty
                  </label>
                  <select
                    value={newQuestionDifficulty}
                    onChange={(e) => setNewQuestionDifficulty(Number(e.target.value) as 1 | 2 | 3)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-white focus:outline-none focus:border-emerald-500"
                  >
                    <option value={1}>1 - Foundational</option>
                    <option value={2}>2 - Intermediate</option>
                    <option value={3}>3 - Advanced / Staff</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAddQuestionModal(false)}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-xs font-semibold rounded-xl border border-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={isAddingQuestion}
                onClick={handleAddManualQuestion}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAddingQuestion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Add Question</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Delete Question Confirmation --- */}
      {questionToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Delete Question?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete question <strong className="text-white font-mono">{questionToDelete}</strong>?
              This will automatically recompute your study schedule and coverage requirements.
            </p>
            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setQuestionToDelete(null)}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-xs font-semibold rounded-xl border border-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={isDeletingQuestion}
                onClick={handleDeleteQuestion}
                className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                {isDeletingQuestion ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Brief Overwrite Confirmation (HTTP 428) --- */}
      {showBriefOverwriteModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-amber-400">
              <div className="p-2 bg-amber-500/15 rounded-xl border border-amber-500/30">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Overwrite Customized Brief?</h3>
                <span className="text-[11px] font-mono text-amber-400 font-bold uppercase">Confirmation Required</span>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              You have previously made custom edits to this Company Intelligence Brief. Regenerating will{' '}
              <strong className="text-amber-300">permanently overwrite</strong> your edits with fresh AI research.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowBriefOverwriteModal(false)}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-xs font-semibold rounded-xl border border-slate-800 text-slate-300"
              >
                Keep My Edits
              </button>
              <button
                onClick={() => handleRegenerateBrief(true)}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-md shadow-amber-500/20 cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Overwrite & Regenerate</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Add Manual Flashcard --- */}
      {showAddCardModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-400" />
                <span>Add Hand-Crafted Flashcard</span>
              </h3>
              <button onClick={() => setShowAddCardModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Front (Core Concept)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. What is the Raft consensus leader election timeout?"
                  value={newCardFront}
                  onChange={(e) => setNewCardFront(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Back (High-Yield Bullets)
                </label>
                <textarea
                  rows={4}
                  placeholder="• Heartbeat timeout: 150-300ms\n• Randomized election timers prevent split votes\n• Majority quorum required"
                  value={newCardBack}
                  onChange={(e) => setNewCardBack(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setShowAddCardModal(false)}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-xs font-semibold rounded-xl border border-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={isAddingCard}
                onClick={handleAddFlashcard}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                {isAddingCard ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                <span>Add Flashcard</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Edit Flashcard --- */}
      {editingCardId && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-5 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-emerald-400" />
                <span>Edit Flashcard</span>
              </h3>
              <button onClick={() => setEditingCardId(null)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Front (Core Concept)
                </label>
                <textarea
                  rows={2}
                  value={editCardFront}
                  onChange={(e) => setEditCardFront(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Back (Answer Content)
                </label>
                <textarea
                  rows={4}
                  value={editCardBack}
                  onChange={(e) => setEditCardBack(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                onClick={() => setEditingCardId(null)}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-xs font-semibold rounded-xl border border-slate-800"
              >
                Cancel
              </button>
              <button
                disabled={isSavingCard}
                onClick={handleSaveFlashcardEdit}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSavingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL: Delete Flashcard Confirmation --- */}
      {cardToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 max-w-md w-full space-y-4 shadow-2xl">
            <div className="flex items-center gap-3 text-red-400">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Delete Flashcard?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to delete flashcard <strong className="text-white font-mono">{cardToDelete}</strong>?
            </p>
            <div className="flex justify-end gap-2 pt-3">
              <button
                onClick={() => setCardToDelete(null)}
                className="px-4 py-2 bg-slate-950 hover:bg-slate-800 text-xs font-semibold rounded-xl border border-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteFlashcard}
                className="px-4 py-2 bg-red-500 hover:bg-red-400 text-white font-bold text-xs rounded-xl flex items-center gap-1.5"
              >
                <Trash2 className="w-4 h-4" />
                <span>Confirm Delete</span>
              </button>
            </div>
          </div>
        </div>
      )}
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
