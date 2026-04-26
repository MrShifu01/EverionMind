CREATE TABLE user_memory (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_memory ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own memory" ON user_memory
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
