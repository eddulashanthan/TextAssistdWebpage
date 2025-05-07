'use client';

import { useState, useEffect } from 'react';

export default function DownloadPage() {
  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Download TextAssistD</h1>
      <div className="max-w-md mx-auto bg-white p-6 rounded-lg shadow-md text-center">
        <a
          href="/downloads/TextAssistD-latest.dmg"
          className="inline-block bg-indigo-600 text-white py-3 px-6 rounded-md text-lg font-semibold hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          download
        >
          Download for macOS
        </a>
        <p className="mt-4 text-gray-500">No license required to download. You can activate your license after installing the app.</p>
      </div>
    </main>
  );
}