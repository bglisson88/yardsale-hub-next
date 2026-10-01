'use client';

import React from 'react';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import Link from 'next/link';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">YH</span>
            </div>
            <span className="hidden sm:block font-bold text-lg text-gray-900">YardSale Hub</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/" className="text-gray-700 hover:text-blue-600 transition">
              Browse
            </Link>
            <Link href="/events" className="text-gray-700 hover:text-blue-600 transition">
              Events
            </Link>
            <Link href="/dashboard" className="text-gray-700 hover:text-blue-600 transition">
              Dashboard
            </Link>
            <Link href="/auth/login" className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
              Sign In
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button className="md:hidden" onClick={() => setIsOpen(!isOpen)}>
            {isOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {isOpen && (
          <div className="md:hidden pb-4 space-y-2">
            <Link href="/" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
              Browse
            </Link>
            <Link href="/events" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
              Events
            </Link>
            <Link href="/dashboard" className="block px-4 py-2 text-gray-700 hover:bg-gray-100 rounded">
              Dashboard
            </Link>
            <Link href="/auth/login" className="block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
              Sign In
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
