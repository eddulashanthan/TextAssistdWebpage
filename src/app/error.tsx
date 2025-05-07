'use client';

import Link from 'next/link';

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          Something went wrong
        </h1>
        <p className="text-gray-600 dark:text-gray-300 mb-8">
          {error.message || 'An unexpected error occurred'}
        </p>
        <div className="space-y-4">
          <button
            onClick={reset}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Try again
          </button>
          <Link
            href="/"
            className="w-full flex justify-center py-2 px-4 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500"
          >
            Return home
          </Link>
        </div>
      </div>
    </div>
  );
}