interface MockLicense {
  id: string;
  key: string;
  status: 'active' | 'expired' | 'revoked';
  hours_remaining: number;
  linked_system_id?: string | null;
  last_validated_at?: string | null;
}

type MockData = MockLicense | null;

let storedData: MockData = null;

// Create a proper mock response that matches Supabase's expectations
const createResponse = (data: unknown = null, error: unknown = null) => {
  const responseData = { data, error };
  const responseText = JSON.stringify(responseData);
  
  return Promise.resolve({
    data,
    error,
    status: error ? 400 : 200,
    statusText: error ? 'Error' : 'OK',
    ok: !error,
    text: () => Promise.resolve(responseText),
    json: () => Promise.resolve(responseData)
  });
};

interface FilterBuilder {
  _filterKey: string | null;
  _filterValue: unknown;
  select(): FilterBuilder;
  eq(key: string, value: unknown): FilterBuilder;
  single(): Promise<ReturnType<typeof createResponse>>;
  update(data: Partial<MockLicense>): FilterBuilder;
}

export const mockSupabase = {
  from: jest.fn().mockImplementation((table: string): FilterBuilder => {
    return {
      _filterKey: null,
      _filterValue: null,
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockImplementation(function(this: FilterBuilder, key: string, value: unknown) {
        this._filterKey = key;
        this._filterValue = value;
        return this;
      }),
      single: jest.fn().mockImplementation(function(this: FilterBuilder) {
        if (table !== 'licenses') return createResponse(null);
        if (!storedData) return createResponse(null);
        if (this._filterKey && storedData[this._filterKey as keyof MockLicense] !== this._filterValue) {
          return createResponse(null);
        }
        return createResponse(storedData);
      }),
      update: jest.fn().mockReturnThis()
    };
  }),
  rpc: jest.fn().mockImplementation((funcName: string, params: Record<string, unknown>) => {
    if (!storedData) {
      return createResponse(null, { message: 'Not found', code: 'PGRST116' });
    }

    if (funcName === 'validate_license') {
      const isValid = params.license_key === storedData.key;
      if (!isValid) {
        return createResponse({ valid: false, message: 'License not found' });
      }
      if (storedData.status !== 'active') {
        return createResponse({ valid: false, message: `License is ${storedData.status}` });
      }
      if (storedData.hours_remaining <= 0) {
        return createResponse({ valid: false, message: 'No hours remaining' });
      }
      if (storedData.linked_system_id && storedData.linked_system_id !== params.system_id) {
        return createResponse({ valid: false, message: 'License is bound to different system' });
      }
      if (!storedData.linked_system_id) {
        storedData.linked_system_id = params.system_id as string;
      }
      return createResponse({
        valid: true,
        hours_remaining: storedData.hours_remaining,
        message: 'License valid'
      });
    }

    if (funcName === 'track_usage') {
      const hoursUsed = (params.minutes_used as number) / 60;
      if (storedData.status === 'revoked') {
        return createResponse({ 
          success: false, 
          message: 'License is revoked', 
          hours_remaining: storedData.hours_remaining 
        });
      }
      if (storedData.status !== 'active') {
        return createResponse({ 
          success: false, 
          message: 'License not found or inactive', 
          hours_remaining: storedData.hours_remaining 
        });
      }
      if (storedData.hours_remaining < hoursUsed) {
        return createResponse({ 
          success: false, 
          message: 'Insufficient hours remaining', 
          hours_remaining: storedData.hours_remaining 
        });
      }
      storedData.hours_remaining = Math.max(0, storedData.hours_remaining - hoursUsed);
      if (storedData.hours_remaining === 0) {
        storedData.status = 'expired';
      }
      return createResponse({
        success: true,
        hours_remaining: storedData.hours_remaining,
        message: 'Usage tracked successfully'
      });
    }

    return createResponse(null, { message: 'Function not found', code: 'PGRST116' });
  })
};

export const setMockData = (data: MockData) => {
  storedData = data;
};

// Mock the Supabase module
jest.mock('@/lib/utils/supabase', () => ({
  supabase: mockSupabase
}));