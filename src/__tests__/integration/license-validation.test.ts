jest.mock('@/lib/utils/supabase', () => ({
  supabase: require('../mocks/supabase').mockSupabase
}));

import { NextRequest } from 'next/server';
import { POST as validateLicense } from '@/app/api/licenses/validate/route';
import { POST as trackUsage } from '@/app/api/licenses/track-usage/route';
import { setMockData } from '../mocks/supabase';

describe('License API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setMockData(null);
  });

  describe('POST /api/licenses/validate', () => {
    it('should validate a valid license key', async () => {
      setMockData({
        id: '123',
        key: 'valid-key',
        status: 'active',
        hours_remaining: 100,
        last_validated_at: '2023-01-01'
      });

      const req = new NextRequest('http://localhost/api/licenses/validate', {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: 'valid-key',
          systemId: 'system-1'
        })
      });

      const res = await validateLicense(req);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data).toHaveProperty('valid', true);
      expect(data).toHaveProperty('message', 'License validated successfully');
      expect(data.license).toHaveProperty('hoursRemaining', 100);
    });

    it('should reject an invalid license key', async () => {
      setMockData(null);

      const req = new NextRequest('http://localhost/api/licenses/validate', {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: 'invalid-key',
          systemId: 'system-1'
        })
      });

      const res = await validateLicense(req);
      expect(res.status).toBe(404);
      
      const data = await res.json();
      expect(data).toEqual({
        error: 'Invalid license key'
      });
    });

    it('should handle missing parameters', async () => {
      const req = new NextRequest('http://localhost/api/licenses/validate', {
        method: 'POST',
        body: JSON.stringify({})
      });

      const res = await validateLicense(req);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data).toEqual({
        error: 'License key and system ID are required'
      });
    });

    it('should handle expired license', async () => {
      setMockData({
        id: '123',
        key: 'expired-key',
        status: 'expired',
        hours_remaining: 0,
        last_validated_at: '2023-01-01'
      });

      const req = new NextRequest('http://localhost/api/licenses/validate', {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: 'expired-key',
          systemId: 'system-1'
        })
      });

      const res = await validateLicense(req);
      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data).toEqual({
        error: 'License is expired'
      });
    });

    it('should handle system ID binding correctly', async () => {
      setMockData({
        id: '123',
        key: 'bound-key',
        status: 'active',
        hours_remaining: 100,
        linked_system_id: 'existing-system',
        last_validated_at: '2023-01-01'
      });

      const req = new NextRequest('http://localhost/api/licenses/validate', {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: 'bound-key',
          systemId: 'different-system'
        })
      });

      const res = await validateLicense(req);
      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data).toEqual({
        error: 'License is linked to another system'
      });
    });

    it('should bind system ID on first validation', async () => {
      setMockData({
        id: '123',
        key: 'new-key',
        status: 'active',
        hours_remaining: 100,
        linked_system_id: null,
        last_validated_at: null
      });

      const req = new NextRequest('http://localhost/api/licenses/validate', {
        method: 'POST',
        body: JSON.stringify({
          licenseKey: 'new-key',
          systemId: 'new-system'
        })
      });

      const res = await validateLicense(req);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data.valid).toBe(true);
      expect(data.message).toBe('License validated successfully');
    });
  });

  describe('POST /api/licenses/track-usage', () => {
    it('should track usage successfully', async () => {
      setMockData({
        id: '123',
        key: 'valid-key',
        status: 'active',
        hours_remaining: 100
      });

      const req = new NextRequest('http://localhost/api/licenses/track-usage', {
        method: 'POST',
        body: JSON.stringify({
          licenseId: '123',
          hoursUsed: 0.5
        })
      });

      const res = await trackUsage(req);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data).toEqual({
        success: true,
        hoursRemaining: 99.5,
        message: 'Usage tracked successfully'
      });
    });

    it('should reject when insufficient hours remaining', async () => {
      setMockData({
        id: '123',
        key: 'valid-key',
        status: 'active',
        hours_remaining: 0.2
      });

      const req = new NextRequest('http://localhost/api/licenses/track-usage', {
        method: 'POST',
        body: JSON.stringify({
          licenseId: '123',
          hoursUsed: 0.5
        })
      });

      const res = await trackUsage(req);
      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data).toEqual({
        error: 'Insufficient hours remaining'
      });
    });

    it('should handle invalid license ID', async () => {
      setMockData(null);

      const req = new NextRequest('http://localhost/api/licenses/track-usage', {
        method: 'POST',
        body: JSON.stringify({
          licenseId: 'invalid-id',
          hoursUsed: 0.5
        })
      });

      const res = await trackUsage(req);
      expect(res.status).toBe(404);
      
      const data = await res.json();
      expect(data).toEqual({
        error: 'License not found'
      });
    });

    it('should handle decimal hour values correctly', async () => {
      setMockData({
        id: '123',
        key: 'valid-key',
        status: 'active',
        hours_remaining: 1.5
      });

      const req = new NextRequest('http://localhost/api/licenses/track-usage', {
        method: 'POST',
        body: JSON.stringify({
          licenseId: '123',
          hoursUsed: 0.25
        })
      });

      const res = await trackUsage(req);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data).toEqual({
        success: true,
        hoursRemaining: 1.25,
        message: 'Usage tracked successfully'
      });
    });

    it('should handle exact remaining hours usage', async () => {
      setMockData({
        id: '123',
        key: 'valid-key',
        status: 'active',
        hours_remaining: 1.0
      });

      const req = new NextRequest('http://localhost/api/licenses/track-usage', {
        method: 'POST',
        body: JSON.stringify({
          licenseId: '123',
          hoursUsed: 1.0
        })
      });

      const res = await trackUsage(req);
      expect(res.status).toBe(200);
      
      const data = await res.json();
      expect(data).toEqual({
        success: true,
        hoursRemaining: 0,
        message: 'Usage tracked successfully'
      });
    });

    it('should reject negative usage values', async () => {
      setMockData({
        id: '123',
        key: 'valid-key',
        status: 'active',
        hours_remaining: 10
      });

      const req = new NextRequest('http://localhost/api/licenses/track-usage', {
        method: 'POST',
        body: JSON.stringify({
          licenseId: '123',
          hoursUsed: -1
        })
      });

      const res = await trackUsage(req);
      expect(res.status).toBe(400);
      
      const data = await res.json();
      expect(data).toEqual({
        error: 'Hours used must be a positive number'
      });
    });

    it('should handle revoked license', async () => {
      setMockData({
        id: '123',
        key: 'valid-key',
        status: 'revoked',
        hours_remaining: 10
      });

      const req = new NextRequest('http://localhost/api/licenses/track-usage', {
        method: 'POST',
        body: JSON.stringify({
          licenseId: '123',
          hoursUsed: 1
        })
      });

      const res = await trackUsage(req);
      expect(res.status).toBe(403);
      
      const data = await res.json();
      expect(data).toEqual({
        error: 'License is revoked'
      });
    });
  });
});