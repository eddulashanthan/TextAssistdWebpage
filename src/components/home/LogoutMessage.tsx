'use client';

import { useSearchParams } from 'next/navigation';

export default function LogoutMessage() {
  const searchParams = useSearchParams();
  const showLogout = searchParams.get('logout') === '1';

  if (!showLogout) return null;

  return (
    <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/50 border border-green-200 dark:border-green-800 rounded-md text-center">
      <span className="text-green-700 dark:text-green-400 font-medium">Successfully logged out.</span>
    </div>
  );
}