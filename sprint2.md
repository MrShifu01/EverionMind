# Sprint 2 — Supabase Schema Setup

## What was built (already in code)

Everything below is implemented and pushed to branch `claude/add-entry-connections-7WSyh`. The only missing piece is the Supabase database schema for persistent link storage.

---

## 1. Create the `links` table

Run this in **Supabase Dashboard > SQL Editor**:

```sql
-- Links table for storing connections between entries
CREATE TABLE IF NOT EXISTS links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  from_entry text NOT NULL,
  to_entry text NOT NULL,
  rel text NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, from_entry, to_entry)
);

-- Row-level security
ALTER TABLE links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own links" ON links
  FOR ALL USING (auth.uid() = user_id);
```

## 2. Create the `save_links` RPC function

```sql
-- Bulk upsert links from the frontend
CREATE OR REPLACE FUNCTION save_links(p_user_id uuid, p_links jsonb)
RETURNS void AS $$
DECLARE
  link jsonb;
BEGIN
  FOR link IN SELECT * FROM jsonb_array_elements(p_links)
  LOOP
    INSERT INTO links (user_id, from_entry, to_entry, rel)
    VALUES (
      p_user_id,
      link->>'from',
      link->>'to',
      link->>'rel'
    )
    ON CONFLICT (user_id, from_entry, to_entry)
    DO UPDATE SET rel = EXCLUDED.rel;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

## 3. (Optional) Add Supabase MCP for future Claude Code sessions

Create `.mcp.json` in the project root so Claude Code can manage your schema directly:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest", "--access-token", "YOUR_ACCESS_TOKEN"]
    }
  }
}
```

Get your access token from: Supabase Dashboard > Account > Access Tokens

---

## What this unlocks

Once the SQL above is run, the `/api/save-links` endpoint (already deployed) will automatically start persisting connections to the database. Links currently live in localStorage and sync to Supabase with a 5-second debounce after any change.

## Features shipped in this sprint

- AI-powered connection discovery between entries
- Fuzzy search with relevance ranking
- Auto importance scoring (Critical / Important / Normal)
- Daily Digest view (reminders, brain health, duplicate detection)
- Scan All connections button
- Semantic two-pass chat search
- Data export (JSON / CSV)
- Entry edit history (last 10 versions)
- Offline sync queue
- Error boundary
- Loading state during sync
- Security fix: delete endpoint now checks user_id
- Missing rateLimit.js created
- Links persist to Supabase via /api/save-links
