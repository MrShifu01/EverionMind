-- Allow conservative LLM extraction to create canonical lookup facts while
-- keeping user-authored and deterministic system memories distinguishable.
alter table public.important_memories
  drop constraint if exists important_memories_created_by_check;

alter table public.important_memories
  add constraint important_memories_created_by_check
  check (created_by in ('user', 'system', 'system_llm'));

comment on column public.important_memories.created_by is
  'Origin of the memory: user, deterministic system extraction, or conservative LLM extraction.';
