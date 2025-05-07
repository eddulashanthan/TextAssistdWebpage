# Supabase Test Data Setup

This script sets up the `licenses` table, RLS, and two test users for E2E testing:
- **User 1:** Has a license (for "has license" scenarios)
- **User 2:** Has no license (for "no license" scenarios)

---

## 1. Create Tables

```sql
CREATE TABLE IF NOT EXISTS public.licenses (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    key text UNIQUE NOT NULL,
    user_id uuid NOT NULL REFERENCES auth.users(id),
    hours_purchased integer NOT NULL,
    hours_remaining numeric NOT NULL,
    purchase_date timestamp with time zone NOT NULL DEFAULT now(),
    last_validated_at timestamp with time zone,
    linked_system_id text,
    status text NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id uuid NOT NULL REFERENCES auth.users(id),
    license_id uuid REFERENCES public.licenses(id),
    payment_gateway text NOT NULL,
    gateway_transaction_id text UNIQUE NOT NULL,
    amount numeric NOT NULL,
    currency text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id),
    username text UNIQUE,
    name text,
    created_at timestamp with time zone NOT NULL DEFAULT now(),
    updated_at timestamp with time zone
);
```

---

## 2. Enable RLS and Policies

```sql
ALTER TABLE public.licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own licenses"
    ON public.licenses FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users cannot insert licenses directly"
    ON public.licenses FOR INSERT
    WITH CHECK (false);

CREATE POLICY "Users can view their own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users cannot insert transactions directly"
    ON public.transactions FOR INSERT
    WITH CHECK (false);

CREATE POLICY "Users can view their own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
    ON public.profiles FOR INSERT
    WITH CHECK (auth.uid() = id);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
```

---

## 3. Create Test Users (Manual Step)

- Go to Supabase Dashboard → Authentication → Users.
- Add two users:
  - **licensed@example.com** (User 1)
  - **nolicense@example.com** (User 2)
- Copy their UUIDs (USER1_ID and USER2_ID).

---

## 4. Insert License for User 1

```sql
-- Replace USER1_ID and USER2_ID with actual UUIDs from your Supabase Auth dashboard
INSERT INTO public.licenses (key, user_id, hours_purchased, hours_remaining, status)
VALUES ('test-licensed-key', 'ce280fc9-c99e-420a-b9f6-6d3c8d703e7d', 10, 10, 'active')
ON CONFLICT (key) DO NOTHING;
-- User 2 (nolicense@example.com) will have no license entry.
```
INSERT INTO public.licenses (key, user_id, hours_purchased, hours_remaining, status)
VALUES ('test-licensed-key', 'fc3bd13f-0118-4deb-8421-7f20e61bc888', 10, 10, 'expired')
ON CONFLICT (key) DO NOTHING;
```
---

## 5. Verify

```sql
SELECT email, id FROM auth.users WHERE email IN ('licensed@example.com', 'nolicense@example.com');
SELECT * FROM public.licenses WHERE user_id IN ('USER1_ID', 'USER2_ID');
```

---

**Instructions:**
- Run the table and policy creation scripts in the Supabase SQL editor.
- Create the users via the Supabase Auth dashboard.
- Replace USER1_ID and USER2_ID in the license insert and verify queries.
- Run the insert and verify queries in the SQL editor. 