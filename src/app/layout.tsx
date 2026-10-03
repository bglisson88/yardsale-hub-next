import type { Metadata } from 'next';
import { Navbar, Footer } from '@/components';
import './globals.css';
import { Toaster } from 'react-hot-toast';
import { Pacifico } from 'next/font/google';

const brandFont = Pacifico({ weight: '400', subsets: ['latin'], variable: '--font-brand' });

const title = 'YardSale Hub - Buy & Sell Locally';
const description = 'Discover and organize local yard sales. Buy and sell items from your community.';

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    type: 'website',
    siteName: 'YardSale Hub',
  },
  twitter: {
    card: 'summary',
    title,
    description,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`font-sans ${brandFont.variable}`}>
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
