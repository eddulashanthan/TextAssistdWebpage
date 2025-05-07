'use client';

import { useMemo, useState } from 'react';
import type { License } from '@/lib/utils/supabase';
import { useRouter } from 'next/navigation';

interface LicenseStatsProps {
  license: License;
}

export function LicenseStats({ license }: LicenseStatsProps) {
  const [showKey, setShowKey] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(license.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const usagePercentage = useMemo(() => {
    return Math.round(((license.hours_purchased - license.hours_remaining) / license.hours_purchased) * 100);
  }, [license.hours_purchased, license.hours_remaining]);

  const remainingHours = useMemo(() => {
    return Math.round(license.hours_remaining * 10) / 10;
  }, [license.hours_remaining]);

  // Show purchase prompt for expired or nearly-expired licenses
  const showPurchasePrompt = license.status === 'expired' || (license.status === 'active' && license.hours_remaining < 1);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          License Usage
        </h3>
        <span className={`px-2 py-1 text-xs rounded-full ${
          license.status === 'active'
            ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
            : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'
        }`}
        data-testid="license-status">
          {license.status}
        </span>
      </div>

      <div className="space-y-4">
        {showPurchasePrompt && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/40 border border-yellow-200 dark:border-yellow-700 rounded flex items-center justify-between gap-4">
            <div>
              <span className="text-yellow-800 dark:text-yellow-200 font-semibold">
                {license.status === 'expired'
                  ? 'Your license has expired.'
                  : 'Less than 1 hour remaining!'}
              </span>
              <span className="block text-yellow-700 dark:text-yellow-100 text-xs mt-1">
                Purchase more hours to continue using TextAssistd.
              </span>
            </div>
            <button
              className="bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
              onClick={() => router.push(`/pricing?from=dashboard&remaining=${remainingHours}`)}
              data-testid="purchase-license-button"
            >
              Purchase
            </button>
          </div>
        )}
        <div>
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500 dark:text-gray-400">Hours Remaining</span>
            <span className="text-gray-900 dark:text-white font-medium" data-testid="hours-remaining">
              {remainingHours}h
            </span>
          </div>
          <div className="flex justify-between items-center text-xs mb-2 mt-2 gap-2">
            <span className="text-gray-500 dark:text-gray-400">License Key</span>
            <div className="flex items-center gap-2">
              <span
                className="font-mono text-xs text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded select-all"
                data-testid="license-key"
                style={{ letterSpacing: '0.05em' }}
              >
                {showKey ? license.key : '•'.repeat(license.key.length)}
              </span>
              <button
                type="button"
                aria-label={showKey ? 'Hide license key' : 'Show license key'}
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none"
                onClick={() => setShowKey((v) => !v)}
                data-testid="toggle-license-key-visibility"
              >
                {showKey ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-5.523 0-10-4.477-10-10 0-1.657.336-3.236.938-4.675M15 12a3 3 0 11-6 0 3 3 0 016 0zm6.062-4.675A9.956 9.956 0 0122 9c0 5.523-4.477 10-10 10a9.956 9.956 0 01-4.675-.938" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zm2.828-2.828A9.956 9.956 0 0122 12c0 5.523-4.477 10-10 10S2 17.523 2 12c0-2.21.714-4.254 1.928-5.928M4.222 4.222l15.556 15.556" /></svg>
                )}
              </button>
              <button
                type="button"
                aria-label="Copy license key"
                className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none"
                onClick={handleCopy}
                data-testid="copy-license-key"
                disabled={copied}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16h8M8 12h8m-7 8h6a2 2 0 002-2V6a2 2 0 00-2-2H8a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                {copied && (
                  <span className="ml-1 text-green-500 text-xs">Copied!</span>
                )}
              </button>
            </div>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
            <div
              className="bg-blue-600 h-2.5 rounded-full"
              style={{ width: `${100 - usagePercentage}%` }}
              data-testid="usage-chart"
            ></div>
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-gray-500 dark:text-gray-400">
              {usagePercentage}% used
            </span>
            <span className="text-gray-500 dark:text-gray-400">
              {license.hours_purchased}h total
            </span>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Purchased</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {new Date(license.purchase_date).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">Last Used</p>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {license.last_validated_at
                  ? new Date(license.last_validated_at).toLocaleDateString()
                  : 'Never'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}