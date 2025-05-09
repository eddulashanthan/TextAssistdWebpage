# TextAssistd Licensing System Plan
## Phase 1: Solidify Server-Side Core (Web Backend & Supabase) - Highest Priority
### 1. Task: Deep Review & Testing of Supabase Database Functions (RPCs)
#### Details:
- `create_license(user_id, hours, transaction_id, payment_gateway, amount, currency)`:
  - Verify: Atomic creation of records in licenses and transactions tables.
  - Verify: Correct generation of a unique key for the licenses table (e.g., using uuid_generate_v4()).
  - Verify: Correct initialization of hours_purchased, hours_remaining, status (e.g., to 'active' or 'pending' initially, then 'active' after payment).
  - Verify: Idempotency (e.g., if called twice with the same gateway_transaction_id, it doesn't create duplicate licenses/transactions).
  - Security: Ensure it's secure if running as SECURITY DEFINER (parameterized queries, no SQL injection vulnerabilities).
- `validate_license(license_key, system_id)`:
  - Verify: Correctly checks license status (active, not expired, not revoked).
  - Verify: Implements linked_system_id logic (link on first validation, subsequent validations must match).
  - Verify: Correctly checks/calculates hours_remaining and expires_at (if applicable).
  - Verify: Updates last_validated_at in the licenses table.
  - Return Value: Ensure it returns all necessary fields for the macOS app (validity, message, hours_remaining, status, expires_at).
- New/Refined RPC for Usage Tracking (e.g., record_license_usage(license_key, system_id, minutes_used)):
  - Create/Verify: This function should:
    - Validate the license_key and system_id (potentially by calling parts of validate_license logic or ensuring the license is active and linked).
    - Securely decrement hours_remaining in the licenses table.
    - Add a record to the license_usage table.
    - Handle cases where minutes_used would make hours_remaining negative (e.g., set to 0 and mark as expired).
    - Return the updated hours_remaining and license status.
#### Action: Review PLpgSQL code in Supabase. Conduct direct SQL testing.
#### Why: These functions are the heart of your licensing logic.

### 2. Task: Implement and Rigorously Test Supabase Row Level Security (RLS) Policies
#### Details:
- For licenses table: Users should only be able to read their own licenses (e.g., auth.uid() = user_id). Server-side functions (SECURITY DEFINER) will handle modifications.
- For transactions table: Similar to licenses, users read their own.
- For license_usage table: Similar to licenses.
- For auth.users (and any profiles table): Ensure appropriate default RLS is in place.
#### Action: Define and apply RLS policies in Supabase. Test using different user roles/sessions.
#### Why: Critical for data security and preventing unauthorized access/modification.

### 3. Task: Complete and Test PayPal Payment Integration
#### Files: src/app/api/payments/paypal/create-order/route.ts, src/app/api/payments/paypal/webhook/route.ts
#### Details:
- create-order: Ensure it correctly communicates with PayPal SDK to set up an order.
- webhook:
  - Implement: Robust PayPal IPN/webhook signature verification.
  - Verify: Correctly extracts necessary data from PayPal event.
  - Verify: Calls the create_license Supabase RPC with correct parameters upon successful payment.
  - Verify: Handles various PayPal event types and potential errors gracefully.
#### Action: Write/review TypeScript code. Conduct E2E PayPal sandbox tests.
#### Why: Ensures PayPal payments are processed correctly and licenses are generated.

### 4.  Task: Implement and Test track-usage API Endpoint
#### File: src/app/api/licenses/track-usage/route.ts (or similar if named differently)
#### Details:
- Implement: This API route should receive license_key, system_id, and minutes_used from the macOS app.
- Implement: Call the new/refined Supabase RPC record_license_usage (from step 1.1.3).
- Return: Respond to the macOS app with success/failure and updated license status (e.g., hours_remaining).
#### Action: Write TypeScript code. Test with mock requests.
#### Why: Enables accurate tracking and decrementing of license usage.

### 5. Task: Implement Email Delivery of License Keys
#### Files: Modify Stripe (.../webhook/route.ts) and PayPal (.../webhook/route.ts) webhook handlers.
#### Details:
- Integrate an email service (e.g., Resend, SendGrid). Store API keys securely as environment variables.
- After the create_license Supabase RPC returns successfully (providing the generated license key), trigger an email to the user_id's email address containing their new license key and basic instructions.
#### Action: Add email sending logic. Test email delivery.
#### Why: Critical for user experience post-purchase.

### 6. Task: Standardize and Enhance Backend Error Handling & Logging
#### Files: Across all API routes.
#### Details:
- Use consistent error response formats.
- Implement structured logging (e.g., using a library like Pino, and integrating with Vercel's log drains or a service like Sentry/Logtail). Log important events, errors, and request identifiers.
#### Action: Refactor error handling. Set up chosen logging solution.
#### Why: Improves debuggability and maintainability in production.

## Phase 2: Adapt macOS App to Server-Authoritative Model

This phase updates the macOS application to rely entirely on the now-robust backend.

### 7. Task: Implement Server-Side Trial Management (Supabase Schema & API Design)
#### Status: Supabase `trials` table schema and RLS implemented. API endpoint design & implementation next.
#### Files (Backend):
- Supabase Migrations: (Applied for `public.trials` table and RLS)
- API Routes (To Be Created): `src/app/api/trial/activate/route.ts`, `src/app/api/trial/status/route.ts`
#### Details (Supabase - Implemented):
- **`public.trials` Table:**
    - Created with fields: `id`, `system_id` (UNIQUE), `user_id` (nullable, FK to `auth.users`), `status` (e.g., 'active', 'expired'), `start_time`, `duration_seconds`, `expiry_time`, analytics fields (`total_usage_minutes`, `sessions_count`, `features_used`), `last_seen_at`, and audit timestamps (`created_at`, `updated_at`).
    - The `system_id` is intended to store the device's `IOPlatformUUID`.
    - `expiry_time` is to be calculated as `start_time + (duration_seconds * interval '1 second')`.
    - An `updated_at` trigger function is in place.
- **RLS Policy for `public.trials`:**
    - `CREATE POLICY "Users can view their own trial records" ON public.trials FOR SELECT USING (auth.uid() = user_id);`
    - This allows authenticated users to read trial rows linked to their `user_id`.
    - All other database interactions (creating new trials, updating trial analytics, reading trials by `system_id` for anonymous users) will be performed by backend API routes using the `service_role` key, which bypasses this RLS policy. The `UNIQUE` constraint on `system_id` is a key database-level protection.
#### Details (API Endpoints - To Be Designed & Implemented):
- **`/api/trial/activate`**:
    - **Request Parameters:** `system_id` (string, required), `user_id` (string, optional, if user is authenticated).
    - **Logic:**
        1.  Validate `system_id`.
        2.  Check if a trial for this `system_id` already exists in `public.trials`. If yes, return current trial status (or an error indicating trial already active/used).
        3.  If no existing trial, create a new record in `public.trials`:
            - Set `system_id`.
            - Set `user_id` if provided and valid.
            - Set `status` to 'active'.
            - Set `start_time` to `now()`.
            - Define `duration_seconds` (e.g., 20 minutes = 1200 seconds).
            - Calculate and set `expiry_time`.
            - Initialize analytics fields.
    - **Response:** JSON object with trial details (e.g., `trial_id`, `system_id`, `status`, `expiry_time`, `remaining_seconds`).
- **`/api/trial/status`**:
    - **Request Parameters:** `system_id` (string, required).
    - **Logic:**
        1.  Validate `system_id`.
        2.  Query `public.trials` for the record matching `system_id`.
        3.  If found, check if `expiry_time` is in the past and update `status` to 'expired' if needed.
        4.  Consider updating `last_seen_at` and potentially incrementing `sessions_count` here or via a dedicated usage reporting mechanism.
    - **Response:** JSON object with trial details (e.g., `trial_id`, `system_id`, `status`, `expiry_time`, `remaining_seconds`, `total_usage_minutes`, `sessions_count`, `features_used`). If not found, appropriate error/status.
- **(Considered) `/api/trial/report-usage` (or integrate into `/api/trial/status` logic):**
    - **Request Parameters:** `system_id` (string, required), `session_minutes_used` (number, optional), `session_features_used` (array of strings, optional).
    - **Logic:**
        1. Validate `system_id`.
        2. Find the trial. If active:
            - Update `last_seen_at`.
            - Increment `total_usage_minutes`.
            - Merge `session_features_used` with existing `features_used`.
    - **Response:** Updated trial status.
#### Action (Backend):
- **Done:** Defined and applied Supabase schema and RLS for `public.trials`.
- **Next:** Implement Vercel serverless functions for `/api/trial/activate` and `/api/trial/status`, including any usage reporting logic.
#### Why: Establishes the secure, server-authoritative backend for the trial system, moving away from client-side `UserDefaults`.

### 8. Task: Refactor macOS App Trial System
#### Files (macOS App): LicenseAPIService.swift, TrialStatusViewModel.swift, any related UserDefaults logic.
#### Details:
- Remove: All UserDefaults-based trial activation, status checking, extension, and analytics logic from LicenseAPIService.swift.
- Implement: Network calls in LicenseAPIService.swift to the new server-side trial API endpoints (/api/trial/activate, /api/trial/status).
- Modify: TrialStatusViewModel.swift and related UI to consume trial status from these new service methods.
- Caching: Trial status can be lightly cached in memory, but the server is the source of truth. Re-check with the server on app launch and periodically or before critical actions.
#### Action (macOS App): Rewrite Swift code for trial management.
#### Why: Secures the trial system against client-side tampering.

### 9. Task: Update macOS App Paid License Handling
#### Files (macOS App): LicenseService.swift, LicenseAPIService.swift, FeatureGateService.swift, UI views.
#### Details:
- validateLicense: Ensure it correctly sends licenseKey and systemId to /api/licenses/validate/route.ts and parses the detailed JSON response (validity, specific messages, hoursRemaining, status, expires_at). Update Swift data models accordingly.
- reportUsage: Ensure it calls the /api/licenses/track-usage/route.ts endpoint with correct parameters and handles the response.
- UI: Update views to display more specific error messages and license statuses received from the server.
- FeatureGateService.swift: Ensure it correctly interprets the richer license status (including expires_at if relevant to feature gating).
#### Action (macOS App): Modify Swift networking code, data models, and UI logic.
#### Why: Ensures the app correctly interacts with the improved backend and provides better user feedback.

### 10. Task: Align macOS App Data Models with API Responses
#### Files (macOS App): Swift structures/classes representing License details.
#### Details: Ensure the License struct in Swift accurately reflects all fields returned by the /api/licenses/validate endpoint, including expires_at and any other new fields.
#### Action (macOS App): Update Swift struct definitions.
#### Why: Prevents parsing errors and ensures all available data is usable.

## Phase 3: Implement User-Facing Web Features & Polish

This phase focuses on the user experience on your website.

### 11. Task: Develop Frontend Purchase Flow
#### Files (Web Frontend): src/app/pricing/page.tsx (or similar), components for checkout.
#### Details:
- Implement UI for users to select license tiers.
- Integrate calls to /api/payments/stripe/create-checkout and /api/payments/paypal/create-order.
- Embed Stripe Elements / PayPal buttons and handle their client-side callbacks correctly.
- Provide clear feedback to the user throughout the purchase process.
#### Action: Write React/Next.js components and logic.
#### Why: Enables users to purchase licenses.

### 12. Task: Develop User Dashboard for License Management
#### Files (Web Frontend): src/app/dashboard/... routes and components.
#### Details:
- Authenticated users should be able to see their purchased licenses, status, hours_remaining, expires_at, and linked system_id.
- Requires new API endpoints (e.g., /api/user/licenses) secured by Supabase Auth to fetch this data, respecting RLS.
#### Action: Create Next.js pages/components. Implement new backend API endpoints if needed.
#### Why: Allows users to view and manage their licenses.