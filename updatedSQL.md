-- Drop the old track_usage function if it exists and you are fully replacing it.
-- DROP FUNCTION IF EXISTS public.track_usage(text, numeric);

CREATE OR REPLACE FUNCTION public.record_license_usage(
    p_license_key text,
    p_system_id text,
    p_minutes_used integer
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    license_record public.licenses%ROWTYPE;
    hours_to_decrement NUMERIC;
    final_hours_remaining NUMERIC;
    final_license_status TEXT; -- Changed to TEXT
BEGIN
    SELECT * INTO license_record
    FROM public.licenses
    WHERE key = p_license_key;

    IF NOT FOUND THEN
        RETURN json_build_object('success', false, 'message', 'License not found', 'hours_remaining', null, 'status', null);
    END IF;

    IF license_record.status != 'active' THEN -- Assuming TEXT
        RETURN json_build_object('success', false, 'message', 'License is not active. Status: ' || license_record.status, 'hours_remaining', license_record.hours_remaining, 'status', license_record.status);
    END IF;

    IF license_record.linked_system_id IS NULL THEN
        RETURN json_build_object('success', false, 'message', 'License not yet linked to any system. Please validate first.', 'hours_remaining', license_record.hours_remaining, 'status', license_record.status);
    ELSIF license_record.linked_system_id != p_system_id THEN
        RETURN json_build_object('success', false, 'message', 'License is linked to a different system.', 'hours_remaining', license_record.hours_remaining, 'status', license_record.status);
    END IF;
    
    IF license_record.hours_remaining <= 0 THEN
        RETURN json_build_object('success', false, 'message', 'No hours remaining on this license.', 'hours_remaining', 0, 'status', 'expired'); -- Assuming TEXT
    END IF;

    hours_to_decrement := p_minutes_used / 60.0;
    final_hours_remaining := GREATEST(0, license_record.hours_remaining - hours_to_decrement);
    
    IF final_hours_remaining = 0 THEN
        final_license_status := 'expired'; -- Assuming TEXT
    ELSE
        final_license_status := license_record.status; 
    END IF;

    UPDATE public.licenses
    SET hours_remaining = final_hours_remaining,
        status = final_license_status, -- Assigning TEXT
        last_validated_at = NOW()
    WHERE id = license_record.id;

    INSERT INTO public.license_usage (license_id, user_id, minutes_used, tracked_at)
    VALUES (license_record.id, license_record.user_id, p_minutes_used, NOW());

    RETURN json_build_object(
        'success', true,
        'message', 'Usage tracked successfully.',
        'hours_remaining', final_hours_remaining,
        'status', final_license_status
    );
EXCEPTION
    WHEN OTHERS THEN
        RAISE;
END;
$function$;

-- Drop the existing policy that allows users to insert their own usage
DROP POLICY IF EXISTS "Users can insert their own usage" ON public.license_usage;

-- Create a new policy to block direct inserts to license_usage
-- All inserts should go through the record_license_usage SECURITY DEFINER function
CREATE POLICY "Block direct inserts to license_usage"
ON public.license_usage
FOR INSERT
WITH CHECK (false);

-- Ensure the SELECT policy is still in place (it should be, but good to verify)
-- The previous check showed: "Users can view their own usage" (user_id = auth.uid()) FOR SELECT
-- If it's missing, you can add it:
-- CREATE POLICY "Users can view their own usage"
-- ON public.license_usage
-- FOR SELECT
-- USING (auth.uid() = user_id);
---
CREATE OR REPLACE FUNCTION public.validate_license(
    license_key text,  -- Original name
    system_id text     -- Original name
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    license_record public.licenses%ROWTYPE;
BEGIN
    -- Get the license record
    SELECT * INTO license_record
    FROM public.licenses
    WHERE key = license_key; -- Use original parameter name

    -- Check if license exists
    IF NOT FOUND THEN
        RETURN json_build_object(
            'valid', false,
            'message', 'License not found',
            'status', null,
            'hours_remaining', null,
            'expires_at', null
        );
    END IF;

    -- Check if license is active
    IF license_record.status != 'active' THEN
        RETURN json_build_object(
            'valid', false,
            'message', 'License is ' || license_record.status,
            'status', license_record.status,
            'hours_remaining', license_record.hours_remaining,
            'expires_at', license_record.expires_at
        );
    END IF;

    -- Check hours remaining
    IF license_record.hours_remaining <= 0 THEN
        -- Optionally, ensure status is 'expired' if hours are zero but status isn't.
        IF license_record.status = 'active' THEN
             UPDATE public.licenses SET status = 'expired' WHERE id = license_record.id;
             license_record.status := 'expired'; -- reflect change in current record
        END IF;
        RETURN json_build_object(
            'valid', false,
            'message', 'No hours remaining',
            'status', license_record.status,
            'hours_remaining', license_record.hours_remaining,
            'expires_at', license_record.expires_at
        );
    END IF;

    -- Check system binding
    IF license_record.linked_system_id IS NULL THEN
        -- First use - bind to this system and update last_validated_at
        UPDATE public.licenses
        SET linked_system_id = system_id, -- Use original parameter name
            last_validated_at = NOW()
        WHERE id = license_record.id;
    ELSIF license_record.linked_system_id != system_id THEN -- Use original parameter name
        RETURN json_build_object(
            'valid', false,
            'message', 'License is bound to a different system',
            'status', license_record.status,
            'hours_remaining', license_record.hours_remaining,
            'expires_at', license_record.expires_at
        );
    ELSE
        -- License is active, linked to the correct system, and has hours. Update last_validated_at.
        UPDATE public.licenses
        SET last_validated_at = NOW()
        WHERE id = license_record.id;
    END IF;
    
    RETURN json_build_object(
        'valid', true,
        'message', 'License valid',
        'hours_remaining', license_record.hours_remaining,
        'status', license_record.status, 
        'expires_at', license_record.expires_at
    );
END;
$function$;

COMMENT ON FUNCTION public.validate_license IS 'Validates a license key and system ID. Binds system on first use. Updates last_validated_at on successful validation. Returns detailed status.';

---
CREATE OR REPLACE FUNCTION public.create_license(
    user_id uuid,         -- Original name
    hours integer,        -- Original name
    transaction_id text,  -- Original name
    payment_gateway text, -- Original name
    amount numeric,       -- Original name
    currency text         -- Original name
)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    existing_transaction public.transactions%ROWTYPE;
    existing_license_key TEXT;
    new_license_key TEXT;
    new_license_id UUID;
BEGIN
    -- Check if a transaction with this gateway_transaction_id already exists for the payment_gateway
    SELECT * INTO existing_transaction
    FROM public.transactions t
    WHERE t.gateway_transaction_id = transaction_id -- Use original parameter name
      AND t.payment_gateway = payment_gateway;     -- Use original parameter name

    IF FOUND THEN
        -- Transaction already exists, fetch the associated license key
        SELECT l.key INTO existing_license_key
        FROM public.licenses l
        WHERE l.id = existing_transaction.license_id;

        RETURN json_build_object(
            'success', true,
            'license_key', existing_license_key,
            'message', 'License already created for this transaction (idempotent)'
        );
    END IF;

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
        user_id, -- Use original parameter name
        hours,   -- Use original parameter name
        hours,   -- Initialize hours_remaining with hours_purchased
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
        user_id,         -- Use original parameter name
        new_license_id,
        payment_gateway, -- Use original parameter name
        transaction_id,  -- Use original parameter name
        amount,          -- Use original parameter name
        currency,        -- Use original parameter name
        'completed'
    );

    RETURN json_build_object(
        'success', true,
        'license_key', new_license_key,
        'message', 'License created successfully'
    );
EXCEPTION
    WHEN unique_violation THEN
        -- This handles a race condition if another process created the transaction
        -- just after our check. We re-check and return existing if that's the case.
        SELECT * INTO existing_transaction
        FROM public.transactions t
        WHERE t.gateway_transaction_id = transaction_id -- Use original parameter name
          AND t.payment_gateway = payment_gateway;     -- Use original parameter name

        IF FOUND THEN
            SELECT l.key INTO existing_license_key
            FROM public.licenses l
            WHERE l.id = existing_transaction.license_id;

            RETURN json_build_object(
                'success', true,
                'license_key', existing_license_key,
                'message', 'License already created for this transaction (idempotent - race condition handled)'
            );
        ELSE
            -- If transaction still not found after unique violation on something else, re-raise.
            RAISE; 
        END IF;
    WHEN OTHERS THEN
        -- Log error or handle as needed
        RAISE; -- Re-raise the exception
END;
$function$;

COMMENT ON FUNCTION public.create_license IS 'Creates a new license and records the transaction. Idempotent based on gateway_transaction_id and payment_gateway.';