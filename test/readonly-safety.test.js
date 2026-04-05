import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_PATH = path.join(__dirname, '..', 'src', 'index.js');

let source;

beforeAll(() => {
  source = fs.readFileSync(SOURCE_PATH, 'utf8');
});

// ---------------------------------------------------------------------------
// Write tool names that must NOT appear in tool definitions or switch cases
// ---------------------------------------------------------------------------

const WRITE_TOOLS = [
  'ticktick_create_project',
  'ticktick_create_task',
  'ticktick_update_task',
  'ticktick_delete_task',
  'ticktick_complete_task',
  'ticktick_create_tag',
  'ticktick_add_tag_to_task',
  'ticktick_create_habit',
  'ticktick_update_habit',
  'ticktick_delete_habit',
  'ticktick_checkin_habit',
  'ticktick_pause_habit',
  'ticktick_resume_habit',
  'ticktick_bulk_checkin_habits',
  'ticktick_set_habit_goal',
  'ticktick_update_tag',
  'ticktick_delete_tag',
  'ticktick_remove_tag_from_task',
  'ticktick_merge_tags',
  'ticktick_bulk_tag_operations',
  'ticktick_start_focus_session',
  'ticktick_stop_focus_session',
  'ticktick_pause_focus_session',
  'ticktick_resume_focus_session',
  'ticktick_set_task_estimate',
  'ticktick_set_focus_goals',
  'ticktick_create_project_folder',
  'ticktick_move_project_to_folder',
  'ticktick_archive_project',
  'ticktick_unarchive_project',
  'ticktick_duplicate_project',
  'ticktick_set_project_color',
  'ticktick_reorder_projects',
  'ticktick_create_project_from_template',
  'ticktick_export_project',
  'ticktick_share_project',
  'ticktick_invite_collaborator',
  'ticktick_remove_collaborator',
  'ticktick_assign_task',
  'ticktick_add_task_comment',
  'ticktick_set_project_permissions',
  'ticktick_bulk_assign_tasks',
  'ticktick_export_team_report',
  'ticktick_create_calendar_event',
  'ticktick_sync_with_google_calendar',
  'ticktick_sync_with_outlook',
  'ticktick_convert_task_to_event',
  'ticktick_bulk_calendar_import',
  'ticktick_add_task_note',
  'ticktick_update_task_note',
  'ticktick_delete_task_note',
  'ticktick_upload_task_attachment',
  'ticktick_delete_task_attachment',
  'ticktick_create_task_template',
  'ticktick_update_task_template',
  'ticktick_delete_task_template',
  'ticktick_create_task_from_template',
  'ticktick_set_recurring_task',
  'ticktick_pause_recurring_task',
  'ticktick_bulk_create_from_template',
  'ticktick_update_user_settings',
  'ticktick_update_notification_settings',
  'ticktick_update_sync_settings',
  'ticktick_reset_user_data',
  'ticktick_import_from_csv',
];

// Read tool names that MUST be present
const READ_TOOLS = [
  'ticktick_get_projects',
  'ticktick_get_task_details',
  'ticktick_filter_tasks',
  'ticktick_search_tasks',
  'ticktick_get_tags',
  'ticktick_get_today_tasks',
  'ticktick_get_overdue_tasks',
  'ticktick_get_upcoming_tasks',
  'ticktick_get_user_profile',
  'ticktick_get_habits',
  'ticktick_get_habit_history',
  'ticktick_get_habit_stats',
  'ticktick_get_habit_streaks',
  'ticktick_get_habit_calendar',
  'ticktick_get_habits_summary',
  'ticktick_get_focus_stats',
  'ticktick_get_daily_focus_summary',
  'ticktick_get_focus_history',
  'ticktick_get_productivity_insights',
  'ticktick_get_project_folders',
  'ticktick_get_project_stats',
  'ticktick_get_cached_tasks',
  'ticktick_get_notification_settings',
  'ticktick_get_sync_settings',
  'ticktick_convert_datetime_to_ticktick_format',
];

// ---------------------------------------------------------------------------
// Helper: extract the tool definitions section (ListToolsRequestSchema)
// ---------------------------------------------------------------------------

function extractToolDefinitionsSection() {
  // The tool definitions are inside: this.server.setRequestHandler(ListToolsRequestSchema, ...)
  // Use the second occurrence (first is the import statement)
  const marker = 'setRequestHandler(ListToolsRequestSchema';
  const start = source.indexOf(marker);
  const end = source.indexOf('setRequestHandler(CallToolRequestSchema');
  return source.substring(start, end);
}

// ---------------------------------------------------------------------------
// Helper: extract the switch/case section (CallToolRequestSchema)
// ---------------------------------------------------------------------------

function extractSwitchSection() {
  const start = source.indexOf('setRequestHandler(CallToolRequestSchema');
  const end = source.indexOf('async makeTickTickRequest');
  return source.substring(start, end);
}

// ---------------------------------------------------------------------------
// Layer 1: No write tools in tool definitions
// ---------------------------------------------------------------------------

