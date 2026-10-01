'use client';

import { Logo } from '@/components/Logo';
import { Search, MapPin, Calendar, Package } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('');

  return (
    <div>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-50 to-indigo-50 py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <Logo size={48} />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
                Find Local Yard Sales & Great Deals
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                Discover treasures in your neighborhood. Buy and sell items locally with ease.
              </p>
              <div className="flex gap-4">
                <Link
                  href="/auth/signup"
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                  Get Started
                </Link>
                <Link
                  href="/events"
                  className="px-6 py-3 bg-white text-blue-600 border-2 border-blue-600 rounded-lg hover:bg-blue-50 transition font-semibold"
                >
                  Browse Sales
                </Link>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="bg-white rounded-2xl shadow-xl p-8 border border-blue-100">
                <Logo size={200} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Search Section */}
      <section className="bg-white py-12 border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 text-gray-400" size={20} />
              <input
                type="text"
                placeholder="Location..."
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <Link
              href={`/?search=${searchQuery}&location=${location}`}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition font-semibold text-center"
            >
              Search
            </Link>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">Why YardSale Hub?</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <Package className="text-blue-600 mb-4" size={32} />
              <h3 className="font-bold text-lg mb-2">Post Items</h3>
              <p className="text-gray-600 text-sm">
                List items individually or organize a full yard sale event with photos and descriptions.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <Calendar className="text-blue-600 mb-4" size={32} />
              <h3 className="font-bold text-lg mb-2">Plan Events</h3>
              <p className="text-gray-600 text-sm">
                Create yard sale events with dates, times, and locations. Attract local buyers.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <MapPin className="text-blue-600 mb-4" size={32} />
              <h3 className="font-bold text-lg mb-2">Local Discovery</h3>
              <p className="text-gray-600 text-sm">
                Find yard sales and items near you. Filter by location and category.
              </p>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-lg transition">
              <Search className="text-blue-600 mb-4" size={32} />
              <h3 className="font-bold text-lg mb-2">Easy Messaging</h3>
              <p className="text-gray-600 text-sm">
                Connect directly with sellers. Ask questions and make offers securely.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-600 py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">Ready to Start?</h2>
          <p className="text-blue-100 text-lg mb-8">
            Join thousands of locals buying and selling items in their community.
          </p>
          <Link
            href="/auth/signup"
            className="inline-block px-8 py-3 bg-white text-blue-600 rounded-lg hover:bg-blue-50 transition font-bold text-lg"
          >
            Create Account
          </Link>
        </div>
      </section>
    </div>
  );
}
