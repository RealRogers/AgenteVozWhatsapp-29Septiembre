/**
 * Tools that only work when the workspace's HighLevel integration is
 * connected (enabled + PIT + location). When it isn't, getEnabledTools
 * leaves them out of the LLM's ToolSet and Settings → Tools marks them as
 * requiring the integration.
 *
 * Pure module: safe to import from client components.
 */
export const HIGHLEVEL_TOOL_KEYS: ReadonlySet<string> = new Set([
  "check_availability",
  "schedule_highlevel",
  "reschedule_highlevel",
  "cancel_highlevel",
  "list_highlevel_appointments",
]);
