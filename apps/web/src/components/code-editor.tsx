'use client';

import React, { useState, useEffect } from 'react';
import { Code2, Copy, Check, RotateCcw, Trash2, Play, Loader2 } from 'lucide-react';
import { InterviewLanguage } from '@taro/shared';

interface CodeEditorProps {
  language: InterviewLanguage;
  onLanguageChange: (lang: InterviewLanguage) => void;
  code: string;
  onCodeChange?: (code: string) => void;
  onChange?: (code: string) => void;
  readOnly?: boolean;
  onRun?: () => void;
  isRunning?: boolean;
}

export const JS_STARTER = `function solution() {
  
}
`;

export const PYTHON_STARTER = `class Solution:
    def solve(self):
        pass
`;

export const CPP_STARTER = `#include <iostream>
#include <vector>
#include <string>
#include <unordered_map>
#include <algorithm>

using namespace std;

class Solution {
public:
    void solve() {
        
    }
};
`;

export const SQL_STARTER = `-- Write your SQL solution or schema DDL below

`;

export function getStarterForLanguage(lang: InterviewLanguage): string {
  switch (lang) {
    case 'sql':
      return SQL_STARTER;
    case 'python':
      return PYTHON_STARTER;
    case 'cpp':
      return CPP_STARTER;
    case 'javascript':
    default:
      return JS_STARTER;
  }
}

function isUntouchedStarter(text: string): boolean {
  const trimmed = (text || '').trim();
  return (
    !trimmed ||
    trimmed === JS_STARTER.trim() ||
    trimmed === CPP_STARTER.trim() ||
    trimmed === PYTHON_STARTER.trim() ||
    trimmed === SQL_STARTER.trim() ||
    trimmed.startsWith('#include <iostream>') ||
    trimmed.startsWith('function solution(') ||
    trimmed.startsWith('class Solution:') ||
    trimmed.startsWith('-- Write your SQL')
  );
}

export function CodeEditor({
  language,
  onLanguageChange,
  code,
  onCodeChange,
  onChange,
  readOnly = false,
  onRun,
  isRunning = false,
}: CodeEditorProps) {
  const [copied, setCopied] = useState(false);
  const notifyChange = React.useCallback(
    (newCode: string) => {
      if (onCodeChange) onCodeChange(newCode);
      if (onChange) onChange(newCode);
    },
    [onCodeChange, onChange]
  );

  // Keep starter code in sync when empty or if switching languages with untouched default templates
  useEffect(() => {
    const trimmed = (code || '').trim();
    if (!trimmed) {
      notifyChange(getStarterForLanguage(language));
    } else if (isUntouchedStarter(code)) {
      const currentExpected = getStarterForLanguage(language).trim();
      if (trimmed !== currentExpected) {
        notifyChange(getStarterForLanguage(language));
      }
    }
  }, [language, code, notifyChange]);

  function handleSelectLanguage(newLang: InterviewLanguage) {
    if (newLang === language) return;
    onLanguageChange(newLang);
    if (isUntouchedStarter(code)) {
      notifyChange(getStarterForLanguage(newLang));
    }
  }

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
    notifyChange(getStarterForLanguage(language));
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

          {/* Language Selector: JavaScript, Python, C++, SQL */}
          <div className="flex items-center bg-slate-900 p-0.5 rounded-lg border border-slate-800">
            <button
              type="button"
              onClick={() => handleSelectLanguage('javascript')}
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
              onClick={() => handleSelectLanguage('python')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                language === 'python'
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Python
            </button>
            <button
              type="button"
              onClick={() => handleSelectLanguage('cpp')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                language === 'cpp'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              C++
            </button>
            <button
              type="button"
              onClick={() => handleSelectLanguage('sql')}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                language === 'sql'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              SQL
            </button>
          </div>
        </div>

        {/* Toolbar Actions */}
        <div className="flex items-center gap-2">
          {onRun && (
            <button
              type="button"
              onClick={onRun}
              disabled={isRunning || !code.trim()}
              className="px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold rounded-lg transition-all flex items-center gap-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm shadow-emerald-500/20 mr-1"
              title="Run and evaluate code against test cases"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Checking...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-slate-950" />
                  <span>Run & Check</span>
                </>
              )}
            </button>
          )}

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
            language === 'sql'
              ? '-- Write PostgreSQL / MySQL / Schema DDL / Query here...'
              : language === 'python'
              ? '# Write modern Python 3 solution here...'
              : language === 'cpp'
              ? '// Write modern C++ (C++17/20) solution here...'
              : '// Write modern JavaScript (ES6+) solution here...'
          }
          className="flex-1 p-3 bg-transparent text-slate-100 resize-none outline-none overflow-y-auto whitespace-pre font-mono selection:bg-emerald-500/30 placeholder:text-slate-600"
        />
      </div>

      {/* Editor Footer */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-slate-950/90 border-t border-slate-800/80 text-[10px] text-slate-500 font-mono">
        <div>
          {language === 'sql'
            ? 'SQL (PostgreSQL / ANSI)'
            : language === 'python'
            ? 'Python 3.11+'
            : language === 'cpp'
            ? 'C++ (Modern STL)'
            : 'JavaScript (Node.js)'} • UTF-8
        </div>
        <div>
          {lines.length} lines • {code.length} chars
        </div>
      </div>
    </div>
  );
}
