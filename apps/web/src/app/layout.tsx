import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
import { AuthProvider } from '../hooks/use-auth';

export const metadata: Metadata = {
  title: 'Taro — AI Interview Prep Kit',
  description: 'Turn job descriptions into personalized interview preparation kits.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}

