'use client';

import { Navbar, Footer } from '@/components';
import { Logo } from '@/components/Logo';
import './globals.css';
import { Toaster } from 'react-hot-toast';

export const metadata = {
  title: 'YardSale Hub - Buy & Sell Locally',
  description: 'Discover and organize local yard sales. Buy and sell items from your community.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-white">
        <Navbar />
        <main className="min-h-screen">
          {children}
        </main>
        <Footer />
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
