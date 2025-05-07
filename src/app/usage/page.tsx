'use client';

import { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

export default function UsagePage() {
  const [hoursRemaining, setHoursRemaining] = useState<number | null>(null);
  const [usageHours, setUsageHours] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showUsageInput, setShowUsageInput] = useState(false);
  const [usageData, setUsageData] = useState<{ dates: string[], hours: number[] }>({
    dates: [],
    hours: []
  });
  const [licenseStatus, setLicenseStatus] = useState<'active' | 'expired' | 'revoked'>('active');

  useEffect(() => {
    fetchUsageData();
  }, []);

  const fetchUsageData = async () => {
    try {
      const response = await fetch('/api/usage');
      const data = await response.json();
      
      if (response.ok) {
        setHoursRemaining(data.hoursRemaining);
        setUsageData({
          dates: data.usageHistory.map((h: { date: string }) => h.date),
          hours: data.usageHistory.map((h: { hours: number }) => h.hours)
        });
        setLicenseStatus(data.licenseStatus || 'active');
      }
    } catch {
      setError('Failed to fetch usage data');
    }
  };

  const handleTrackUsage = async () => {
    // Clear previous error
    setError('');

    // Check license status first
    if (licenseStatus !== 'active') {
      setError(`License is ${licenseStatus}`);
      return;
    }

    const hours = parseFloat(usageHours);
    
    if (isNaN(hours) || hours <= 0) {
      setError('Hours used must be a positive number');
      return;
    }

    if (hoursRemaining !== null && hours > hoursRemaining) {
      setError('Insufficient hours remaining');
      return;
    }

    try {
      const response = await fetch('/api/usage/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ hours }),
      });

      const data = await response.json();

      if (response.ok) {
        setHoursRemaining(data.hoursRemaining);
        setUsageHours('');
        setShowUsageInput(false);
        setError('');
        await fetchUsageData(); // Refresh usage data
        setSuccess('Usage tracked successfully'); // Add success message
      } else {
        setError(data.error || 'Failed to track usage');
      }
    } catch (error) {
      setError('Failed to track usage');
    }
  };

  const chartData = {
    labels: usageData.dates,
    datasets: [
      {
        label: 'Usage Hours',
        data: usageData.hours,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }
    ]
  };

  return (
    <main className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-8">Usage Tracking</h1>

      <div className="max-w-2xl mx-auto">
        {hoursRemaining !== null && (
          <div className="mb-6 p-4 bg-white rounded-lg shadow-md">
            <h2 className="text-xl font-semibold mb-2">Current Status</h2>
            <p data-testid="hours-remaining" className="text-lg">
              Hours Remaining: {hoursRemaining}
            </p>
          </div>
        )}

        <div className="mb-6">
          {!showUsageInput ? (
            <button
              data-testid="track-usage-button"
              className="bg-indigo-600 text-white py-2 px-4 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
              onClick={() => setShowUsageInput(true)}
            >
              Track Usage
            </button>
          ) : (
            <div className="bg-white p-4 rounded-lg shadow-md">
              <input
                type="number"
                data-testid="usage-minutes-input"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 mb-4"
                value={usageHours}
                onChange={(e) => setUsageHours(e.target.value)}
                placeholder="Enter hours used"
                step="0.25"
                min="0"
              />
              <div className="flex space-x-4">
                <button
                  data-testid="confirm-usage-button"
                  className="bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  onClick={handleTrackUsage}
                >
                  Confirm
                </button>
                <button
                  className="bg-gray-600 text-white py-2 px-4 rounded-md hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  onClick={() => {
                    setShowUsageInput(false);
                    setUsageHours('');
                    setError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {error && (
            <div data-testid="usage-error" className="mt-4 p-4 bg-red-50 text-red-700 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div data-testid="usage-success" className="mt-4 p-4 bg-green-50 text-green-700 rounded-md">
              {success}
            </div>
          )}
        </div>

        <div className="bg-white p-4 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">Usage History</h2>
          <div data-testid="usage-chart" className="w-full h-64">
            <Line data={chartData} options={{ maintainAspectRatio: false }} />
          </div>
        </div>
      </div>
    </main>
  );
}