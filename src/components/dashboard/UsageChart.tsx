'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { format, parseISO, subDays } from 'date-fns';
import { supabase } from '@/lib/utils/supabase';
import { LoadingSpinner } from '../ui/LoadingSpinner';

interface UsageData {
  tracked_at: string;
  minutes_used: number;
}

interface UsageChartProps {
  licenseId: string;
}

export function UsageChart({ licenseId }: UsageChartProps) {
  const [data, setData] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pre-process data to fill in missing days with zero usage
  const processedData = useMemo(() => {
    const today = new Date();
    
    // Create a map of existing data points
    const dataMap = new Map(
      data.map(point => [format(parseISO(point.tracked_at), 'yyyy-MM-dd'), point.minutes_used])
    );
    
    // Generate array of all dates in range
    const allDates = Array.from({ length: 31 }, (_, i) => {
      const date = subDays(today, 30 - i);
      const dateStr = format(date, 'yyyy-MM-dd');
      return {
        tracked_at: dateStr,
        minutes_used: dataMap.get(dateStr) || 0
      };
    });

    return allDates;
  }, [data]);

  const fetchUsageData = useCallback(async () => {
    try {
      const { data: usageData, error } = await supabase
        .from('license_usage')
        .select('tracked_at, minutes_used')
        .eq('license_id', licenseId)
        .gte('tracked_at', subDays(new Date(), 30).toISOString())
        .order('tracked_at', { ascending: true });

      if (error) throw error;

      setData(usageData || []);
    } catch (err) {
      setError('Failed to load usage data');
      console.error('Error fetching usage data:', err);
    } finally {
      setLoading(false);
    }
  }, [licenseId]);

  useEffect(() => {
    fetchUsageData();

    // Subscribe to real-time updates
    const channel = supabase
      .channel(`license-usage-${licenseId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'license_usage',
          filter: `license_id=eq.${licenseId}`,
        },
        (payload) => {
          const newData = payload.new as UsageData;
          setData((currentData) => {
            // Remove old data point for the same day if it exists
            const filteredData = currentData.filter(
              point => format(parseISO(point.tracked_at), 'yyyy-MM-dd') !== 
                      format(parseISO(newData.tracked_at), 'yyyy-MM-dd')
            );
            return [...filteredData, newData];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [licenseId, fetchUsageData]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="flex justify-center items-center h-64">
          <LoadingSpinner size="large" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
        <div className="p-4 bg-red-50 dark:bg-red-900/50 border border-red-200 dark:border-red-800 rounded-md">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
        Usage History
      </h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={processedData}
            margin={{
              top: 10,
              right: 10,
              left: 0,
              bottom: 0,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#374151"
              opacity={0.1}
            />
            <XAxis
              dataKey="tracked_at"
              tickFormatter={(value) => format(parseISO(value), 'MMM d')}
              stroke="#6B7280"
              fontSize={12}
            />
            <YAxis
              stroke="#6B7280"
              fontSize={12}
              tickFormatter={(value) => `${value}m`}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'rgba(17, 24, 39, 0.8)',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
              }}
              labelFormatter={(value) => format(parseISO(value as string), 'MMM d, yyyy')}
              formatter={(value: number) => [`${value} minutes`, 'Usage']}
            />
            <Area
              type="monotone"
              dataKey="minutes_used"
              stroke="#3B82F6"
              fill="#3B82F6"
              fillOpacity={0.2}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}