'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../hooks/use-auth';
import {
  Sparkles,
  LogOut,
  User as UserIcon,
  Menu,
  X,
  LayoutDashboard,
  Plus,
} from 'lucide-react';

export function Navbar() {
  const { user, logout, isLoading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu whenever the active route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isMobileMenuOpen]);

  const handleLogout = async () => {
    setIsMobileMenuOpen(false);
    await logout();
    router.push('/login');
  };

  const isDashboardActive = pathname === '/dashboard';
  const isNewKitActive = pathname === '/kits/new';

  return (
    <>
      <header className="sticky top-0 z-40 w-full border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Brand Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 font-bold text-xl text-white tracking-tight hover:opacity-90 transition-opacity shrink-0"
            onClick={() => setIsMobileMenuOpen(false)}
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <span>Recon</span>
            <span className="hidden sm:inline-flex text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
              AI Prep
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-3 min-h-[36px]">
            {isLoading ? (
              <div className="h-8 w-36 rounded-lg bg-slate-900/50 animate-pulse" />
            ) : user ? (
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    isDashboardActive
                      ? 'bg-slate-900 text-emerald-400 border-slate-800 font-medium'
                      : 'text-slate-300 hover:text-white border-transparent hover:bg-slate-900'
                  }`}
                >
                  <LayoutDashboard className="w-3.5 h-3.5" />
                  <span>Dashboard</span>
                </Link>

                <Link
                  href="/kits/new"
                  className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                    isNewKitActive
                      ? 'bg-slate-900 text-emerald-400 border-slate-800 font-medium'
                      : 'text-slate-300 hover:text-white border-transparent hover:bg-slate-900'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5 text-emerald-400" />
                  <span>New Kit</span>
                </Link>

                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900 border border-slate-800 text-xs text-slate-300">
                  <UserIcon className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="max-w-[140px] truncate">{user.email}</span>
                </div>

                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg border border-transparent hover:border-rose-500/20 transition-all cursor-pointer"
                  title="Sign out"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  prefetch={true}
                  className="text-sm font-medium text-slate-300 hover:text-white px-3.5 py-1.5 rounded-lg hover:bg-slate-900 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  prefetch={true}
                  className="text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 px-3.5 py-1.5 rounded-lg transition-colors shadow-sm shadow-emerald-500/20"
                >
                  Get Started
                </Link>
              </div>
            )}
          </div>

          {/* Mobile Menu Toggle Button */}
          <div className="flex items-center gap-2 md:hidden">
            {isLoading ? (
              <div className="h-8 w-8 rounded-lg bg-slate-900/50 animate-pulse" />
            ) : (
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/40 cursor-pointer"
                aria-label="Toggle navigation menu"
                aria-expanded={isMobileMenuOpen}
              >
                {isMobileMenuOpen ? (
                  <X className="w-5 h-5 text-slate-200" />
                ) : (
                  <Menu className="w-5 h-5 text-slate-200" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Mobile Dropdown Panel */}
        {isMobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-xl px-4 py-4 space-y-3 shadow-2xl animate-in fade-in slide-in-from-top-2 duration-200">
            {user ? (
              <div className="space-y-3">
                {/* User Info Capsule */}
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-900/80 border border-slate-800">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-slate-400 font-medium">Signed in as</div>
                    <div className="text-sm font-semibold text-slate-200 truncate">{user.email}</div>
                  </div>
                </div>

                {/* Mobile Nav Links */}
                <div className="space-y-1">
                  <Link
                    href="/dashboard"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isDashboardActive
                        ? 'bg-slate-900 text-emerald-400 border border-slate-800'
                        : 'text-slate-200 hover:text-white hover:bg-slate-900/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <LayoutDashboard className="w-4 h-4 text-emerald-400" />
                      <span>Dashboard</span>
                    </div>
                  </Link>

                  <Link
                    href="/kits/new"
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      isNewKitActive
                        ? 'bg-slate-900 text-emerald-400 border border-slate-800'
                        : 'text-slate-200 hover:text-white hover:bg-slate-900/70 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Plus className="w-4 h-4 text-emerald-400" />
                      <span>New Prep Kit</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                      Create
                    </span>
                  </Link>
                </div>

                {/* Sign Out Button */}
                <div className="pt-2 border-t border-slate-800/80">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl text-rose-400 hover:text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition-all text-sm font-semibold cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <Link
                  href="/login"
                  prefetch={true}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center justify-center py-2.5 px-4 rounded-xl text-sm font-medium text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/register"
                  prefetch={true}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition-colors shadow-sm shadow-emerald-500/20"
                >
                  <span>Get Started Free</span>
                  <Sparkles className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>
        )}
      </header>

      {/* Backdrop overlay on mobile when menu is open */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 top-16 bg-slate-950/60 backdrop-blur-sm z-30 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}

