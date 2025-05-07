'use client';

import Link from "next/link";
import { useSearchParams } from 'next/navigation';

export default function Home() {
  const searchParams = useSearchParams();
  const showLogout = searchParams.get('logout') === '1';

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      {/* Navigation */}
      <nav className="fixed w-full bg-white/80 dark:bg-gray-900/80 backdrop-blur-sm z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <span className="text-xl font-bold">TextAssistd</span>
            </div>
            <div className="flex items-center space-x-4">
              <Link href="/pricing" className="text-sm hover:text-gray-600 dark:hover:text-gray-300">
                Pricing
              </Link>
              <Link href="/login" className="text-sm hover:text-gray-600 dark:hover:text-gray-300">
                Login
              </Link>
              <Link 
                href="/download"
                className="bg-black text-white dark:bg-white dark:text-black px-4 py-2 rounded-full text-sm hover:opacity-90"
              >
                Download
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="pt-24 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {showLogout && (
            <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 rounded-md text-center">
              <span className="text-green-700 dark:text-green-400 font-medium">Successfully logged out.</span>
            </div>
          )}
          <div className="text-center">
            <h1 className="text-4xl sm:text-6xl font-bold tracking-tight">
              Your AI Assistant, <span className="text-blue-600 dark:text-blue-400">Always Ready</span>
            </h1>
            <p className="mt-6 text-lg sm:text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto">
              TextAssistd brings the power of AI to your macOS desktop. Float it anywhere, use it everywhere.
            </p>
            <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
              <Link 
                href="/download"
                className="bg-blue-600 text-white px-8 py-3 rounded-full text-lg font-medium hover:bg-blue-700 transition-colors"
              >
                Download Now
              </Link>
              <Link 
                href="/pricing"
                className="bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-white px-8 py-3 rounded-full text-lg font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              >
                View Pricing
              </Link>
            </div>
          </div>
        </div>

        {/* Features Section */}
        <div className="mt-32 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="text-center">
              <div className="bg-blue-100 dark:bg-blue-900 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-600 dark:text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">Floating Chat</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Access AI assistance anywhere on your screen without disrupting your workflow.</p>
            </div>
            <div className="text-center">
              <div className="bg-green-100 dark:bg-green-900 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-600 dark:text-green-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">Stealth Mode</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Hide instantly with a hotkey when you need privacy or distraction-free work.</p>
            </div>
            <div className="text-center">
              <div className="bg-purple-100 dark:bg-purple-900 w-12 h-12 rounded-full flex items-center justify-center mx-auto">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-purple-600 dark:text-purple-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <h3 className="mt-4 text-xl font-semibold">Lightning Fast</h3>
              <p className="mt-2 text-gray-600 dark:text-gray-300">Powered by the latest OpenAI models for quick, accurate responses.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center">
            <div className="text-gray-500 dark:text-gray-400 text-sm">
              © 2024 TextAssistd. All rights reserved.
            </div>
            <div className="flex space-x-6">
              <a href="#" className="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300">
                Privacy Policy
              </a>
              <a href="#" className="text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300">
                Terms of Service
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
