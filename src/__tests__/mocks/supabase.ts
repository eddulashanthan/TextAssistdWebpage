type MockData = {
  [key: string]: any;
} | null;

let storedData: MockData = null;

// Create a proper mock response that matches Supabase's expectations
const createResponse = (data: any = null, error: any = null) => {
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
      _filterValue: null as any,
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockImplementation(function (this: any, key, value) {
        this._filterKey = key;
        this._filterValue = value;
        return this;
      }),
      single: jest.fn().mockImplementation(function (this: any) {
        // Only support the 'licenses' table for now
        if (table !== 'licenses') return createResponse(null);
        if (!storedData) return createResponse(null);
        if (this._filterKey && storedData[this._filterKey] !== this._filterValue) return createResponse(null);
        return createResponse(storedData);
      }),
      update: jest.fn().mockReturnThis()
    };
  }),
  rpc: jest.fn().mockImplementation((funcName: string, params: any) => {
    if (!storedData) {
      return createResponse(null, { message: 'Not found', code: 'PGRST116' });
    }

    if (funcName === 'validate_license') {
      const isValid = params.license_key === storedData.key;
      if (!isValid) {
        return createResponse({ valid: false, message: 'License not found' });
      }
      // Simulate SQL logic: check status, hours_remaining, and system binding
      if (storedData.status !== 'active') {
        return createResponse({ valid: false, message: `License is ${storedData.status}` });
      }
      if (storedData.hours_remaining <= 0) {
        return createResponse({ valid: false, message: 'No hours remaining' });
      }
      if (storedData.linked_system_id && storedData.linked_system_id !== params.system_id) {
        return createResponse({ valid: false, message: 'License is bound to different system' });
      }
      // Simulate system binding
      if (!storedData.linked_system_id) {
        storedData.linked_system_id = params.system_id;
      }
      return createResponse({
        valid: true,
        hours_remaining: storedData.hours_remaining,
        message: 'License valid'
      });
    }

    if (funcName === 'track_usage') {
      const hoursUsed = params.minutes_used / 60;
      if (storedData.status !== 'active') {
        return createResponse({ success: false, message: 'License not found or inactive', hours_remaining: storedData.hours_remaining });
      }
      if (storedData.hours_remaining < hoursUsed) {
        return createResponse({ success: false, message: 'Insufficient hours remaining', hours_remaining: storedData.hours_remaining });
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