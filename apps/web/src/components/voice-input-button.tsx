'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

export function VoiceInputButton({ onTranscript, disabled = false }: VoiceInputButtonProps) {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setIsSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      let finalTranscript = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        }
      }
      if (finalTranscript.trim()) {
        onTranscript(finalTranscript.trim());
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('[SpeechRecognition] error:', event.error);
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, [onTranscript]);

  function toggleListening() {
    if (!isSupported) {
      alert(
        'Speech recognition is not supported in this browser. Please use Google Chrome, Edge, or Safari, or type your answer in Chat Mode.'
      );
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsListening(true);
      } catch (err) {
        console.error('Failed to start speech recognition:', err);
      }
    }
  }

  return (
    <button
      type="button"
      onClick={toggleListening}
      disabled={disabled}
      title={
        !isSupported
          ? 'Voice input not supported in this browser'
          : isListening
          ? 'Listening... Click to stop'
          : 'Speak your answer (Voice Mode)'
      }
      className={`relative p-2.5 rounded-xl border transition-all flex items-center justify-center ${
        isListening
          ? 'bg-red-500/20 text-red-400 border-red-500/50 shadow-lg shadow-red-500/20 animate-pulse'
          : 'bg-slate-900/80 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-800'
      } disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {isListening ? (
        <>
          <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
          </span>
          <div className="flex items-center gap-1.5">
            <Mic className="w-4 h-4 text-red-400" />
            <div className="flex items-center gap-0.5 h-3.5 px-0.5" aria-label="Audio recording indicator">
              <span className="w-0.5 h-2 bg-red-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
              <span className="w-0.5 h-3.5 bg-red-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
              <span className="w-0.5 h-2 bg-red-400 rounded-full animate-bounce"></span>
              <span className="w-0.5 h-3 bg-red-400 rounded-full animate-bounce [animation-delay:-0.25s]"></span>
            </div>
          </div>
        </>
      ) : (
        <Mic className="w-5 h-5" />
      )}
    </button>
  );
}
