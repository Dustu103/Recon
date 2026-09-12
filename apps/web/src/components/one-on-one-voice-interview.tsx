'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Bot,
  User,
  Radio,
  Send,
  Loader2,
  Square,
  Play,
  Code2,
  CheckCircle2,
  MessageSquare,
} from 'lucide-react';
import { InterviewFeedback } from '@taro/shared';

interface OneOnOneVoiceInterviewProps {
  isOpen: boolean;
  onClose: () => void;
  interviewerMessage: string;
  isSendingTurn: boolean;
  onSendVoiceTurn: (transcript: string) => Promise<void>;
  companyName?: string;
  roleTitle?: string;
  questionPrompt?: string;
  category?: string;
  latestFeedback?: InterviewFeedback | null;
  codeSnippet?: { language: string; code: string };
  onRunCode?: () => void;
}

export function OneOnOneVoiceInterview({
  isOpen,
  onClose,
  interviewerMessage,
  isSendingTurn,
  onSendVoiceTurn,
  companyName = 'Target Company',
  roleTitle = 'Software Engineer',
  questionPrompt = '',
  category = 'technical',
  latestFeedback,
  codeSnippet,
  onRunCode,
}: OneOnOneVoiceInterviewProps) {
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isCandidateSpeaking, setIsCandidateSpeaking] = useState(false);
  const [liveTranscript, setLiveTranscript] = useState('');
  const [accumulatedTranscript, setAccumulatedTranscript] = useState('');
  const [handsFreeMode, setHandsFreeMode] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);

  const recognitionRef = useRef<any>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const currentUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const lastSpokenMessageRef = useRef<string>('');

  // Initialize SpeechSynthesis and SpeechRecognition
  useEffect(() => {
    if (typeof window !== 'undefined') {
      synthRef.current = window.speechSynthesis || null;

      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

      if (!SpeechRecognition) {
        setSpeechSupported(false);
      }
    }
  }, []);

  // Speak AI messages when new interviewer message arrives
  const speakAiMessage = useCallback(
    (textToSpeak: string) => {
      if (!synthRef.current || isSpeakerMuted || !textToSpeak.trim()) return;

      // Avoid re-speaking identical message
      if (lastSpokenMessageRef.current === textToSpeak && isAiSpeaking) return;
      lastSpokenMessageRef.current = textToSpeak;

      synthRef.current.cancel();

      // Clean markdown code blocks, backticks, asterisks, URLs
      const clean = textToSpeak
        .replace(/```[\s\S]*?```/g, ' [code snippet attached] ')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/[*#_~]/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .trim();

      if (!clean) return;

      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.rate = 1.02;
      utterance.pitch = 1.0;
      utterance.lang = 'en-US';

      // Pick best natural voice if available
      const voices = synthRef.current.getVoices();
      const preferredVoice = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Daniel') ||
            v.name.includes('Ava') ||
            v.name.includes('Arthur'))
      );
      if (preferredVoice) {
        utterance.voice = preferredVoice;
      }

      utterance.onstart = () => {
        setIsAiSpeaking(true);
        // Pause candidate mic while AI is talking to avoid echo
        if (recognitionRef.current && handsFreeMode) {
          try {
            recognitionRef.current.stop();
          } catch {}
        }
      };

      utterance.onend = () => {
        setIsAiSpeaking(false);
        // Auto-resume candidate mic if in hands-free mode and unmuted
        if (handsFreeMode && !isMuted && isOpen && recognitionRef.current) {
          try {
            recognitionRef.current.start();
            setIsCandidateSpeaking(true);
          } catch {}
        }
      };

      utterance.onerror = () => {
        setIsAiSpeaking(false);
      };

      currentUtteranceRef.current = utterance;
      synthRef.current.speak(utterance);
    },
    [isSpeakerMuted, handsFreeMode, isMuted, isOpen, isAiSpeaking]
  );

  // Trigger speech when interviewerMessage updates or modal opens
  useEffect(() => {
    if (isOpen && interviewerMessage && !isSpeakerMuted) {
      const timer = setTimeout(() => {
        speakAiMessage(interviewerMessage);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen, interviewerMessage, isSpeakerMuted, speakAiMessage]);

  // Setup SpeechRecognition listener
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsCandidateSpeaking(true);
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript;
        } else {
          interim += event.results[i][0].transcript;
        }
      }

      if (interim) {
        setLiveTranscript(interim);
      }
      if (final) {
        setAccumulatedTranscript((prev) => (prev ? `${prev} ${final}` : final));
        setLiveTranscript('');
      }
    };

    recognition.onerror = (err: any) => {
      console.warn('[VoiceInterview Recognition Error]', err.error);
      if (err.error !== 'no-speech') {
        setIsCandidateSpeaking(false);
      }
    };

    recognition.onend = () => {
      // If we're supposed to be listening in hands-free mode, restart
      if (handsFreeMode && !isMuted && !isAiSpeaking && isOpen) {
        try {
          recognition.start();
        } catch {
          setIsCandidateSpeaking(false);
        }
      } else {
        setIsCandidateSpeaking(false);
      }
    };

    recognitionRef.current = recognition;

    // Start recognition if not muted and AI is not speaking
    if (!isMuted && !isAiSpeaking) {
      try {
        recognition.start();
      } catch {}
    }

    return () => {
      try {
        recognition.stop();
      } catch {}
      if (synthRef.current) {
        synthRef.current.cancel();
      }
    };
  }, [isOpen, isMuted, handsFreeMode, isAiSpeaking]);

  // Handle manual or automatic submission of spoken turn
  async function handleSubmitTurn() {
    const fullText = `${accumulatedTranscript} ${liveTranscript}`.trim();
    if (!fullText && (!codeSnippet || !codeSnippet.code.trim())) return;

    // Stop speaking/listening
    if (synthRef.current) synthRef.current.cancel();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
    }

    setAccumulatedTranscript('');
    setLiveTranscript('');
    setIsCandidateSpeaking(false);

    await onSendVoiceTurn(fullText);
  }

  function toggleMute() {
    setIsMuted((prev) => {
      const next = !prev;
      if (next && recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
        setIsCandidateSpeaking(false);
      } else if (!next && recognitionRef.current && !isAiSpeaking) {
        try {
          recognitionRef.current.start();
          setIsCandidateSpeaking(true);
        } catch {}
      }
      return next;
    });
  }

  function toggleSpeaker() {
    setIsSpeakerMuted((prev) => {
      const next = !prev;
      if (next && synthRef.current) {
        synthRef.current.cancel();
        setIsAiSpeaking(false);
      } else if (!next && interviewerMessage) {
        speakAiMessage(interviewerMessage);
      }
      return next;
    });
  }

  function handleStopAiSpeaking() {
    if (synthRef.current) {
      synthRef.current.cancel();
      setIsAiSpeaking(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 border border-emerald-500/40 rounded-3xl p-5 sm:p-6 shadow-2xl relative overflow-hidden transition-all duration-300">
      {/* Background Ambience Glow */}
      <div className="absolute top-0 right-1/4 w-96 h-48 bg-emerald-500/10 blur-3xl pointer-events-none rounded-full" />
      <div className="absolute -bottom-10 left-10 w-80 h-32 bg-teal-500/10 blur-3xl pointer-events-none rounded-full" />

      {/* Top Header: Live 1-on-1 Call Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center text-emerald-400">
                <Bot className="w-5 h-5" />
              </div>
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-extrabold text-white tracking-wide">
                1-on-1 Voice Interview Call
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                <Radio className="w-3 h-3 text-emerald-400 animate-pulse" />
                Live Audio Session
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Staff Interviewer for {roleTitle} at <strong className="text-slate-200">{companyName}</strong>
            </p>
          </div>
        </div>

        {/* Call Controls Toolbar */}
        <div className="flex items-center gap-2">
          {/* Hands-free mode toggle */}
          <button
            type="button"
            onClick={() => setHandsFreeMode(!handsFreeMode)}
            className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
              handsFreeMode
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="Auto-listen to voice after interviewer speaks"
          >
            {handsFreeMode ? 'Conversational (Hands-Free)' : 'Push-to-Talk'}
          </button>

          {/* Speaker Mute/Unmute */}
          <button
            type="button"
            onClick={toggleSpeaker}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isSpeakerMuted
                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:text-white'
            }`}
            title={isSpeakerMuted ? 'Unmute AI Voice' : 'Mute AI Voice'}
          >
            {isSpeakerMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>

          {/* Microphone Mute/Unmute */}
          <button
            type="button"
            onClick={toggleMute}
            className={`p-2 rounded-xl border transition-all cursor-pointer ${
              isMuted
                ? 'bg-red-500/20 text-red-400 border-red-500/40'
                : 'bg-slate-900/90 text-slate-300 border-slate-800 hover:text-white'
            }`}
            title={isMuted ? 'Unmute Microphone' : 'Mute Microphone'}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* End Voice Call */}
          <button
            type="button"
            onClick={() => {
              if (synthRef.current) synthRef.current.cancel();
              if (recognitionRef.current) {
                try {
                  recognitionRef.current.stop();
                } catch {}
              }
              onClose();
            }}
            className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-400 hover:text-rose-300 border border-rose-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            title="Switch back to standard chat interface"
          >
            <PhoneOff className="w-3.5 h-3.5" />
            <span>End Call</span>
          </button>
        </div>
      </div>

      {/* Target Question Ribbon */}
      {questionPrompt && (
        <div className="mt-3.5 px-3.5 py-2 bg-slate-900/70 border border-slate-800/80 rounded-xl flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2 truncate">
            <span className="px-2 py-0.5 rounded bg-slate-950 text-emerald-400 font-mono text-[10px] uppercase font-bold border border-slate-800">
              {category}
            </span>
            <span className="truncate text-slate-200 font-medium">{questionPrompt}</span>
          </div>
          {codeSnippet && codeSnippet.code.trim() && (
            <span className="shrink-0 flex items-center gap-1 font-mono text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
              <Code2 className="w-3 h-3" />
              {codeSnippet.language.toUpperCase()} Attached
            </span>
          )}
        </div>
      )}

      {/* Visual Audio Presence Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-5 relative z-10">
        {/* Left Card: AI Interviewer Presence & Live Equalizer */}
        <div
          className={`p-4 rounded-2xl border transition-all duration-300 ${
            isAiSpeaking
              ? 'bg-emerald-950/30 border-emerald-500/50 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-500/30'
              : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs ${
                  isAiSpeaking
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-md shadow-emerald-500/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <Bot className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white">AI Interviewer</span>
            </div>

            {/* Status & Speech Controls */}
            <div className="flex items-center gap-2">
              {isAiSpeaking ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-emerald-400 font-semibold flex items-center gap-1">
                    Speaking
                  </span>
                  <button
                    type="button"
                    onClick={handleStopAiSpeaking}
                    className="text-[10px] px-2 py-0.5 bg-slate-900 hover:bg-slate-800 text-slate-300 rounded border border-slate-700 cursor-pointer"
                    title="Stop speaking"
                  >
                    <Square className="w-2.5 h-2.5 inline mr-1 fill-current" />
                    Pause
                  </button>
                </div>
              ) : isSendingTurn ? (
                <span className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Formulating...
                </span>
              ) : (
                <span className="text-[11px] font-mono text-slate-500">Listening to you</span>
              )}
            </div>
          </div>

          {/* AI Voice Equalizer Bars */}
          <div className="h-10 flex items-center justify-center gap-1 bg-slate-950/70 rounded-xl px-4 border border-slate-800/80">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isAiSpeaking
                    ? 'bg-emerald-400'
                    : 'bg-slate-800 h-1.5'
                }`}
                style={
                  isAiSpeaking
                    ? {
                        height: `${Math.max(6, Math.sin(i * 0.7 + Date.now() / 200) * 28 + 12)}px`,
                        animation: `pulse 0.4s ease-in-out infinite alternate ${i * 0.05}s`,
                      }
                    : undefined
                }
              />
            ))}
          </div>

          {/* AI Dialogue Subtitle */}
          <div className="mt-3 text-xs text-slate-300 max-h-24 overflow-y-auto pr-1 font-sans leading-relaxed custom-scrollbar">
            <span className="text-slate-500 font-bold font-mono text-[10px] uppercase block mb-0.5">
              Spoken Dialogue:
            </span>
            {interviewerMessage || 'Awaiting interviewer prompt...'}
          </div>
        </div>

        {/* Right Card: Candidate Voice Presence & Live Transcriber */}
        <div
          className={`p-4 rounded-2xl border transition-all duration-300 ${
            isCandidateSpeaking && !isMuted
              ? 'bg-teal-950/30 border-teal-500/50 shadow-lg shadow-teal-500/10 ring-1 ring-teal-500/30'
              : 'bg-slate-900/50 border-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center text-xs ${
                  isCandidateSpeaking && !isMuted
                    ? 'bg-teal-400 text-slate-950 font-bold shadow-md shadow-teal-400/30'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                <User className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white">Candidate (You)</span>
            </div>

            <div>
              {isMuted ? (
                <span className="text-[11px] font-mono text-red-400">Microphone Muted</span>
              ) : isCandidateSpeaking ? (
                <span className="text-[11px] font-mono text-teal-300 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-teal-400 animate-ping" />
                  Recording voice...
                </span>
              ) : (
                <span className="text-[11px] font-mono text-slate-500">Ready to speak</span>
              )}
            </div>
          </div>

          {/* Candidate Voice Waves */}
          <div className="h-10 flex items-center justify-center gap-1 bg-slate-950/70 rounded-xl px-4 border border-slate-800/80">
            {Array.from({ length: 20 }).map((_, i) => (
              <span
                key={i}
                className={`w-1 rounded-full transition-all duration-150 ${
                  isCandidateSpeaking && !isMuted
                    ? 'bg-teal-400'
                    : 'bg-slate-800 h-1.5'
                }`}
                style={
                  isCandidateSpeaking && !isMuted
                    ? {
                        height: `${Math.max(6, Math.cos(i * 0.8 + Date.now() / 150) * 26 + 10)}px`,
                        animation: `pulse 0.3s ease-in-out infinite alternate ${i * 0.04}s`,
                      }
                    : undefined
                }
              />
            ))}
          </div>

          {/* Candidate Live Transcription Box */}
          <div className="mt-3 text-xs text-slate-200 max-h-24 overflow-y-auto pr-1 font-sans leading-relaxed custom-scrollbar">
            <span className="text-slate-500 font-bold font-mono text-[10px] uppercase block mb-0.5">
              Your Spoken Transcript:
            </span>
            {accumulatedTranscript || liveTranscript ? (
              <span>
                <strong className="text-white">{accumulatedTranscript}</strong>{' '}
                <span className="text-teal-300 italic">{liveTranscript}</span>
              </span>
            ) : (
              <span className="text-slate-500 italic">
                {speechSupported
                  ? 'Speak freely into your microphone. Your words will transcribe here in real-time.'
                  : 'Speech recognition is not supported in this browser. Please type in chat mode.'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Action Footer: Spoken Submission & Simultaneous Code Run */}
      <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3 relative z-10">
        <div className="text-xs text-slate-400 flex items-center gap-2">
          <span>
            {accumulatedTranscript.trim().split(/\s+/).filter(Boolean).length} words transcribed
          </span>
          {codeSnippet && codeSnippet.code.trim() && (
            <>
              <span>•</span>
              <span className="text-emerald-400">Code sync active</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Clear Transcript Button */}
          {(accumulatedTranscript || liveTranscript) && (
            <button
              type="button"
              onClick={() => {
                setAccumulatedTranscript('');
                setLiveTranscript('');
              }}
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl text-xs border border-slate-800 transition-colors cursor-pointer"
            >
              Clear
            </button>
          )}

          {/* Submit Spoken Turn Button */}
          <button
            type="button"
            disabled={
              isSendingTurn ||
              (!accumulatedTranscript.trim() &&
                !liveTranscript.trim() &&
                (!codeSnippet || !codeSnippet.code.trim()))
            }
            onClick={handleSubmitTurn}
            className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-xs rounded-xl transition-all shadow-lg shadow-emerald-500/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSendingTurn ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Submitting to Interviewer...</span>
              </>
            ) : (
              <>
                <Send className="w-4 h-4" />
                <span>Send Voice Turn</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
