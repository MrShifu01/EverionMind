CREATE TABLE messaging_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('telegram')),
  platform_user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(platform, platform_user_id)
);
ALTER TABLE messaging_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own connections" ON messaging_connections
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TABLE messaging_pending_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brain_id UUID NOT NULL REFERENCES brains(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE messaging_pending_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pending links" ON messaging_pending_links
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
