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
**Status: COMPLETE (for track_usage refinement and review of others) - 2025-05-08**
- `track_usage` function successfully refined to include `system_id` validation and logging to `license_usage` table. Tested thoroughly.
- Other core functions (`create_license`, `validate_license`, `renew_license`) were previously reviewed and refined.

### 2. Task: Implement and Rigorously Test Supabase Row Level Security (RLS) Policies
#### Details:
- For licenses table: Users should only be able to read their own licenses (e.g., auth.uid() = user_id). Server-side functions (SECURITY DEFINER) will handle modifications.
- For transactions table: Similar to licenses, users read their own.
- For license_usage table: Similar to licenses.
- For auth.users (and any profiles table): Ensure appropriate default RLS is in place.
#### Action: Define and apply RLS policies in Supabase. Test using different user roles/sessions.
#### Why: Critical for data security and preventing unauthorized access/modification.
**Status: COMPLETE - 2025-05-08**
- RLS policies implemented for `licenses`, `transactions`, and `license_usage` tables.
- Users can only read their own records.
- Direct DML operations are restricted, enforcing modifications via `SECURITY DEFINER` functions.
- SELECT RLS verified for the `licenses` table.

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

### 4. Task: Implement and Test track-usage API Endpoint
#### Files: `src/app/api/licenses/track-usage/route.ts`
#### Details:
- Receives `licenseKey`, `systemId`, `minutesUsed`.
- Calls Supabase RPC `track_usage`.
- Handles responses from RPC (success, insufficient hours, license expired/invalid, system ID mismatch).
#### Action: Implement route handler. Test with various scenarios (valid, invalid key, insufficient time, etc.).
#### Why: Core mechanism for your app to report usage and decrement license time.
**Status: COMPLETE - 2025-05-08**
- API endpoint `src/app/api/licenses/track-usage/route.ts` implemented and tested.
- Uses Supabase `service_role_key` for RPC calls.
- RPC parameter names (`p_license_key`, `p_system_id`, `p_minutes_used`) aligned between API route and SQL function.
- Middleware (`src/middleware.ts`) updated to allow unauthenticated access to this specific endpoint, as it's intended for backend (macOS app) calls.
- Successfully tested with a valid license, verified `license_usage` table insertion and `licenses.hours_remaining` update.

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

### 7. Task: Design Server-Side Trial Management API Endpoints
#### Files (Backend): Create new API routes, e.g., src/app/api/trial/activate/route.ts, src/app/api/trial/status/route.ts.
#### Details (Backend):
- These endpoints will interact with Supabase (new table trials or extend licenses table to support trial types).
- activate: Takes system_id, creates a trial record linked to it (or a temporary anonymous user if full user accounts aren't required for trials), sets expiry.
- status: Takes system_id, returns trial validity, remaining time, etc.
#### Action (Backend): Design schema changes/additions in Supabase. Implement API routes.
#### Why: Lays the groundwork for secure, server-managed trials.

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