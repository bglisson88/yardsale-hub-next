'use client';

import { useEffect, useRef, useState } from 'react';
import { Menu, X, PlusCircle, ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
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
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useAuthContext();
  const { user, loading } = useAuthStore();

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const menuLinks = user
    ? [
        { href: '/dashboard', label: 'Dashboard' },
        { href: '/dashboard/profile', label: 'Edit Profile' },
        { href: `/items?seller=${user.id}`, label: 'My Items' },
        { href: '/items/new', label: 'Post Item' },
        { href: '/events/new', label: 'Create Event' },
        { href: '/messages', label: 'Messages' },
      ]
    : [];

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

  const navLink = 'text-gray-700 font-medium hover:text-brand-600 transition';

  return (
    <nav className="sticky top-0 z-[1100] bg-white/80 backdrop-blur-md border-b border-brand-100 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <Logo size={40} />
            <span className="hidden sm:block font-extrabold text-lg text-gray-900">YardSale Hub</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/items" className={navLink}>Browse</Link>
            <Link href="/events" className={navLink}>Events</Link>
            {user && (
              <Link href="/items/new" className="btn-primary !px-4 !py-2 text-sm">
                <PlusCircle size={16} aria-hidden="true" /> Post Item
              </Link>
            )}
            {loading ? (
              <div className="w-10 h-10" aria-hidden="true" />
            ) : user ? (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={() => setMenuOpen(!menuOpen)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-label="Open account menu"
                  className="flex items-center gap-1 rounded-full ring-2 ring-brand-300 hover:ring-brand-500 transition p-0.5"
                >
                  <Avatar src={user.photoURL} name={user.displayName} size={36} />
                  <ChevronDown size={14} className="text-gray-500 mr-1" aria-hidden="true" />
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-xl border border-gray-100 py-2"
                  >
                    <div className="px-4 pb-2 mb-1 border-b border-gray-100">
                      <p className="font-semibold text-gray-900 truncate">{user.displayName}</p>
                      <p className="text-xs text-gray-500 truncate">{user.email}</p>
                    </div>
                    {menuLinks.map((l) => (
                      <Link
                        key={l.label}
                        href={l.href}
                        role="menuitem"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-gray-700 hover:bg-brand-50"
                      >
                        {l.label}
                      </Link>
                    ))}
                    <button
                      role="menuitem"
                      onClick={handleSignOut}
                      className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                    >
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Link href="/auth/login" className="btn-primary !px-4 !py-2 text-sm">
                Sign In
              </Link>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={isOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={isOpen}
          >
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 space-y-1">
            {user && (
              <div className="flex items-center gap-3 px-4 py-3 mb-2 bg-brand-50 rounded-xl">
                <Avatar src={user.photoURL} name={user.displayName} size={40} />
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 truncate">{user.displayName}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
              </div>
            )}
            <Link href="/items" onClick={() => setIsOpen(false)} className="block px-4 py-2 text-gray-700 hover:bg-brand-50 rounded">Browse</Link>
            <Link href="/events" onClick={() => setIsOpen(false)} className="block px-4 py-2 text-gray-700 hover:bg-brand-50 rounded">Events</Link>
            {user ? (
              <>
                {menuLinks.map((l) => (
                  <Link
                    key={l.label}
                    href={l.href}
                    onClick={() => setIsOpen(false)}
                    className="block px-4 py-2 text-gray-700 hover:bg-brand-50 rounded"
                  >
                    {l.label}
                  </Link>
                ))}
                <button
                  onClick={handleSignOut}
                  className="w-full text-left px-4 py-2 text-red-600 hover:bg-red-50 rounded"
                >
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/auth/login" onClick={() => setIsOpen(false)} className="block px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 text-center font-semibold">
                Sign In
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
