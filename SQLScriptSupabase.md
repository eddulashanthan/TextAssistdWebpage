-- Create the licenses table
CREATE TABLE public.licenses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    key text UNIQUE NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id), -- Foreign key to Supabase Auth users table
    hours_purchased integer NOT NULL,
    hours_remaining numeric NOT NULL,
    purchase_date timestamp with time zone NOT NULL DEFAULT now(),
    last_validated_at timestamp with time zone,
    linked_system_id text,
    status text NOT NULL DEFAULT 'active' -- e.g., 'active', 'expired', 'revoked'
);

-- Optional: Add a comment to the table
COMMENT ON TABLE public.licenses IS 'Stores purchased software licenses.';

-- Create the transactions table
CREATE TABLE public.transactions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id), -- Foreign key to Supabase Auth users table
    license_id uuid REFERENCES public.licenses(id), -- Foreign key to licenses table (nullable if transaction fails before license issued)
    payment_gateway text NOT NULL, -- e.g., 'stripe', 'paypal'
    gateway_transaction_id text UNIQUE NOT NULL, -- Unique ID from the payment gateway
    amount numeric NOT NULL,
    currency text NOT NULL,
    status text NOT NULL, -- e.g., 'completed', 'failed'
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Optional: Add a comment to the table
COMMENT ON TABLE public.transactions IS 'Records payment transactions.';

-- Optional: Create the profiles table (if you need extra user info beyond auth.users)
CREATE TABLE public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id), -- Foreign key to Supabase Auth users table
    username text UNIQUE, -- Optional: if you want unique usernames
    name text,
    -- Add any other profile-specific columns here
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone
);

-- Optional: Add a comment to the table
COMMENT ON TABLE public.profiles IS 'Stores additional user profile information.';

-- Enable RLS for the licenses table
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

-- Enable RLS for the transactions table
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Optional: Enable RLS for the profiles table
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Licenses table policies
CREATE POLICY "Users can view their own licenses"
ON public.licenses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users cannot insert licenses directly"
ON public.licenses FOR INSERT
WITH CHECK (false);  -- Only backend functions should create licenses

-- Transactions table policies
CREATE POLICY "Users can view their own transactions"
ON public.transactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users cannot insert transactions directly"
ON public.transactions FOR INSERT
WITH CHECK (false);  -- Only backend functions should create transactions

-- Profiles table policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);
-- Testing
SELECT tablename
FROM pg_tables
WHERE schemaname = 'public';

-- \d public.licenses
-- Or, for a more standard SQL approach:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'licenses';

-- \d public.transactions
-- Or:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'transactions';

-- \d public.profiles
-- Or:
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'profiles';

SELECT relname, relrowsecurity
FROM pg_class R
JOIN pg_namespace N ON (N.oid = R.relnamespace)
WHERE nspname = 'public' AND relname IN ('licenses', 'transactions', 'profiles'); -- Include 'profiles' if you created it

