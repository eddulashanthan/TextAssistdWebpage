-- Add expires_at column to licenses table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'licenses'
        AND column_name = 'expires_at'
    ) THEN
        ALTER TABLE public.licenses
        ADD COLUMN expires_at TIMESTAMP WITH TIME ZONE NULL;
    END IF;
END $$;

-- Enable pgcrypto extension if not already enabled (for gen_random_uuid())
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create license_usage table to log usage events
CREATE TABLE IF NOT EXISTS public.license_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    license_id UUID NOT NULL REFERENCES public.licenses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tracked_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    minutes_used NUMERIC NOT NULL CHECK (minutes_used > 0)
);

CREATE INDEX IF NOT EXISTS idx_license_usage_license_id ON public.license_usage(license_id);
CREATE INDEX IF NOT EXISTS idx_license_usage_user_id ON public.license_usage(user_id);

-- Conditionally alter minutes_used to NUMERIC if it's currently INTEGER
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'license_usage'
          AND column_name = 'minutes_used'
          AND (data_type = 'integer' OR data_type = 'int4') -- Check for integer or its alias
    ) THEN
        ALTER TABLE public.license_usage ALTER COLUMN minutes_used TYPE NUMERIC;
    END IF;
END $$;

-- Function to create a new license
DROP FUNCTION IF EXISTS public.create_license(UUID, INTEGER, TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION create_license(
    p_user_id UUID,
    p_hours INTEGER,
    p_transaction_id TEXT,
    p_payment_gateway TEXT,
    p_amount NUMERIC,
    p_currency TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    new_license_key TEXT;
    new_license_id UUID;
    v_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    new_license_key := gen_random_uuid()::TEXT;

    -- License expires 3 months from purchase_date (which defaults to NOW() on table DDL for new rows)
    v_expires_at := NOW() + INTERVAL '3 months';

    INSERT INTO public.licenses (
        key,
        user_id,
        hours_purchased,
        hours_remaining,
        status,
        expires_at -- Added expires_at
    ) VALUES (
        new_license_key,
        p_user_id,
        p_hours,
        p_hours,
        'active',
        v_expires_at -- Set expires_at
    ) RETURNING id INTO new_license_id;

    INSERT INTO public.transactions (
        user_id,
        license_id,
        payment_gateway,
        gateway_transaction_id,
        amount,
        currency,
        status
    ) VALUES (
        p_user_id,
        new_license_id,
        p_payment_gateway,
        p_transaction_id,
        p_amount,
        p_currency,
        'completed'
    );

    RETURN json_build_object(
        'success', true,
        'license_key', new_license_key,
        'license_id', new_license_id,
        'expires_at', TO_CHAR(v_expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), -- Return expires_at
        'message', 'License created successfully'
    );
END;
$$;

-- Function to validate a license
DROP FUNCTION IF EXISTS public.validate_license(TEXT, TEXT);
CREATE OR REPLACE FUNCTION validate_license(
    p_license_key TEXT,
    p_system_id TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    license_record public.licenses%ROWTYPE;
BEGIN
    SELECT * INTO license_record
    FROM public.licenses
    WHERE key = p_license_key;

    IF NOT FOUND THEN
        RETURN json_build_object('valid', false, 'message', 'License not found', 'reason', 'not_found');
    END IF;

    -- Check 1: Time-based expiry
    IF license_record.expires_at IS NOT NULL AND license_record.expires_at < NOW() THEN
        RETURN json_build_object('valid', false, 'message', 'License has expired (time-based).', 'status', 'expired', 'reason', 'time_expired', 'hours_remaining', license_record.hours_remaining, 'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    END IF;

    -- Check 2: Status (could have been set to 'expired' by time or usage, or 'revoked')
    IF license_record.status != 'active' THEN
        RETURN json_build_object('valid', false, 'message', 'License is ' || license_record.status, 'status', license_record.status, 'reason', 'status_inactive', 'hours_remaining', license_record.hours_remaining, 'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    END IF;

    -- Check 3: Hours remaining
    IF license_record.hours_remaining <= 0 THEN
        RETURN json_build_object('valid', false, 'message', 'No hours remaining.', 'status', 'expired', 'reason', 'hours_depleted', 'hours_remaining', 0, 'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    END IF;

    -- Check 4: System binding
    IF license_record.linked_system_id IS NULL THEN
        UPDATE public.licenses
        SET linked_system_id = p_system_id,
            last_validated_at = NOW()
        WHERE key = p_license_key
        RETURNING * INTO license_record; 
    ELSIF license_record.linked_system_id != p_system_id THEN
        RETURN json_build_object('valid', false, 'message', 'License is bound to a different system.', 'status', license_record.status, 'reason', 'system_mismatch', 'hours_remaining', license_record.hours_remaining, 'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    END IF;

    RETURN json_build_object(
        'valid', true,
        'hours_remaining', license_record.hours_remaining,
        'status', license_record.status,
        'linked_system_id', license_record.linked_system_id,
        'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'message', 'License valid'
    );
END;
$$;

-- Function to track usage
DROP FUNCTION IF EXISTS public.track_usage(TEXT, TEXT, NUMERIC); -- This drops the old version
CREATE OR REPLACE FUNCTION track_usage(
    p_license_key TEXT,
    p_system_id TEXT, -- Added system_id parameter
    p_minutes_used NUMERIC
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    license_record public.licenses;
    hours_to_deduct NUMERIC;
    new_status TEXT;
BEGIN
    -- Basic validation for p_minutes_used
    IF p_minutes_used <= 0 THEN
        RETURN json_build_object('success', false, 'message', 'Minutes used must be positive.', 'reason', 'invalid_input');
    END IF;

    -- Retrieve the license details
    SELECT * INTO license_record
    FROM public.licenses
    WHERE key = p_license_key;

    -- Check 1: License existence
    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'License not found.', 'reason', 'not_found');
    END IF;

    -- Check 1.1: System binding validation (NEW)
    IF license_record.linked_system_id IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'message', 'License not yet validated or linked to a system. Please validate first.',
            'status', license_record.status,
            'reason', 'not_validated'
        );
    ELSIF license_record.linked_system_id != p_system_id THEN
        RETURN json_build_object(
            'success', false,
            'message', 'License is bound to a different system.',
            'status', license_record.status,
            'reason', 'system_mismatch'
        );
    END IF;

    -- Check 2: License status (already expired by time or hours)
    IF license_record.status = 'expired' THEN
        RETURN json_build_object('success', false, 'message', 'License is already expired.', 'status', 'expired', 'reason', 'already_expired', 'hours_remaining', license_record.hours_remaining, 'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    END IF;

    -- Check 3: Time-based expiration
    IF license_record.expires_at IS NOT NULL AND license_record.expires_at < NOW() THEN
        UPDATE public.licenses
        SET status = 'expired'
        WHERE id = license_record.id
        RETURNING * INTO license_record; 

        RETURN json_build_object('success', false, 'message', 'License has expired (time-based).', 'status', 'expired', 'reason', 'time_expired', 'hours_remaining', license_record.hours_remaining, 'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    END IF;

    -- Check 4: Hours remaining (already depleted before this usage)
    IF license_record.hours_remaining <= 0 THEN
         UPDATE public.licenses
        SET status = 'expired'
        WHERE id = license_record.id
        RETURNING * INTO license_record;

        RETURN json_build_object('success', false, 'message', 'No hours remaining.', 'status', 'expired', 'reason', 'hours_depleted_prior', 'hours_remaining', 0, 'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
    END IF;

    hours_to_deduct := p_minutes_used / 60.0;
    new_status := license_record.status; -- Initialize with current status

    -- Update hours_remaining and status
    license_record.hours_remaining := license_record.hours_remaining - hours_to_deduct;

    IF license_record.hours_remaining <= 0 THEN
        license_record.hours_remaining := 0; -- Prevent negative hours
        new_status := 'expired';
    END IF;

    UPDATE public.licenses
    SET hours_remaining = license_record.hours_remaining,
        status = new_status,
        last_validated_at = CASE WHEN new_status = 'active' THEN NOW() ELSE last_validated_at END -- Optionally update last_validated_at if still active
    WHERE id = license_record.id
    RETURNING * INTO license_record; -- Get the updated record back

    -- Log usage to license_usage table (NEW)
    IF new_status = 'active' OR (new_status = 'expired' AND hours_to_deduct > 0) THEN -- Log if usage was attempted/occurred
        INSERT INTO public.license_usage (license_id, user_id, minutes_used)
        VALUES (license_record.id, license_record.user_id, p_minutes_used);
    END IF;

    IF new_status = 'expired' THEN
        RETURN json_build_object(
            'success', true, -- Still true as usage was processed, license just expired as a result
            'hours_remaining', license_record.hours_remaining,
            'status', new_status,
            'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'message', 'Usage tracked. License is now expired.'
        );
    ELSE
        RETURN json_build_object(
            'success', true,
            'hours_remaining', license_record.hours_remaining,
            'status', new_status,
            'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
            'message', 'Usage tracked successfully.'
        );
    END IF;
END;
$$;

-- Function to renew a license (updates existing license)
DROP FUNCTION IF EXISTS public.renew_license(TEXT, INTEGER, TEXT, TEXT, NUMERIC, TEXT);
CREATE OR REPLACE FUNCTION renew_license(
    p_old_license_key TEXT,
    p_hours_to_add INTEGER,
    p_transaction_id TEXT,
    p_payment_gateway TEXT,
    p_amount NUMERIC,
    p_currency TEXT
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    license_record public.licenses%ROWTYPE;
    v_new_expires_at TIMESTAMP WITH TIME ZONE;
BEGIN
    SELECT * INTO license_record
    FROM public.licenses
    WHERE key = p_old_license_key;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'License to renew not found.');
    END IF;

    v_new_expires_at := NOW() + INTERVAL '3 months';

    UPDATE public.licenses
    SET
        hours_remaining = GREATEST(0, hours_remaining) + p_hours_to_add,
        hours_purchased = hours_purchased + p_hours_to_add, 
        status = 'active',                                 
        purchase_date = NOW(), -- Consider if purchase_date should represent original or latest renewal
        last_validated_at = NULL, -- Reset last validation time
        expires_at = v_new_expires_at                      
    WHERE key = p_old_license_key
    RETURNING * INTO license_record;

    INSERT INTO public.transactions (
        user_id,
        license_id,
        payment_gateway,
        gateway_transaction_id,
        amount,
        currency,
        status
    ) VALUES (
        license_record.user_id,
        license_record.id,
        p_payment_gateway,
        p_transaction_id,
        p_amount,
        p_currency,
        'completed'
    );

    RETURN json_build_object(
        'success', true,
        'license_key', license_record.key,
        'hours_remaining', license_record.hours_remaining,
        'status', license_record.status,
        'expires_at', TO_CHAR(license_record.expires_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'message', 'License renewed successfully.'
    );
END;
$$;

--
-- Row Level Security (RLS) Policies
--

-- RLS for public.licenses table
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own licenses" ON public.licenses;
CREATE POLICY "Users can read their own licenses"
    ON public.licenses FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users cannot directly insert licenses" ON public.licenses;
CREATE POLICY "Users cannot directly insert licenses"
    ON public.licenses FOR INSERT
    WITH CHECK (false); -- Inserts handled by create_license function

DROP POLICY IF EXISTS "Users cannot directly update licenses" ON public.licenses;
CREATE POLICY "Users cannot directly update licenses"
    ON public.licenses FOR UPDATE
    USING (false); -- Updates handled by track_usage, renew_license functions

DROP POLICY IF EXISTS "Users cannot directly delete licenses" ON public.licenses;
CREATE POLICY "Users cannot directly delete licenses"
    ON public.licenses FOR DELETE
    USING (false);

-- RLS for public.transactions table
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own transactions" ON public.transactions;
CREATE POLICY "Users can read their own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users cannot directly insert transactions" ON public.transactions;
CREATE POLICY "Users cannot directly insert transactions"
    ON public.transactions FOR INSERT
    WITH CHECK (false); -- Inserts handled by create_license, renew_license functions

DROP POLICY IF EXISTS "Users cannot directly update transactions" ON public.transactions;
CREATE POLICY "Users cannot directly update transactions"
    ON public.transactions FOR UPDATE
    USING (false); -- Transactions are generally immutable

DROP POLICY IF EXISTS "Users cannot directly delete transactions" ON public.transactions;
CREATE POLICY "Users cannot directly delete transactions"
    ON public.transactions FOR DELETE
    USING (false);

-- RLS for public.license_usage table
ALTER TABLE public.license_usage ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read their own license usage" ON public.license_usage;
CREATE POLICY "Users can read their own license usage"
    ON public.license_usage FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users cannot directly insert license usage" ON public.license_usage;
CREATE POLICY "Users cannot directly insert license usage"
    ON public.license_usage FOR INSERT
    WITH CHECK (false); -- Inserts handled by track_usage function

DROP POLICY IF EXISTS "Users cannot directly update license usage" ON public.license_usage;
CREATE POLICY "Users cannot directly update license usage"
    ON public.license_usage FOR UPDATE
    USING (false); -- Usage logs are generally immutable

DROP POLICY IF EXISTS "Users cannot directly delete license usage" ON public.license_usage;
CREATE POLICY "Users cannot directly delete license usage"
    ON public.license_usage FOR DELETE
    USING (false);