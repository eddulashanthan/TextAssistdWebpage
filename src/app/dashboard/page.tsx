'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { supabase } from '@/lib/utils/supabase';
import type { License } from '@/lib/utils/supabase';
import { UsageChart } from '@/components/dashboard/UsageChart';
import { LicenseStats } from '@/components/dashboard/LicenseStats';
import { TransactionHistory } from '@/components/dashboard/TransactionHistory';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import Link from 'next/link';
import { UsageTrackingPanel } from '@/components/dashboard/UsageTrackingPanel';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const { user } = useAuth();
  const [licenses, setLicenses] = useState<License[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    
    fetchLicenses();

    // Subscribe to license updates
    const channel = supabase
      .channel(`user-licenses-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'licenses',
          filter: `user_id=eq.${user.id}`,
        },
        () => {
          fetchLicenses();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchLicenses = async () => {
    try {
      const { data, error } = await supabase
        .from('licenses')
        .select('*')
        .eq('user_id', user!.id)
        .order('purchase_date', { ascending: false });

      if (error) throw error;

      setLicenses(data);
    } catch (err) {
      setError('Failed to load licenses');
      console.error('Error fetching licenses:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/?logout=1');
  };

  if (loading || !user) {
    return (
      <div className="flex justify-center items-center min-h-screen">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 rounded-md p-4">
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Navigation */}
      <nav className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex items-center">
              <Link href="/" className="text-xl font-bold text-gray-900 dark:text-white">
                TextAssistd
              </Link>
            </div>
            <div className="flex items-center">
              {user && (
                <span className="mr-4 text-gray-700 dark:text-gray-200">{user.email}</span>
              )}
              <button
                onClick={handleSignOut}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Dashboard
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage your TextAssistd licenses and monitor usage
            </p>
          </div>

          {licenses.length === 0 ? (
            <div className="text-center py-12">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Welcome, {user?.email || 'User'}!
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-6">
                You don't have any licenses yet. Purchase one to get started with TextAssistd.
              </p>
              <Link
                href="/pricing"
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                View Offers & Purchase
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              {/* License Stats & Usage Chart */}
              <div className="space-y-6">
                {licenses.map((license) => (
                  <div key={license.id} className="space-y-6">
                    <LicenseStats license={license} />
                    <UsageChart licenseId={license.id} />
                  </div>
                ))}
                {/* Usage Tracking Panel for E2E and user actions */}
                <section className="mt-8">
                  <h2 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Track Usage</h2>
                  <UsageTrackingPanel />
                </section>
              </div>

              {/* Transaction History */}
              {user && (
                <div>
                  <TransactionHistory userId={user.id} />
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}