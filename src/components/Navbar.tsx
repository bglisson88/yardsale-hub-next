'use client';

import { Menu, X, PlusCircle, ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import toast from 'react-hot-toast';
import { auth } from '@/lib/firebase';
import { useAuthContext } from '@/hooks';
import { useAuthStore } from '@/store';
import { Avatar } from './Avatar';
import { Logo } from './Logo';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationRef = useRef<HTMLElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const accountButtonRef = useRef<HTMLButtonElement>(null);
  const mobileButtonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  useAuthContext();
  const { user, loading } = useAuthStore();

  useEffect(() => {
    setMenuOpen(false);
    setIsOpen(false);
  }, [pathname, user?.id]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
      if (!navigationRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (menuOpen) accountButtonRef.current?.focus();
      if (isOpen) mobileButtonRef.current?.focus();
      setMenuOpen(false);
      setIsOpen(false);
    };
    const media = window.matchMedia('(min-width: 768px)');
    const close = () => {
      setMenuOpen(false);
      setIsOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    media.addEventListener('change', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
      media.removeEventListener('change', close);
    };
  }, [isOpen, menuOpen]);

  const menuLinks = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/items/new', label: 'Post Item' },
    { href: '/events/new', label: 'Create Event' },
    { href: '/messages', label: 'Messages' },
  ];

  const handleSignOut = async () => {
    setMenuOpen(false);
    setIsOpen(false);
    try {
      await signOut(auth);
      router.push('/');
    } catch (error) {
      console.error('Sign out failed:', error);
      toast.error('Failed to sign out');
    }
  };

  const navLink = 'text-slate-300 font-semibold hover:text-emerald-400 transition-colors';
  const actionLink = 'inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-emerald-500 transition-colors';
  const mobileLink = 'block px-4 py-2.5 text-slate-300 hover:bg-slate-800 hover:text-white rounded-xl';

  return (
    <nav ref={navigationRef} aria-label="Main navigation" className="site-nav sticky top-0 z-[1100] bg-slate-950/95 py-3 text-white backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 px-3 shadow-lg shadow-black/20 sm:px-5">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" aria-label="YardSale Hub home" className="flex items-center gap-2 rounded-lg">
            <span aria-hidden="true"><Logo size={44} /></span>
            <span className="font-brand font-extrabold text-lg sm:text-2xl tracking-tight">
              YardSale <span className="text-emerald-400">Hub</span>
            </span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-6">
            <Link href="/items" className={navLink}>Browse</Link>
            <Link href="/events" className={navLink}>Events</Link>
            {user && <Link href="/items/new" className={actionLink}><PlusCircle size={16} aria-hidden="true" /> Post Item</Link>}
            {loading ? (
              <div className="w-10 h-10" aria-hidden="true" />
            ) : user ? (
              <div className="relative" ref={menuRef}>
                <button
                  ref={accountButtonRef}
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-expanded={menuOpen}
                  aria-controls="account-navigation"
                  aria-label="Open account menu"
                  className="flex items-center gap-1 rounded-full ring-2 ring-slate-600 hover:ring-emerald-400 transition p-0.5"
                >
                  <Avatar src={user.photoURL} name={user.displayName} size={36} />
                  <ChevronDown size={14} className="text-slate-300 mr-1" aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div id="account-navigation" className="absolute right-0 mt-2 w-52 bg-slate-900 rounded-xl shadow-xl border border-slate-700 py-2">
                    <div className="px-4 pb-2 mb-1 border-b border-slate-700">
                      <p className="font-semibold text-white truncate">{user.displayName}</p>
                      <p className="text-xs text-slate-300 truncate">{user.email}</p>
                    </div>
                    {menuLinks.map((link) => (
                      <Link key={link.href} href={link.href} onClick={() => setMenuOpen(false)} className="block px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white">
                        {link.label}
                      </Link>
                    ))}
                    <button onClick={handleSignOut} className="w-full text-left px-4 py-2 text-sm text-red-300 hover:bg-slate-800">Sign Out</button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/auth/login" className={actionLink}>Sign In</Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            ref={mobileButtonRef}
            className="md:hidden rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
            aria-controls="mobile-navigation"
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div id="mobile-navigation" className="md:hidden max-h-[calc(100dvh-6rem)] overflow-y-auto border-t border-slate-800 py-3 space-y-1">
            {user && (
              <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-slate-800 rounded-xl">
                <Avatar src={user.photoURL} name={user.displayName} size={40} />
                <div className="min-w-0">
                  <p className="font-semibold text-white truncate">{user.displayName}</p>
                  <p className="text-xs text-slate-300 truncate">{user.email}</p>
                </div>
              </div>
            )}
            <Link href="/items" onClick={() => setIsOpen(false)} className={mobileLink}>Browse</Link>
            <Link href="/events" onClick={() => setIsOpen(false)} className={mobileLink}>Events</Link>
            {!loading && (user ? (
              <>
                {menuLinks.map((link) => (
                  <Link key={link.href} href={link.href} onClick={() => setIsOpen(false)} className={mobileLink}>{link.label}</Link>
                ))}
                <button onClick={handleSignOut} className="w-full text-left px-4 py-2.5 text-red-300 hover:bg-slate-800 rounded-xl">Sign Out</button>
              </>
            ) : (
              <Link href="/auth/login" onClick={() => setIsOpen(false)} className={`${actionLink} w-full`}>Sign In</Link>
            ))}
          </div>
        )}
        </div>
      </div>
    </nav>
  );
}
