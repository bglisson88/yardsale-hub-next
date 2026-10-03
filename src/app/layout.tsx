import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';
import { Navbar, Footer } from '@/components';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const brandFont = Nunito({
  subsets: ['latin'],
  weight: ['700', '800'],
  variable: '--font-brand',
  display: 'swap',
});

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
    <html lang="en" className={brandFont.variable}>
      <body className="font-sans">
        <Navbar />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
