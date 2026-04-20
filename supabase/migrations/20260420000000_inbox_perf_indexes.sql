-- Performance indexes for the CloudDesk inbox
-- These support the most common query patterns:
--   loadConversations  → filter by status, order by updated_at
--   AssigneeSection    → filter by assigned_agent_id
--   refreshTabCounts   → COUNT(*) GROUP BY status

CREATE INDEX IF NOT EXISTS idx_desk_conversations_status
  ON desk_conversations (status);

CREATE INDEX IF NOT EXISTS idx_desk_conversations_updated_at
  ON desk_conversations (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_desk_conversations_status_updated
  ON desk_conversations (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_desk_conversations_assigned
  ON desk_conversations (assigned_agent_id)
  WHERE assigned_agent_id IS NOT NULL;
