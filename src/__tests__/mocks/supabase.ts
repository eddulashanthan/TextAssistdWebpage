type MockData = {
  [key: string]: unknown;
} | null;

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

// Create mock builders that maintain chainability
const createFilterBuilder = (data: any = null) => ({
  eq: jest.fn().mockReturnThis(),
  single: jest.fn().mockImplementation(() => createResponse(data))
});

const createBuilder = (data: any = null) => {
  // Store filter state per builder instance
  const builder = {
    _filterKey: null as string | null,
    _filterValue: null as any,
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockImplementation(function (this: any, key, value) {
      this._filterKey = key;
      this._filterValue = value;
      return this;
    }),
    single: jest.fn().mockImplementation(function (this: any) {
      if (!data) return createResponse(null);
      if (this._filterKey && data[this._filterKey] !== this._filterValue) return createResponse(null);
      return createResponse(data);
    }),
    update: jest.fn().mockReturnThis()
  };
  return builder;
};

export const mockSupabase = {
  from: jest.fn().mockImplementation((table: string) => {
    return {
      _filterKey: null as string | null,
      _filterValue: null as unknown,
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockImplementation(function (this: any, key: string, value: unknown) {
        this._filterKey = key;
        this._filterValue = value;
        return this;
      }),
      single: jest.fn().mockImplementation(function (this: any) {
        // Only support the 'licenses' table for now
        if (table !== 'licenses') return createResponse(null);
        if (!storedData) return createResponse(null);
        if (this._filterKey && (storedData as any)[this._filterKey] !== this._filterValue) return createResponse(null);
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
      const isValid = params.license_key === (storedData as any).key;
      if (!isValid) {
        return createResponse({ valid: false, message: 'License not found' });
      }
      // Simulate SQL logic: check status, hours_remaining, and system binding
      if ((storedData as any).status !== 'active') {
        return createResponse({ valid: false, message: `License is ${(storedData as any).status}` });
      }
      if ((storedData as any).hours_remaining <= 0) {
        return createResponse({ valid: false, message: 'No hours remaining' });
      }
      if ((storedData as any).linked_system_id && (storedData as any).linked_system_id !== params.system_id) {
        return createResponse({ valid: false, message: 'License is bound to different system' });
      }
      // Simulate system binding
      if (!(storedData as any).linked_system_id) {
        (storedData as any).linked_system_id = params.system_id;
      }
      return createResponse({
        valid: true,
        hours_remaining: (storedData as any).hours_remaining,
        message: 'License valid'
      });
    }

    if (funcName === 'track_usage') {
      const hoursUsed = (params.minutes_used as number) / 60;
      if ((storedData as any).status !== 'active') {
        return createResponse({ success: false, message: 'License not found or inactive', hours_remaining: (storedData as any).hours_remaining });
      }
      if ((storedData as any).hours_remaining < hoursUsed) {
        return createResponse({ success: false, message: 'Insufficient hours remaining', hours_remaining: (storedData as any).hours_remaining });
      }
      (storedData as any).hours_remaining = Math.max(0, (storedData as any).hours_remaining - hoursUsed);
      if ((storedData as any).hours_remaining === 0) {
        (storedData as any).status = 'expired';
      }
      return createResponse({
        success: true,
        hours_remaining: (storedData as any).hours_remaining,
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