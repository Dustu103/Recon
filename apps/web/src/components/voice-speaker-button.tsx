'use client';

import React, { useState, useEffect } from 'react';
import { Volume2, Square } from 'lucide-react';

interface VoiceSpeakerButtonProps {
  text: string;
  className?: string;
}

export function VoiceSpeakerButton({ text, className }: VoiceSpeakerButtonProps) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  function handleToggleSpeech() {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      alert('Speech synthesis is not supported in this browser.');
      return;
    }

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel(); // Cancel any existing speech
    const cleanText = text.replace(/[*#_`]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = 'en-US';

    utterance.onend = () => {
      setIsSpeaking(false);
    };

    utterance.onerror = () => {
      setIsSpeaking(false);
    };

    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);
  }

  return (
    <button
      type="button"
      onClick={handleToggleSpeech}
      title={isSpeaking ? 'Stop interviewer voice' : 'Listen to interviewer voice'}
      className={`p-1.5 rounded-lg border text-xs transition-colors flex items-center gap-1 ${
        isSpeaking
          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40 animate-pulse'
          : 'bg-slate-900/60 text-slate-400 border-slate-800 hover:text-slate-200 hover:bg-slate-800'
      } ${className || ''}`}
    >
      {isSpeaking ? (
        <>
          <Square className="w-3.5 h-3.5 fill-emerald-400" />
          <span>Speaking...</span>
        </>
      ) : (
        <>
          <Volume2 className="w-3.5 h-3.5" />
          <span>Listen</span>
        </>
      )}
    </button>
  );
}