-- Function to validate a license
CREATE OR REPLACE FUNCTION validate_license(
    license_key TEXT,
    system_id TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    license_record public.licenses%ROWTYPE;
    result json;
BEGIN
    -- Get the license record
    SELECT * INTO license_record
    FROM public.licenses
    WHERE key = license_key;

    -- Check if license exists
    IF NOT FOUND THEN
        RETURN json_build_object(
            'valid', false,
            'message', 'License not found'
        );
    END IF;

    -- Check if license is active
    IF license_record.status != 'active' THEN
        RETURN json_build_object(
            'valid', false,
            'message', 'License is ' || license_record.status
        );
    END IF;

    -- Check hours remaining
    IF license_record.hours_remaining <= 0 THEN
        RETURN json_build_object(
            'valid', false,
            'message', 'No hours remaining'
        );
    END IF;

    -- Check system binding
    IF license_record.linked_system_id IS NULL THEN
        -- First use - bind to this system
        UPDATE public.licenses
        SET linked_system_id = system_id,
            last_validated_at = NOW()
        WHERE key = license_key;
    ELSIF license_record.linked_system_id != system_id THEN
        RETURN json_build_object(
            'valid', false,
            'message', 'License is bound to different system'
        );
    END IF;

    RETURN json_build_object(
        'valid', true,
        'hours_remaining', license_record.hours_remaining,
        'message', 'License valid'
    );
END;
$$;

-- Function to track usage
CREATE OR REPLACE FUNCTION track_usage(
    license_key TEXT,
    minutes_used NUMERIC
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    license_record public.licenses%ROWTYPE;
    hours_used NUMERIC;
BEGIN
    -- Convert minutes to hours
    hours_used := minutes_used / 60.0;

    -- Get and update license record
    UPDATE public.licenses
    SET hours_remaining = GREATEST(0, hours_remaining - hours_used)
    WHERE key = license_key
    AND status = 'active'
    RETURNING * INTO license_record;

    -- Check if update succeeded
    IF NOT FOUND THEN
        RETURN json_build_object(
            'success', false,
            'message', 'License not found or inactive'
        );
    END IF;

    -- Check if license has expired due to this usage
    IF license_record.hours_remaining = 0 THEN
        UPDATE public.licenses
        SET status = 'expired'
        WHERE key = license_key;
    END IF;

    RETURN json_build_object(
        'success', true,
        'hours_remaining', license_record.hours_remaining,
        'message', 'Usage tracked successfully'
    );
END;
$$;

-- Function to create a new license
CREATE OR REPLACE FUNCTION create_license(
    user_id UUID,
    hours INTEGER,
    transaction_id TEXT,
    payment_gateway TEXT,
    amount NUMERIC,
    currency TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_license_key TEXT;
    new_license_id UUID;
BEGIN
    -- Generate a new UUID for the license key
    new_license_key := gen_random_uuid()::TEXT;
    
    -- Create the license
    INSERT INTO public.licenses (
        key,
        user_id,
        hours_purchased,
        hours_remaining,
        status
    ) VALUES (
        new_license_key,
        user_id,
        hours,
        hours,
        'active'
    ) RETURNING id INTO new_license_id;

    -- Record the transaction
    INSERT INTO public.transactions (
        user_id,
        license_id,
        payment_gateway,
        gateway_transaction_id,
        amount,
        currency,
        status
    ) VALUES (
        user_id,
        new_license_id,
        payment_gateway,
        transaction_id,
        amount,
        currency,
        'completed'
    );

    RETURN json_build_object(
        'success', true,
        'license_key', new_license_key,
        'message', 'License created successfully'
    );
END;
$$;

-- Add license renewal function
CREATE OR REPLACE FUNCTION renew_license(
    old_license_key TEXT,
    hours INTEGER,
    transaction_id TEXT,
    payment_gateway TEXT,
    amount NUMERIC,
    currency TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    old_license public.licenses%ROWTYPE;
    new_license_key TEXT;
BEGIN
    -- Get old license
    SELECT * INTO old_license 
    FROM public.licenses 
    WHERE key = old_license_key;

    -- Generate new license
    new_license_key := gen_random_uuid()::TEXT;
    
    -- Create new license with same system binding
    INSERT INTO public.licenses (
        key,
        user_id,
        hours_purchased,
        hours_remaining,
        linked_system_id,
        status
    ) VALUES (
        new_license_key,
        old_license.user_id,
        hours,
        hours,
        old_license.linked_system_id,
        'active'
    );

    RETURN json_build_object(
        'success', true,
        'new_license_key', new_license_key,
        'message', 'License renewed successfully'
    );
END;
$$;

-- First, let's check existing users
SELECT id, email 
FROM auth.users 
LIMIT 5;

-- Add test data section after existing policies
-- Test license creation with existing user
SELECT create_license(
    'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid,  -- Your existing user ID
    10,                                             -- Hours purchased
    'test-transaction-1',                           -- Transaction ID
    'stripe',                                       -- Payment gateway
    49.99,                                          -- Amount
    'USD'                                          -- Currency
);

-- Verify the license was created
SELECT * FROM public.licenses 
WHERE user_id = 'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid;

-- Get the license key for testing (save this for next steps)
SELECT key FROM public.licenses 
WHERE user_id = 'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid
ORDER BY purchase_date DESC 
LIMIT 1;

-- Test validate_license (replace LICENSE_KEY with value from previous query)
SELECT validate_license(
    '16debc92-3364-4b3c-9982-010e245fd862',           -- Replace with actual license key from previous query
    'MACBOOK-PRO-TEST-001'  -- Test system ID
);

-- Test track_usage (use same license key)
SELECT track_usage(
    '16debc92-3364-4b3c-9982-010e245fd862',          -- Replace with same license key
    30                      -- Test with 30 minutes usage
);

-- Check current license status
SELECT 
    key,
    hours_purchased,
    hours_remaining,
    status,
    last_validated_at
FROM public.licenses 
WHERE user_id = 'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid
ORDER BY purchase_date DESC 
LIMIT 1;

-- Track additional 30 minutes usage
SELECT track_usage(
    '16debc92-3364-4b3c-9982-010e245fd862',  -- Replace with your actual license key
    30
);

-- Verify updated hours
SELECT 
    hours_remaining,
    status
FROM public.licenses 
WHERE key = '16debc92-3364-4b3c-9982-010e245fd862';

-- current status verification Check detailed license status
SELECT 
    key,
    hours_purchased,
    hours_remaining,
    status,
    last_validated_at,
    linked_system_id
FROM public.licenses 
WHERE user_id = 'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid
AND hours_remaining = 9;

-- Test 1: Try using more hours than remaining
SELECT track_usage(
    '16debc92-3364-4b3c-9982-010e245fd862',  -- Replace with your actual license key
    540                  -- 9 hours = 540 minutes
);

-- Test 2: Verify system binding
SELECT validate_license(
    '16debc92-3364-4b3c-9982-010e245fd862',
    'DIFFERENT-SYSTEM-ID'  -- Should fail if trying different system ID
);

-- Test 3: Check transaction history
SELECT 
    t.created_at,
    t.amount,
    t.currency,
    l.hours_remaining
FROM public.transactions t
JOIN public.licenses l ON t.license_id = l.id
WHERE l.user_id = 'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid
ORDER BY t.created_at DESC;

-- Add verification queries
-- Check final license state
SELECT 
    key,
    hours_purchased,
    hours_remaining,
    status,
    linked_system_id
FROM public.licenses 
WHERE user_id = 'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid;

-- Check usage history through transactions
SELECT 
    l.key as license_key,
    t.created_at,
    t.amount,
    t.currency,
    l.hours_remaining,
    l.status
FROM public.transactions t
JOIN public.licenses l ON t.license_id = l.id
WHERE l.user_id = 'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid
ORDER BY t.created_at DESC;

-- Create new license for same user
SELECT create_license(
    'd7bed83f-3291-4a2f-9041-7c3833788352'::uuid,
    10,
    'renewal-transaction-1',
    'stripe',
    49.99,
    'USD'
);

SELECT 
    tablename, 
    obj_description(pgclass.oid) as description 
FROM pg_catalog.pg_tables 
JOIN pg_class pgclass ON tablename = pgclass.relname 
WHERE schemaname = 'public';