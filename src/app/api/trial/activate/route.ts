// src/app/api/trial/activate/route.ts
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { system_id, user_id } = await request.json();

    if (!system_id) {
      return NextResponse.json({ error: 'system_id is required' }, { status: 400 });
    }

    // Placeholder logic: Simulate successful trial activation
    console.log(`Placeholder: Trial activation requested for system_id: ${system_id}, user_id: ${user_id || 'N/A'}`);

    const now = new Date();
    const expiryTime = new Date(now.getTime() + 20 * 60 * 1000); // 20 minutes from now

    const mockTrialResponse = {
      trial_id: `trial_${Date.now()}`, // Mock trial ID
      system_id: system_id,
      user_id: user_id || null,
      status: 'active',
      start_time: now.toISOString(),
      expiry_time: expiryTime.toISOString(),
      duration_seconds: 1200, // 20 minutes
      remaining_seconds: 1200,
      total_usage_minutes: 0,
      sessions_count: 0,
      features_used: [],
      message: 'Trial activated successfully (placeholder).',
    };

    return NextResponse.json(mockTrialResponse, { status: 200 });

  } catch (error) {
    console.error('Error in /api/trial/activate (placeholder):', error);
    let errorMessage = 'An unknown error occurred';
    if (error instanceof Error) {
        errorMessage = error.message;
    }
    return NextResponse.json({ error: 'Failed to activate trial (placeholder)', details: errorMessage }, { status: 500 });
  }
}