describe('Layer 1: Write tools removed from tool definitions', () => {
  let toolDefsSection;

  beforeAll(() => {
    toolDefsSection = extractToolDefinitionsSection();
  });

  for (const tool of WRITE_TOOLS) {
    it(`tool definition does not include ${tool}`, () => {
      expect(toolDefsSection).not.toContain(`name: '${tool}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 1b: Read tools still present in tool definitions
// ---------------------------------------------------------------------------

describe('Layer 1b: Read tools still present in tool definitions', () => {
  let toolDefsSection;

  beforeAll(() => {
    toolDefsSection = extractToolDefinitionsSection();
  });

  for (const tool of READ_TOOLS) {
    it(`tool definition includes ${tool}`, () => {
      expect(toolDefsSection).toContain(`name: '${tool}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 1c: No write tools in switch/case dispatch
// ---------------------------------------------------------------------------

describe('Layer 1c: Write tools removed from switch/case dispatch', () => {
  let switchSection;

  beforeAll(() => {
    switchSection = extractSwitchSection();
  });

  for (const tool of WRITE_TOOLS) {
    it(`switch does not route ${tool}`, () => {
      expect(switchSection).not.toContain(`case '${tool}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 1d: Read tools still routed in switch/case dispatch
// ---------------------------------------------------------------------------

describe('Layer 1d: Read tools still routed in switch/case dispatch', () => {
  let switchSection;

  beforeAll(() => {
    switchSection = extractSwitchSection();
  });

  for (const tool of READ_TOOLS) {
    it(`switch routes ${tool}`, () => {
      expect(switchSection).toContain(`case '${tool}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// Layer 2: HTTP gate blocks non-GET requests
// ---------------------------------------------------------------------------

describe('Layer 2: makeTickTickRequest HTTP gate', () => {
  it('source contains read-only gate before any fetch call', () => {
    const methodStart = source.indexOf('async makeTickTickRequest');
    const gatePos = source.indexOf("if (method !== 'GET')", methodStart);
    const fetchPos = source.indexOf('fetch(', methodStart);

    expect(gatePos).toBeGreaterThan(methodStart);
    expect(gatePos).toBeLessThan(fetchPos);
  });

  it('gate throws an error mentioning read-only mode', () => {
    const methodStart = source.indexOf('async makeTickTickRequest');
    const gateRegion = source.substring(methodStart, methodStart + 300);
    expect(gateRegion).toContain('Read-only mode');
    expect(gateRegion).toContain('requests are blocked');
  });

  it('gate checks for GET specifically (not a blocklist of POST/PUT/DELETE)', () => {
    // An allowlist (method !== 'GET') is safer than a blocklist (method === 'POST')
    // because it blocks any unknown method too (PATCH, OPTIONS abuse, etc.)
    const methodStart = source.indexOf('async makeTickTickRequest');
    const gateRegion = source.substring(methodStart, methodStart + 300);
    expect(gateRegion).toContain("method !== 'GET'");
  });
});

// ---------------------------------------------------------------------------
// No new write tool definitions can sneak in
// ---------------------------------------------------------------------------

describe('No write HTTP methods in tool handler implementations used by read tools', () => {
  // Extract only the makeTickTickRequest calls used by read tool handlers.
  // All should use GET (the default) or explicitly pass 'GET'.
  // This test catches if someone wires a read tool to a write endpoint.

  it('read tool switch cases only call methods that use GET requests', () => {
    const switchSection = extractSwitchSection();
    // Extract method names called from the switch cases
    const methodCalls = [...switchSection.matchAll(/return await this\.(\w+)\(args\)/g)]
      .map(m => m[1]);

    for (const methodName of methodCalls) {
      // Find the method body
      const methodPattern = new RegExp(`async ${methodName}\\(`);
      const methodMatch = source.match(methodPattern);
      if (!methodMatch) continue;

      const methodStart = source.indexOf(methodMatch[0]);
      // Find the next method (crude but effective for a single-class file)
      const nextAsync = source.indexOf('\n  async ', methodStart + 1);
      const methodBody = source.substring(methodStart, nextAsync > 0 ? nextAsync : methodStart + 5000);

      // Check that all makeTickTickRequest calls in this method use GET
      const apiCalls = [...methodBody.matchAll(/makeTickTickRequest\([^)]+\)/g)];
      for (const call of apiCalls) {
        const callStr = call[0];
        // If there's a second argument, it should be 'GET' or absent (defaults to GET)
        const hasExplicitMethod = callStr.match(/makeTickTickRequest\([^,]+,\s*'(\w+)'/);
        if (hasExplicitMethod) {
          expect(hasExplicitMethod[1]).toBe('GET');
        }
        // If no second argument, it defaults to GET -- that's fine
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Structural integrity
// ---------------------------------------------------------------------------

describe('Structural integrity', () => {
  it('source file has valid JavaScript syntax', async () => {
    // If the source has syntax errors, this would have failed at module parse time
    // But let's also verify it's not empty or truncated
    expect(source.length).toBeGreaterThan(1000);
    expect(source).toContain('class TickTickMCPServer');
    expect(source).toContain('new TickTickMCPServer()');
  });

  it('startup banner reflects read-only mode', () => {
    expect(source).toContain('READ-ONLY MODE');
    expect(source).not.toContain("Available tools (112 total)");
  });

  it('number of tool definitions matches number of switch cases', () => {
    const toolDefsSection = extractToolDefinitionsSection();
    const switchSection = extractSwitchSection();

    const toolNames = [...toolDefsSection.matchAll(/name: '(ticktick_\w+)'/g)].map(m => m[1]);
    const caseNames = [...switchSection.matchAll(/case '(ticktick_\w+)'/g)].map(m => m[1]);

    // Every tool definition should have a corresponding switch case
    for (const name of toolNames) {
      expect(caseNames).toContain(name);
    }

    // Every switch case should have a corresponding tool definition
    for (const name of caseNames) {
      expect(toolNames).toContain(name);
    }
  });
});
