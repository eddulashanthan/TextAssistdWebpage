import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  return NextResponse.json(
    { error: 'This endpoint is deprecated. Please use /api/licenses/track-usage instead.' },
    { status: 410 } // 410 Gone status code
  );
}