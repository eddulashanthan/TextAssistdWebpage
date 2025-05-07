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

export function UsageTrackingPanel() {
  const [minutesRemaining, setMinutesRemaining] = useState<number | null>(null);
  const [usageMinutes, setUsageMinutes] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showUsageInput, setShowUsageInput] = useState(false);
  const [usageData, setUsageData] = useState<{ dates: string[], minutes: number[] }>({
    dates: [],
    minutes: []
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
        setMinutesRemaining(data.minutesRemaining);
        setUsageData({
          dates: data.usageHistory.map((h: any) => h.date),
          minutes: data.usageHistory.map((h: any) => h.minutes)
        });
        setLicenseStatus(data.licenseStatus || 'active');
      }
    } catch (error) {
      setError('Failed to fetch usage data');
    }
  };

  const handleTrackUsage = async () => {
    setError('');
    if (licenseStatus !== 'active') {
      setError(`License is ${licenseStatus}`);
      return;
    }
    const minutes = parseFloat(usageMinutes);
    if (isNaN(minutes) || minutes <= 0) {
      setError('Minutes used must be a positive number');
      return;
    }
    if (minutesRemaining !== null && minutes > minutesRemaining) {
      setError('Insufficient minutes remaining');
      return;
    }
    try {
      const response = await fetch('/api/licenses/track-usage', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ minutes }),
      });
      const data = await response.json();
      if (response.ok) {
        setMinutesRemaining(data.minutesRemaining);
        setUsageMinutes('');
        setShowUsageInput(false);
        setError('');
        await fetchUsageData();
        setSuccess('Usage tracked successfully');
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
        label: 'Usage Minutes',
        data: usageData.minutes,
        borderColor: 'rgb(75, 192, 192)',
        tension: 0.1
      }
    ]
  };

  return (
    <div className="max-w-2xl mx-auto">
      {minutesRemaining !== null && (
        <div className="mb-6 p-4 bg-white rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-2">Current Status</h2>
          <p data-testid="usage-minutes-remaining" className="text-lg">
            Minutes Remaining: {minutesRemaining}
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
              value={usageMinutes}
              onChange={(e) => setUsageMinutes(e.target.value)}
              placeholder="Enter minutes used"
              step="1"
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
                  setUsageMinutes('');
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
        <div data-testid="tracking-usage-chart" className="w-full h-64">
          <Line data={chartData} options={{ maintainAspectRatio: false }} />
        </div>
      </div>
    </div>
  );
} 