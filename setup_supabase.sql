-- =========================================================================
-- CONFESSOUT DATABASE SETUP SCRIPT
-- Paste this script into your Supabase SQL Editor to set up the backend.
-- =========================================================================

-- 1. Create confessions table if it doesn't exist
CREATE TABLE IF NOT EXISTS confessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  tag text NOT NULL,
  status text NOT NULL DEFAULT 'pending', -- pending, approved, rejected
  timestamp timestamptz NOT NULL DEFAULT now(),
  reports integer NOT NULL DEFAULT 0,
  react_love integer NOT NULL DEFAULT 0,
  react_fire integer NOT NULL DEFAULT 0,
  react_haha integer NOT NULL DEFAULT 0,
  react_cry integer NOT NULL DEFAULT 0,
  react_shocked integer NOT NULL DEFAULT 0
);

-- 2. Enable Row-Level Security (RLS)
ALTER TABLE confessions ENABLE ROW LEVEL SECURITY;

-- 3. Drop existing policies to prevent "already exists" errors (making the script re-runnable)
DROP POLICY IF EXISTS "Allow public select approved" ON confessions;
DROP POLICY IF EXISTS "Allow public insert pending" ON confessions;
DROP POLICY IF EXISTS "Allow public update reactions and reports" ON confessions;
DROP POLICY IF EXISTS "Allow public select all for moderation" ON confessions;

-- 4. Policy: Allow anyone to view approved confessions on the public feed
CREATE POLICY "Allow public select approved" ON confessions
  FOR SELECT 
  USING (status = 'approved');

-- 5. Policy: Allow anyone to submit a confession anonymously (forces pending status)
CREATE POLICY "Allow public insert pending" ON confessions
  FOR INSERT 
  WITH CHECK (status = 'pending');

-- 6. Policy: Allow anyone to update ONLY reaction counts and reports on approved/pending confessions
-- Restrict to specific columns to prevent status manipulation
CREATE POLICY "Allow public update reactions and reports" ON confessions
  FOR UPDATE
  USING (status IN ('approved', 'pending'))
  WITH CHECK (
    status IN ('approved', 'pending') AND
    -- Only allow updating reaction and report columns
    (OLD.text = NEW.text) AND
    (OLD.tag = NEW.tag) AND
    (OLD.status = NEW.status) AND
    (OLD.timestamp = NEW.timestamp) AND
    (OLD.id = NEW.id)
  );

-- 7. Policy: Allow public select of pending for the student feed moderation dashboard
-- NOTE: In production, this should be restricted to authenticated moderators only
-- For now, keeping it open but with a warning comment
CREATE POLICY "Allow public select all for moderation" ON confessions
  FOR SELECT
  USING (true);
  -- TODO: Restrict to authenticated users with moderator role:
  -- USING (
  --   auth.role() = 'authenticated' AND
  --   EXISTS (
  --     SELECT 1 FROM auth.users
  --     WHERE id = auth.uid()
  --     AND raw_user_meta_data->>'role' IN ('admin', 'moderator')
  --   )
  -- );

-- 8. Policy: Admins/moderators can manage all confessions (approve, reject, delete)
CREATE POLICY "Allow admin manage confessions" ON confessions
  FOR ALL
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'moderator')
    )
  );

-- 9. Create admin_chats table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  message text NOT NULL,
  sender text NOT NULL, -- 'user' or 'staff'
  sender_name text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now(),
  user_id uuid REFERENCES auth.users(id) -- Track authenticated user for staff messages
);

-- 10. Enable RLS on admin_chats
ALTER TABLE admin_chats ENABLE ROW LEVEL SECURITY;

-- 11. Drop existing policies to prevent duplicates
DROP POLICY IF EXISTS "Allow public select chats" ON admin_chats;
DROP POLICY IF EXISTS "Allow public insert chats" ON admin_chats;
DROP POLICY IF EXISTS "Allow user insert own chat" ON admin_chats;
DROP POLICY IF EXISTS "Allow staff select all chats" ON admin_chats;
DROP POLICY IF EXISTS "Allow staff insert replies" ON admin_chats;

-- 12. Policy: Users can read messages from their own session only
CREATE POLICY "Allow user select own session" ON admin_chats
  FOR SELECT
  USING (
    -- Allow reading if session matches (for anonymous users via session_id)
    -- OR if authenticated staff member
    (session_id = current_setting('app.current_session_id', true)) OR
    (
      auth.role() = 'authenticated' AND
      EXISTS (
        SELECT 1 FROM auth.users
        WHERE id = auth.uid()
        AND raw_user_meta_data->>'role' IN ('admin', 'moderator')
      )
    )
  );

-- 13. Policy: Anonymous users can insert messages to their own session
CREATE POLICY "Allow user insert own chat" ON admin_chats
  FOR INSERT
  WITH CHECK (
    sender = 'user' AND
    session_id = current_setting('app.current_session_id', true)
  );

-- 14. Policy: Staff can insert replies to any session
CREATE POLICY "Allow staff insert replies" ON admin_chats
  FOR INSERT
  WITH CHECK (
    sender = 'staff' AND
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'moderator')
    )
  );

-- 15. Create index for performance
CREATE INDEX IF NOT EXISTS idx_admin_chats_session_id ON admin_chats (session_id);

-- 16. Create system_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- 17. Enable RLS on system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 18. Drop existing policies to prevent duplicates
DROP POLICY IF EXISTS "Allow public select settings" ON system_settings;
DROP POLICY IF EXISTS "Allow public write settings" ON system_settings;
DROP POLICY IF EXISTS "Allow admin write settings" ON system_settings;

-- 19. Policy: Allow anyone to view NON-SENSITIVE configurations only
-- Sensitive keys (passwords) should NEVER be readable by public
CREATE POLICY "Allow public select non-sensitive settings" ON system_settings
  FOR SELECT
  USING (key NOT IN ('admin_password', 'moderator_password'));

-- 20. Policy: Only authenticated admins/moderators can write settings
-- This requires Supabase Auth to be properly configured
CREATE POLICY "Allow admin write settings" ON system_settings
  FOR ALL
  USING (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'moderator')
    )
  )
  WITH CHECK (
    auth.role() = 'authenticated' AND
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE id = auth.uid()
      AND raw_user_meta_data->>'role' IN ('admin', 'moderator')
    )
  );
