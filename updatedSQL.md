## Functions:


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


#### Edit 'update_updated_at_column' function
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;


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

# Tables
create table public.activated_devices (
  id uuid not null default extensions.uuid_generate_v4 (),
  license_id uuid not null,
  device_id text not null,
  device_name text null,
  activated_at timestamp with time zone null default now(),
  last_seen_at timestamp with time zone null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint activated_devices_pkey primary key (id),
  constraint uq_license_device unique (license_id, device_id),
  constraint activated_devices_license_id_fkey foreign KEY (license_id) references licenses (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_activated_devices_license_id on public.activated_devices using btree (license_id) TABLESPACE pg_default;

create index IF not exists idx_activated_devices_device_id on public.activated_devices using btree (device_id) TABLESPACE pg_default;

create table public.license_usage (
  id uuid not null default extensions.uuid_generate_v4 (),
  license_id uuid not null,
  user_id uuid not null,
  minutes_used numeric not null,
  tracked_at timestamp with time zone not null default now(),
  constraint license_usage_pkey primary key (id),
  constraint license_usage_license_id_fkey foreign KEY (license_id) references licenses (id) on delete CASCADE,
  constraint license_usage_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_license_usage_license_id on public.license_usage using btree (license_id) TABLESPACE pg_default;

create index IF not exists idx_license_usage_user_id on public.license_usage using btree (user_id) TABLESPACE pg_default;

create table public.licenses (
  id uuid not null default extensions.uuid_generate_v4 (),
  key text not null,
  user_id uuid not null,
  hours_purchased integer not null,
  hours_remaining numeric not null,
  purchase_date timestamp with time zone not null default now(),
  last_validated_at timestamp with time zone null,
  linked_system_id text null,
  status text not null default 'active'::text,
  expires_at timestamp with time zone null,
  max_activations integer null default 1,
  constraint licenses_pkey primary key (id),
  constraint licenses_key_key unique (key),
  constraint licenses_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create table public.profiles (
  id uuid not null,
  username text null,
  name text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone null,
  constraint profiles_pkey primary key (id),
  constraint profiles_username_key unique (username),
  constraint profiles_id_fkey foreign KEY (id) references auth.users (id)
) TABLESPACE pg_default;

create table public.transactions (
  id uuid not null default extensions.uuid_generate_v4 (),
  user_id uuid not null,
  license_id uuid null,
  payment_gateway text not null,
  gateway_transaction_id text not null,
  amount numeric not null,
  currency text not null,
  status text not null,
  created_at timestamp with time zone not null default now(),
  constraint transactions_pkey primary key (id),
  constraint transactions_gateway_transaction_id_key unique (gateway_transaction_id),
  constraint transactions_license_id_fkey foreign KEY (license_id) references licenses (id),
  constraint transactions_user_id_fkey foreign KEY (user_id) references auth.users (id)
) TABLESPACE pg_default;

create table public.trials (
  id uuid not null default extensions.uuid_generate_v4 (),
  system_id text not null,
  user_id uuid null,
  status text not null default 'active'::text,
  start_time timestamp with time zone not null default now(),
  duration_seconds integer not null,
  expiry_time timestamp with time zone not null,
  last_seen_at timestamp with time zone null,
  total_usage_minutes integer null default 0,
  sessions_count integer null default 0,
  features_used jsonb null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint trials_pkey primary key (id),
  constraint trials_system_id_key unique (system_id),
  constraint trials_user_id_fkey foreign KEY (user_id) references auth.users (id) on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_trials_user_id on public.trials using btree (user_id) TABLESPACE pg_default;

create index IF not exists idx_trials_expiry_time on public.trials using btree (expiry_time) TABLESPACE pg_default;

create trigger trigger_trials_updated_at BEFORE
update on trials for EACH row
execute FUNCTION update_updated_at_column ();