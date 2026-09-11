'use client';

import React, { useState, useEffect } from 'react';
import { Code2, Copy, Check, RotateCcw, Trash2 } from 'lucide-react';
import { InterviewLanguage } from '@taro/shared';

interface CodeEditorProps {
  language: InterviewLanguage;
  onLanguageChange: (lang: InterviewLanguage) => void;
  code: string;
  onCodeChange?: (code: string) => void;
  onChange?: (code: string) => void;
  readOnly?: boolean;
}

const JS_STARTER = `/**
 * @param {any} input
 * @return {any}
 */
function solution(input) {
  // Write your JavaScript solution here
  
}
`;

const CPP_STARTER = `#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <algorithm>

using namespace std;

class Solution {
public:
    // Write your C++ solution here
    
};
`;

export function CodeEditor({
  language,
  onLanguageChange,
  code,
  onCodeChange,
  onChange,
  readOnly = false,
}: CodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const notifyChange = React.useCallback(
    (newCode: string) => {
      if (onCodeChange) onCodeChange(newCode);
      if (onChange) onChange(newCode);
    },
    [onCodeChange, onChange]
  );

  // Set default starter code if empty
  useEffect(() => {
    if (!code || code.trim().length === 0) {
      notifyChange(language === 'cpp' ? CPP_STARTER : JS_STARTER);
    }
  }, [language, code, notifyChange]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newCode = code.substring(0, start) + '  ' + code.substring(end);
      notifyChange(newCode);

      // Restore cursor position after state update
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleReset() {
    notifyChange(language === 'cpp' ? CPP_STARTER : JS_STARTER);
  }

  function handleClear() {
    notifyChange('');
  }

  const lines = code.split('\n');
  const lineCount = Math.max(lines.length, 12);

  return (
    <div className="flex flex-col h-full bg-slate-900/90 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Editor Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
            <Code2 className="w-4 h-4 text-emerald-400" />
            <span>Interview Code Workspace</span>
          </div>

          {/* Language Selector: JavaScript vs C++ */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => onLanguageChange('javascript')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                language === 'javascript'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              JavaScript
            </button>
            <button
              type="button"
              onClick={() => onLanguageChange('cpp')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                language === 'cpp'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              C++
            </button>
          </div>
        </div>

        {/* Toolbar Actions */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            title="Copy code"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy</span>
              </>
            )}
          </button>

          {!readOnly && (
            <>
              <button
                type="button"
                onClick={handleReset}
                title="Reset to starter template"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1 text-xs"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                title="Clear code"
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors flex items-center gap-1 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Editor Body with Line Numbers */}
      <div className="relative flex-1 flex overflow-hidden font-mono text-xs leading-5">
        {/* Line Numbers Gutter */}
        <div className="w-10 py-3 bg-slate-950/80 select-none text-right pr-2.5 text-slate-600 border-r border-slate-800/80">
          {Array.from({ length: lineCount }).map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Code Textarea */}
        <textarea
          value={code}
          onChange={(e) => notifyChange(e.target.value)}
          onKeyDown={handleKeyDown}
          readOnly={readOnly}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          placeholder={
            language === 'cpp'
              ? '// Write modern C++ (C++17/20) solution here...'
              : '// Write modern JavaScript (ES6+) solution here...'
          }
          className="flex-1 p-3 bg-transparent text-slate-100 resize-none outline-none overflow-y-auto whitespace-pre font-mono selection:bg-emerald-500/30 placeholder:text-slate-600"
        />
      </div>

      {/* Editor Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950/90 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
        <div>
          {language === 'cpp' ? 'C++ (Modern STL)' : 'JavaScript (Node.js)'} • UTF-8
        </div>
        <div>
          {lines.length} lines • {code.length} chars
        </div>
      </div>
    </div>
  );
}
