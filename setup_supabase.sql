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

-- 6. Policy: Allow anyone to update reactions or report counts
CREATE POLICY "Allow public update reactions and reports" ON confessions
  FOR UPDATE 
  USING (true)
  WITH CHECK (true);

-- 7. Policy: Allow public select of pending for the student feed moderation dashboard
CREATE POLICY "Allow public select all for moderation" ON confessions
  FOR SELECT 
  USING (true);

-- 8. Create admin_chats table if it doesn't exist
CREATE TABLE IF NOT EXISTS admin_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  message text NOT NULL,
  sender text NOT NULL, -- 'user' or 'staff'
  sender_name text NOT NULL,
  timestamp timestamptz NOT NULL DEFAULT now()
);

-- 9. Enable RLS on admin_chats
ALTER TABLE admin_chats ENABLE ROW LEVEL SECURITY;

-- 10. Drop existing policies to prevent duplicates
DROP POLICY IF EXISTS "Allow public select chats" ON admin_chats;
DROP POLICY IF EXISTS "Allow public insert chats" ON admin_chats;

-- 11. Policy: Allow public read of all messages
CREATE POLICY "Allow public select chats" ON admin_chats
  FOR SELECT
  USING (true);

-- 12. Policy: Allow public insertion of messages
CREATE POLICY "Allow public insert chats" ON admin_chats
  FOR INSERT
  WITH CHECK (true);

-- 13. Create index for performance
CREATE INDEX IF NOT EXISTS idx_admin_chats_session_id ON admin_chats (session_id);

-- 14. Create system_settings table if it doesn't exist
CREATE TABLE IF NOT EXISTS system_settings (
  key text PRIMARY KEY,
  value text NOT NULL
);

-- 15. Enable RLS on system_settings
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 16. Drop existing policies to prevent duplicates
DROP POLICY IF EXISTS "Allow public select settings" ON system_settings;
DROP POLICY IF EXISTS "Allow public write settings" ON system_settings;

-- 17. Policy: Allow anyone to view configurations
CREATE POLICY "Allow public select settings" ON system_settings
  FOR SELECT
  USING (true);

-- 18. Policy: Allow public write/update of configurations (Owner/Moderators)
CREATE POLICY "Allow public write settings" ON system_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);
