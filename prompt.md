-- Insert a license for User 1 (licensed@example.com)
INSERT INTO public.licenses (key, user_id, hours_purchased, hours_remaining, status)
VALUES ('test-licensed-key', 'USER1_ID', 10, 10, 'active')
ON CONFLICT (key) DO NOTHING;

-- User 2 (nolicense@example.com) will have no license entry.
