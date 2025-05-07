import { NextResponse } from 'next/server';

// Mock data - replace with actual database queries
const mockUsageHistory = [
  { date: '2025-05-01', hours: 2.5 },
  { date: '2025-05-02', hours: 1.75 },
  { date: '2025-05-03', hours: 3.0 },
  { date: '2025-05-04', hours: 2.0 },
  { date: '2025-05-05', hours: 1.5 },
];

export async function GET(request: Request) {
  try {
    // Mock license status check - replace with actual check
    const url = new URL(request.url);
    const mockLicenseStatus = url.searchParams.get('mockStatus') || 'active';

    if (mockLicenseStatus === 'expired') {
      return NextResponse.json({
        success: false,
        licenseStatus: 'expired',
        message: 'License is expired'
      }, { status: 403 });
    }

    if (mockLicenseStatus === 'revoked') {
      return NextResponse.json({
        success: false,
        licenseStatus: 'revoked',
        message: 'License has been revoked'
      }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      hoursRemaining: 89.25,
      usageHistory: mockUsageHistory,
      licenseStatus: 'active'
    });
  } catch {
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}