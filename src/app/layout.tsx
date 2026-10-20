import { Plus_Jakarta_Sans } from 'next/font/google';
import { Navbar, Footer } from '@/components';
import { CategoryNavigation } from '@/components/CategoryNavigation';
import './globals.css';
import { Toaster } from 'react-hot-toast';

const brandFont = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-brand',
  display: 'swap',
});

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
    <html lang="en" className={brandFont.variable}>
      <body className="bg-white">
        <Navbar />
        <CategoryNavigation />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
