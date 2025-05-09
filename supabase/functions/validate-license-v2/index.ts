// supabase/functions/validate-license-v2/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Define types for clarity (optional but good practice)
interface LicenseValidationRequest {
  licenseKey: string;
  deviceId: string;
}

interface LicenseRecord {
  id: string;
  status: string; // Adjust based on your actual license_status enum values
  max_activations: number | null;
  hours_remaining: number | null; // Or other relevant fields
  license_type: string | null;
}

interface ActivatedDeviceRecord {
  id: string;
  last_seen_at: string;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // TODO: Restrict this in production!
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS', // Specify allowed methods
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { licenseKey, deviceId } = await req.json() as LicenseValidationRequest;

    if (!licenseKey || !deviceId) {
      return new Response(JSON.stringify({ error: 'licenseKey and deviceId are required' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey);

    // 1. Fetch license details
    const { data: licenseData, error: licenseError } = await supabaseAdmin
      .from('licenses')
      .select('id, status, max_activations, hours_remaining, license_type')
      .eq('key', licenseKey)
      .single<LicenseRecord>();

    if (licenseError || !licenseData) {
      console.error(`License validation error for key ${licenseKey}:`, licenseError?.message);
      return new Response(JSON.stringify({ isValid: false, error: 'Invalid license key.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404, 
      });
    }

    // IMPORTANT: Adjust 'active' to match your actual valid status from the 'license_status' enum
    if (licenseData.status !== 'active') { 
      return new Response(JSON.stringify({ isValid: false, error: `License is not active. Status: ${licenseData.status}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403,
      });
    }
    
    const licenseId = licenseData.id;
    const maxActivations = licenseData.max_activations || 1; // Default to 1 if null

    // 2. Check if this device is already activated for this license
    const { data: existingActivation, error: existingActivationError } = await supabaseAdmin
      .from('activated_devices')
      .select('id, last_seen_at')
      .eq('license_id', licenseId)
      .eq('device_id', deviceId)
      .maybeSingle<ActivatedDeviceRecord>();

    if (existingActivationError) { 
        console.error(`Error checking existing activation for device ${deviceId} on license ${licenseId}:`, existingActivationError.message);
        return new Response(JSON.stringify({ isValid: false, error: 'Server error checking device activation.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
    
    if (existingActivation) {
      // Device already activated, update last_seen_at and return success
      const { error: updateError } = await supabaseAdmin
        .from('activated_devices')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', existingActivation.id);
      
      if (updateError) {
          console.error(`Error updating last_seen_at for device ${existingActivation.id}:`, updateError.message);
          // Non-critical, proceed with validation success
      }
      return new Response(JSON.stringify({ 
          isValid: true, 
          message: 'Device already activated.',
          hoursRemaining: licenseData.hours_remaining,
          licenseType: licenseData.license_type 
        }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // 3. Device not yet activated for this license, check current total activations for the license
    const { count: currentActivationsCount, error: countError } = await supabaseAdmin
      .from('activated_devices')
      .select('*', { count: 'exact', head: true })
      .eq('license_id', licenseId);

    if (countError) {
        console.error(`Error counting activations for license ${licenseId}:`, countError.message);
        return new Response(JSON.stringify({ isValid: false, error: 'Server error counting activations.' }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }

    if (currentActivationsCount !== null && currentActivationsCount >= maxActivations) {
      return new Response(JSON.stringify({ 
          isValid: false, 
          error: 'Activation limit reached. Please deactivate an existing device from your account dashboard.',
          activationLimitReached: true
        }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 403, 
      });
    }

    // 4. Activation limit not reached, add new device to activated_devices
    const { error: insertError } = await supabaseAdmin
      .from('activated_devices')
      .insert({
        license_id: licenseId,
        device_id: deviceId,
        activated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });

    if (insertError) {
      console.error(`Error inserting new activation for device ${deviceId} on license ${licenseId}:`, insertError.message);
      // Check for unique constraint violation (e.g., code '23505' for PostgreSQL)
      // This can happen in a race condition if another request activated the same device concurrently.
      if (insertError.code === '23505') { 
         return new Response(JSON.stringify({ 
            isValid: true, 
            message: 'Device activated (concurrently).',
            hoursRemaining: licenseData.hours_remaining,
            licenseType: licenseData.license_type 
         }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200, 
         });
      }
      return new Response(JSON.stringify({ isValid: false, error: 'Server error activating device.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    return new Response(JSON.stringify({ 
        isValid: true, 
        message: 'Device activated successfully.',
        hoursRemaining: licenseData.hours_remaining,
        licenseType: licenseData.license_type
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    console.error('Unhandled error in validate-license-v2:', error);
    return new Response(JSON.stringify({ error: 'Internal server error', details: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
