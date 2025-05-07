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
  const [usageHours, setUsageHours] = useState('');
  const [showUsageInput, setShowUsageInput] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [hoursRemaining, setHoursRemaining] = useState<number | null>(null);
  const [licenseStatus, setLicenseStatus] = useState<string>('active');
  const [usageData, setUsageData] = useState<{ dates: string[], hours: number[] }>({
    dates: [],
    hours: []
  });

  const fetchUsageData = async () => {
    try {
      const response = await fetch('/api/usage');
      const data = await response.json();
      if (response.ok) {
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

  useEffect(() => {
    fetchUsageData();
  }, []);

  const handleTrackUsage = async () => {
    setError('');
    setSuccess('');

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
      const response = await fetch('/api/licenses/track-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          hoursUsed: hours,
          licenseId: (await (await fetch('/api/licenses/validate')).json()).licenseId
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setHoursRemaining(data.hoursRemaining);
        setUsageHours('');
        setShowUsageInput(false);
        setError('');
        await fetchUsageData();
        setSuccess('Usage tracked successfully');
      } else {
        setError(data.error || 'Failed to track usage');
      }
    } catch {
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
            <p data-testid="usage-hours-remaining" className="text-lg">
              Hours Remaining: {hoursRemaining}
            </p>
          </div>
        )}

        <div className="mb-8">
          {!showUsageInput ? (
            <button
              onClick={() => setShowUsageInput(true)}
              data-testid="track-usage-button"
              className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
              disabled={licenseStatus !== 'active'}
            >
              Track Usage
            </button>
          ) : (
            <div className="p-4 bg-white rounded-lg shadow-md">
              <input
                type="number"
                value={usageHours}
                onChange={(e) => setUsageHours(e.target.value)}
                placeholder="Enter hours used"
                data-testid="usage-hours-input"
                className="w-full p-2 mb-4 border rounded"
                step="0.1"
                min="0.1"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleTrackUsage}
                  data-testid="confirm-usage-button"
                  className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
                >
                  Confirm
                </button>
                <button
                  onClick={() => {
                    setShowUsageInput(false);
                    setUsageHours('');
                    setError('');
                  }}
                  className="bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div data-testid="usage-error" className="mb-4 p-4 bg-red-100 text-red-700 rounded">
            {error}
          </div>
        )}

        {success && (
          <div data-testid="usage-success" className="mb-4 p-4 bg-green-100 text-green-700 rounded">
            {success}
          </div>
        )}

        <div data-testid="tracking-usage-chart" className="bg-white p-4 rounded-lg shadow-md">
          <Line data={chartData} />
        </div>
      </div>
    </main>
  );
}