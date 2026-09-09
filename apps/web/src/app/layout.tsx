import type { Metadata } from 'next';
import React from 'react';
import './globals.css';
import { AuthProvider } from '../hooks/use-auth';

export const metadata: Metadata = {
  title: 'Recon — AI Interview Prep Kit',
  description: 'Transform any job description into a hyper-personalized interview preparation kit.',
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

