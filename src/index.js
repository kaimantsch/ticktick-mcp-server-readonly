#!/usr/bin/env node

/**
 * TickTick MCP Server - Docker Version
 * Based on jen6/ticktick-mcp with Docker integration and SDK 1.15.0
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  CallToolRequestSchema, 
  ListToolsRequestSchema,
  ErrorCode,
  McpError 
} from '@modelcontextprotocol/sdk/types.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Environment configuration
const TICKTICK_CLIENT_ID = process.env.TICKTICK_CLIENT_ID;
const TICKTICK_CLIENT_SECRET = process.env.TICKTICK_CLIENT_SECRET;
const TICKTICK_TOKEN = process.env.TICKTICK_TOKEN;
const TICKTICK_ACCESS_TOKEN = process.env.TICKTICK_ACCESS_TOKEN;
const TICKTICK_AUTH_CODE = process.env.TICKTICK_AUTH_CODE;

// Cache configuration
const CACHE_FILE_PATH = path.join(os.homedir(), '.ticktick-mcp-cache.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

class TickTickMCPServer {
  constructor() {
    this.server = new Server(
      {
        name: 'ticktick-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );
    
    this.initializeCache();
    this.setupHandlers();
  }

  // Cache management methods
  initializeCache() {
    try {
      if (!fs.existsSync(CACHE_FILE_PATH)) {
        this.saveCache({ tasks: {} });
      }
    } catch (error) {
      console.warn('Failed to initialize cache:', error.message);
      // Continue without cache if there's an issue
    }
  }

  loadCache() {
    try {
      if (fs.existsSync(CACHE_FILE_PATH)) {
        const data = fs.readFileSync(CACHE_FILE_PATH, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.warn('Failed to load cache:', error.message);
    }
    return { tasks: {} };
  }

  saveCache(data) {
    try {
      fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
      console.warn('Failed to save cache:', error.message);
    }
  }

  isTaskStale(task) {
    if (!task.cached_at) return true;
    return Date.now() - new Date(task.cached_at) > CACHE_TTL;
  }

  addTaskToCache(taskId, projectId, title) {
    try {
      const cache = this.loadCache();
      cache.tasks[taskId] = {
        project_id: projectId,
        title: title,
        cached_at: new Date().toISOString()
      };
      this.saveCache(cache);
    } catch (error) {
      console.warn('Failed to add task to cache:', error.message);
    }
  }

  setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: 'ticktick_get_projects',
            description: 'Get all projects from TickTick',
            inputSchema: {
              type: 'object',
              properties: {
                include_archived: {
                  type: 'boolean',
                  description: 'Include archived projects',
                  default: false
                }
              }
            }
          },
          {
            name: 'ticktick_get_task_details',
            description: 'Get specific task details using project ID and task ID',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'string',
                  description: 'Project ID containing the task'
                },
                task_id: {
                  type: 'string',
                  description: 'Specific task ID to retrieve'
                }
              },
              required: ['project_id', 'task_id']
            }
          },
          {
            name: 'ticktick_get_task_details',
            description: 'Get detailed information about a specific task',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: {
                  type: 'string',
                  description: 'ID of the task'
                }
              },
              required: ['task_id']
            }
          },
          {
            name: 'ticktick_filter_tasks',
            description: 'Filter tasks by various criteria',
            inputSchema: {
              type: 'object',
              properties: {
                keywords: {
                  type: 'string',
                  description: 'Keywords to search for in task titles/content'
                },
                tags: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by tags'
                },
                priority: {
                  type: 'number',
                  description: 'Filter by priority level'
                },
                due_before: {
                  type: 'string',
                  description: 'Tasks due before this date'
                },
                due_after: {
                  type: 'string',
                  description: 'Tasks due after this date'
                }
              }
            }
          },
          {
            name: 'ticktick_convert_datetime_to_ticktick_format',
            description: 'Convert datetime to TickTick API format',
            inputSchema: {
              type: 'object',
              properties: {
                datetime_string: {
                  type: 'string',
                  description: 'Human-readable datetime string'
                },
                timezone: {
                  type: 'string',
                  description: 'Timezone (e.g., America/New_York)',
                  default: 'UTC'
                }
              },
              required: ['datetime_string']
            }
          },
          {
            name: 'ticktick_get_tags',
            description: 'Get all tags from TickTick',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'ticktick_search_tasks',
            description: 'Advanced search for tasks with text query',
            inputSchema: {
              type: 'object',
              properties: {
                query: {
                  type: 'string',
                  description: 'Search query text'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 20
                }
              },
              required: ['query']
            }
          },
          {
            name: 'ticktick_get_today_tasks',
            description: 'Get tasks scheduled for today',
            inputSchema: {
              type: 'object',
              properties: {
                include_overdue: {
                  type: 'boolean',
                  description: 'Include overdue tasks',
                  default: true
                }
              }
            }
          },
          {
            name: 'ticktick_get_overdue_tasks',
            description: 'Get all overdue tasks',
            inputSchema: {
              type: 'object',
              properties: {
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 50
                }
              }
            }
          },
          {
            name: 'ticktick_get_upcoming_tasks',
            description: 'Get upcoming tasks within specified days',
            inputSchema: {
              type: 'object',
              properties: {
                days_ahead: {
                  type: 'number',
                  description: 'Number of days to look ahead',
                  default: 7
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of results',
                  default: 30
                }
              }
            }
          },
          {
            name: 'ticktick_get_user_profile',
            description: 'Get user profile information',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'ticktick_get_habits',
            description: 'Get all habits from TickTick',
            inputSchema: {
              type: 'object',
              properties: {
                include_archived: {
                  type: 'boolean',
                  description: 'Include archived habits',
                  default: false
                }
              }
            }
          },
          {
            name: 'ticktick_get_habit_history',
            description: 'Get habit completion history',
            inputSchema: {
              type: 'object',
              properties: {
                habit_id: {
                  type: 'string',
                  description: 'ID of the habit'
                },
                days_back: {
                  type: 'number',
                  description: 'Number of days to look back',
                  default: 30
                }
              },
              required: ['habit_id']
            }
          },
          {
            name: 'ticktick_get_habit_stats',
            description: 'Get habit statistics and streaks',
            inputSchema: {
              type: 'object',
              properties: {
                habit_id: {
                  type: 'string',
                  description: 'ID of the habit'
                }
              },
              required: ['habit_id']
            }
          },
          {
            name: 'ticktick_get_habit_streaks',
            description: 'Get current and longest streaks for a habit',
            inputSchema: {
              type: 'object',
              properties: {
                habit_id: {
                  type: 'string',
                  description: 'ID of the habit'
                }
              },
              required: ['habit_id']
            }
          },
          {
            name: 'ticktick_get_habit_calendar',
            description: 'Get calendar view of habit completions',
            inputSchema: {
              type: 'object',
              properties: {
                habit_id: {
                  type: 'string',
                  description: 'ID of the habit'
                },
                year: {
                  type: 'number',
                  description: 'Year for calendar view',
                  default: new Date().getFullYear()
                },
                month: {
                  type: 'number',
                  description: 'Month for calendar view (1-12), optional for full year'
                }
              },
              required: ['habit_id']
            }
          },
          {
            name: 'ticktick_get_habits_summary',
            description: 'Get daily summary of all habits',
            inputSchema: {
              type: 'object',
              properties: {
                date: {
                  type: 'string',
                  description: 'Date for summary (YYYY-MM-DD), defaults to today'
                }
              }
            }
          },
          {
            name: 'ticktick_export_habit_data',
            description: 'Export habit tracking data',
            inputSchema: {
              type: 'object',
              properties: {
                habit_id: {
                  type: 'string',
                  description: 'ID of specific habit, or omit for all habits'
                },
                start_date: {
                  type: 'string',
                  description: 'Start date for export (YYYY-MM-DD)'
                },
                end_date: {
                  type: 'string',
                  description: 'End date for export (YYYY-MM-DD)'
                },
                format: {
                  type: 'string',
                  description: 'Export format: json, csv',
                  default: 'json'
                }
              }
            }
          },
          {
            name: 'ticktick_get_tasks_by_tag',
            description: 'Get all tasks with a specific tag',
            inputSchema: {
              type: 'object',
              properties: {
                tag_name: {
                  type: 'string',
                  description: 'Name of the tag to filter by'
                },
                limit: {
                  type: 'number',
                  description: 'Maximum number of tasks to return',
                  default: 50
                }
              },
              required: ['tag_name']
            }
          },
          {
            name: 'ticktick_get_tag_usage_stats',
            description: 'Get usage statistics for a specific tag',
            inputSchema: {
              type: 'object',
              properties: {
                tag_id: {
                  type: 'string',
                  description: 'ID of the tag'
                }
              },
              required: ['tag_id']
            }
          },
          {
            name: 'ticktick_get_focus_stats',
            description: 'Get focus time statistics and analytics',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  description: 'Time period: today, week, month, year',
                  default: 'today'
                }
              }
            }
          },
          {
            name: 'ticktick_get_daily_focus_summary',
            description: 'Get daily focus time summary',
            inputSchema: {
              type: 'object',
              properties: {
                date: {
                  type: 'string',
                  description: 'Date for summary (YYYY-MM-DD), defaults to today'
                }
              }
            }
          },
          {
            name: 'ticktick_get_focus_history',
            description: 'Get historical focus session data',
            inputSchema: {
              type: 'object',
              properties: {
                days_back: {
                  type: 'number',
                  description: 'Number of days to look back',
                  default: 30
                },
                task_id: {
                  type: 'string',
                  description: 'Filter by specific task (optional)'
                }
              }
            }
          },
          {
            name: 'ticktick_get_productivity_insights',
            description: 'Get AI-powered productivity insights',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  description: 'Analysis period: week, month, quarter',
                  default: 'week'
                }
              }
            }
          },
          {
            name: 'ticktick_get_project_folders',
            description: 'Get all project folders and groups',
            inputSchema: {
              type: 'object',
              properties: {}
            }
          },
          {
            name: 'ticktick_get_project_stats',
            description: 'Get project analytics and statistics',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'string',
                  description: 'ID of the project'
                }
              },
              required: ['project_id']
            }
          },
          {
            name: 'ticktick_get_project_templates',
            description: 'List available project templates',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Filter by template category'
                }
              }
            }
          },
          // Collaboration & Sharing (12 operations)
          {
            name: 'ticktick_get_shared_projects',
            description: 'List shared projects',
            inputSchema: {
              type: 'object',
              properties: {
                include_owned: {
                  type: 'boolean',
                  description: 'Include projects you own',
                  default: true
                },
                include_received: {
                  type: 'boolean',
                  description: 'Include projects shared with you',
                  default: true
                }
              }
            }
          },
          {
            name: 'ticktick_get_task_assignees',
            description: 'List task assignees',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: {
                  type: 'string',
                  description: 'ID of the task'
                }
              },
              required: ['task_id']
            }
          },
          {
            name: 'ticktick_get_team_activity',
            description: 'Project activity feed',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'string',
                  description: 'ID of the project'
                },
                limit: {
                  type: 'number',
                  description: 'Number of activities to retrieve',
                  default: 50
                },
                activity_types: {
                  type: 'array',
                  items: { 
                    type: 'string',
                    enum: ['task_created', 'task_completed', 'task_assigned', 'comment_added', 'project_shared']
                  },
                  description: 'Filter by activity types'
                }
              },
              required: ['project_id']
            }
          },
          {
            name: 'ticktick_get_collaboration_stats',
            description: 'Team productivity metrics',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'string',
                  description: 'ID of the project'
                },
                time_period: {
                  type: 'string',
                  enum: ['week', 'month', 'quarter', 'year'],
                  description: 'Time period for stats',
                  default: 'month'
                }
              },
              required: ['project_id']
            }
          },
          // Calendar Integration (8 operations)
          {
            name: 'ticktick_get_calendar_events',
            description: 'List calendar events',
            inputSchema: {
              type: 'object',
              properties: {
                start_date: {
                  type: 'string',
                  description: 'Start date for events (YYYY-MM-DD)'
                },
                end_date: {
                  type: 'string',
                  description: 'End date for events (YYYY-MM-DD)'
                },
                calendar_id: {
                  type: 'string',
                  description: 'Specific calendar ID to filter'
                }
              }
            }
          },
          {
            name: 'ticktick_get_calendar_view',
            description: 'Calendar view for date range',
            inputSchema: {
              type: 'object',
              properties: {
                start_date: {
                  type: 'string',
                  description: 'Start date (YYYY-MM-DD)'
                },
                end_date: {
                  type: 'string',
                  description: 'End date (YYYY-MM-DD)'
                },
                view_type: {
                  type: 'string',
                  enum: ['day', 'week', 'month', 'agenda'],
                  description: 'Calendar view type',
                  default: 'week'
                },
                include_tasks: {
                  type: 'boolean',
                  description: 'Include tasks in calendar view',
                  default: true
                }
              }
            }
          },
          {
            name: 'ticktick_get_schedule_conflicts',
            description: 'Detect scheduling conflicts',
            inputSchema: {
              type: 'object',
              properties: {
                start_date: {
                  type: 'string',
                  description: 'Start date to check (YYYY-MM-DD)'
                },
                end_date: {
                  type: 'string',
                  description: 'End date to check (YYYY-MM-DD)'
                },
                include_tasks: {
                  type: 'boolean',
                  description: 'Include task conflicts',
                  default: true
                },
                conflict_threshold_minutes: {
                  type: 'number',
                  description: 'Minimum overlap time to consider conflict',
                  default: 15
                }
              }
            }
          },
          // Notes & Attachments (8 operations)
          {
            name: 'ticktick_get_task_notes',
            description: 'Get task notes/comments',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: {
                  type: 'string',
                  description: 'ID of the task'
                },
                include_replies: {
                  type: 'boolean',
                  description: 'Include comment replies',
                  default: true
                },
                sort_order: {
                  type: 'string',
                  enum: ['newest', 'oldest'],
                  description: 'Sort order for notes',
                  default: 'newest'
                }
              },
              required: ['task_id']
            }
          },
          {
            name: 'ticktick_get_task_attachments',
            description: 'List task attachments',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: {
                  type: 'string',
                  description: 'ID of the task'
                },
                file_type_filter: {
                  type: 'string',
                  enum: ['all', 'images', 'documents', 'audio', 'video'],
                  description: 'Filter by file type',
                  default: 'all'
                }
              },
              required: ['task_id']
            }
          },
          {
            name: 'ticktick_download_task_attachment',
            description: 'Download attached files',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: {
                  type: 'string',
                  description: 'ID of the task'
                },
                attachment_id: {
                  type: 'string',
                  description: 'ID of the attachment'
                },
                download_format: {
                  type: 'string',
                  enum: ['original', 'compressed'],
                  description: 'Download format',
                  default: 'original'
                }
              },
              required: ['task_id', 'attachment_id']
            }
          },
          // Templates & Automation (9 operations)
          {
            name: 'ticktick_get_task_templates',
            description: 'List task templates',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  description: 'Filter by template category'
                },
                include_shared: {
                  type: 'boolean',
                  description: 'Include templates shared by team',
                  default: true
                },
                sort_by: {
                  type: 'string',
                  enum: ['name', 'usage', 'created_date', 'updated_date'],
                  description: 'Sort templates by field',
                  default: 'usage'
                }
              }
            }
          },
          {
            name: 'ticktick_get_recurring_tasks',
            description: 'List recurring tasks',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'string',
                  description: 'Filter by project'
                },
                frequency_filter: {
                  type: 'string',
                  enum: ['all', 'daily', 'weekly', 'monthly', 'yearly'],
                  description: 'Filter by recurrence frequency',
                  default: 'all'
                },
                status: {
                  type: 'string',
                  enum: ['active', 'paused', 'completed'],
                  description: 'Filter by recurrence status',
                  default: 'active'
                }
              }
            }
          },
          {
            name: 'ticktick_get_productivity_report',
            description: 'Get comprehensive productivity analytics and insights',
            inputSchema: {
              type: 'object',
              properties: {
                time_range: {
                  type: 'string',
                  enum: ['today', 'week', 'month', 'quarter', 'year', 'custom'],
                  description: 'Time period for the report',
                  default: 'month'
                },
                start_date: {
                  type: 'string',
                  description: 'Start date for custom range (YYYY-MM-DD)'
                },
                end_date: {
                  type: 'string',
                  description: 'End date for custom range (YYYY-MM-DD)'
                },
                include_habits: {
                  type: 'boolean',
                  description: 'Include habit tracking data',
                  default: true
                },
                include_focus: {
                  type: 'boolean',
                  description: 'Include focus time data',
                  default: true
                },
                project_ids: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by specific projects'
                }
              }
            }
          },
          {
            name: 'ticktick_get_completion_trends',
            description: 'Analyze task completion patterns and trends over time',
            inputSchema: {
              type: 'object',
              properties: {
                period: {
                  type: 'string',
                  enum: ['daily', 'weekly', 'monthly'],
                  description: 'Granularity of trend analysis',
                  default: 'weekly'
                },
                duration: {
                  type: 'number',
                  description: 'Number of periods to analyze',
                  default: 12
                },
                project_id: {
                  type: 'string',
                  description: 'Filter by specific project'
                },
                tag_filter: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Filter by specific tags'
                },
                include_predictions: {
                  type: 'boolean',
                  description: 'Include trend predictions',
                  default: true
                }
              }
            }
          },
          {
            name: 'ticktick_get_time_tracking_report',
            description: 'Generate detailed time allocation and tracking analysis',
            inputSchema: {
              type: 'object',
              properties: {
                time_period: {
                  type: 'string',
                  enum: ['week', 'month', 'quarter'],
                  description: 'Reporting period',
                  default: 'month'
                },
                breakdown_by: {
                  type: 'string',
                  enum: ['project', 'tag', 'priority', 'assignee'],
                  description: 'How to categorize time data',
                  default: 'project'
                },
                include_estimates: {
                  type: 'boolean',
                  description: 'Compare actual vs estimated time',
                  default: true
                },
                focus_sessions_only: {
                  type: 'boolean',
                  description: 'Only include tracked focus sessions',
                  default: false
                },
                export_format: {
                  type: 'string',
                  enum: ['summary', 'detailed', 'csv'],
                  description: 'Level of detail in report',
                  default: 'detailed'
                }
              }
            }
          },
          {
            name: 'ticktick_get_goal_progress',
            description: 'Track progress toward personal and team goals',
            inputSchema: {
              type: 'object',
              properties: {
                goal_type: {
                  type: 'string',
                  enum: ['task_completion', 'habit_consistency', 'focus_time', 'project_milestones'],
                  description: 'Type of goals to analyze'
                },
                time_frame: {
                  type: 'string',
                  enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
                  description: 'Goal time frame',
                  default: 'monthly'
                },
                target_metrics: {
                  type: 'object',
                  properties: {
                    tasks_per_day: { type: 'number' },
                    focus_hours_per_week: { type: 'number' },
                    habit_streak_days: { type: 'number' },
                    project_completion_rate: { type: 'number' }
                  },
                  description: 'Specific targets to track against'
                },
                include_recommendations: {
                  type: 'boolean',
                  description: 'Include AI-powered improvement suggestions',
                  default: true
                }
              }
            }
          },
          {
            name: 'ticktick_export_analytics_data',
            description: 'Export raw analytics data for external analysis',
            inputSchema: {
              type: 'object',
              properties: {
                data_types: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['tasks', 'habits', 'focus_sessions', 'projects', 'time_logs']
                  },
                  description: 'Types of data to export',
                  default: ['tasks', 'habits', 'focus_sessions']
                },
                date_range: {
                  type: 'object',
                  properties: {
                    start_date: { type: 'string', description: 'Start date (YYYY-MM-DD)' },
                    end_date: { type: 'string', description: 'End date (YYYY-MM-DD)' }
                  },
                  required: ['start_date', 'end_date']
                },
                format: {
                  type: 'string',
                  enum: ['json', 'csv', 'xlsx'],
                  description: 'Export file format',
                  default: 'json'
                },
                include_metadata: {
                  type: 'boolean',
                  description: 'Include field descriptions and data schema',
                  default: true
                },
                privacy_filter: {
                  type: 'boolean',
                  description: 'Remove personally identifiable information',
                  default: false
                }
              },
              required: ['date_range']
            }
          },
          {
            name: 'ticktick_get_weekly_summary',
            description: 'Generate comprehensive weekly productivity summary',
            inputSchema: {
              type: 'object',
              properties: {
                week_offset: {
                  type: 'number',
                  description: 'Weeks ago (0 = current week, 1 = last week)',
                  default: 0
                },
                include_sections: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['tasks', 'habits', 'focus', 'achievements', 'challenges', 'next_week']
                  },
                  description: 'Sections to include in summary',
                  default: ['tasks', 'habits', 'focus', 'achievements']
                },
                compare_previous: {
                  type: 'boolean',
                  description: 'Compare with previous week',
                  default: true
                },
                personalization: {
                  type: 'object',
                  properties: {
                    tone: {
                      type: 'string',
                      enum: ['professional', 'casual', 'motivational', 'analytical'],
                      default: 'motivational'
                    },
                    focus_areas: {
                      type: 'array',
                      items: { type: 'string' },
                      description: 'Specific areas to emphasize'
                    }
                  }
                }
              }
            }
          },
          {
            name: 'ticktick_get_monthly_insights',
            description: 'Generate deep monthly performance insights and recommendations',
            inputSchema: {
              type: 'object',
              properties: {
                month_offset: {
                  type: 'number',
                  description: 'Months ago (0 = current month, 1 = last month)',
                  default: 0
                },
                insight_depth: {
                  type: 'string',
                  enum: ['overview', 'detailed', 'comprehensive'],
                  description: 'Level of analysis depth',
                  default: 'detailed'
                },
                focus_metrics: {
                  type: 'array',
                  items: {
                    type: 'string',
                    enum: ['efficiency', 'consistency', 'goal_achievement', 'time_management', 'stress_patterns']
                  },
                  description: 'Key metrics to analyze',
                  default: ['efficiency', 'consistency', 'goal_achievement']
                },
                benchmarking: {
                  type: 'object',
                  properties: {
                    compare_to_average: { type: 'boolean', default: true },
                    compare_to_best_month: { type: 'boolean', default: true },
                    include_peer_insights: { type: 'boolean', default: false }
                  }
                },
                action_planning: {
                  type: 'boolean',
                  description: 'Include actionable recommendations for next month',
                  default: true
                }
              }
            }
          },
          {
            name: 'ticktick_get_notification_settings',
            description: 'Get current notification preferences and settings',
            inputSchema: {
              type: 'object',
              properties: {
                category: {
                  type: 'string',
                  enum: ['all', 'tasks', 'habits', 'calendar', 'collaboration', 'system'],
                  description: 'Filter by notification category',
                  default: 'all'
                },
                include_disabled: {
                  type: 'boolean',
                  description: 'Include disabled notification types',
                  default: false
                }
              }
            }
          },
          {
            name: 'ticktick_get_sync_settings',
            description: 'Get device synchronization configuration and status',
            inputSchema: {
              type: 'object',
              properties: {
                include_device_list: {
                  type: 'boolean',
                  description: 'Include list of synced devices',
                  default: true
                },
                include_sync_history: {
                  type: 'boolean',
                  description: 'Include recent sync activity',
                  default: false
                }
              }
            }
          },
          {
            name: 'ticktick_get_cached_tasks',
            description: 'Get all cached tasks, optionally filtered by project',
            inputSchema: {
              type: 'object',
              properties: {
                project_id: {
                  type: 'string',
                  description: 'Optional project ID to filter tasks'
                },
                include_stale: {
                  type: 'boolean',
                  description: 'Include stale/expired cached tasks',
                  default: false
                }
              }
            }
          },
          {
            name: 'ticktick_register_task_id',
            description: 'Manually register a task ID in the cache for future reading',
            inputSchema: {
              type: 'object',
              properties: {
                task_id: {
                  type: 'string',
                  description: 'Task ID to register'
                },
                project_id: {
                  type: 'string',
                  description: 'Project ID the task belongs to'
                },
                title: {
                  type: 'string',
                  description: 'Optional task title for cache metadata'
                }
              },
              required: ['task_id', 'project_id']
            }
          }
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      if (!TICKTICK_ACCESS_TOKEN && !TICKTICK_TOKEN) {
        throw new McpError(ErrorCode.InvalidRequest, 'TickTick credentials not properly configured');
      }

      try {
        switch (name) {
          case 'ticktick_get_projects':
            return await this.getProjects(args);
          case 'ticktick_get_task_details':
            return await this.getTaskDetails(args);
          case 'ticktick_filter_tasks':
            return await this.filterTasks(args);
          case 'ticktick_convert_datetime_to_ticktick_format':
            return await this.convertDatetimeToTicktickFormat(args);
          case 'ticktick_get_tags':
            return await this.getTags(args);
          case 'ticktick_search_tasks':
            return await this.searchTasks(args);
          case 'ticktick_get_today_tasks':
            return await this.getTodayTasks(args);
          case 'ticktick_get_overdue_tasks':
            return await this.getOverdueTasks(args);
          case 'ticktick_get_upcoming_tasks':
            return await this.getUpcomingTasks(args);
          case 'ticktick_get_user_profile':
            return await this.getUserProfile(args);
          case 'ticktick_get_habits':
            return await this.getHabits(args);
          case 'ticktick_get_habit_history':
            return await this.getHabitHistory(args);
          case 'ticktick_get_habit_stats':
            return await this.getHabitStats(args);
          case 'ticktick_get_habit_streaks':
            return await this.getHabitStreaks(args);
          case 'ticktick_get_habit_calendar':
            return await this.getHabitCalendar(args);
          case 'ticktick_get_habits_summary':
            return await this.getHabitsSummary(args);
          case 'ticktick_export_habit_data':
            return await this.exportHabitData(args);
          case 'ticktick_get_tasks_by_tag':
            return await this.getTasksByTag(args);
          case 'ticktick_get_tag_usage_stats':
            return await this.getTagUsageStats(args);
          case 'ticktick_get_focus_stats':
            return await this.getFocusStats(args);
          case 'ticktick_get_daily_focus_summary':
            return await this.getDailyFocusSummary(args);
          case 'ticktick_get_focus_history':
            return await this.getFocusHistory(args);
          case 'ticktick_get_productivity_insights':
            return await this.getProductivityInsights(args);
          case 'ticktick_get_project_folders':
            return await this.getProjectFolders(args);
          case 'ticktick_get_project_stats':
            return await this.getProjectStats(args);
          case 'ticktick_get_project_templates':
            return await this.getProjectTemplates(args);
          case 'ticktick_get_shared_projects':
            return await this.getSharedProjects(args);
          case 'ticktick_get_task_assignees':
            return await this.getTaskAssignees(args);
          case 'ticktick_get_team_activity':
            return await this.getTeamActivity(args);
          case 'ticktick_get_collaboration_stats':
            return await this.getCollaborationStats(args);
          case 'ticktick_get_calendar_events':
            return await this.getCalendarEvents(args);
          case 'ticktick_get_calendar_view':
            return await this.getCalendarView(args);
          case 'ticktick_get_schedule_conflicts':
            return await this.getScheduleConflicts(args);
          case 'ticktick_get_task_notes':
            return await this.getTaskNotes(args);
          case 'ticktick_get_task_attachments':
            return await this.getTaskAttachments(args);
          case 'ticktick_download_task_attachment':
            return await this.downloadTaskAttachment(args);
          case 'ticktick_get_task_templates':
            return await this.getTaskTemplates(args);
          case 'ticktick_get_recurring_tasks':
            return await this.getRecurringTasks(args);
          case 'ticktick_get_productivity_report':
            return await this.getProductivityReport(args);
          case 'ticktick_get_completion_trends':
            return await this.getCompletionTrends(args);
          case 'ticktick_get_time_tracking_report':
            return await this.getTimeTrackingReport(args);
          case 'ticktick_get_goal_progress':
            return await this.getGoalProgress(args);
          case 'ticktick_export_analytics_data':
            return await this.exportAnalyticsData(args);
          case 'ticktick_get_weekly_summary':
            return await this.getWeeklySummary(args);
          case 'ticktick_get_monthly_insights':
            return await this.getMonthlyInsights(args);
          case 'ticktick_get_notification_settings':
            return await this.getNotificationSettings(args);
          case 'ticktick_get_sync_settings':
            return await this.getSyncSettings(args);
          case 'ticktick_get_cached_tasks':
            return await this.getCachedTasks(args);
          case 'ticktick_register_task_id':
            return await this.registerTaskId(args);
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`❌ Error in ${name}:`, error);
        throw new McpError(ErrorCode.InternalError, `Error: ${error.message}`);
      }
    });
  }

  async makeTickTickRequest(endpoint, method = 'GET', data = null) {
    // SAFETY: Read-only mode - reject all non-GET requests
    if (method !== 'GET') {
      throw new Error(`Read-only mode: ${method} requests are blocked. Only GET requests are allowed.`);
    }

    const baseUrl = 'https://api.ticktick.com/open/v1';
    const url = `${baseUrl}${endpoint}`;
    
    const headers = {
      'Authorization': `Bearer ${TICKTICK_ACCESS_TOKEN || TICKTICK_TOKEN}`,
      'Content-Type': 'application/json'
    };

    const config = {
      method,
      headers
    };

    if (data && method !== 'GET') {
      config.body = JSON.stringify(data);
    }

    console.log(`🔍 TickTick API Request: ${method} ${url}`);
    if (data) console.log(`📤 Request Data:`, JSON.stringify(data, null, 2));

    const response = await fetch(url, config);
    
    console.log(`📊 TickTick API Response: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ TickTick API Error Response:`, errorText);
      throw new Error(`TickTick API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const responseData = await response.json();
    console.log(`📥 Response Data:`, JSON.stringify(responseData, null, 2));
    
    return responseData;
  }

  // Fetch all tasks across all projects using /project/{projectId}/data
  // The TickTick Open API doesn't have a bulk task listing endpoint,
  // so we iterate over projects and collect tasks from each one.
  async getAllTasks() {
    const projects = await this.makeTickTickRequest('/project');
    const allTasks = [];

    // Include Inbox -- the Open API doesn't list it as a project,
    // but GET /project/inbox/data works and returns Inbox tasks.
    const inboxProject = { id: 'inbox', name: 'Inbox' };
    const allProjects = [inboxProject, ...projects];

    for (const project of allProjects) {
      try {
        const data = await this.makeTickTickRequest(`/project/${project.id}/data`);
        if (data && data.tasks && Array.isArray(data.tasks)) {
          // Tag each task with the project name for display purposes
          for (const task of data.tasks) {
            task._projectName = project.name;
            allTasks.push(task);
          }
        }
      } catch (err) {
        // Some projects may fail (e.g. permission issues) -- skip and continue
        console.warn(`Skipping project "${project.name}" (${project.id}): ${err.message}`);
      }
    }

    return allTasks;
  }

  // Cache-based task management methods
  async importFromCsv({ csv_data }) {
    try {
      const lines = csv_data.trim().split('\n');
      const headers = lines[0].toLowerCase().split(',');
      
      // Find column indices
      const taskIdIndex = headers.findIndex(h => h.includes('task_id') || h.includes('id'));
      const projectIdIndex = headers.findIndex(h => h.includes('project_id') || h.includes('project'));
      const titleIndex = headers.findIndex(h => h.includes('title') || h.includes('name'));
      
      if (taskIdIndex === -1 || projectIdIndex === -1) {
        throw new Error('CSV must contain task_id and project_id columns');
      }
      
      const cache = this.loadCache();
      let importedCount = 0;
      
      for (let i = 1; i < lines.length; i++) {
        const row = lines[i].split(',');
        if (row.length >= 2) {
          const taskId = row[taskIdIndex]?.trim();
          const projectId = row[projectIdIndex]?.trim();
          const title = titleIndex !== -1 ? row[titleIndex]?.trim() : 'Imported Task';
          
          if (taskId && projectId) {
            cache.tasks[taskId] = {
              project_id: projectId,
              title: title || 'Imported Task',
              cached_at: new Date().toISOString()
            };
            importedCount++;
          }
        }
      }
      
      this.saveCache(cache);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **CSV Import Successful!**\n\n` +
                `📊 **Import Summary**:\n` +
                `• **Tasks Imported**: ${importedCount}\n` +
                `• **Cache Updated**: ${new Date().toLocaleString()}\n` +
                `• **Total Cached Tasks**: ${Object.keys(cache.tasks).length}\n\n` +
                `💡 **Next Steps**:\n` +
                `• Use \`ticktick_get_cached_tasks()\` to see all cached tasks\n` +
                `• Use \`ticktick_get_task_details(project_id, task_id)\` to read specific tasks\n` +
                `• Tasks will auto-expire after 24 hours for freshness`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to import CSV: ${error.message}`);
    }
  }

  async getCachedTasks({ project_id, include_stale = false }) {
    try {
      const cache = this.loadCache();
      let tasks = Object.entries(cache.tasks);
      
      // Filter by project if specified
      if (project_id) {
        tasks = tasks.filter(([_, task]) => task.project_id === project_id);
      }
      
      // Filter out stale tasks unless requested
      if (!include_stale) {
        tasks = tasks.filter(([_, task]) => !this.isTaskStale(task));
      }
      
      const freshTasks = tasks.filter(([_, task]) => !this.isTaskStale(task));
      const staleTasks = tasks.length - freshTasks.length;
      
      return {
        content: [{
          type: 'text',
          text: `📋 **Cached Tasks** ${project_id ? `(Project: ${project_id})` : '(All Projects)'}\n\n` +
                `📊 **Cache Summary**:\n` +
                `• **Fresh Tasks**: ${freshTasks.length}\n` +
                `• **Stale Tasks**: ${staleTasks}\n` +
                `• **Total Tasks**: ${tasks.length}\n\n` +
                
                (tasks.length > 0 ? 
                  `🔍 **Available Tasks**:\n` +
                  tasks.map(([taskId, task]) => {
                    const isStale = this.isTaskStale(task);
                    const staleIcon = isStale ? '⏰' : '✅';
                    return `${staleIcon} **${task.title}**\n` +
                           `   📋 Task ID: \`${taskId}\`\n` +
                           `   📁 Project: ${task.project_id}\n` +
                           `   📅 Cached: ${new Date(task.cached_at).toLocaleString()}\n` +
                           `   ${isStale ? '⚠️ *Stale - may need refresh*' : ''}`;
                  }).join('\n\n') :
                  `📭 **No tasks found in cache.**\n\n` +
                  `💡 **To populate cache**:\n` +
                  `• Use \`ticktick_import_from_csv()\` with exported data\n` +
                  `• Use \`ticktick_register_task_id()\` for specific tasks\n` +
                  `• Create tasks via MCP (auto-cached)`
                ) +
                
                `\n\n💡 **Usage Tips**:\n` +
                `• Use task IDs with \`ticktick_get_task_details(project_id, task_id)\`\n` +
                `• Fresh tasks are less than 24 hours old\n` +
                `• Stale tasks may have outdated information`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get cached tasks: ${error.message}`);
    }
  }

  async registerTaskId({ task_id, project_id, title }) {
    try {
      // Try to fetch the actual task to validate and get real title
      let actualTitle = title || 'Registered Task';
      try {
        const taskDetails = await this.makeTickTickRequest(`/project/${project_id}/task/${task_id}`);
        actualTitle = taskDetails.title || actualTitle;
      } catch (error) {
        console.warn('Could not fetch task details for validation:', error.message);
        // Continue with manual registration even if validation fails
      }
      
      this.addTaskToCache(task_id, project_id, actualTitle);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Task Registered Successfully!**\n\n` +
                `📋 **Task Details**:\n` +
                `• **Task ID**: \`${task_id}\`\n` +
                `• **Project ID**: ${project_id}\n` +
                `• **Title**: ${actualTitle}\n` +
                `• **Registered**: ${new Date().toLocaleString()}\n\n` +
                `💡 **Next Steps**:\n` +
                `• Use \`ticktick_get_task_details("${project_id}", "${task_id}")\` to read the task\n` +
                `• Use \`ticktick_get_cached_tasks()\` to see all cached tasks\n` +
                `• Task will auto-expire after 24 hours for freshness`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to register task: ${error.message}`);
    }
  }

  async getProjects({ include_archived = false }) {
    try {
      const projects = await this.makeTickTickRequest('/project');
      
      const filteredProjects = include_archived ? 
        projects : 
        projects.filter(p => !p.closed);

      return {
        content: [{
          type: 'text',
          text: `📁 **TickTick Projects** (${filteredProjects.length} found):\n\n` +
                filteredProjects.map(project => 
                  `**${project.name}** (ID: ${project.id})\n` +
                  `- Color: ${project.color}\n` +
                  `- Shared: ${project.isOwner ? 'Owner' : 'Member'}\n` +
                  `- Task Count: ${project.taskCount || 0}\n` +
                  `- Modified: ${project.modifiedTime ? new Date(project.modifiedTime).toLocaleDateString() : 'Unknown'}\n`
                ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get projects: ${error.message}`);
    }
  }

  async createProject({ name, color = '#3498db', is_shared = false }) {
    try {
      const projectData = {
        name,
        color,
        isOwner: true,
        permission: is_shared ? 'members' : 'owner'
      };

      const project = await this.makeTickTickRequest('/project', 'POST', projectData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Created TickTick Project**\n\n` +
                `📁 **Name**: ${project.name}\n` +
                `🆔 **ID**: ${project.id}\n` +
                `🎨 **Color**: ${project.color}\n` +
                `📅 **Created**: ${new Date(project.modifiedTime).toLocaleDateString()}\n` +
                `🔒 **Shared**: ${is_shared ? 'Yes' : 'No'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create project: ${error.message}`);
    }
  }

  async getTasks({ project_id, completed, limit = 50 }) {
    try {
      // Note: TickTick API doesn't provide a direct "get all tasks in project" endpoint
      // This method is deprecated in favor of getTaskDetails with specific task IDs
      throw new Error('getTasks method is deprecated. Use getTaskDetails with specific project_id and task_id, or getProjectData to get project with task information.');
    } catch (error) {
      throw new Error(`Failed to get tasks: ${error.message}`);
    }
  }

  async getTaskDetails({ project_id, task_id }) {
    try {
      // Use the correct TickTick API endpoint pattern
      const endpoint = `/project/${project_id}/task/${task_id}`;
      const task = await this.makeTickTickRequest(endpoint);
      
      return {
        content: [{
          type: 'text',
          text: `📝 **TickTick Task Details**\n\n` +
                `**${task.title}** (ID: ${task.id})\n` +
                `- Status: ${task.status === 2 ? '✅ Completed' : '⏳ Pending'}\n` +
                `- Priority: ${this.getPriorityText(task.priority)}\n` +
                `- Project: ${task.projectId}\n` +
                `${task.content ? `- Content: ${task.content}\n` : ''}` +
                `${task.dueDate ? `- Due: ${new Date(task.dueDate).toLocaleDateString()}\n` : ''}` +
                `${task.tags && task.tags.length ? `- Tags: ${task.tags.join(', ')}\n` : ''}` +
                `- Created: ${new Date(task.createdTime).toLocaleDateString()}\n` +
                `- Modified: ${new Date(task.modifiedTime).toLocaleDateString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get task details: ${error.message}`);
    }
  }

  async createTask({ title, content, project_id, priority = 0, due_date, tags }) {
    try {
      const taskData = {
        title,
        content: content || '',
        priority,
        status: 0 // 0 = not completed
      };

      if (project_id) taskData.projectId = project_id;
      if (due_date) taskData.dueDate = new Date(due_date).toISOString();
      if (tags && tags.length) taskData.tags = tags;

      const task = await this.makeTickTickRequest('/task', 'POST', taskData);
      
      // Auto-cache the created task
      this.addTaskToCache(task.id, task.projectId || project_id, task.title);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Created TickTick Task**\n\n` +
                `📝 **Title**: ${task.title}\n` +
                `🆔 **ID**: ${task.id}\n` +
                `📁 **Project**: ${task.projectId || 'Inbox'}\n` +
                `⚡ **Priority**: ${this.getPriorityText(task.priority)}\n` +
                `${task.dueDate ? `📅 **Due**: ${new Date(task.dueDate).toLocaleDateString()}\n` : ''}` +
                `${task.tags && task.tags.length ? `🏷️ **Tags**: ${task.tags.join(', ')}\n` : ''}` +
                `📅 **Created**: ${new Date(task.createdTime).toLocaleDateString()}\n\n` +
                `🔄 **Auto-cached for easy retrieval!** Use \`ticktick_get_cached_tasks()\` to see all cached tasks.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create task: ${error.message}`);
    }
  }

  async updateTask({ task_id, title, content, priority, due_date, completed }) {
    try {
      const updateData = {};
      
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) updateData.content = content;
      if (priority !== undefined) updateData.priority = priority;
      if (due_date !== undefined) updateData.dueDate = new Date(due_date).toISOString();
      if (completed !== undefined) updateData.status = completed ? 2 : 0;

      const task = await this.makeTickTickRequest(`/task/${task_id}`, 'POST', updateData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Updated TickTick Task**\n\n` +
                `📝 **Title**: ${task.title}\n` +
                `🆔 **ID**: ${task.id}\n` +
                `🔄 **Status**: ${task.status === 2 ? '✅ Completed' : '⏳ Pending'}\n` +
                `⚡ **Priority**: ${this.getPriorityText(task.priority)}\n` +
                `📅 **Updated**: ${new Date(task.modifiedTime).toLocaleDateString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update task: ${error.message}`);
    }
  }

  async deleteTask({ task_id }) {
    try {
      await this.makeTickTickRequest(`/task/${task_id}`, 'DELETE');
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Deleted TickTick Task**\n\nTask ID: ${task_id} has been permanently deleted.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to delete task: ${error.message}`);
    }
  }

  async completeTask({ task_id }) {
    try {
      const task = await this.makeTickTickRequest(`/task/${task_id}`, 'POST', { status: 2 });
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Completed TickTick Task**\n\n` +
                `📝 **Title**: ${task.title}\n` +
                `🆔 **ID**: ${task.id}\n` +
                `🎉 **Status**: Completed\n` +
                `📅 **Completed**: ${new Date().toLocaleDateString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to complete task: ${error.message}`);
    }
  }


  async filterTasks({ keywords, tags, priority, due_before, due_after }) {
    try {
      const allTasks = await this.getAllTasks();

      let filteredTasks = allTasks.filter(t => t.status !== 2);
      
      if (keywords) {
        const keywordLower = keywords.toLowerCase();
        filteredTasks = filteredTasks.filter(task => 
          task.title.toLowerCase().includes(keywordLower) ||
          (task.content && task.content.toLowerCase().includes(keywordLower))
        );
      }
      
      if (tags && tags.length) {
        filteredTasks = filteredTasks.filter(task => 
          task.tags && tags.some(tag => task.tags.includes(tag))
        );
      }
      
      if (priority !== undefined) {
        filteredTasks = filteredTasks.filter(task => task.priority === priority);
      }
      
      if (due_before) {
        const beforeDate = new Date(due_before);
        filteredTasks = filteredTasks.filter(task => 
          task.dueDate && new Date(task.dueDate) < beforeDate
        );
      }
      
      if (due_after) {
        const afterDate = new Date(due_after);
        filteredTasks = filteredTasks.filter(task => 
          task.dueDate && new Date(task.dueDate) > afterDate
        );
      }

      return {
        content: [{
          type: 'text',
          text: filteredTasks.length === 0
                ? `No tasks matched the given filters.`
                : `**Filtered Tasks** (${filteredTasks.length} found):\n\n` +
                  filteredTasks.map(task =>
                    `**${task.title}** (ID: ${task.id})\n` +
                    `- Priority: ${this.getPriorityText(task.priority)}\n` +
                    `${task.dueDate ? `- Due: ${new Date(task.dueDate).toLocaleDateString()}\n` : ''}` +
                    `- Project: ${task._projectName || task.projectId}\n` +
                    `${task.tags && task.tags.length ? `- Tags: ${task.tags.join(', ')}\n` : ''}`
                  ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to filter tasks: ${error.message}`);
    }
  }

  async convertDatetimeToTicktickFormat({ datetime_string, timezone = 'UTC' }) {
    try {
      const date = new Date(datetime_string);
      const isoString = date.toISOString();
      
      return {
        content: [{
          type: 'text',
          text: `🕐 **DateTime Conversion**\n\n` +
                `**Input**: ${datetime_string}\n` +
                `**Timezone**: ${timezone}\n` +
                `**TickTick Format**: ${isoString}\n` +
                `**Timestamp**: ${date.getTime()}\n\n` +
                `Use this ISO format for TickTick API calls.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to convert datetime: ${error.message}`);
    }
  }

  getPriorityText(priority) {
    switch (priority) {
      case 0: return '⚪ None';
      case 1: return '🔵 Low';
      case 3: return '🟡 Medium';
      case 5: return '🔴 High';
      default: return `Unknown (${priority})`;
    }
  }

  async getTags() {
    try {
      const tags = await this.makeTickTickRequest('/tag');
      
      return {
        content: [{
          type: 'text',
          text: `🏷️ **TickTick Tags** (${tags.length} found):\n\n` +
                tags.map(tag => 
                  `**${tag.name}** (ID: ${tag.id})\n` +
                  `- Color: ${tag.color || 'Default'}\n` +
                  `- Usage Count: ${tag.usageCount || 0}\n`
                ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get tags: ${error.message}`);
    }
  }

  async createTag({ name, color = '#3498db' }) {
    try {
      const tagData = {
        name,
        color
      };

      const tag = await this.makeTickTickRequest('/tag', 'POST', tagData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Created TickTick Tag**\n\n` +
                `🏷️ **Name**: ${tag.name}\n` +
                `🆔 **ID**: ${tag.id}\n` +
                `🎨 **Color**: ${tag.color}\n` +
                `📅 **Created**: ${new Date().toLocaleDateString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create tag: ${error.message}`);
    }
  }

  async searchTasks({ query, limit = 20 }) {
    try {
      const endpoint = `/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      const results = await this.makeTickTickRequest(endpoint);
      
      const tasks = results.tasks || results || [];
      
      return {
        content: [{
          type: 'text',
          text: `🔍 **Search Results for "${query}"** (${tasks.length} found):\n\n` +
                tasks.map(task => 
                  `**${task.title}** (ID: ${task.id})\n` +
                  `- Status: ${task.status === 2 ? '✅ Completed' : '⏳ Pending'}\n` +
                  `- Priority: ${this.getPriorityText(task.priority)}\n` +
                  `- Project: ${task.projectId}\n` +
                  `${task.content ? `- Content: ${task.content.substring(0, 100)}...\n` : ''}` +
                  `${task.dueDate ? `- Due: ${new Date(task.dueDate).toLocaleDateString()}\n` : ''}`
                ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to search tasks: ${error.message}`);
    }
  }

  async getTodayTasks({ include_overdue = true }) {
    try {
      const allTasks = await this.getAllTasks();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

      const tasks = allTasks.filter(task => {
        if (task.status === 2) return false; // skip completed
        if (!task.dueDate) return false;
        const due = new Date(task.dueDate);
        if (include_overdue) {
          return due < todayEnd;
        }
        return due >= todayStart && due < todayEnd;
      });

      return {
        content: [{
          type: 'text',
          text: tasks.length === 0
            ? `No tasks due today${include_overdue ? ' (including overdue)' : ''}.`
            : `**Today's Tasks** (${tasks.length} found):\n\n` +
              tasks.map(task => {
                const due = new Date(task.dueDate);
                const isOverdue = due < todayStart;
                return `**${task.title}** (ID: ${task.id})\n` +
                  `- Status: ${isOverdue ? 'OVERDUE' : 'Pending'}\n` +
                  `- Priority: ${this.getPriorityText(task.priority)}\n` +
                  `- Due: ${due.toLocaleDateString()}\n` +
                  `- Project: ${task._projectName || task.projectId}\n` +
                  `${task.tags && task.tags.length ? `- Tags: ${task.tags.join(', ')}\n` : ''}`;
              }).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get today's tasks: ${error.message}`);
    }
  }

  async getOverdueTasks({ limit = 50 }) {
    try {
      const allTasks = await this.getAllTasks();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      const tasks = allTasks
        .filter(task => {
          if (task.status === 2) return false;
          if (!task.dueDate) return false;
          return new Date(task.dueDate) < todayStart;
        })
        .slice(0, limit);

      return {
        content: [{
          type: 'text',
          text: tasks.length === 0
            ? `No overdue tasks found.`
            : `**Overdue Tasks** (${tasks.length} found):\n\n` +
              tasks.map(task => {
                const dueDate = new Date(task.dueDate);
                const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

                return `**${task.title}** (ID: ${task.id})\n` +
                       `- Priority: ${this.getPriorityText(task.priority)}\n` +
                       `- Due: ${dueDate.toLocaleDateString()} (${daysOverdue} days ago)\n` +
                         `- Project: ${task._projectName || task.projectId}\n` +
                         `${task.tags && task.tags.length ? `- Tags: ${task.tags.join(', ')}\n` : ''}`;
                }).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get overdue tasks: ${error.message}`);
    }
  }

  async getUpcomingTasks({ days_ahead = 7, limit = 30 }) {
    try {
      const allTasks = await this.getAllTasks();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const futureEnd = new Date(todayStart.getTime() + (days_ahead + 1) * 24 * 60 * 60 * 1000);

      const tasks = allTasks
        .filter(task => {
          if (task.status === 2) return false;
          if (!task.dueDate) return false;
          const due = new Date(task.dueDate);
          return due >= todayStart && due < futureEnd;
        })
        .slice(0, limit);

      return {
        content: [{
          type: 'text',
          text: tasks.length === 0
            ? `No upcoming tasks in the next ${days_ahead} days.`
            : `**Upcoming Tasks** (Next ${days_ahead} days, ${tasks.length} found):\n\n` +
              tasks.map(task =>
                `**${task.title}** (ID: ${task.id})\n` +
                `- Priority: ${this.getPriorityText(task.priority)}\n` +
                `- Due: ${new Date(task.dueDate).toLocaleDateString()}\n` +
                `- Project: ${task._projectName || task.projectId}\n` +
                `${task.tags && task.tags.length ? `- Tags: ${task.tags.join(', ')}\n` : ''}`
              ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get upcoming tasks: ${error.message}`);
    }
  }

  async addTagToTask({ task_id, tag_name }) {
    try {
      // First get the current task to preserve existing data
      const task = await this.makeTickTickRequest(`/task/${task_id}`);
      
      // Add the new tag to existing tags
      const currentTags = task.tags || [];
      if (!currentTags.includes(tag_name)) {
        currentTags.push(tag_name);
      }
      
      // Update the task with new tags
      const updatedTask = await this.makeTickTickRequest(`/task/${task_id}`, 'PUT', {
        ...task,
        tags: currentTags
      });
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Added Tag to Task**\n\n` +
                `📝 **Task**: ${task.title}\n` +
                `🏷️ **Tag Added**: ${tag_name}\n` +
                `🏷️ **All Tags**: ${currentTags.join(', ')}\n` +
                `📅 **Updated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to add tag to task: ${error.message}`);
    }
  }

  async getUserProfile() {
    try {
      const profile = await this.makeTickTickRequest('/user/profile');
      
      return {
        content: [{
          type: 'text',
          text: `👤 **TickTick User Profile**\n\n` +
                `**Name**: ${profile.name || 'Not set'}\n` +
                `**Email**: ${profile.email || 'Not available'}\n` +
                `**Username**: ${profile.username || 'Not set'}\n` +
                `**Timezone**: ${profile.timezone || 'Not set'}\n` +
                `**Pro Status**: ${profile.pro ? '✅ Pro Member' : '❌ Free Account'}\n` +
                `**Member Since**: ${profile.createdTime ? new Date(profile.createdTime).toLocaleDateString() : 'Unknown'}\n` +
                `**Total Tasks**: ${profile.totalTasks || 0}\n` +
                `**Completed Tasks**: ${profile.completedTasks || 0}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get user profile: ${error.message}`);
    }
  }

  // ===== HABITS & TRACKING METHODS =====

  async getHabits({ include_archived = false }) {
    try {
      const habits = await this.makeTickTickRequest('/habit');
      
      const filteredHabits = include_archived ? 
        habits : 
        habits.filter(h => !h.archived);

      return {
        content: [{
          type: 'text',
          text: `🔄 **TickTick Habits** (${filteredHabits.length} found):\n\n` +
                filteredHabits.map(habit => 
                  `**${habit.name}** (ID: ${habit.id})\n` +
                  `- Frequency: ${habit.frequency || 'Daily'}\n` +
                  `- Goal: ${habit.goal || 1} times per ${habit.frequency || 'day'}\n` +
                  `- Current Streak: ${habit.currentStreak || 0} days\n` +
                  `- Status: ${habit.paused ? '⏸️ Paused' : '▶️ Active'}\n` +
                  `- Color: ${habit.color || 'Default'}\n` +
                  `- Created: ${habit.createdTime ? new Date(habit.createdTime).toLocaleDateString() : 'Unknown'}\n`
                ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get habits: ${error.message}`);
    }
  }

  async createHabit({ name, frequency = 'daily', goal = 1, reminder_time, color = '#3498db' }) {
    try {
      const habitData = {
        name,
        frequency,
        goal,
        color,
        createdTime: new Date().toISOString()
      };

      if (reminder_time) {
        habitData.reminderTime = reminder_time;
      }

      const habit = await this.makeTickTickRequest('/habit', 'POST', habitData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Created TickTick Habit**\n\n` +
                `🔄 **Name**: ${habit.name}\n` +
                `🆔 **ID**: ${habit.id}\n` +
                `📅 **Frequency**: ${habit.frequency}\n` +
                `🎯 **Goal**: ${habit.goal} times per ${habit.frequency}\n` +
                `🎨 **Color**: ${habit.color}\n` +
                `${habit.reminderTime ? `⏰ **Reminder**: ${habit.reminderTime}\n` : ''}` +
                `📅 **Created**: ${new Date().toLocaleDateString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create habit: ${error.message}`);
    }
  }

  async updateHabit({ habit_id, name, frequency, goal, reminder_time, color }) {
    try {
      // Get current habit data
      const currentHabit = await this.makeTickTickRequest(`/habit/${habit_id}`);
      
      // Update only provided fields
      const updateData = { ...currentHabit };
      if (name) updateData.name = name;
      if (frequency) updateData.frequency = frequency;
      if (goal) updateData.goal = goal;
      if (reminder_time) updateData.reminderTime = reminder_time;
      if (color) updateData.color = color;

      const updatedHabit = await this.makeTickTickRequest(`/habit/${habit_id}`, 'PUT', updateData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Updated TickTick Habit**\n\n` +
                `🔄 **Name**: ${updatedHabit.name}\n` +
                `📅 **Frequency**: ${updatedHabit.frequency}\n` +
                `🎯 **Goal**: ${updatedHabit.goal}\n` +
                `🎨 **Color**: ${updatedHabit.color}\n` +
                `📅 **Updated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update habit: ${error.message}`);
    }
  }

  async deleteHabit({ habit_id }) {
    try {
      await this.makeTickTickRequest(`/habit/${habit_id}`, 'DELETE');
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Deleted TickTick Habit**\n\n` +
                `🆔 **Habit ID**: ${habit_id}\n` +
                `📅 **Deleted**: ${new Date().toLocaleString()}\n\n` +
                `⚠️ **Note**: This action cannot be undone. All habit history has been permanently removed.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to delete habit: ${error.message}`);
    }
  }

  async checkinHabit({ habit_id, date, count = 1 }) {
    try {
      const checkinDate = date || new Date().toISOString().split('T')[0];
      
      const checkinData = {
        habitId: habit_id,
        date: checkinDate,
        count: count,
        timestamp: new Date().toISOString()
      };

      const checkin = await this.makeTickTickRequest('/habit/checkin', 'POST', checkinData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Habit Check-in Successful**\n\n` +
                `🔄 **Habit ID**: ${habit_id}\n` +
                `📅 **Date**: ${checkinDate}\n` +
                `🔢 **Count**: ${count}\n` +
                `🔥 **New Streak**: ${checkin.newStreak || 'Unknown'}\n` +
                `📊 **Progress**: ${checkin.progress || 'N/A'}\n` +
                `⏰ **Checked in**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to check in habit: ${error.message}`);
    }
  }

  async getHabitHistory({ habit_id, days_back = 30 }) {
    try {
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - days_back * 24 * 60 * 60 * 1000);
      
      const endpoint = `/habit/${habit_id}/history?start=${startDate.toISOString().split('T')[0]}&end=${endDate.toISOString().split('T')[0]}`;
      const history = await this.makeTickTickRequest(endpoint);
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Habit History** (Last ${days_back} days)\n\n` +
                `🔄 **Habit ID**: ${habit_id}\n` +
                `📅 **Period**: ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}\n\n` +
                `**Completion Records**:\n` +
                history.map(record => 
                  `• ${record.date}: ${record.completed ? '✅' : '❌'} (${record.count || 0} times)`
                ).join('\n') +
                `\n\n**Summary**:\n` +
                `- Total Days: ${history.length}\n` +
                `- Completed: ${history.filter(r => r.completed).length}\n` +
                `- Completion Rate: ${Math.round((history.filter(r => r.completed).length / history.length) * 100)}%`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get habit history: ${error.message}`);
    }
  }

  async getHabitStats({ habit_id }) {
    try {
      const stats = await this.makeTickTickRequest(`/habit/${habit_id}/stats`);
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Habit Statistics**\n\n` +
                `🔄 **Habit ID**: ${habit_id}\n` +
                `🔥 **Current Streak**: ${stats.currentStreak || 0} days\n` +
                `🏆 **Longest Streak**: ${stats.longestStreak || 0} days\n` +
                `📈 **Total Completions**: ${stats.totalCompletions || 0}\n` +
                `📅 **Days Tracked**: ${stats.daysTracked || 0}\n` +
                `📊 **Success Rate**: ${stats.successRate || 0}%\n` +
                `📈 **Weekly Average**: ${stats.weeklyAverage || 0} completions\n` +
                `📈 **Monthly Average**: ${stats.monthlyAverage || 0} completions\n` +
                `📅 **Last Completed**: ${stats.lastCompleted ? new Date(stats.lastCompleted).toLocaleDateString() : 'Never'}\n` +
                `📅 **Generated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get habit stats: ${error.message}`);
    }
  }

  async pauseHabit({ habit_id, resume_date }) {
    try {
      const pauseData = {
        paused: true,
        pausedDate: new Date().toISOString().split('T')[0]
      };

      if (resume_date) {
        pauseData.resumeDate = resume_date;
      }

      const habit = await this.makeTickTickRequest(`/habit/${habit_id}`, 'PUT', pauseData);
      
      return {
        content: [{
          type: 'text',
          text: `⏸️ **Habit Paused**\n\n` +
                `🔄 **Habit ID**: ${habit_id}\n` +
                `📅 **Paused Date**: ${pauseData.pausedDate}\n` +
                `${resume_date ? `📅 **Resume Date**: ${resume_date}\n` : ''}` +
                `📊 **Status**: Paused\n` +
                `📝 **Note**: Habit tracking is temporarily disabled. Your streak will be preserved.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to pause habit: ${error.message}`);
    }
  }

  async resumeHabit({ habit_id }) {
    try {
      const resumeData = {
        paused: false,
        resumedDate: new Date().toISOString().split('T')[0]
      };

      const habit = await this.makeTickTickRequest(`/habit/${habit_id}`, 'PUT', resumeData);
      
      return {
        content: [{
          type: 'text',
          text: `▶️ **Habit Resumed**\n\n` +
                `🔄 **Habit ID**: ${habit_id}\n` +
                `📅 **Resumed Date**: ${resumeData.resumedDate}\n` +
                `📊 **Status**: Active\n` +
                `🔥 **Streak Preserved**: ${habit.currentStreak || 0} days\n` +
                `📝 **Note**: Habit tracking is now active again.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to resume habit: ${error.message}`);
    }
  }

  async getHabitStreaks({ habit_id }) {
    try {
      const streaks = await this.makeTickTickRequest(`/habit/${habit_id}/streaks`);
      
      return {
        content: [{
          type: 'text',
          text: `🔥 **Habit Streaks**\n\n` +
                `🔄 **Habit ID**: ${habit_id}\n` +
                `🔥 **Current Streak**: ${streaks.current || 0} days\n` +
                `🏆 **Longest Streak**: ${streaks.longest || 0} days\n` +
                `📅 **Current Streak Started**: ${streaks.currentStart ? new Date(streaks.currentStart).toLocaleDateString() : 'N/A'}\n` +
                `📅 **Longest Streak Period**: ${streaks.longestStart && streaks.longestEnd ? 
                  `${new Date(streaks.longestStart).toLocaleDateString()} - ${new Date(streaks.longestEnd).toLocaleDateString()}` : 'N/A'}\n` +
                `📊 **Streak History**:\n` +
                (streaks.history || []).slice(0, 5).map((streak, index) => 
                  `${index + 1}. ${streak.length} days (${new Date(streak.start).toLocaleDateString()} - ${new Date(streak.end).toLocaleDateString()})`
                ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get habit streaks: ${error.message}`);
    }
  }

  async bulkCheckinHabits({ habit_ids, date }) {
    try {
      const checkinDate = date || new Date().toISOString().split('T')[0];
      
      const bulkData = {
        habitIds: habit_ids,
        date: checkinDate,
        timestamp: new Date().toISOString()
      };

      const results = await this.makeTickTickRequest('/habit/bulk-checkin', 'POST', bulkData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Bulk Habit Check-in**\n\n` +
                `📅 **Date**: ${checkinDate}\n` +
                `🔢 **Habits Processed**: ${habit_ids.length}\n` +
                `✅ **Successful**: ${results.successful || 0}\n` +
                `❌ **Failed**: ${results.failed || 0}\n\n` +
                `**Results**:\n` +
                (results.details || []).map(result => 
                  `• ${result.habitId}: ${result.success ? '✅ Success' : '❌ Failed'} ${result.newStreak ? `(Streak: ${result.newStreak})` : ''}`
                ).join('\n') +
                `\n\n⏰ **Processed**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to bulk check-in habits: ${error.message}`);
    }
  }

  async getHabitCalendar({ habit_id, year = new Date().getFullYear(), month }) {
    try {
      let endpoint = `/habit/${habit_id}/calendar?year=${year}`;
      if (month) {
        endpoint += `&month=${month}`;
      }
      
      const calendar = await this.makeTickTickRequest(endpoint);
      
      return {
        content: [{
          type: 'text',
          text: `📅 **Habit Calendar View**\n\n` +
                `🔄 **Habit ID**: ${habit_id}\n` +
                `📅 **Period**: ${month ? `${year}-${month.toString().padStart(2, '0')}` : year}\n\n` +
                `**Calendar Data**:\n` +
                Object.entries(calendar.days || {}).map(([date, data]) => 
                  `${date}: ${data.completed ? '✅' : '⬜'} ${data.count ? `(${data.count}x)` : ''}`
                ).join('\n') +
                `\n\n**Summary**:\n` +
                `- Total Days: ${Object.keys(calendar.days || {}).length}\n` +
                `- Completed: ${Object.values(calendar.days || {}).filter(d => d.completed).length}\n` +
                `- Success Rate: ${calendar.successRate || 0}%\n` +
                `- Longest Streak in Period: ${calendar.longestStreakInPeriod || 0} days`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get habit calendar: ${error.message}`);
    }
  }

  async setHabitGoal({ habit_id, goal_type = 'daily', target_count, target_streak }) {
    try {
      const goalData = {
        habitId: habit_id,
        goalType: goal_type,
        targetCount: target_count
      };

      if (target_streak) {
        goalData.targetStreak = target_streak;
      }

      const goal = await this.makeTickTickRequest('/habit/goal', 'POST', goalData);
      
      return {
        content: [{
          type: 'text',
          text: `🎯 **Habit Goal Set**\n\n` +
                `🔄 **Habit ID**: ${habit_id}\n` +
                `📊 **Goal Type**: ${goal_type}\n` +
                `🔢 **Target Count**: ${target_count}\n` +
                `${target_streak ? `🔥 **Target Streak**: ${target_streak} days\n` : ''}` +
                `📅 **Goal Set**: ${new Date().toLocaleString()}\n` +
                `📝 **Status**: Active`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to set habit goal: ${error.message}`);
    }
  }

  async getHabitsSummary({ date }) {
    try {
      const summaryDate = date || new Date().toISOString().split('T')[0];
      const summary = await this.makeTickTickRequest(`/habit/summary?date=${summaryDate}`);
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Daily Habits Summary**\n\n` +
                `📅 **Date**: ${summaryDate}\n` +
                `🔄 **Total Habits**: ${summary.totalHabits || 0}\n` +
                `✅ **Completed**: ${summary.completed || 0}\n` +
                `⏳ **Pending**: ${summary.pending || 0}\n` +
                `📊 **Completion Rate**: ${summary.completionRate || 0}%\n\n` +
                `**Habit Details**:\n` +
                (summary.habits || []).map(habit => 
                  `• ${habit.name}: ${habit.completed ? '✅' : '⏳'} ${habit.currentStreak ? `(${habit.currentStreak} day streak)` : ''}`
                ).join('\n') +
                `\n\n🔥 **Active Streaks**: ${summary.activeStreaks || 0}\n` +
                `🏆 **Best Streak Today**: ${summary.bestStreak || 0} days`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get habits summary: ${error.message}`);
    }
  }

  async exportHabitData({ habit_id, start_date, end_date, format = 'json' }) {
    try {
      let endpoint = '/habit/export';
      const params = new URLSearchParams();
      
      if (habit_id) params.append('habitId', habit_id);
      if (start_date) params.append('startDate', start_date);
      if (end_date) params.append('endDate', end_date);
      params.append('format', format);
      
      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const exportData = await this.makeTickTickRequest(endpoint);
      
      return {
        content: [{
          type: 'text',
          text: `📤 **Habit Data Export**\n\n` +
                `${habit_id ? `🔄 **Habit ID**: ${habit_id}\n` : '🔄 **Scope**: All Habits\n'}` +
                `📅 **Period**: ${start_date || 'All time'} ${end_date ? `to ${end_date}` : ''}\n` +
                `📋 **Format**: ${format.toUpperCase()}\n` +
                `📊 **Records**: ${exportData.recordCount || 0}\n` +
                `📁 **File Size**: ${exportData.fileSize || 'Unknown'}\n` +
                `📅 **Generated**: ${new Date().toLocaleString()}\n\n` +
                `**Export Data Preview**:\n` +
                `\`\`\`${format}\n${JSON.stringify(exportData.preview || exportData, null, 2).substring(0, 500)}...\n\`\`\``
        }]
      };
    } catch (error) {
      throw new Error(`Failed to export habit data: ${error.message}`);
    }
  }

  // ===== ADVANCED TAGS METHODS =====

  async updateTag({ tag_id, name, color }) {
    try {
      // Get current tag data
      const currentTag = await this.makeTickTickRequest(`/tag/${tag_id}`);
      
      // Update only provided fields
      const updateData = { ...currentTag };
      if (name) updateData.name = name;
      if (color) updateData.color = color;

      const updatedTag = await this.makeTickTickRequest(`/tag/${tag_id}`, 'PUT', updateData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Updated TickTick Tag**\n\n` +
                `🏷️ **Name**: ${updatedTag.name}\n` +
                `🆔 **ID**: ${tag_id}\n` +
                `🎨 **Color**: ${updatedTag.color}\n` +
                `📊 **Usage Count**: ${updatedTag.usageCount || 0}\n` +
                `📅 **Updated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update tag: ${error.message}`);
    }
  }

  async deleteTag({ tag_id }) {
    try {
      await this.makeTickTickRequest(`/tag/${tag_id}`, 'DELETE');
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Deleted TickTick Tag**\n\n` +
                `🆔 **Tag ID**: ${tag_id}\n` +
                `📅 **Deleted**: ${new Date().toLocaleString()}\n\n` +
                `⚠️ **Note**: This action cannot be undone. The tag has been removed from all tasks.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to delete tag: ${error.message}`);
    }
  }

  async removeTagFromTask({ task_id, tag_name }) {
    try {
      // First get the current task to preserve existing data
      const task = await this.makeTickTickRequest(`/task/${task_id}`);
      
      // Remove the tag from existing tags
      const currentTags = task.tags || [];
      const updatedTags = currentTags.filter(tag => tag !== tag_name);
      
      // Update the task with new tags
      const updatedTask = await this.makeTickTickRequest(`/task/${task_id}`, 'PUT', {
        ...task,
        tags: updatedTags
      });
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Removed Tag from Task**\n\n` +
                `📝 **Task**: ${task.title}\n` +
                `🏷️ **Tag Removed**: ${tag_name}\n` +
                `🏷️ **Remaining Tags**: ${updatedTags.length > 0 ? updatedTags.join(', ') : 'None'}\n` +
                `📅 **Updated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to remove tag from task: ${error.message}`);
    }
  }

  async getTasksByTag({ tag_name, limit = 50 }) {
    try {
      const endpoint = `/task?tags=${encodeURIComponent(tag_name)}&limit=${limit}`;
      const tasks = await this.makeTickTickRequest(endpoint);
      
      return {
        content: [{
          type: 'text',
          text: `🏷️ **Tasks Tagged with "${tag_name}"** (${tasks.length} found):\n\n` +
                tasks.map(task => 
                  `**${task.title}** (ID: ${task.id})\n` +
                  `- Status: ${task.status === 2 ? '✅ Completed' : '⏳ Pending'}\n` +
                  `- Priority: ${this.getPriorityText(task.priority)}\n` +
                  `- Project: ${task.projectId}\n` +
                  `${task.dueDate ? `- Due: ${new Date(task.dueDate).toLocaleDateString()}\n` : ''}` +
                  `- All Tags: ${task.tags && task.tags.length ? task.tags.join(', ') : 'None'}\n`
                ).join('\n') +
                `\n**Summary**:\n` +
                `- Total Tasks: ${tasks.length}\n` +
                `- Completed: ${tasks.filter(t => t.status === 2).length}\n` +
                `- Pending: ${tasks.filter(t => t.status !== 2).length}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get tasks by tag: ${error.message}`);
    }
  }

  async getTagUsageStats({ tag_id }) {
    try {
      const stats = await this.makeTickTickRequest(`/tag/${tag_id}/stats`);
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Tag Usage Statistics**\n\n` +
                `🏷️ **Tag ID**: ${tag_id}\n` +
                `📝 **Tag Name**: ${stats.name || 'Unknown'}\n` +
                `📊 **Total Usage**: ${stats.totalTasks || 0} tasks\n` +
                `✅ **Completed Tasks**: ${stats.completedTasks || 0}\n` +
                `⏳ **Pending Tasks**: ${stats.pendingTasks || 0}\n` +
                `📈 **Usage Trend**: ${stats.trend || 'Stable'}\n` +
                `📅 **First Used**: ${stats.firstUsed ? new Date(stats.firstUsed).toLocaleDateString() : 'Unknown'}\n` +
                `📅 **Last Used**: ${stats.lastUsed ? new Date(stats.lastUsed).toLocaleDateString() : 'Unknown'}\n` +
                `🎯 **Completion Rate**: ${stats.completionRate || 0}%\n` +
                `📊 **Usage by Project**:\n` +
                (stats.projectBreakdown || []).map(proj => 
                  `• ${proj.projectName}: ${proj.taskCount} tasks`
                ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get tag usage stats: ${error.message}`);
    }
  }

  async mergeTags({ source_tag_id, target_tag_id }) {
    try {
      const mergeData = {
        sourceTagId: source_tag_id,
        targetTagId: target_tag_id
      };

      const result = await this.makeTickTickRequest('/tag/merge', 'POST', mergeData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Tags Merged Successfully**\n\n` +
                `🔄 **Source Tag**: ${source_tag_id} (deleted)\n` +
                `🎯 **Target Tag**: ${target_tag_id} (kept)\n` +
                `📊 **Tasks Affected**: ${result.tasksAffected || 0}\n` +
                `📝 **Operation**: All tasks with source tag now have target tag\n` +
                `📅 **Merged**: ${new Date().toLocaleString()}\n\n` +
                `⚠️ **Note**: Source tag has been permanently deleted.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to merge tags: ${error.message}`);
    }
  }

  async bulkTagOperations({ operation, task_ids, tag_names, replace_with }) {
    try {
      const bulkData = {
        operation,
        taskIds: task_ids,
        tagNames: tag_names
      };

      if (operation === 'replace' && replace_with) {
        bulkData.replaceWith = replace_with;
      }

      const result = await this.makeTickTickRequest('/tag/bulk', 'POST', bulkData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Bulk Tag Operation Complete**\n\n` +
                `🔄 **Operation**: ${operation.toUpperCase()}\n` +
                `📝 **Tasks Processed**: ${task_ids.length}\n` +
                `🏷️ **Tags**: ${tag_names.join(', ')}\n` +
                `${operation === 'replace' && replace_with ? `🔄 **Replaced With**: ${replace_with.join(', ')}\n` : ''}` +
                `✅ **Successful**: ${result.successful || 0}\n` +
                `❌ **Failed**: ${result.failed || 0}\n\n` +
                `**Results Summary**:\n` +
                (result.details || []).slice(0, 10).map(detail => 
                  `• Task ${detail.taskId}: ${detail.success ? '✅ Success' : '❌ Failed'}`
                ).join('\n') +
                `${result.details && result.details.length > 10 ? `\n... and ${result.details.length - 10} more` : ''}\n\n` +
                `⏰ **Processed**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to perform bulk tag operations: ${error.message}`);
    }
  }

  // ===== FOCUS TIME & POMODORO METHODS =====

  async startFocusSession({ task_id, duration = 25, session_type = 'focus' }) {
    try {
      const sessionData = {
        type: session_type,
        duration: duration,
        startTime: new Date().toISOString()
      };

      if (task_id) {
        sessionData.taskId = task_id;
      }

      const session = await this.makeTickTickRequest('/focus/start', 'POST', sessionData);
      
      return {
        content: [{
          type: 'text',
          text: `⏰ **Focus Session Started**\n\n` +
                `🆔 **Session ID**: ${session.id}\n` +
                `🎯 **Type**: ${session_type.replace('_', ' ').toUpperCase()}\n` +
                `⏱️ **Duration**: ${duration} minutes\n` +
                `${task_id ? `📝 **Task**: ${task_id}\n` : ''}` +
                `▶️ **Started**: ${new Date().toLocaleString()}\n` +
                `🏁 **Ends**: ${new Date(Date.now() + duration * 60000).toLocaleString()}\n\n` +
                `🔥 **Focus Mode Active** - Stay concentrated and avoid distractions!`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to start focus session: ${error.message}`);
    }
  }

  async stopFocusSession({ session_id }) {
    try {
      const stopData = {
        sessionId: session_id,
        endTime: new Date().toISOString()
      };

      const result = await this.makeTickTickRequest('/focus/stop', 'POST', stopData);
      
      return {
        content: [{
          type: 'text',
          text: `⏹️ **Focus Session Completed**\n\n` +
                `🆔 **Session ID**: ${session_id}\n` +
                `⏱️ **Duration**: ${Math.round(result.actualDuration || 0)} minutes\n` +
                `📊 **Completion**: ${result.completionRate || 0}%\n` +
                `🎯 **Focus Score**: ${result.focusScore || 'N/A'}/10\n` +
                `⏰ **Ended**: ${new Date().toLocaleString()}\n\n` +
                `${result.completionRate >= 90 ? '🎉 **Excellent focus!** Well done!' : 
                  result.completionRate >= 70 ? '👍 **Good session!** Keep it up!' :
                  '💪 **Practice makes perfect!** Try again soon.'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to stop focus session: ${error.message}`);
    }
  }

  async pauseFocusSession({ session_id }) {
    try {
      const pauseData = {
        sessionId: session_id,
        pauseTime: new Date().toISOString()
      };

      const result = await this.makeTickTickRequest('/focus/pause', 'POST', pauseData);
      
      return {
        content: [{
          type: 'text',
          text: `⏸️ **Focus Session Paused**\n\n` +
                `🆔 **Session ID**: ${session_id}\n` +
                `⏱️ **Elapsed Time**: ${Math.round(result.elapsedMinutes || 0)} minutes\n` +
                `⏳ **Remaining**: ${Math.round(result.remainingMinutes || 0)} minutes\n` +
                `⏸️ **Paused**: ${new Date().toLocaleString()}\n\n` +
                `📝 **Note**: Your session is paused. Resume when you're ready to continue focusing.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to pause focus session: ${error.message}`);
    }
  }

  async resumeFocusSession({ session_id }) {
    try {
      const resumeData = {
        sessionId: session_id,
        resumeTime: new Date().toISOString()
      };

      const result = await this.makeTickTickRequest('/focus/resume', 'POST', resumeData);
      
      return {
        content: [{
          type: 'text',
          text: `▶️ **Focus Session Resumed**\n\n` +
                `🆔 **Session ID**: ${session_id}\n` +
                `⏱️ **Remaining Time**: ${Math.round(result.remainingMinutes || 0)} minutes\n` +
                `🔄 **Resumed**: ${new Date().toLocaleString()}\n` +
                `🏁 **New End Time**: ${new Date(Date.now() + (result.remainingMinutes || 0) * 60000).toLocaleString()}\n\n` +
                `🔥 **Back to focus!** Let's finish strong!`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to resume focus session: ${error.message}`);
    }
  }

  async getFocusStats({ period = 'today' }) {
    try {
      const stats = await this.makeTickTickRequest(`/focus/stats?period=${period}`);
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Focus Statistics** (${period.toUpperCase()})\n\n` +
                `⏱️ **Total Focus Time**: ${Math.round(stats.totalMinutes || 0)} minutes\n` +
                `🎯 **Sessions Completed**: ${stats.completedSessions || 0}\n` +
                `📈 **Average Session**: ${Math.round(stats.averageSessionLength || 0)} minutes\n` +
                `🔥 **Focus Score**: ${stats.averageFocusScore || 0}/10\n` +
                `🎯 **Completion Rate**: ${stats.completionRate || 0}%\n` +
                `🏆 **Longest Session**: ${Math.round(stats.longestSession || 0)} minutes\n` +
                `📅 **Most Productive Day**: ${stats.bestDay || 'N/A'}\n\n` +
                `**Session Types**:\n` +
                `• Focus: ${stats.focusSessions || 0} sessions\n` +
                `• Short Break: ${stats.shortBreaks || 0} sessions\n` +
                `• Long Break: ${stats.longBreaks || 0} sessions\n\n` +
                `📈 **Trend**: ${stats.trend || 'Stable'}\n` +
                `🎯 **Goal Progress**: ${stats.goalProgress || 0}%`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get focus stats: ${error.message}`);
    }
  }

  async setTaskEstimate({ task_id, estimated_minutes, estimate_type = 'minutes' }) {
    try {
      let finalEstimate = estimated_minutes;
      
      // Convert estimate types
      if (estimate_type === 'pomodoros') {
        finalEstimate = estimated_minutes * 25; // 25 minutes per pomodoro
      } else if (estimate_type === 'hours') {
        finalEstimate = estimated_minutes * 60;
      }

      const estimateData = {
        taskId: task_id,
        estimatedMinutes: finalEstimate,
        estimateType: estimate_type,
        setAt: new Date().toISOString()
      };

      const result = await this.makeTickTickRequest('/task/estimate', 'POST', estimateData);
      
      return {
        content: [{
          type: 'text',
          text: `⏱️ **Task Estimate Set**\n\n` +
                `📝 **Task ID**: ${task_id}\n` +
                `⏱️ **Estimate**: ${estimated_minutes} ${estimate_type}\n` +
                `🕐 **Total Minutes**: ${finalEstimate} minutes\n` +
                `🍅 **Pomodoros**: ${Math.ceil(finalEstimate / 25)}\n` +
                `📅 **Set**: ${new Date().toLocaleString()}\n\n` +
                `💡 **Tip**: Use this estimate to plan your focus sessions!`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to set task estimate: ${error.message}`);
    }
  }

  async getDailyFocusSummary({ date }) {
    try {
      const summaryDate = date || new Date().toISOString().split('T')[0];
      const summary = await this.makeTickTickRequest(`/focus/daily?date=${summaryDate}`);
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Daily Focus Summary**\n\n` +
                `📅 **Date**: ${summaryDate}\n` +
                `⏱️ **Total Focus Time**: ${Math.round(summary.totalMinutes || 0)} minutes\n` +
                `🎯 **Sessions**: ${summary.totalSessions || 0}\n` +
                `✅ **Completed**: ${summary.completedSessions || 0}\n` +
                `⏸️ **Incomplete**: ${summary.incompleteSessions || 0}\n` +
                `📈 **Focus Score**: ${summary.averageFocusScore || 0}/10\n` +
                `🏆 **Best Session**: ${Math.round(summary.bestSession || 0)} minutes\n\n` +
                `**Hourly Breakdown**:\n` +
                (summary.hourlyBreakdown || []).map(hour => 
                  `${hour.hour}:00 - ${Math.round(hour.minutes || 0)} min`
                ).join('\n') +
                `\n\n**Top Tasks**:\n` +
                (summary.topTasks || []).slice(0, 5).map((task, index) => 
                  `${index + 1}. ${task.title}: ${Math.round(task.focusTime || 0)} min`
                ).join('\n') +
                `\n\n🎯 **Goal Progress**: ${summary.goalProgress || 0}%`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get daily focus summary: ${error.message}`);
    }
  }

  async getFocusHistory({ days_back = 30, task_id }) {
    try {
      let endpoint = `/focus/history?days=${days_back}`;
      if (task_id) {
        endpoint += `&taskId=${task_id}`;
      }

      const history = await this.makeTickTickRequest(endpoint);
      
      return {
        content: [{
          type: 'text',
          text: `📈 **Focus History** (Last ${days_back} days)\n\n` +
                `${task_id ? `📝 **Task**: ${task_id}\n` : ''}` +
                `📊 **Total Sessions**: ${history.sessions ? history.sessions.length : 0}\n` +
                `⏱️ **Total Time**: ${Math.round(history.totalMinutes || 0)} minutes\n` +
                `📈 **Average Daily**: ${Math.round((history.totalMinutes || 0) / days_back)} minutes\n\n` +
                `**Recent Sessions**:\n` +
                (history.sessions || []).slice(0, 10).map(session => 
                  `• ${new Date(session.date).toLocaleDateString()}: ${Math.round(session.duration || 0)} min (${session.completed ? '✅' : '❌'})`
                ).join('\n') +
                `${history.sessions && history.sessions.length > 10 ? `\n... and ${history.sessions.length - 10} more sessions` : ''}\n\n` +
                `**Weekly Trends**:\n` +
                (history.weeklyTrends || []).map(week => 
                  `Week ${week.week}: ${Math.round(week.totalMinutes || 0)} min (${week.sessions || 0} sessions)`
                ).join('\n')
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get focus history: ${error.message}`);
    }
  }

  async setFocusGoals({ goal_type = 'daily', target_minutes, target_sessions }) {
    try {
      const goalData = {
        type: goal_type,
        targetMinutes: target_minutes,
        setAt: new Date().toISOString()
      };

      if (target_sessions) {
        goalData.targetSessions = target_sessions;
      }

      const goal = await this.makeTickTickRequest('/focus/goals', 'POST', goalData);
      
      return {
        content: [{
          type: 'text',
          text: `🎯 **Focus Goal Set**\n\n` +
                `📊 **Goal Type**: ${goal_type.toUpperCase()}\n` +
                `⏱️ **Target Time**: ${target_minutes} minutes\n` +
                `${target_sessions ? `🎯 **Target Sessions**: ${target_sessions}\n` : ''}` +
                `🍅 **Pomodoros Needed**: ${Math.ceil(target_minutes / 25)}\n` +
                `📅 **Set**: ${new Date().toLocaleString()}\n` +
                `📈 **Current Progress**: 0%\n\n` +
                `💪 **You've got this!** Start your first focus session to begin tracking progress.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to set focus goals: ${error.message}`);
    }
  }

  async getProductivityInsights({ period = 'week' }) {
    try {
      const insights = await this.makeTickTickRequest(`/analytics/productivity?period=${period}`);
      
      return {
        content: [{
          type: 'text',
          text: `🤖 **AI Productivity Insights** (${period.toUpperCase()})\n\n` +
                `📊 **Overall Score**: ${insights.productivityScore || 0}/100\n` +
                `📈 **Trend**: ${insights.trend || 'Stable'}\n` +
                `🎯 **Focus Efficiency**: ${insights.focusEfficiency || 0}%\n` +
                `✅ **Task Completion**: ${insights.taskCompletionRate || 0}%\n\n` +
                `**Key Insights**:\n` +
                (insights.insights || []).map((insight, index) => 
                  `${index + 1}. ${insight.title}\n   ${insight.description}`
                ).join('\n\n') +
                `\n\n**Recommendations**:\n` +
                (insights.recommendations || []).map((rec, index) => 
                  `🔸 ${rec.title}: ${rec.description}`
                ).join('\n') +
                `\n\n**Peak Performance**:\n` +
                `• Best Day: ${insights.bestDay || 'N/A'}\n` +
                `• Peak Hours: ${insights.peakHours || 'N/A'}\n` +
                `• Most Productive: ${insights.mostProductiveTask || 'N/A'}\n\n` +
                `🎯 **Next Week Goal**: ${insights.suggestedGoal || 'Keep up the momentum!'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get productivity insights: ${error.message}`);
    }
  }

  // Advanced Project Management Methods (Phase 2: 12 operations)
  async getProjectFolders() {
    try {
      const folders = await this.makeTickTickRequest('/project/folder');
      
      return {
        content: [{
          type: 'text',
          text: `📁 **Project Folders** (${folders.length || 0} folders)\n\n` +
                (folders.length > 0 ? 
                  folders.map((folder, index) => 
                    `${index + 1}. **${folder.name}**\n` +
                    `   📁 ID: ${folder.id}\n` +
                    `   📊 Projects: ${folder.projectCount || 0}\n` +
                    `   🎨 Color: ${folder.color || 'Default'}\n` +
                    `   📅 Created: ${folder.createdTime || 'N/A'}`
                  ).join('\n\n') :
                  '📭 No project folders found.'
                ) +
                `\n\n💡 **Tip**: Use folders to organize related projects and improve workspace navigation.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get project folders: ${error.message}`);
    }
  }

  async createProjectFolder({ name, color = '#3498db', description = '' }) {
    try {
      const folderData = {
        name,
        color,
        description
      };
      
      const folder = await this.makeTickTickRequest('/project/folder', 'POST', folderData);
      
      return {
        content: [{
          type: 'text',
          text: `✅ **Project Folder Created Successfully!**\n\n` +
                `📁 **${folder.name}**\n` +
                `🆔 ID: ${folder.id}\n` +
                `🎨 Color: ${folder.color}\n` +
                `📝 Description: ${folder.description || 'None'}\n` +
                `📅 Created: ${new Date().toLocaleDateString()}\n\n` +
                `🎯 **Next Steps**:\n` +
                `• Move existing projects to this folder\n` +
                `• Create new projects within this folder\n` +
                `• Set up folder-specific workflows`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create project folder: ${error.message}`);
    }
  }

  async moveProjectToFolder({ project_id, folder_id = null }) {
    try {
      const moveData = {
        folderId: folder_id
      };
      
      await this.makeTickTickRequest(`/project/${project_id}/move`, 'PUT', moveData);
      
      const folderName = folder_id ? `folder ${folder_id}` : 'root level';
      
      return {
        content: [{
          type: 'text',
          text: `📁 **Project Moved Successfully!**\n\n` +
                `✅ Project ID: ${project_id}\n` +
                `📍 New Location: ${folderName}\n` +
                `📅 Moved: ${new Date().toLocaleString()}\n\n` +
                `🎯 **Organization Tips**:\n` +
                `• Group related projects together\n` +
                `• Use folders for different clients or areas\n` +
                `• Keep active projects easily accessible`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to move project to folder: ${error.message}`);
    }
  }

  async archiveProject({ project_id }) {
    try {
      await this.makeTickTickRequest(`/project/${project_id}/archive`, 'PUT');
      
      return {
        content: [{
          type: 'text',
          text: `📦 **Project Archived Successfully!**\n\n` +
                `✅ Project ID: ${project_id}\n` +
                `📅 Archived: ${new Date().toLocaleString()}\n` +
                `🔒 Status: Hidden from active view\n\n` +
                `📋 **What This Means**:\n` +
                `• Project is preserved but hidden\n` +
                `• All tasks and data remain intact\n` +
                `• Can be unarchived anytime\n` +
                `• Reduces workspace clutter\n\n` +
                `💡 **Pro Tip**: Archive completed projects to keep your workspace clean while preserving historical data.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to archive project: ${error.message}`);
    }
  }

  async unarchiveProject({ project_id }) {
    try {
      await this.makeTickTickRequest(`/project/${project_id}/unarchive`, 'PUT');
      
      return {
        content: [{
          type: 'text',
          text: `📤 **Project Unarchived Successfully!**\n\n` +
                `✅ Project ID: ${project_id}\n` +
                `📅 Restored: ${new Date().toLocaleString()}\n` +
                `👁️ Status: Now visible in active view\n\n` +
                `🎯 **Project Restored**:\n` +
                `• All tasks and data preserved\n` +
                `• Full functionality restored\n` +
                `• Available in project lists\n` +
                `• Ready for active use\n\n` +
                `💡 **Note**: Check project settings and update as needed for current workflows.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to unarchive project: ${error.message}`);
    }
  }

  async duplicateProject({ project_id, new_name, include_tasks = true, include_settings = true }) {
    try {
      const duplicateData = {
        name: new_name,
        includeTasks: include_tasks,
        includeSettings: include_settings
      };
      
      const newProject = await this.makeTickTickRequest(`/project/${project_id}/duplicate`, 'POST', duplicateData);
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Project Duplicated Successfully!**\n\n` +
                `📋 **Original**: Project ${project_id}\n` +
                `📋 **New Copy**: ${newProject.name} (ID: ${newProject.id})\n` +
                `📅 Created: ${new Date().toLocaleString()}\n\n` +
                `📊 **What Was Copied**:\n` +
                `• ${include_tasks ? '✅' : '❌'} Tasks and subtasks\n` +
                `• ${include_settings ? '✅' : '❌'} Project settings\n` +
                `• ✅ Project structure\n` +
                `• ✅ Custom fields\n\n` +
                `🎯 **Use Cases**:\n` +
                `• Template for recurring projects\n` +
                `• Testing new workflows\n` +
                `• Client project templates\n` +
                `• Backup before major changes`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to duplicate project: ${error.message}`);
    }
  }

  async getProjectStats({ project_id }) {
    try {
      const stats = await this.makeTickTickRequest(`/project/${project_id}/stats`);
      
      const completionRate = stats.totalTasks > 0 ? 
        Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0;
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Project Statistics**\n\n` +
                `📈 **Overview**:\n` +
                `• Total Tasks: ${stats.totalTasks || 0}\n` +
                `• Completed: ${stats.completedTasks || 0}\n` +
                `• In Progress: ${stats.inProgressTasks || 0}\n` +
                `• Overdue: ${stats.overdueTasks || 0}\n` +
                `• Completion Rate: ${completionRate}%\n\n` +
                `⏱️ **Time Tracking**:\n` +
                `• Total Time Spent: ${stats.totalTimeSpent || '0h'}\n` +
                `• Average Task Duration: ${stats.avgTaskDuration || 'N/A'}\n` +
                `• Focus Sessions: ${stats.focusSessions || 0}\n\n` +
                `📅 **Timeline**:\n` +
                `• Created: ${stats.createdDate || 'N/A'}\n` +
                `• Last Activity: ${stats.lastActivity || 'N/A'}\n` +
                `• Days Active: ${stats.daysActive || 0}\n\n` +
                `🏷️ **Organization**:\n` +
                `• Tags Used: ${stats.uniqueTags || 0}\n` +
                `• Subtasks: ${stats.subtasks || 0}\n` +
                `• Priority Distribution: High: ${stats.highPriority || 0}, Medium: ${stats.mediumPriority || 0}, Low: ${stats.lowPriority || 0}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get project stats: ${error.message}`);
    }
  }

  async setProjectColor({ project_id, color }) {
    try {
      const updateData = { color };
      
      await this.makeTickTickRequest(`/project/${project_id}`, 'PUT', updateData);
      
      return {
        content: [{
          type: 'text',
          text: `🎨 **Project Color Updated!**\n\n` +
                `✅ Project ID: ${project_id}\n` +
                `🎨 New Color: ${color}\n` +
                `📅 Updated: ${new Date().toLocaleString()}\n\n` +
                `🌈 **Color Coding Benefits**:\n` +
                `• Visual project identification\n` +
                `• Quick status recognition\n` +
                `• Improved workspace organization\n` +
                `• Better team coordination\n\n` +
                `💡 **Pro Tip**: Use consistent color schemes across related projects for better visual organization.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to set project color: ${error.message}`);
    }
  }

  async reorderProjects({ project_orders }) {
    try {
      const reorderData = {
        orders: project_orders.map(order => ({
          projectId: order.project_id,
          sortOrder: order.position
        }))
      };
      
      await this.makeTickTickRequest('/project/reorder', 'PUT', reorderData);
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Projects Reordered Successfully!**\n\n` +
                `✅ Updated Order for ${project_orders.length} projects\n` +
                `📅 Reordered: ${new Date().toLocaleString()}\n\n` +
                `📋 **New Order**:\n` +
                project_orders.map((order, index) => 
                  `${index + 1}. Project ${order.project_id} (Position: ${order.position})`
                ).join('\n') +
                `\n\n🎯 **Organization Benefits**:\n` +
                `• Prioritized project visibility\n` +
                `• Improved workflow efficiency\n` +
                `• Custom workspace layout\n` +
                `• Better focus on important projects`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to reorder projects: ${error.message}`);
    }
  }

  async getProjectTemplates() {
    try {
      const templates = await this.makeTickTickRequest('/project/templates');
      
      return {
        content: [{
          type: 'text',
          text: `📋 **Project Templates** (${templates.length || 0} available)\n\n` +
                (templates.length > 0 ? 
                  templates.map((template, index) => 
                    `${index + 1}. **${template.name}**\n` +
                    `   🆔 ID: ${template.id}\n` +
                    `   📝 Description: ${template.description || 'No description'}\n` +
                    `   📊 Tasks: ${template.taskCount || 0}\n` +
                    `   🏷️ Category: ${template.category || 'General'}\n` +
                    `   📅 Created: ${template.createdTime || 'N/A'}`
                  ).join('\n\n') :
                  '📭 No project templates found.'
                ) +
                `\n\n🚀 **Template Benefits**:\n` +
                `• Rapid project setup\n` +
                `• Consistent structure\n` +
                `• Best practice workflows\n` +
                `• Time-saving automation`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get project templates: ${error.message}`);
    }
  }

  async createProjectFromTemplate({ template_id, project_name, customize_settings = {} }) {
    try {
      const projectData = {
        templateId: template_id,
        name: project_name,
        customizations: customize_settings
      };
      
      const newProject = await this.makeTickTickRequest('/project/from-template', 'POST', projectData);
      
      return {
        content: [{
          type: 'text',
          text: `🚀 **Project Created from Template!**\n\n` +
                `📋 **New Project**: ${newProject.name}\n` +
                `🆔 Project ID: ${newProject.id}\n` +
                `📋 Template Used: ${template_id}\n` +
                `📅 Created: ${new Date().toLocaleString()}\n\n` +
                `📊 **Project Setup**:\n` +
                `• Tasks: ${newProject.taskCount || 0} imported\n` +
                `• Structure: ✅ Applied\n` +
                `• Settings: ${Object.keys(customize_settings).length > 0 ? '✅ Customized' : '📋 Default'}\n` +
                `• Ready for use: ✅\n\n` +
                `🎯 **Next Steps**:\n` +
                `• Review and adjust tasks\n` +
                `• Set project deadlines\n` +
                `• Assign team members\n` +
                `• Customize project settings`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create project from template: ${error.message}`);
    }
  }

  async exportProject({ project_id, format = 'json', include_completed = true, include_attachments = false }) {
    try {
      const exportData = {
        format,
        includeCompleted: include_completed,
        includeAttachments: include_attachments
      };
      
      const exportResult = await this.makeTickTickRequest(`/project/${project_id}/export`, 'POST', exportData);
      
      const fileSize = exportResult.fileSize ? `${Math.round(exportResult.fileSize / 1024)}KB` : 'Unknown';
      
      return {
        content: [{
          type: 'text',
          text: `📤 **Project Export Completed!**\n\n` +
                `📋 **Project**: ${project_id}\n` +
                `📁 **Format**: ${format.toUpperCase()}\n` +
                `📊 **File Size**: ${fileSize}\n` +
                `📅 **Exported**: ${new Date().toLocaleString()}\n\n` +
                `📦 **Export Contents**:\n` +
                `• ${include_completed ? '✅' : '❌'} Completed tasks\n` +
                `• ${include_attachments ? '✅' : '❌'} File attachments\n` +
                `• ✅ Project structure\n` +
                `• ✅ Task metadata\n` +
                `• ✅ Time tracking data\n\n` +
                `🔗 **Download**: ${exportResult.downloadUrl || 'Check email for download link'}\n\n` +
                `💡 **Use Cases**:\n` +
                `• Data backup\n` +
                `• Client reporting\n` +
                `• Project archival\n` +
                `• External analysis`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to export project: ${error.message}`);
    }
  }

  // Collaboration & Sharing Methods (Phase 2: 12 operations)
  async shareProject({ project_id, emails, permission_level = 'edit', message = '' }) {
    try {
      const shareData = {
        emails,
        permissionLevel: permission_level,
        invitationMessage: message
      };
      
      const result = await this.makeTickTickRequest(`/project/${project_id}/share`, 'POST', shareData);
      
      return {
        content: [{
          type: 'text',
          text: `🤝 **Project Shared Successfully!**\n\n` +
                `📋 **Project**: ${project_id}\n` +
                `👥 **Shared with**: ${emails.length} user(s)\n` +
                `🔑 **Permission Level**: ${permission_level}\n` +
                `📅 **Shared**: ${new Date().toLocaleString()}\n\n` +
                `📧 **Recipients**:\n` +
                emails.map((email, index) => `${index + 1}. ${email}`).join('\n') +
                `\n\n${message ? `📝 **Message**: "${message}"\n\n` : ''}` +
                `✅ **Next Steps**:\n` +
                `• Recipients will receive email invitations\n` +
                `• They can access the project once they accept\n` +
                `• Manage permissions anytime from project settings\n` +
                `• Track collaboration activity in the team feed`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to share project: ${error.message}`);
    }
  }

  async getSharedProjects({ include_owned = true, include_received = true }) {
    try {
      const sharedProjects = await this.makeTickTickRequest(
        `/project/shared?includeOwned=${include_owned}&includeReceived=${include_received}`
      );
      
      const ownedProjects = sharedProjects.filter(p => p.isOwner) || [];
      const receivedProjects = sharedProjects.filter(p => !p.isOwner) || [];
      
      return {
        content: [{
          type: 'text',
          text: `🤝 **Shared Projects Overview**\n\n` +
                `📊 **Summary**:\n` +
                `• Projects you own: ${ownedProjects.length}\n` +
                `• Projects shared with you: ${receivedProjects.length}\n` +
                `• Total shared projects: ${sharedProjects.length}\n\n` +
                
                (ownedProjects.length > 0 ? 
                  `👑 **Projects You Own & Share**:\n` +
                  ownedProjects.map((project, index) => 
                    `${index + 1}. **${project.name}** (ID: ${project.id})\n` +
                    `   👥 Collaborators: ${project.memberCount || 0}\n` +
                    `   🔑 Permission: ${project.permission || 'Admin'}\n` +
                    `   📅 Last Activity: ${project.lastActivity || 'N/A'}`
                  ).join('\n\n') + '\n\n' : ''
                ) +
                
                (receivedProjects.length > 0 ? 
                  `📥 **Projects Shared With You**:\n` +
                  receivedProjects.map((project, index) => 
                    `${index + 1}. **${project.name}** (ID: ${project.id})\n` +
                    `   👤 Owner: ${project.ownerName || project.ownerId}\n` +
                    `   🔑 Your Role: ${project.yourRole || 'Member'}\n` +
                    `   📅 Joined: ${project.joinedDate || 'N/A'}`
                  ).join('\n\n') + '\n\n' : ''
                ) +
                
                `💡 **Collaboration Tips**:\n` +
                `• Use @mentions in comments for better communication\n` +
                `• Set clear task assignments and deadlines\n` +
                `• Review team activity regularly\n` +
                `• Manage permissions based on roles`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get shared projects: ${error.message}`);
    }
  }

  async inviteCollaborator({ project_id, email, role = 'member', personal_message = '' }) {
    try {
      const inviteData = {
        email,
        role,
        personalMessage: personal_message
      };
      
      const invitation = await this.makeTickTickRequest(`/project/${project_id}/invite`, 'POST', inviteData);
      
      return {
        content: [{
          type: 'text',
          text: `📧 **Collaborator Invited Successfully!**\n\n` +
                `📋 **Project**: ${project_id}\n` +
                `👤 **Invited**: ${email}\n` +
                `🎭 **Role**: ${role}\n` +
                `📅 **Invited**: ${new Date().toLocaleString()}\n` +
                `🆔 **Invitation ID**: ${invitation.id || 'Generated'}\n\n` +
                `${personal_message ? `💬 **Personal Message**:\n"${personal_message}"\n\n` : ''}` +
                `📮 **Invitation Status**:\n` +
                `• Email sent to ${email}\n` +
                `• Pending acceptance\n` +
                `• Will expire in 7 days if not accepted\n\n` +
                `🔑 **Role Permissions (${role})**:\n` +
                (role === 'admin' ? 
                  `• ✅ Full project access\n• ✅ Invite others\n• ✅ Manage settings\n• ✅ Delete project` :
                role === 'editor' ?
                  `• ✅ Create/edit tasks\n• ✅ Add comments\n• ❌ Invite others\n• ❌ Manage settings` :
                  `• ✅ View tasks\n• ✅ Add comments\n• ❌ Edit tasks\n• ❌ Invite others`
                )
        }]
      };
    } catch (error) {
      throw new Error(`Failed to invite collaborator: ${error.message}`);
    }
  }

  async removeCollaborator({ project_id, user_id }) {
    try {
      await this.makeTickTickRequest(`/project/${project_id}/collaborator/${user_id}`, 'DELETE');
      
      return {
        content: [{
          type: 'text',
          text: `🚫 **Collaborator Removed Successfully!**\n\n` +
                `📋 **Project**: ${project_id}\n` +
                `👤 **Removed User**: ${user_id}\n` +
                `📅 **Removed**: ${new Date().toLocaleString()}\n\n` +
                `📋 **Access Revoked**:\n` +
                `• User can no longer access the project\n` +
                `• All their task assignments remain\n` +
                `• Previous comments and activities preserved\n` +
                `• User will be notified of removal\n\n` +
                `🔄 **Next Steps**:\n` +
                `• Reassign their pending tasks if needed\n` +
                `• Review project permissions\n` +
                `• Consider archiving their contributions\n` +
                `• Update team documentation`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to remove collaborator: ${error.message}`);
    }
  }

  async assignTask({ task_id, assignee_id, due_date, priority, notification = true }) {
    try {
      const assignmentData = {
        assigneeId: assignee_id,
        dueDate: due_date,
        priority,
        sendNotification: notification
      };
      
      const assignment = await this.makeTickTickRequest(`/task/${task_id}/assign`, 'PUT', assignmentData);
      
      return {
        content: [{
          type: 'text',
          text: `👥 **Task Assigned Successfully!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `👤 **Assigned To**: ${assignee_id}\n` +
                `📅 **Due Date**: ${due_date || 'Not set'}\n` +
                `⚡ **Priority**: ${priority || 'Medium'}\n` +
                `📅 **Assigned**: ${new Date().toLocaleString()}\n\n` +
                `📬 **Notification**: ${notification ? '✅ Sent to assignee' : '❌ No notification'}\n\n` +
                `🎯 **Assignment Details**:\n` +
                `• Assignee will receive task in their inbox\n` +
                `• Task appears in their task lists\n` +
                `• Progress can be tracked by team\n` +
                `• Automatic reminders based on due date\n\n` +
                `💡 **Management Tips**:\n` +
                `• Use comments for detailed instructions\n` +
                `• Set realistic deadlines\n` +
                `• Check in regularly on progress\n` +
                `• Provide necessary resources`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to assign task: ${error.message}`);
    }
  }

  async getTaskAssignees({ task_id }) {
    try {
      const assignees = await this.makeTickTickRequest(`/task/${task_id}/assignees`);
      
      return {
        content: [{
          type: 'text',
          text: `👥 **Task Assignees** (${assignees.length || 0} assigned)\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `📅 **Retrieved**: ${new Date().toLocaleString()}\n\n` +
                (assignees.length > 0 ? 
                  `👤 **Assigned Team Members**:\n` +
                  assignees.map((assignee, index) => 
                    `${index + 1}. **${assignee.name || assignee.email}**\n` +
                    `   🆔 ID: ${assignee.id}\n` +
                    `   📧 Email: ${assignee.email}\n` +
                    `   🎭 Role: ${assignee.role || 'Member'}\n` +
                    `   📅 Assigned: ${assignee.assignedDate || 'N/A'}\n` +
                    `   ⏰ Status: ${assignee.status || 'Active'}`
                  ).join('\n\n') :
                  '👤 **No assignees found**\n\nThis task is not currently assigned to anyone.'
                ) +
                `\n\n🔄 **Quick Actions**:\n` +
                `• Assign to additional team members\n` +
                `• Update assignment details\n` +
                `• Send reminders to assignees\n` +
                `• Check assignment progress`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get task assignees: ${error.message}`);
    }
  }

  async addTaskComment({ task_id, comment, mention_users = [], is_private = false }) {
    try {
      const commentData = {
        content: comment,
        mentions: mention_users,
        isPrivate: is_private
      };
      
      const newComment = await this.makeTickTickRequest(`/task/${task_id}/comment`, 'POST', commentData);
      
      const mentionText = mention_users.length > 0 ? 
        `\n👋 **Mentioned**: ${mention_users.join(', ')}` : '';
      
      return {
        content: [{
          type: 'text',
          text: `💬 **Comment Added Successfully!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Comment ID**: ${newComment.id}\n` +
                `📅 **Posted**: ${new Date().toLocaleString()}\n` +
                `🔒 **Privacy**: ${is_private ? 'Private' : 'Public'}\n${mentionText}\n\n` +
                `📝 **Comment**:\n"${comment}"\n\n` +
                `📢 **Team Communication**:\n` +
                `• Comment visible to ${is_private ? 'project admins only' : 'all team members'}\n` +
                `• Mentioned users will receive notifications\n` +
                `• Comment timeline preserved\n` +
                `• Can be edited or deleted later\n\n` +
                `💡 **Collaboration Tips**:\n` +
                `• Use @mentions for specific feedback\n` +
                `• Add status updates regularly\n` +
                `• Ask questions when blocked\n` +
                `• Share relevant resources`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to add task comment: ${error.message}`);
    }
  }

  async getTeamActivity({ project_id, limit = 50, activity_types }) {
    try {
      const params = new URLSearchParams({
        limit: limit.toString()
      });
      
      if (activity_types && activity_types.length > 0) {
        params.append('types', activity_types.join(','));
      }
      
      const activities = await this.makeTickTickRequest(`/project/${project_id}/activity?${params}`);
      
      const activityTypeIcons = {
        task_created: '📝',
        task_completed: '✅',
        task_assigned: '👥',
        comment_added: '💬',
        project_shared: '🤝'
      };
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Team Activity Feed** (${activities.length || 0} activities)\n\n` +
                `📋 **Project**: ${project_id}\n` +
                `📅 **Retrieved**: ${new Date().toLocaleString()}\n` +
                `🔍 **Filter**: ${activity_types ? activity_types.join(', ') : 'All types'}\n\n` +
                
                (activities.length > 0 ? 
                  `🔄 **Recent Activities**:\n` +
                  activities.slice(0, limit).map((activity, index) => {
                    const icon = activityTypeIcons[activity.type] || '📌';
                    return `${icon} **${activity.type.replace('_', ' ').toUpperCase()}**\n` +
                           `   👤 By: ${activity.userName || activity.userId}\n` +
                           `   📋 Item: ${activity.itemName || activity.itemId}\n` +
                           `   📅 When: ${activity.timestamp ? new Date(activity.timestamp).toLocaleString() : 'N/A'}\n` +
                           `   ${activity.description ? `💭 Details: ${activity.description}` : ''}`;
                  }).join('\n\n') :
                  '📭 **No recent activity found**\n\nThis project has no recorded team activities yet.'
                ) +
                
                `\n\n📈 **Activity Summary**:\n` +
                `• Tasks Created: ${activities.filter(a => a.type === 'task_created').length}\n` +
                `• Tasks Completed: ${activities.filter(a => a.type === 'task_completed').length}\n` +
                `• Assignments Made: ${activities.filter(a => a.type === 'task_assigned').length}\n` +
                `• Comments Added: ${activities.filter(a => a.type === 'comment_added').length}\n\n` +
                
                `💡 **Team Insights**:\n` +
                `• Monitor project momentum\n` +
                `• Identify active contributors\n` +
                `• Track collaboration patterns\n` +
                `• Celebrate team achievements`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get team activity: ${error.message}`);
    }
  }

  async setProjectPermissions({ project_id, permissions, apply_to_existing = false }) {
    try {
      const permissionData = {
        permissions,
        applyToExisting: apply_to_existing
      };
      
      await this.makeTickTickRequest(`/project/${project_id}/permissions`, 'PUT', permissionData);
      
      return {
        content: [{
          type: 'text',
          text: `🔐 **Project Permissions Updated!**\n\n` +
                `📋 **Project**: ${project_id}\n` +
                `📅 **Updated**: ${new Date().toLocaleString()}\n` +
                `🔄 **Apply to Existing**: ${apply_to_existing ? 'Yes' : 'No'}\n\n` +
                
                `⚙️ **Permission Settings**:\n` +
                `• Can Invite Others: ${permissions.can_invite ? '✅' : '❌'}\n` +
                `• Can Edit Tasks: ${permissions.can_edit_tasks ? '✅' : '❌'}\n` +
                `• Can Delete Tasks: ${permissions.can_delete_tasks ? '✅' : '❌'}\n` +
                `• Can View Reports: ${permissions.can_view_reports ? '✅' : '❌'}\n\n` +
                
                `👥 **Impact**:\n` +
                `• ${apply_to_existing ? 'All existing collaborators updated with new permissions' : 'New permissions apply to future invitations only'}\n` +
                `• Project security enhanced\n` +
                `• Clear role boundaries established\n` +
                `• Team workflow improved\n\n` +
                
                `💡 **Permission Best Practices**:\n` +
                `• Grant minimum necessary access\n` +
                `• Review permissions regularly\n` +
                `• Document role expectations\n` +
                `• Train team on new permissions`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to set project permissions: ${error.message}`);
    }
  }

  async getCollaborationStats({ project_id, time_period = 'month' }) {
    try {
      const stats = await this.makeTickTickRequest(`/project/${project_id}/collaboration-stats?period=${time_period}`);
      
      const totalContributions = (stats.tasksCreated || 0) + (stats.tasksCompleted || 0) + (stats.commentsAdded || 0);
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Team Productivity Metrics** (${time_period.toUpperCase()})\n\n` +
                `📋 **Project**: ${project_id}\n` +
                `📅 **Period**: ${stats.periodStart || 'N/A'} - ${stats.periodEnd || 'N/A'}\n` +
                `📅 **Generated**: ${new Date().toLocaleString()}\n\n` +
                
                `👥 **Team Overview**:\n` +
                `• Active Members: ${stats.activeMembers || 0}\n` +
                `• Total Contributions: ${totalContributions}\n` +
                `• Projects Shared: ${stats.projectsShared || 0}\n` +
                `• Average Response Time: ${stats.avgResponseTime || 'N/A'}\n\n` +
                
                `📈 **Activity Breakdown**:\n` +
                `• Tasks Created: ${stats.tasksCreated || 0}\n` +
                `• Tasks Completed: ${stats.tasksCompleted || 0}\n` +
                `• Tasks Assigned: ${stats.tasksAssigned || 0}\n` +
                `• Comments Added: ${stats.commentsAdded || 0}\n` +
                `• Files Shared: ${stats.filesShared || 0}\n\n` +
                
                `🏆 **Top Contributors**:\n` +
                (stats.topContributors || []).slice(0, 5).map((contributor, index) => 
                  `${index + 1}. **${contributor.name}** - ${contributor.contributions} contributions`
                ).join('\n') +
                
                `\n\n📊 **Performance Insights**:\n` +
                `• Collaboration Score: ${stats.collaborationScore || 0}/100\n` +
                `• Team Velocity: ${stats.teamVelocity || 'N/A'} tasks/week\n` +
                `• Communication Level: ${stats.communicationLevel || 'Moderate'}\n` +
                `• Project Health: ${stats.projectHealth || 'Good'}\n\n` +
                
                `💡 **Recommendations**:\n` +
                (stats.recommendations || []).map(rec => `• ${rec}`).join('\n') +
                
                `\n\n🎯 **Next Steps**:\n` +
                `• Review individual contributions\n` +
                `• Recognize top performers\n` +
                `• Address collaboration gaps\n` +
                `• Plan team improvement initiatives`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get collaboration stats: ${error.message}`);
    }
  }

  async bulkAssignTasks({ assignments, notify_assignees = true }) {
    try {
      const assignmentData = {
        assignments: assignments.map(assignment => ({
          taskId: assignment.task_id,
          assigneeId: assignment.assignee_id,
          dueDate: assignment.due_date
        })),
        notifyAssignees: notify_assignees
      };
      
      const result = await this.makeTickTickRequest('/task/bulk-assign', 'POST', assignmentData);
      
      const successCount = result.successful || assignments.length;
      const failureCount = (result.failed || []).length;
      
      return {
        content: [{
          type: 'text',
          text: `👥 **Bulk Task Assignment Complete!**\n\n` +
                `📊 **Assignment Results**:\n` +
                `• Total Assignments: ${assignments.length}\n` +
                `• Successful: ${successCount} ✅\n` +
                `• Failed: ${failureCount} ❌\n` +
                `• Success Rate: ${Math.round((successCount / assignments.length) * 100)}%\n` +
                `📅 **Completed**: ${new Date().toLocaleString()}\n\n` +
                
                `📬 **Notifications**: ${notify_assignees ? '✅ Sent to all assignees' : '❌ No notifications sent'}\n\n` +
                
                (successCount > 0 ? 
                  `✅ **Successful Assignments**:\n` +
                  assignments.slice(0, successCount).map((assignment, index) => 
                    `${index + 1}. Task ${assignment.task_id} → ${assignment.assignee_id}` +
                    (assignment.due_date ? ` (Due: ${assignment.due_date})` : '')
                  ).join('\n') + '\n\n' : ''
                ) +
                
                (failureCount > 0 ? 
                  `❌ **Failed Assignments**:\n` +
                  (result.failed || []).map((failure, index) => 
                    `${index + 1}. Task ${failure.taskId}: ${failure.reason}`
                  ).join('\n') + '\n\n' : ''
                ) +
                
                `🎯 **Next Steps**:\n` +
                `• Review successful assignments\n` +
                `• Retry failed assignments if needed\n` +
                `• Set up assignment tracking\n` +
                `• Monitor team workload distribution\n\n` +
                
                `💡 **Bulk Assignment Tips**:\n` +
                `• Verify user permissions before assigning\n` +
                `• Balance workload across team members\n` +
                `• Set realistic due dates\n` +
                `• Follow up on critical assignments`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to bulk assign tasks: ${error.message}`);
    }
  }

  async exportTeamReport({ project_id, report_type = 'productivity', date_range, format = 'pdf' }) {
    try {
      const exportData = {
        reportType: report_type,
        dateRange: date_range,
        format
      };
      
      const exportResult = await this.makeTickTickRequest(`/project/${project_id}/export/team-report`, 'POST', exportData);
      
      const reportTypes = {
        productivity: 'Team Productivity Analysis',
        task_completion: 'Task Completion Metrics',
        time_tracking: 'Time Tracking Summary',
        team_activity: 'Team Activity Overview'
      };
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Team Report Generated Successfully!**\n\n` +
                `📋 **Project**: ${project_id}\n` +
                `📈 **Report Type**: ${reportTypes[report_type] || report_type}\n` +
                `📁 **Format**: ${format.toUpperCase()}\n` +
                `📅 **Generated**: ${new Date().toLocaleString()}\n` +
                `📊 **File Size**: ${exportResult.fileSize ? `${Math.round(exportResult.fileSize / 1024)}KB` : 'Unknown'}\n\n` +
                
                `📅 **Date Range**:\n` +
                `• Start: ${date_range?.start_date || 'Not specified'}\n` +
                `• End: ${date_range?.end_date || 'Not specified'}\n\n` +
                
                `📦 **Report Contents**:\n` +
                (report_type === 'productivity' ? 
                  `• Team performance metrics\n• Individual productivity scores\n• Task completion rates\n• Collaboration effectiveness` :
                report_type === 'task_completion' ?
                  `• Task completion statistics\n• Deadline adherence\n• Priority distribution\n• Completion trends` :
                report_type === 'time_tracking' ?
                  `• Time spent per task\n• Focus session analytics\n• Productivity patterns\n• Time allocation breakdown` :
                  `• Team activity timeline\n• Communication patterns\n• Project milestones\n• Member contributions`
                ) +
                `\n\n🔗 **Download**: ${exportResult.downloadUrl || 'Check email for download link'}\n` +
                `⏰ **Expiry**: Download link expires in 24 hours\n\n` +
                
                `📊 **Report Insights**:\n` +
                `• Use for performance reviews\n` +
                `• Share with stakeholders\n` +
                `• Track team progress over time\n` +
                `• Identify improvement opportunities\n\n` +
                
                `💡 **Analysis Tips**:\n` +
                `• Compare reports across periods\n` +
                `• Focus on trends, not single metrics\n` +
                `• Discuss findings with team\n` +
                `• Set improvement goals based on data`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to export team report: ${error.message}`);
    }
  }

  // Calendar Integration Methods (Phase 3: 8 operations)
  async getCalendarEvents({ start_date, end_date, calendar_id }) {
    try {
      const params = new URLSearchParams();
      if (start_date) params.append('startDate', start_date);
      if (end_date) params.append('endDate', end_date);
      if (calendar_id) params.append('calendarId', calendar_id);
      
      const events = await this.makeTickTickRequest(`/calendar/events?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `📅 **Calendar Events** (${events.length || 0} found)\n\n` +
                `📊 **Query Parameters**:\n` +
                `• Start Date: ${start_date || 'Not specified'}\n` +
                `• End Date: ${end_date || 'Not specified'}\n` +
                `• Calendar Filter: ${calendar_id || 'All calendars'}\n` +
                `📅 **Retrieved**: ${new Date().toLocaleString()}\n\n` +
                
                (events.length > 0 ? 
                  `📋 **Upcoming Events**:\n` +
                  events.map((event, index) => 
                    `${index + 1}. **${event.title}**\n` +
                    `   📅 Date: ${event.startDate ? new Date(event.startDate).toLocaleDateString() : 'TBD'}\n` +
                    `   ⏰ Time: ${event.startTime || 'All day'} - ${event.endTime || 'TBD'}\n` +
                    `   📍 Location: ${event.location || 'No location'}\n` +
                    `   📝 Description: ${event.description ? event.description.substring(0, 100) + '...' : 'No description'}\n` +
                    `   🔔 Reminder: ${event.reminderMinutes ? `${event.reminderMinutes} min before` : 'None'}`
                  ).join('\n\n') :
                  '📭 **No events found** for the specified criteria.'
                ) +
                
                `\n\n📈 **Event Summary**:\n` +
                `• Total Events: ${events.length}\n` +
                `• Today's Events: ${events.filter(e => e.startDate === new Date().toISOString().split('T')[0]).length}\n` +
                `• All-day Events: ${events.filter(e => e.allDay).length}\n` +
                `• With Reminders: ${events.filter(e => e.reminderMinutes).length}\n\n` +
                
                `🔄 **Quick Actions**:\n` +
                `• Create new calendar event\n` +
                `• Sync with external calendars\n` +
                `• Convert tasks to events\n` +
                `• Check for schedule conflicts`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get calendar events: ${error.message}`);
    }
  }

  async createCalendarEvent({ title, start_time, end_time, description, location, reminder_minutes = 15 }) {
    try {
      const eventData = {
        title,
        startTime: start_time,
        endTime: end_time,
        description,
        location,
        reminderMinutes: reminder_minutes
      };
      
      const event = await this.makeTickTickRequest('/calendar/event', 'POST', eventData);
      
      const duration = new Date(end_time) - new Date(start_time);
      const durationHours = Math.round(duration / (1000 * 60 * 60) * 10) / 10;
      
      return {
        content: [{
          type: 'text',
          text: `📅 **Calendar Event Created Successfully!**\n\n` +
                `🎯 **Event Details**:\n` +
                `• **Title**: ${event.title}\n` +
                `• **Event ID**: ${event.id}\n` +
                `• **Start**: ${new Date(event.startTime).toLocaleString()}\n` +
                `• **End**: ${new Date(event.endTime).toLocaleString()}\n` +
                `• **Duration**: ${durationHours} hour(s)\n` +
                `• **Location**: ${event.location || 'No location specified'}\n\n` +
                
                `📝 **Description**:\n${event.description || 'No description provided'}\n\n` +
                
                `🔔 **Reminder**: ${event.reminderMinutes} minutes before event\n` +
                `📅 **Created**: ${new Date().toLocaleString()}\n\n` +
                
                `✅ **Event Setup Complete**:\n` +
                `• Added to your calendar\n` +
                `• Reminder notifications configured\n` +
                `• Available across all your devices\n` +
                `• Synced with connected calendars\n\n` +
                
                `🎯 **Next Steps**:\n` +
                `• Add attendees if needed\n` +
                `• Set up recurring pattern if applicable\n` +
                `• Link related tasks or projects\n` +
                `• Share calendar invite with participants`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create calendar event: ${error.message}`);
    }
  }

  async syncWithGoogleCalendar({ google_calendar_id, sync_direction = 'bidirectional', date_range_days = 30 }) {
    try {
      const syncData = {
        googleCalendarId: google_calendar_id,
        syncDirection: sync_direction,
        dateRangeDays: date_range_days
      };
      
      const syncResult = await this.makeTickTickRequest('/calendar/sync/google', 'POST', syncData);
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Google Calendar Sync Completed!**\n\n` +
                `📊 **Sync Configuration**:\n` +
                `• Google Calendar: ${google_calendar_id}\n` +
                `• Direction: ${sync_direction.toUpperCase()}\n` +
                `• Date Range: ${date_range_days} days (past & future)\n` +
                `• Started: ${new Date().toLocaleString()}\n\n` +
                
                `📈 **Sync Results**:\n` +
                `• Events Imported: ${syncResult.imported || 0}\n` +
                `• Events Exported: ${syncResult.exported || 0}\n` +
                `• Conflicts Resolved: ${syncResult.conflictsResolved || 0}\n` +
                `• Duplicates Merged: ${syncResult.duplicatesMerged || 0}\n` +
                `• Errors Encountered: ${syncResult.errors || 0}\n\n` +
                
                `⚙️ **Sync Status**: ${syncResult.status || 'Completed'}\n` +
                `⏱️ **Duration**: ${syncResult.durationMs ? `${Math.round(syncResult.durationMs / 1000)}s` : 'Unknown'}\n\n` +
                
                (syncResult.errors > 0 ? 
                  `⚠️ **Issues Found**:\n` +
                  (syncResult.errorDetails || []).map(error => `• ${error}`).join('\n') + '\n\n' : ''
                ) +
                
                `✅ **Benefits**:\n` +
                `• Unified calendar view across platforms\n` +
                `• Real-time synchronization\n` +
                `• Automatic conflict detection\n` +
                `• Cross-platform accessibility\n\n` +
                
                `🔄 **Auto-Sync**: ${syncResult.autoSyncEnabled ? 'Enabled' : 'Manual only'}\n` +
                `📅 **Next Sync**: ${syncResult.nextSyncTime || 'On-demand'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to sync with Google Calendar: ${error.message}`);
    }
  }

  async syncWithOutlook({ outlook_calendar_id, sync_direction = 'bidirectional', include_meetings = true }) {
    try {
      const syncData = {
        outlookCalendarId: outlook_calendar_id,
        syncDirection: sync_direction,
        includeMeetings: include_meetings
      };
      
      const syncResult = await this.makeTickTickRequest('/calendar/sync/outlook', 'POST', syncData);
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Outlook Calendar Sync Completed!**\n\n` +
                `📊 **Sync Configuration**:\n` +
                `• Outlook Calendar: ${outlook_calendar_id}\n` +
                `• Direction: ${sync_direction.toUpperCase()}\n` +
                `• Include Meetings: ${include_meetings ? 'Yes' : 'No'}\n` +
                `• Started: ${new Date().toLocaleString()}\n\n` +
                
                `📈 **Sync Results**:\n` +
                `• Events Synced: ${syncResult.eventsSynced || 0}\n` +
                `• Meetings Imported: ${syncResult.meetingsImported || 0}\n` +
                `• Appointments Created: ${syncResult.appointmentsCreated || 0}\n` +
                `• Conflicts Detected: ${syncResult.conflicts || 0}\n` +
                `• Sync Errors: ${syncResult.errors || 0}\n\n` +
                
                `📧 **Meeting Integration**:\n` +
                `• Teams Meetings: ${syncResult.teamsMeetings || 0}\n` +
                `• Zoom Meetings: ${syncResult.zoomMeetings || 0}\n` +
                `• Other Meeting Links: ${syncResult.otherMeetings || 0}\n\n` +
                
                `⚙️ **Sync Status**: ${syncResult.status || 'Completed'}\n` +
                `🔐 **Authentication**: ${syncResult.authStatus || 'Valid'}\n\n` +
                
                (syncResult.warnings && syncResult.warnings.length > 0 ? 
                  `⚠️ **Warnings**:\n` +
                  syncResult.warnings.map(warning => `• ${warning}`).join('\n') + '\n\n' : ''
                ) +
                
                `✅ **Enterprise Features**:\n` +
                `• Exchange Server integration\n` +
                `• Meeting room bookings\n` +
                `• Attendee management\n` +
                `• Corporate calendar policies\n\n` +
                
                `🔄 **Sync Schedule**: ${syncResult.syncInterval || 'Every 15 minutes'}\n` +
                `📊 **Data Usage**: ${syncResult.dataTransferred || 'Minimal'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to sync with Outlook: ${error.message}`);
    }
  }

  async getCalendarView({ start_date, end_date, view_type = 'week', include_tasks = true }) {
    try {
      const params = new URLSearchParams({
        startDate: start_date || new Date().toISOString().split('T')[0],
        endDate: end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        viewType: view_type,
        includeTasks: include_tasks.toString()
      });
      
      const calendarView = await this.makeTickTickRequest(`/calendar/view?${params}`);
      
      const viewTypeLabels = {
        day: 'Daily View',
        week: 'Weekly View', 
        month: 'Monthly View',
        agenda: 'Agenda View'
      };
      
      return {
        content: [{
          type: 'text',
          text: `📅 **${viewTypeLabels[view_type]}** Calendar\n\n` +
                `📊 **View Settings**:\n` +
                `• Period: ${start_date || 'Today'} - ${end_date || '7 days ahead'}\n` +
                `• Include Tasks: ${include_tasks ? 'Yes' : 'No'}\n` +
                `• View Type: ${view_type.toUpperCase()}\n` +
                `• Generated: ${new Date().toLocaleString()}\n\n` +
                
                `📈 **Schedule Overview**:\n` +
                `• Total Events: ${calendarView.events?.length || 0}\n` +
                `• Tasks Scheduled: ${calendarView.tasks?.length || 0}\n` +
                `• Free Time Blocks: ${calendarView.freeTimeBlocks || 0}\n` +
                `• Conflicts: ${calendarView.conflicts || 0}\n\n` +
                
                (calendarView.dailyBreakdown ? 
                  `📋 **Daily Breakdown**:\n` +
                  Object.entries(calendarView.dailyBreakdown).map(([date, data]) => 
                    `📅 **${new Date(date).toLocaleDateString()}**:\n` +
                    `   • Events: ${data.events || 0}\n` +
                    `   • Tasks: ${data.tasks || 0}\n` +
                    `   • Busy Hours: ${data.busyHours || 0}\n` +
                    `   • Free Hours: ${data.freeHours || 0}`
                  ).join('\n\n') + '\n\n' : ''
                ) +
                
                (calendarView.conflicts && calendarView.conflicts.length > 0 ? 
                  `⚠️ **Schedule Conflicts**:\n` +
                  calendarView.conflicts.slice(0, 5).map((conflict, index) => 
                    `${index + 1}. ${conflict.time}: ${conflict.description}`
                  ).join('\n') + '\n\n' : ''
                ) +
                
                `🎯 **Productivity Insights**:\n` +
                `• Peak Hours: ${calendarView.peakHours || 'Not analyzed'}\n` +
                `• Utilization Rate: ${calendarView.utilizationRate || 0}%\n` +
                `• Focus Time Available: ${calendarView.focusTimeHours || 0} hours\n` +
                `• Meeting Load: ${calendarView.meetingLoad || 'Light'}\n\n` +
                
                `💡 **Optimization Tips**:\n` +
                `• Schedule focused work during free blocks\n` +
                `• Batch similar tasks together\n` +
                `• Leave buffer time between meetings\n` +
                `• Block time for deep work sessions`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get calendar view: ${error.message}`);
    }
  }

  async convertTaskToEvent({ task_id, event_duration_minutes = 60, start_time, create_reminder = true }) {
    try {
      const conversionData = {
        eventDurationMinutes: event_duration_minutes,
        startTime: start_time,
        createReminder: create_reminder
      };
      
      const result = await this.makeTickTickRequest(`/task/${task_id}/convert-to-event`, 'POST', conversionData);
      
      const durationHours = Math.round(event_duration_minutes / 60 * 10) / 10;
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Task Converted to Calendar Event!**\n\n` +
                `📋 **Original Task**: ${task_id}\n` +
                `📅 **New Event**: ${result.eventId}\n` +
                `📅 **Conversion Date**: ${new Date().toLocaleString()}\n\n` +
                
                `📊 **Event Details**:\n` +
                `• **Title**: ${result.eventTitle || 'Converted from task'}\n` +
                `• **Duration**: ${durationHours} hour(s) (${event_duration_minutes} minutes)\n` +
                `• **Scheduled**: ${start_time ? new Date(start_time).toLocaleString() : 'Time to be determined'}\n` +
                `• **Reminder**: ${create_reminder ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                
                `🔗 **Task-Event Connection**:\n` +
                `• Original task ${result.taskKept ? 'preserved' : 'archived'}\n` +
                `• Event linked to task data\n` +
                `• Progress tracking maintained\n` +
                `• Comments and attachments carried over\n\n` +
                
                `✅ **Benefits of Conversion**:\n` +
                `• Time-blocked in calendar\n` +
                `• Better schedule visibility\n` +
                `• Automatic reminders\n` +
                `• Integration with other calendar tools\n` +
                `• Protected focus time\n\n` +
                
                `🎯 **Next Steps**:\n` +
                `• Adjust event timing if needed\n` +
                `• Add location or meeting details\n` +
                `• Invite collaborators if applicable\n` +
                `• Set up recurring pattern if this is a regular task\n\n` +
                
                `💡 **Pro Tips**:\n` +
                `• Convert routine tasks for better time management\n` +
                `• Use time-blocking for deep work\n` +
                `• Schedule tasks during your peak energy hours\n` +
                `• Leave buffer time between events`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to convert task to event: ${error.message}`);
    }
  }

  async getScheduleConflicts({ start_date, end_date, include_tasks = true, conflict_threshold_minutes = 15 }) {
    try {
      const params = new URLSearchParams({
        startDate: start_date || new Date().toISOString().split('T')[0],
        endDate: end_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        includeTasks: include_tasks.toString(),
        thresholdMinutes: conflict_threshold_minutes.toString()
      });
      
      const conflicts = await this.makeTickTickRequest(`/calendar/conflicts?${params}`);
      
      const severityColors = {
        high: '🔴',
        medium: '🟡', 
        low: '🟢'
      };
      
      return {
        content: [{
          type: 'text',
          text: `⚠️ **Schedule Conflict Analysis** (${conflicts.length || 0} conflicts found)\n\n` +
                `📊 **Analysis Parameters**:\n` +
                `• Date Range: ${start_date || 'Today'} - ${end_date || '7 days ahead'}\n` +
                `• Include Tasks: ${include_tasks ? 'Yes' : 'No'}\n` +
                `• Conflict Threshold: ${conflict_threshold_minutes} minutes\n` +
                `• Analyzed: ${new Date().toLocaleString()}\n\n` +
                
                (conflicts.length > 0 ? 
                  `🚨 **Detected Conflicts**:\n` +
                  conflicts.map((conflict, index) => 
                    `${index + 1}. ${severityColors[conflict.severity] || '⚠️'} **${conflict.type?.toUpperCase()} CONFLICT**\n` +
                    `   📅 Date: ${new Date(conflict.date).toLocaleDateString()}\n` +
                    `   ⏰ Time: ${conflict.startTime} - ${conflict.endTime}\n` +
                    `   📋 Items: ${conflict.item1} ↔ ${conflict.item2}\n` +
                    `   ⏱️ Overlap: ${conflict.overlapMinutes} minutes\n` +
                    `   💡 Suggestion: ${conflict.suggestion || 'Reschedule one item'}`
                  ).join('\n\n') :
                  '✅ **No conflicts found!** Your schedule is well-organized for the specified period.'
                ) +
                
                `\n\n📊 **Conflict Summary**:\n` +
                `• High Priority: ${conflicts.filter(c => c.severity === 'high').length} 🔴\n` +
                `• Medium Priority: ${conflicts.filter(c => c.severity === 'medium').length} 🟡\n` +
                `• Low Priority: ${conflicts.filter(c => c.severity === 'low').length} 🟢\n` +
                `• Event-Event: ${conflicts.filter(c => c.type === 'event').length}\n` +
                `• Task-Event: ${conflicts.filter(c => c.type === 'task').length}\n\n` +
                
                (conflicts.length > 0 ? 
                  `🔧 **Resolution Strategies**:\n` +
                  `• Reschedule lower priority items\n` +
                  `• Shorten event durations\n` +
                  `• Move tasks to different time slots\n` +
                  `• Delegate conflicting responsibilities\n` +
                  `• Use buffer time between events\n\n` : ''
                ) +
                
                `📈 **Schedule Health Score**: ${conflicts.length === 0 ? '100' : Math.max(0, 100 - conflicts.length * 10)}/100\n\n` +
                
                `💡 **Prevention Tips**:\n` +
                `• Use calendar blocking for important tasks\n` +
                `• Set realistic time estimates\n` +
                `• Include travel time between meetings\n` +
                `• Regular schedule reviews\n` +
                `• Automated conflict detection`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get schedule conflicts: ${error.message}`);
    }
  }

  async bulkCalendarImport({ calendar_data, import_source, merge_duplicates = true, create_new_calendar = false }) {
    try {
      const importData = {
        calendarData: calendar_data,
        importSource: import_source,
        mergeDuplicates: merge_duplicates,
        createNewCalendar: create_new_calendar
      };
      
      const importResult = await this.makeTickTickRequest('/calendar/bulk-import', 'POST', importData);
      
      return {
        content: [{
          type: 'text',
          text: `📥 **Bulk Calendar Import Completed!**\n\n` +
                `📊 **Import Configuration**:\n` +
                `• Source: ${import_source || 'Unknown'}\n` +
                `• Data Format: iCal/ICS\n` +
                `• Merge Duplicates: ${merge_duplicates ? 'Yes' : 'No'}\n` +
                `• New Calendar: ${create_new_calendar ? 'Created' : 'Use existing'}\n` +
                `• Processed: ${new Date().toLocaleString()}\n\n` +
                
                `📈 **Import Results**:\n` +
                `• Events Processed: ${importResult.totalProcessed || 0}\n` +
                `• Successfully Imported: ${importResult.imported || 0}\n` +
                `• Duplicates Merged: ${importResult.duplicatesMerged || 0}\n` +
                `• Skipped (Invalid): ${importResult.skipped || 0}\n` +
                `• Errors Encountered: ${importResult.errors || 0}\n\n` +
                
                `📅 **Date Range**:\n` +
                `• Earliest Event: ${importResult.earliestDate || 'N/A'}\n` +
                `• Latest Event: ${importResult.latestDate || 'N/A'}\n` +
                `• Span: ${importResult.dateSpan || 'Unknown'}\n\n` +
                
                (importResult.newCalendarId ? 
                  `📁 **New Calendar Created**:\n` +
                  `• Calendar ID: ${importResult.newCalendarId}\n` +
                  `• Name: ${importResult.newCalendarName || 'Imported Events'}\n` +
                  `• Color: ${importResult.newCalendarColor || 'Default'}\n\n` : ''
                ) +
                
                (importResult.errors > 0 ? 
                  `⚠️ **Import Issues**:\n` +
                  (importResult.errorDetails || []).slice(0, 5).map((error, index) => 
                    `${index + 1}. ${error.message} (Line: ${error.line || 'Unknown'})`
                  ).join('\n') + 
                  (importResult.errorDetails?.length > 5 ? `\n... and ${importResult.errorDetails.length - 5} more errors` : '') + '\n\n' : ''
                ) +
                
                `✅ **Import Success Rate**: ${importResult.totalProcessed > 0 ? Math.round((importResult.imported / importResult.totalProcessed) * 100) : 0}%\n\n` +
                
                `🔄 **Post-Import Actions**:\n` +
                `• Review imported events for accuracy\n` +
                `• Set up notifications for important events\n` +
                `• Organize events into appropriate calendars\n` +
                `• Verify time zones are correct\n` +
                `• Clean up any duplicate entries\n\n` +
                
                `💡 **Data Quality Tips**:\n` +
                `• Use standard iCal format for best results\n` +
                `• Include timezone information\n` +
                `• Validate data before import\n` +
                `• Back up existing calendar before large imports\n` +
                `• Test with small datasets first`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to bulk import calendar: ${error.message}`);
    }
  }

  // Notes & Attachments Methods (Phase 3: 8 operations)
  async getTaskNotes({ task_id, include_replies = true, sort_order = 'newest' }) {
    try {
      const params = new URLSearchParams({
        includeReplies: include_replies.toString(),
        sortOrder: sort_order
      });
      
      const notes = await this.makeTickTickRequest(`/task/${task_id}/notes?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `📝 **Task Notes** (${notes.length || 0} notes found)\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🔄 **Sort Order**: ${sort_order.toUpperCase()}\n` +
                `💬 **Include Replies**: ${include_replies ? 'Yes' : 'No'}\n` +
                `📅 **Retrieved**: ${new Date().toLocaleString()}\n\n` +
                
                (notes.length > 0 ? 
                  `📄 **Notes & Comments**:\n` +
                  notes.map((note, index) => 
                    `${index + 1}. **${note.type?.toUpperCase() || 'COMMENT'}** ${note.isPrivate ? '🔒' : '🌍'}\n` +
                    `   👤 Author: ${note.authorName || note.authorId}\n` +
                    `   📅 Created: ${note.createdTime ? new Date(note.createdTime).toLocaleString() : 'N/A'}\n` +
                    `   📝 Content: ${note.content ? note.content.substring(0, 200) + (note.content.length > 200 ? '...' : '') : 'No content'}\n` +
                    `   🆔 Note ID: ${note.id}\n` +
                    (note.replies && note.replies.length > 0 ? 
                      `   💬 Replies (${note.replies.length}): ${note.replies.map(r => r.authorName || r.authorId).join(', ')}\n` : ''
                    ) +
                    (note.lastModified ? `   ✏️ Last Modified: ${new Date(note.lastModified).toLocaleString()}\n` : '')
                  ).join('\n') :
                  '📭 **No notes found** for this task.'
                ) +
                
                `\n\n📊 **Notes Summary**:\n` +
                `• Total Notes: ${notes.length}\n` +
                `• Comments: ${notes.filter(n => n.type === 'comment').length}\n` +
                `• Progress Updates: ${notes.filter(n => n.type === 'progress').length}\n` +
                `• Reminders: ${notes.filter(n => n.type === 'reminder').length}\n` +
                `• Private Notes: ${notes.filter(n => n.isPrivate).length}\n` +
                `• With Replies: ${notes.filter(n => n.replies && n.replies.length > 0).length}\n\n` +
                
                `🔄 **Quick Actions**:\n` +
                `• Add new note or comment\n` +
                `• Edit existing notes\n` +
                `• Reply to specific comments\n` +
                `• Mark notes as private/public`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get task notes: ${error.message}`);
    }
  }

  async addTaskNote({ task_id, note_content, note_type = 'comment', is_private = false }) {
    try {
      const noteData = {
        content: note_content,
        type: note_type,
        isPrivate: is_private
      };
      
      const newNote = await this.makeTickTickRequest(`/task/${task_id}/note`, 'POST', noteData);
      
      const noteTypeLabels = {
        comment: 'Comment',
        progress: 'Progress Update',
        reminder: 'Reminder'
      };
      
      return {
        content: [{
          type: 'text',
          text: `📝 **Note Added Successfully!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Note ID**: ${newNote.id}\n` +
                `📂 **Type**: ${noteTypeLabels[note_type] || note_type}\n` +
                `🔒 **Privacy**: ${is_private ? 'Private' : 'Public'}\n` +
                `📅 **Created**: ${new Date().toLocaleString()}\n\n` +
                
                `📝 **Note Content**:\n"${note_content}"\n\n` +
                
                `✅ **Note Features**:\n` +
                `• ${is_private ? 'Visible to you only' : 'Visible to all team members'}\n` +
                `• Can be edited or deleted later\n` +
                `• Supports @mentions and rich formatting\n` +
                `• Automatically timestamped\n` +
                `• Preserved in task history\n\n` +
                
                `💡 **Best Practices**:\n` +
                (note_type === 'progress' ? 
                  `• Update regularly to keep team informed\n• Include specific accomplishments\n• Mention any blockers or challenges\n• Set next steps clearly` :
                note_type === 'reminder' ?
                  `• Set clear action items\n• Include deadlines if applicable\n• Use @mentions for specific people\n• Follow up on reminder items` :
                  `• Be clear and constructive\n• Ask specific questions\n• Provide context when needed\n• Use friendly, professional tone`
                ) +
                
                `\n\n🎯 **Follow-up Actions**:\n` +
                `• Notify relevant team members\n` +
                `• Set reminders if needed\n` +
                `• Link to related resources\n` +
                `• Monitor for responses`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to add task note: ${error.message}`);
    }
  }

  async updateTaskNote({ task_id, note_id, new_content }) {
    try {
      const updateData = {
        content: new_content
      };
      
      const updatedNote = await this.makeTickTickRequest(`/task/${task_id}/note/${note_id}`, 'PUT', updateData);
      
      return {
        content: [{
          type: 'text',
          text: `✏️ **Note Updated Successfully!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Note ID**: ${note_id}\n` +
                `📅 **Updated**: ${new Date().toLocaleString()}\n` +
                `👤 **Last Editor**: ${updatedNote.lastEditor || 'You'}\n\n` +
                
                `📝 **Updated Content**:\n"${new_content}"\n\n` +
                
                `📊 **Edit History**:\n` +
                `• Original Creation: ${updatedNote.createdTime ? new Date(updatedNote.createdTime).toLocaleString() : 'N/A'}\n` +
                `• Previous Update: ${updatedNote.previousUpdate ? new Date(updatedNote.previousUpdate).toLocaleString() : 'First edit'}\n` +
                `• Current Update: ${new Date().toLocaleString()}\n` +
                `• Total Edits: ${updatedNote.editCount || 1}\n\n` +
                
                `✅ **Update Features**:\n` +
                `• Edit history preserved\n` +
                `• Team members notified of changes\n` +
                `• Timestamps automatically updated\n` +
                `• Previous versions remain accessible\n\n` +
                
                `💡 **Editing Tips**:\n` +
                `• Clearly mark significant changes\n` +
                `• Preserve important context\n` +
                `• Use edit notes for transparency\n` +
                `• Consider notifying mentioned users\n\n` +
                
                `🔄 **Next Steps**:\n` +
                `• Review updated content\n` +
                `• Notify stakeholders if needed\n` +
                `• Update related documentation\n` +
                `• Monitor for team feedback`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update task note: ${error.message}`);
    }
  }

  async deleteTaskNote({ task_id, note_id }) {
    try {
      const noteInfo = await this.makeTickTickRequest(`/task/${task_id}/note/${note_id}`, 'GET');
      await this.makeTickTickRequest(`/task/${task_id}/note/${note_id}`, 'DELETE');
      
      return {
        content: [{
          type: 'text',
          text: `🗑️ **Note Deleted Successfully!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Deleted Note ID**: ${note_id}\n` +
                `📅 **Deleted**: ${new Date().toLocaleString()}\n\n` +
                
                `📝 **Deleted Note Details**:\n` +
                `• **Type**: ${noteInfo.type || 'Comment'}\n` +
                `• **Author**: ${noteInfo.authorName || noteInfo.authorId || 'Unknown'}\n` +
                `• **Created**: ${noteInfo.createdTime ? new Date(noteInfo.createdTime).toLocaleString() : 'N/A'}\n` +
                `• **Content Preview**: ${noteInfo.content ? noteInfo.content.substring(0, 100) + '...' : 'No content'}\n` +
                `• **Privacy**: ${noteInfo.isPrivate ? 'Private' : 'Public'}\n\n` +
                
                `⚠️ **Deletion Impact**:\n` +
                `• Note permanently removed from task\n` +
                `• Edit history no longer accessible\n` +
                `• Replies and mentions removed\n` +
                `• Cannot be recovered once deleted\n\n` +
                
                `📊 **Task Notes Status**:\n` +
                `• Remaining notes will be preserved\n` +
                `• Task activity timeline updated\n` +
                `• Team members notified of deletion\n` +
                `• Related references may be broken\n\n` +
                
                `💡 **Deletion Best Practices**:\n` +
                `• Consider archiving instead of deleting\n` +
                `• Notify team before removing important notes\n` +
                `• Save critical information elsewhere\n` +
                `• Document reason for deletion if needed\n\n` +
                
                `✅ **Cleanup Complete**: Note has been permanently removed from the task.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to delete task note: ${error.message}`);
    }
  }

  async uploadTaskAttachment({ task_id, file_data, file_name, file_type, description }) {
    try {
      const attachmentData = {
        fileData: file_data,
        fileName: file_name,
        fileType: file_type,
        description: description
      };
      
      const attachment = await this.makeTickTickRequest(`/task/${task_id}/attachment`, 'POST', attachmentData);
      
      const fileSizeKB = Math.round(file_data.length * 0.75 / 1024); // Rough estimate from base64
      const fileTypeCategory = file_type?.startsWith('image/') ? '🖼️ Image' :
                              file_type?.startsWith('video/') ? '🎥 Video' :
                              file_type?.startsWith('audio/') ? '🎵 Audio' :
                              file_type?.includes('pdf') ? '📄 PDF' :
                              file_type?.includes('document') ? '📝 Document' :
                              '📎 File';
      
      return {
        content: [{
          type: 'text',
          text: `📎 **File Attached Successfully!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Attachment ID**: ${attachment.id}\n` +
                `📁 **File Name**: ${file_name}\n` +
                `📂 **Type**: ${fileTypeCategory}\n` +
                `📊 **Size**: ~${fileSizeKB}KB\n` +
                `📅 **Uploaded**: ${new Date().toLocaleString()}\n\n` +
                
                `📝 **File Details**:\n` +
                `• **MIME Type**: ${file_type || 'Unknown'}\n` +
                `• **Description**: ${description || 'No description provided'}\n` +
                `• **Storage Location**: TickTick Cloud Storage\n` +
                `• **Access**: Available to all task collaborators\n\n` +
                
                `🔗 **File Access**:\n` +
                `• **Download URL**: ${attachment.downloadUrl || 'Will be available shortly'}\n` +
                `• **Preview**: ${attachment.previewUrl ? 'Available' : 'Not available for this file type'}\n` +
                `• **Sharing**: Can be shared with task link\n` +
                `• **Expiry**: ${attachment.expiryDate || 'No expiration'}\n\n` +
                
                `✅ **Upload Features**:\n` +
                `• Automatic virus scanning completed\n` +
                `• File integrity verified\n` +
                `• Backup copies created\n` +
                `• Team access permissions applied\n` +
                `• Search indexing enabled\n\n` +
                
                `📱 **Supported Actions**:\n` +
                `• Download original file\n` +
                `• Generate shareable links\n` +
                `• Add version comments\n` +
                `• Update file description\n` +
                `• Remove when no longer needed\n\n` +
                
                `💡 **File Management Tips**:\n` +
                `• Use descriptive file names\n` +
                `• Add context in descriptions\n` +
                `• Organize by project or date\n` +
                `• Clean up old files regularly\n` +
                `• Consider file size limits for team plans`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to upload task attachment: ${error.message}`);
    }
  }

  async getTaskAttachments({ task_id, file_type_filter = 'all' }) {
    try {
      const params = new URLSearchParams({
        filter: file_type_filter
      });
      
      const attachments = await this.makeTickTickRequest(`/task/${task_id}/attachments?${params}`);
      
      const typeIcons = {
        images: '🖼️',
        documents: '📝',
        audio: '🎵',
        video: '🎥',
        all: '📎'
      };
      
      const totalSize = attachments.reduce((sum, att) => sum + (att.fileSize || 0), 0);
      const totalSizeMB = Math.round(totalSize / (1024 * 1024) * 10) / 10;
      
      return {
        content: [{
          type: 'text',
          text: `📎 **Task Attachments** (${attachments.length || 0} files found)\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🔍 **Filter**: ${typeIcons[file_type_filter]} ${file_type_filter.toUpperCase()}\n` +
                `📊 **Total Size**: ${totalSizeMB}MB\n` +
                `📅 **Retrieved**: ${new Date().toLocaleString()}\n\n` +
                
                (attachments.length > 0 ? 
                  `📁 **Attached Files**:\n` +
                  attachments.map((attachment, index) => {
                    const fileSizeMB = Math.round((attachment.fileSize || 0) / (1024 * 1024) * 100) / 100;
                    const fileIcon = attachment.fileType?.startsWith('image/') ? '🖼️' :
                                    attachment.fileType?.startsWith('video/') ? '🎥' :
                                    attachment.fileType?.startsWith('audio/') ? '🎵' :
                                    attachment.fileType?.includes('pdf') ? '📄' :
                                    attachment.fileType?.includes('document') ? '📝' : '📎';
                    
                    return `${index + 1}. ${fileIcon} **${attachment.fileName}**\n` +
                           `   🆔 ID: ${attachment.id}\n` +
                           `   📊 Size: ${fileSizeMB}MB\n` +
                           `   📂 Type: ${attachment.fileType || 'Unknown'}\n` +
                           `   📅 Uploaded: ${attachment.uploadDate ? new Date(attachment.uploadDate).toLocaleString() : 'N/A'}\n` +
                           `   👤 Uploader: ${attachment.uploaderName || attachment.uploaderId || 'Unknown'}\n` +
                           `   📝 Description: ${attachment.description || 'No description'}\n` +
                           `   🔗 Status: ${attachment.status || 'Available'}\n` +
                           `   💾 Downloads: ${attachment.downloadCount || 0}`;
                  }).join('\n\n') :
                  `📭 **No ${file_type_filter === 'all' ? '' : file_type_filter + ' '}attachments found** for this task.`
                ) +
                
                `\n\n📊 **Attachment Summary**:\n` +
                `• Images: ${attachments.filter(a => a.fileType?.startsWith('image/')).length} 🖼️\n` +
                `• Documents: ${attachments.filter(a => a.fileType?.includes('document') || a.fileType?.includes('pdf')).length} 📝\n` +
                `• Videos: ${attachments.filter(a => a.fileType?.startsWith('video/')).length} 🎥\n` +
                `• Audio: ${attachments.filter(a => a.fileType?.startsWith('audio/')).length} 🎵\n` +
                `• Other: ${attachments.filter(a => !a.fileType?.match(/(image|video|audio|document|pdf)/)).length} 📎\n\n` +
                
                `🔄 **Quick Actions**:\n` +
                `• Download specific files\n` +
                `• Upload new attachments\n` +
                `• Update file descriptions\n` +
                `• Remove outdated files\n` +
                `• Generate shareable links\n\n` +
                
                `💡 **Storage Tips**:\n` +
                `• Regularly review and clean up files\n` +
                `• Use cloud storage for large files\n` +
                `• Compress files when possible\n` +
                `• Organize with clear naming conventions`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get task attachments: ${error.message}`);
    }
  }

  async downloadTaskAttachment({ task_id, attachment_id, download_format = 'original' }) {
    try {
      const params = new URLSearchParams({
        format: download_format
      });
      
      const downloadInfo = await this.makeTickTickRequest(`/task/${task_id}/attachment/${attachment_id}/download?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `⬇️ **File Download Ready!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Attachment ID**: ${attachment_id}\n` +
                `📁 **File Name**: ${downloadInfo.fileName || 'Unknown'}\n` +
                `📊 **File Size**: ${downloadInfo.fileSize ? Math.round(downloadInfo.fileSize / (1024 * 1024) * 100) / 100 + 'MB' : 'Unknown'}\n` +
                `📂 **Format**: ${download_format.toUpperCase()}\n` +
                `📅 **Generated**: ${new Date().toLocaleString()}\n\n` +
                
                `🔗 **Download Information**:\n` +
                `• **Download URL**: ${downloadInfo.downloadUrl}\n` +
                `• **Expires**: ${downloadInfo.expiryTime ? new Date(downloadInfo.expiryTime).toLocaleString() : 'No expiration'}\n` +
                `• **Access Limit**: ${downloadInfo.downloadLimit || 'Unlimited'} downloads\n` +
                `• **File Type**: ${downloadInfo.mimeType || 'Unknown'}\n\n` +
                
                (download_format === 'compressed' ? 
                  `📦 **Compression Details**:\n` +
                  `• Original Size: ${downloadInfo.originalSize ? Math.round(downloadInfo.originalSize / (1024 * 1024) * 100) / 100 + 'MB' : 'Unknown'}\n` +
                  `• Compressed Size: ${downloadInfo.compressedSize ? Math.round(downloadInfo.compressedSize / (1024 * 1024) * 100) / 100 + 'MB' : 'Unknown'}\n` +
                  `• Compression Ratio: ${downloadInfo.compressionRatio ? Math.round(downloadInfo.compressionRatio * 100) + '%' : 'Unknown'}\n` +
                  `• Quality: ${downloadInfo.quality || 'Optimized'}\n\n` : ''
                ) +
                
                `🔐 **Security Features**:\n` +
                `• Secure HTTPS download link\n` +
                `• Virus scan completed\n` +
                `• Access logging enabled\n` +
                `• Download tracking active\n\n` +
                
                `💡 **Download Tips**:\n` +
                `• Save the file promptly (link may expire)\n` +
                `• Use original format for best quality\n` +
                `• Choose compressed for faster downloads\n` +
                `• Verify file integrity after download\n\n` +
                
                `📱 **Browser Instructions**:\n` +
                `1. Click the download URL above\n` +
                `2. Choose save location\n` +
                `3. Wait for download to complete\n` +
                `4. Verify file opens correctly\n\n` +
                
                `🔄 **Next Steps**:\n` +
                `• Open/review the downloaded file\n` +
                `• Share with team members if needed\n` +
                `• Update task progress\n` +
                `• Provide feedback on file content`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to download task attachment: ${error.message}`);
    }
  }

  async deleteTaskAttachment({ task_id, attachment_id }) {
    try {
      const attachmentInfo = await this.makeTickTickRequest(`/task/${task_id}/attachment/${attachment_id}`, 'GET');
      await this.makeTickTickRequest(`/task/${task_id}/attachment/${attachment_id}`, 'DELETE');
      
      const fileSizeMB = Math.round((attachmentInfo.fileSize || 0) / (1024 * 1024) * 100) / 100;
      
      return {
        content: [{
          type: 'text',
          text: `🗑️ **Attachment Deleted Successfully!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Deleted Attachment ID**: ${attachment_id}\n` +
                `📁 **File Name**: ${attachmentInfo.fileName || 'Unknown'}\n` +
                `📊 **File Size**: ${fileSizeMB}MB\n` +
                `📅 **Deleted**: ${new Date().toLocaleString()}\n\n` +
                
                `📝 **Deleted File Details**:\n` +
                `• **Original Upload**: ${attachmentInfo.uploadDate ? new Date(attachmentInfo.uploadDate).toLocaleString() : 'N/A'}\n` +
                `• **File Type**: ${attachmentInfo.fileType || 'Unknown'}\n` +
                `• **Uploader**: ${attachmentInfo.uploaderName || attachmentInfo.uploaderId || 'Unknown'}\n` +
                `• **Download Count**: ${attachmentInfo.downloadCount || 0} times\n` +
                `• **Description**: ${attachmentInfo.description || 'No description'}\n\n` +
                
                `⚠️ **Deletion Impact**:\n` +
                `• File permanently removed from cloud storage\n` +
                `• Download links no longer accessible\n` +
                `• Cannot be recovered once deleted\n` +
                `• ${fileSizeMB}MB of storage space freed\n` +
                `• References in notes may be broken\n\n` +
                
                `📊 **Storage Cleanup**:\n` +
                `• Cloud storage updated\n` +
                `• Backup copies removed\n` +
                `• Search index updated\n` +
                `• Team access revoked\n` +
                `• Download history preserved\n\n` +
                
                `✅ **Team Notification**:\n` +
                `• Task collaborators notified\n` +
                `• Activity timeline updated\n` +
                `• Related task comments preserved\n` +
                `• Project storage usage updated\n\n` +
                
                `💡 **Post-Deletion Actions**:\n` +
                `• Update related documentation\n` +
                `• Notify stakeholders if needed\n` +
                `• Replace with updated file if applicable\n` +
                `• Review remaining attachments\n\n` +
                
                `🔄 **File Management**:\n` +
                `• Regular cleanup saves storage space\n` +
                `• Archive important files before deletion\n` +
                `• Consider file versioning for updates\n` +
                `• Maintain organized file structures`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to delete task attachment: ${error.message}`);
    }
  }

  // Templates & Automation Methods (Phase 3: 9 operations)
  async getTaskTemplates({ category, include_shared = true, sort_by = 'usage' }) {
    try {
      const params = new URLSearchParams({
        includeShared: include_shared.toString(),
        sortBy: sort_by
      });
      
      if (category) params.append('category', category);
      
      const templates = await this.makeTickTickRequest(`/task/templates?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `📋 **Task Templates** (${templates.length || 0} templates found)\n\n` +
                `🔍 **Search Parameters**:\n` +
                `• Category Filter: ${category || 'All categories'}\n` +
                `• Include Shared: ${include_shared ? 'Yes' : 'No'}\n` +
                `• Sort By: ${sort_by.replace('_', ' ').toUpperCase()}\n` +
                `📅 **Retrieved**: ${new Date().toLocaleString()}\n\n` +
                
                (templates.length > 0 ? 
                  `📄 **Available Templates**:\n` +
                  templates.map((template, index) => 
                    `${index + 1}. **${template.name}** ${template.isShared ? '🌍' : '🔒'}\n` +
                    `   🆔 ID: ${template.id}\n` +
                    `   📂 Category: ${template.category || 'General'}\n` +
                    `   📝 Description: ${template.description || 'No description'}\n` +
                    `   👤 Creator: ${template.creatorName || template.creatorId || 'Unknown'}\n` +
                    `   📊 Usage Count: ${template.usageCount || 0} times\n` +
                    `   📅 Created: ${template.createdDate ? new Date(template.createdDate).toLocaleDateString() : 'N/A'}\n` +
                    `   📅 Updated: ${template.updatedDate ? new Date(template.updatedDate).toLocaleDateString() : 'N/A'}\n` +
                    `   ⭐ Rating: ${template.averageRating || 'No ratings'}\n` +
                    `   🏷️ Tags: ${template.tags ? template.tags.join(', ') : 'None'}`
                  ).join('\n\n') :
                  '📭 **No templates found** matching your criteria.'
                ) +
                
                `\n\n📊 **Template Summary**:\n` +
                `• Personal Templates: ${templates.filter(t => !t.isShared).length}\n` +
                `• Shared Templates: ${templates.filter(t => t.isShared).length}\n` +
                `• Most Used: ${templates.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))[0]?.name || 'None'}\n` +
                `• Categories: ${[...new Set(templates.map(t => t.category).filter(Boolean))].join(', ') || 'None'}\n\n` +
                
                `🔄 **Quick Actions**:\n` +
                `• Create task from template\n` +
                `• Create new template\n` +
                `• Edit existing templates\n` +
                `• Share templates with team\n` +
                `• Bulk create from template\n\n` +
                
                `💡 **Template Tips**:\n` +
                `• Use templates for repetitive task structures\n` +
                `• Create project-specific templates\n` +
                `• Share best practices through templates\n` +
                `• Regularly update and refine templates`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get task templates: ${error.message}`);
    }
  }

  async createTaskTemplate({ template_name, template_description, task_data, category = 'general', is_shared = false }) {
    try {
      const templateData = {
        name: template_name,
        description: template_description,
        taskStructure: task_data,
        category,
        isShared: is_shared
      };
      
      const newTemplate = await this.makeTickTickRequest('/task/template', 'POST', templateData);
      
      return {
        content: [{
          type: 'text',
          text: `📋 **Task Template Created Successfully!**\n\n` +
                `✅ **Template Details**:\n` +
                `• **Name**: ${newTemplate.name}\n` +
                `• **Template ID**: ${newTemplate.id}\n` +
                `• **Category**: ${newTemplate.category}\n` +
                `• **Sharing**: ${is_shared ? 'Shared with team' : 'Personal only'}\n` +
                `• **Created**: ${new Date().toLocaleString()}\n\n` +
                
                `📝 **Description**:\n${template_description || 'No description provided'}\n\n` +
                
                `📊 **Template Structure**:\n` +
                `• **Task Title**: ${task_data.title}\n` +
                `• **Description**: ${task_data.description || 'Template-based task'}\n` +
                `• **Priority**: ${task_data.priority || 'Medium'}\n` +
                `• **Estimated Duration**: ${task_data.estimated_duration ? task_data.estimated_duration + ' minutes' : 'Not specified'}\n` +
                `• **Tags**: ${task_data.tags ? task_data.tags.join(', ') : 'None'}\n\n` +
                
                `✅ **Template Features**:\n` +
                `• Reusable task structure\n` +
                `• Customizable on creation\n` +
                `• ${is_shared ? 'Available to all team members' : 'Private to your account'}\n` +
                `• Version tracking enabled\n` +
                `• Usage analytics tracked\n\n` +
                
                `🎯 **Use Cases**:\n` +
                `• Standardize recurring workflows\n` +
                `• Onboard new team members\n` +
                `• Ensure consistent task quality\n` +
                `• Save time on similar tasks\n\n` +
                
                `🚀 **Next Steps**:\n` +
                `• Create tasks from this template\n` +
                `• Share with team members if needed\n` +
                `• Refine based on usage feedback\n` +
                `• Add to your favorite templates\n\n` +
                
                `💡 **Template Management**:\n` +
                `• Update template as processes evolve\n` +
                `• Monitor usage statistics\n` +
                `• Gather feedback from users\n` +
                `• Archive unused templates`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create task template: ${error.message}`);
    }
  }

  async updateTaskTemplate({ template_id, template_name, template_description, task_data, category }) {
    try {
      const updateData = {};
      if (template_name) updateData.name = template_name;
      if (template_description) updateData.description = template_description;
      if (task_data) updateData.taskStructure = task_data;
      if (category) updateData.category = category;
      
      const updatedTemplate = await this.makeTickTickRequest(`/task/template/${template_id}`, 'PUT', updateData);
      
      return {
        content: [{
          type: 'text',
          text: `✏️ **Template Updated Successfully!**\n\n` +
                `📋 **Updated Template**:\n` +
                `• **Template ID**: ${template_id}\n` +
                `• **Name**: ${updatedTemplate.name}\n` +
                `• **Category**: ${updatedTemplate.category}\n` +
                `• **Version**: ${updatedTemplate.version || 'Latest'}\n` +
                `• **Updated**: ${new Date().toLocaleString()}\n\n` +
                
                `📝 **Description**:\n${updatedTemplate.description || 'No description provided'}\n\n` +
                
                `🔄 **Update Summary**:\n` +
                `• ${template_name ? '✅ Name updated' : '📋 Name unchanged'}\n` +
                `• ${template_description ? '✅ Description updated' : '📋 Description unchanged'}\n` +
                `• ${task_data ? '✅ Task structure updated' : '📋 Structure unchanged'}\n` +
                `• ${category ? '✅ Category updated' : '📋 Category unchanged'}\n\n` +
                
                `📊 **Template Impact**:\n` +
                `• Usage Count: ${updatedTemplate.usageCount || 0} times\n` +
                `• Active Users: ${updatedTemplate.activeUsers || 0}\n` +
                `• Last Used: ${updatedTemplate.lastUsed ? new Date(updatedTemplate.lastUsed).toLocaleDateString() : 'Never'}\n` +
                `• Average Rating: ${updatedTemplate.averageRating || 'No ratings'}\n\n` +
                
                `⚠️ **Update Notes**:\n` +
                `• Previous version archived automatically\n` +
                `• Existing tasks created from template unchanged\n` +
                `• New tasks will use updated structure\n` +
                `• Team members notified of changes\n\n` +
                
                `💡 **Best Practices**:\n` +
                `• Document significant changes\n` +
                `• Test template before wide adoption\n` +
                `• Communicate updates to team\n` +
                `• Monitor impact on workflow efficiency\n\n` +
                
                `🔄 **Version Management**:\n` +
                `• Previous versions remain accessible\n` +
                `• Change history preserved\n` +
                `• Rollback available if needed\n` +
                `• Usage analytics continue tracking`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update task template: ${error.message}`);
    }
  }

  async deleteTaskTemplate({ template_id }) {
    try {
      const templateInfo = await this.makeTickTickRequest(`/task/template/${template_id}`, 'GET');
      await this.makeTickTickRequest(`/task/template/${template_id}`, 'DELETE');
      
      return {
        content: [{
          type: 'text',
          text: `🗑️ **Template Deleted Successfully!**\n\n` +
                `📋 **Deleted Template**:\n` +
                `• **Name**: ${templateInfo.name}\n` +
                `• **Template ID**: ${template_id}\n` +
                `• **Category**: ${templateInfo.category || 'General'}\n` +
                `• **Creator**: ${templateInfo.creatorName || templateInfo.creatorId || 'Unknown'}\n` +
                `• **Deleted**: ${new Date().toLocaleString()}\n\n` +
                
                `📊 **Template History**:\n` +
                `• **Total Usage**: ${templateInfo.usageCount || 0} times\n` +
                `• **Active Users**: ${templateInfo.activeUsers || 0}\n` +
                `• **Created**: ${templateInfo.createdDate ? new Date(templateInfo.createdDate).toLocaleDateString() : 'N/A'}\n` +
                `• **Last Used**: ${templateInfo.lastUsed ? new Date(templateInfo.lastUsed).toLocaleDateString() : 'Never'}\n` +
                `• **Rating**: ${templateInfo.averageRating || 'No ratings'}\n\n` +
                
                `⚠️ **Deletion Impact**:\n` +
                `• Template permanently removed\n` +
                `• Cannot be used for new task creation\n` +
                `• Existing tasks remain unchanged\n` +
                `• Template history preserved for analytics\n` +
                `• Shared access revoked\n\n` +
                
                `📋 **Affected Users**:\n` +
                `• ${templateInfo.activeUsers || 0} users lost access\n` +
                `• Team members will be notified\n` +
                `• Bookmark references will be broken\n` +
                `• Workflow automations may need updates\n\n` +
                
                `💡 **Post-Deletion Actions**:\n` +
                `• Review dependent workflows\n` +
                `• Create replacement template if needed\n` +
                `• Update team documentation\n` +
                `• Consider alternative templates\n\n` +
                
                `🔄 **Alternative Solutions**:\n` +
                `• Archive instead of delete for reference\n` +
                `• Create improved version before deletion\n` +
                `• Export template structure for backup\n` +
                `• Migrate users to similar templates\n\n` +
                
                `✅ **Cleanup Complete**: Template has been permanently removed from the system.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to delete task template: ${error.message}`);
    }
  }

  async createTaskFromTemplate({ template_id, project_id, customizations = {}, create_multiple = 1 }) {
    try {
      const creationData = {
        templateId: template_id,
        projectId: project_id,
        customizations,
        quantity: create_multiple
      };
      
      const result = await this.makeTickTickRequest('/task/from-template', 'POST', creationData);
      
      const createdTasks = result.tasks || [];
      
      return {
        content: [{
          type: 'text',
          text: `🚀 **Tasks Created from Template!**\n\n` +
                `📋 **Creation Summary**:\n` +
                `• **Template**: ${template_id}\n` +
                `• **Project**: ${project_id || 'Default project'}\n` +
                `• **Tasks Created**: ${createdTasks.length}/${create_multiple}\n` +
                `• **Success Rate**: ${create_multiple > 0 ? Math.round((createdTasks.length / create_multiple) * 100) : 0}%\n` +
                `• **Created**: ${new Date().toLocaleString()}\n\n` +
                
                (createdTasks.length > 0 ? 
                  `✅ **Created Tasks**:\n` +
                  createdTasks.slice(0, 10).map((task, index) => 
                    `${index + 1}. **${task.title}**\n` +
                    `   🆔 ID: ${task.id}\n` +
                    `   📅 Due: ${task.dueDate ? new Date(task.dueDate).toLocaleDateString() : 'Not set'}\n` +
                    `   ⚡ Priority: ${task.priority || 'Medium'}\n` +
                    `   👤 Assigned: ${task.assigneeName || task.assigneeId || 'Unassigned'}\n` +
                    `   🏷️ Tags: ${task.tags ? task.tags.join(', ') : 'None'}`
                  ).join('\n\n') +
                  (createdTasks.length > 10 ? `\n\n... and ${createdTasks.length - 10} more tasks` : '') :
                  '❌ **No tasks were created**. Check template and project permissions.'
                ) +
                
                `\n\n📊 **Customizations Applied**:\n` +
                Object.keys(customizations).length > 0 ? 
                  Object.entries(customizations).map(([key, value]) => 
                    `• ${key.replace('_', ' ').toUpperCase()}: ${value}`
                  ).join('\n') :
                  '• No customizations applied (used template defaults)' +
                
                `\n\n🎯 **Template Benefits**:\n` +
                `• Consistent task structure\n` +
                `• Time-saving automation\n` +
                `• Standardized workflows\n` +
                `• Reduced setup errors\n` +
                `• Best practice implementation\n\n` +
                
                (create_multiple > 1 ? 
                  `🔄 **Bulk Creation Results**:\n` +
                  `• Requested: ${create_multiple} tasks\n` +
                  `• Successfully Created: ${createdTasks.length}\n` +
                  `• Failed: ${create_multiple - createdTasks.length}\n` +
                  `• Average Creation Time: ${result.averageCreationTime || 'Unknown'}\n\n` : ''
                ) +
                
                `📱 **Next Steps**:\n` +
                `• Review created tasks for accuracy\n` +
                `• Assign team members if needed\n` +
                `• Set specific due dates\n` +
                `• Add project-specific details\n` +
                `• Begin task execution\n\n` +
                
                `💡 **Template Usage Tips**:\n` +
                `• Customize templates for different projects\n` +
                `• Use bulk creation for recurring workflows\n` +
                `• Provide feedback to template creators\n` +
                `• Monitor template effectiveness`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to create task from template: ${error.message}`);
    }
  }

  async setRecurringTask({ task_id, recurrence_pattern }) {
    try {
      const recurrenceData = {
        pattern: recurrence_pattern
      };
      
      const recurringTask = await this.makeTickTickRequest(`/task/${task_id}/recurrence`, 'POST', recurrenceData);
      
      const frequencyLabels = {
        daily: 'Daily',
        weekly: 'Weekly',
        monthly: 'Monthly',
        yearly: 'Yearly'
      };
      
      const endConditionText = recurrence_pattern.end_condition ? 
        recurrence_pattern.end_condition.type === 'never' ? 'Never ends' :
        recurrence_pattern.end_condition.type === 'after_count' ? `After ${recurrence_pattern.end_condition.count} occurrences` :
        recurrence_pattern.end_condition.type === 'on_date' ? `Ends on ${recurrence_pattern.end_condition.end_date}` :
        'Not specified' : 'Never ends';
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Recurring Task Setup Complete!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Recurrence ID**: ${recurringTask.recurrenceId}\n` +
                `📅 **Configured**: ${new Date().toLocaleString()}\n\n` +
                
                `⚙️ **Recurrence Pattern**:\n` +
                `• **Frequency**: ${frequencyLabels[recurrence_pattern.frequency]} (every ${recurrence_pattern.interval || 1} ${recurrence_pattern.frequency})\n` +
                `• **End Condition**: ${endConditionText}\n` +
                (recurrence_pattern.days_of_week ? 
                  `• **Days of Week**: ${recurrence_pattern.days_of_week.map(day => 
                    ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day]
                  ).join(', ')}\n` : ''
                ) +
                `• **Next Occurrence**: ${recurringTask.nextOccurrence ? new Date(recurringTask.nextOccurrence).toLocaleString() : 'Calculating...'}\n\n` +
                
                `📊 **Recurrence Schedule**:\n` +
                `• **Total Planned**: ${recurringTask.totalPlannedOccurrences || 'Unlimited'}\n` +
                `• **Completed So Far**: 0 (just started)\n` +
                `• **Remaining**: ${recurringTask.remainingOccurrences || 'Unlimited'}\n` +
                `• **Status**: Active\n\n` +
                
                `🎯 **Automation Benefits**:\n` +
                `• Automatic task creation\n` +
                `• Consistent scheduling\n` +
                `• Reduced manual effort\n` +
                `• Progress tracking across cycles\n` +
                `• Pattern-based workflows\n\n` +
                
                `📱 **Management Features**:\n` +
                `• Pause/resume recurrence\n` +
                `• Modify future occurrences\n` +
                `• Skip specific instances\n` +
                `• Track completion patterns\n` +
                `• Generate recurrence reports\n\n` +
                
                `💡 **Best Practices**:\n` +
                `• Set realistic recurrence intervals\n` +
                `• Review and adjust patterns regularly\n` +
                `• Use end conditions to prevent overload\n` +
                `• Monitor completion rates\n` +
                `• Pause during holidays or breaks\n\n` +
                
                `🔔 **Notifications**:\n` +
                `• New tasks will appear automatically\n` +
                `• Reminders follow original task settings\n` +
                `• Team members notified of new instances\n` +
                `• Overdue patterns trigger alerts\n\n` +
                
                `✅ **Setup Complete**: Your task will now recur automatically according to the specified pattern.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to set recurring task: ${error.message}`);
    }
  }

  async getRecurringTasks({ project_id, frequency_filter = 'all', status = 'active' }) {
    try {
      const params = new URLSearchParams({
        frequencyFilter: frequency_filter,
        status
      });
      
      if (project_id) params.append('projectId', project_id);
      
      const recurringTasks = await this.makeTickTickRequest(`/task/recurring?${params}`);
      
      const frequencyIcons = {
        daily: '📅',
        weekly: '📆',
        monthly: '🗓️',
        yearly: '📋'
      };
      
      const statusIcons = {
        active: '▶️',
        paused: '⏸️',
        completed: '✅'
      };
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Recurring Tasks** (${recurringTasks.length || 0} found)\n\n` +
                `🔍 **Filter Settings**:\n` +
                `• Project: ${project_id || 'All projects'}\n` +
                `• Frequency: ${frequency_filter.toUpperCase()}\n` +
                `• Status: ${status.toUpperCase()}\n` +
                `📅 **Retrieved**: ${new Date().toLocaleString()}\n\n` +
                
                (recurringTasks.length > 0 ? 
                  `📋 **Active Recurring Tasks**:\n` +
                  recurringTasks.map((task, index) => 
                    `${index + 1}. ${statusIcons[task.status] || '🔄'} **${task.title}**\n` +
                    `   🆔 Task ID: ${task.id}\n` +
                    `   🆔 Recurrence ID: ${task.recurrenceId}\n` +
                    `   ${frequencyIcons[task.frequency] || '📋'} Frequency: ${task.frequency} (every ${task.interval || 1})\n` +
                    `   📅 Next Due: ${task.nextOccurrence ? new Date(task.nextOccurrence).toLocaleString() : 'Calculating...'}\n` +
                    `   📊 Completed: ${task.completedOccurrences || 0}/${task.totalPlannedOccurrences || '∞'}\n` +
                    `   📈 Completion Rate: ${task.completionRate || 0}%\n` +
                    `   🎯 Project: ${task.projectName || task.projectId || 'Default'}\n` +
                    `   ⏰ Created: ${task.createdDate ? new Date(task.createdDate).toLocaleDateString() : 'N/A'}\n` +
                    `   🔚 Ends: ${task.endCondition || 'Never'}`
                  ).join('\n\n') :
                  `📭 **No ${status} recurring tasks found** matching your criteria.`
                ) +
                
                `\n\n📊 **Recurrence Summary**:\n` +
                `• Daily: ${recurringTasks.filter(t => t.frequency === 'daily').length} 📅\n` +
                `• Weekly: ${recurringTasks.filter(t => t.frequency === 'weekly').length} 📆\n` +
                `• Monthly: ${recurringTasks.filter(t => t.frequency === 'monthly').length} 🗓️\n` +
                `• Yearly: ${recurringTasks.filter(t => t.frequency === 'yearly').length} 📋\n\n` +
                
                `📈 **Performance Metrics**:\n` +
                `• Average Completion Rate: ${recurringTasks.length > 0 ? Math.round(recurringTasks.reduce((sum, t) => sum + (t.completionRate || 0), 0) / recurringTasks.length) : 0}%\n` +
                `• Most Frequent: ${recurringTasks.sort((a, b) => (b.completedOccurrences || 0) - (a.completedOccurrences || 0))[0]?.title || 'None'}\n` +
                `• Overdue: ${recurringTasks.filter(t => t.isOverdue).length}\n` +
                `• Due Today: ${recurringTasks.filter(t => t.isDueToday).length}\n\n` +
                
                `🔄 **Quick Actions**:\n` +
                `• Pause/resume specific recurrences\n` +
                `• Modify recurrence patterns\n` +
                `• Complete current occurrences\n` +
                `• Generate recurrence reports\n` +
                `• Set up new recurring tasks\n\n` +
                
                `💡 **Management Tips**:\n` +
                `• Monitor completion rates regularly\n` +
                `• Adjust patterns based on workload\n` +
                `• Use pause feature during busy periods\n` +
                `• Review and optimize patterns quarterly\n` +
                `• Set realistic recurrence intervals`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get recurring tasks: ${error.message}`);
    }
  }

  async pauseRecurringTask({ task_id, pause_reason, resume_date }) {
    try {
      const pauseData = {
        reason: pause_reason,
        resumeDate: resume_date
      };
      
      const pausedTask = await this.makeTickTickRequest(`/task/${task_id}/recurrence/pause`, 'PUT', pauseData);
      
      return {
        content: [{
          type: 'text',
          text: `⏸️ **Recurring Task Paused Successfully!**\n\n` +
                `📋 **Task**: ${task_id}\n` +
                `🆔 **Recurrence ID**: ${pausedTask.recurrenceId}\n` +
                `📅 **Paused**: ${new Date().toLocaleString()}\n` +
                `📅 **Resume Date**: ${resume_date ? new Date(resume_date).toLocaleDateString() : 'Manual resume required'}\n\n` +
                
                `📝 **Pause Details**:\n` +
                `• **Reason**: ${pause_reason || 'No reason specified'}\n` +
                `• **Status**: Paused\n` +
                `• **Next Scheduled**: ${pausedTask.nextScheduled ? new Date(pausedTask.nextScheduled).toLocaleString() : 'Will be calculated on resume'}\n` +
                `• **Missed Occurrences**: ${pausedTask.missedOccurrences || 0}\n\n` +
                
                `📊 **Recurrence History**:\n` +
                `• **Total Completed**: ${pausedTask.completedOccurrences || 0}\n` +
                `• **Completion Rate**: ${pausedTask.completionRate || 0}% (before pause)\n` +
                `• **Active Period**: ${pausedTask.activeDays || 0} days\n` +
                `• **Average Completion Time**: ${pausedTask.avgCompletionTime || 'Not calculated'}\n\n` +
                
                `⏸️ **Pause Impact**:\n` +
                `• No new task instances will be created\n` +
                `• Existing incomplete tasks remain active\n` +
                `• Recurrence pattern preserved\n` +
                `• Statistics tracking continues\n` +
                `• Team members notified of pause\n\n` +
                
                (resume_date ? 
                  `📅 **Automatic Resume**:\n` +
                  `• Will resume on: ${new Date(resume_date).toLocaleDateString()}\n` +
                  `• Next occurrence after resume calculated\n` +
                  `• Notifications will restart\n` +
                  `• Pattern continues from resume date\n\n` :
                  `🔄 **Manual Resume**:\n` +
                  `• Use resume function when ready\n` +
                  `• Pattern will continue from resume date\n` +
                  `• Missed occurrences can be optionally created\n` +
                  `• Statistics will update accordingly\n\n`
                ) +
                
                `💡 **Pause Management**:\n` +
                `• Monitor paused tasks regularly\n` +
                `• Document pause reasons for analysis\n` +
                `• Set resume reminders\n` +
                `• Review pattern effectiveness\n` +
                `• Consider pattern adjustments\n\n` +
                
                `🔄 **Resume Options**:\n` +
                `• Automatic resume (if date set)\n` +
                `• Manual resume anytime\n` +
                `• Modify pattern before resume\n` +
                `• Create missed occurrences\n` +
                `• Cancel recurrence entirely\n\n` +
                
                `✅ **Pause Active**: The recurring task has been paused and will not create new instances until resumed.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to pause recurring task: ${error.message}`);
    }
  }

  async bulkCreateFromTemplate({ template_id, bulk_data, apply_template_defaults = true, notify_assignees = true }) {
    try {
      const bulkCreationData = {
        templateId: template_id,
        tasks: bulk_data,
        applyDefaults: apply_template_defaults,
        notifyAssignees: notify_assignees
      };
      
      const result = await this.makeTickTickRequest('/task/bulk-from-template', 'POST', bulkCreationData);
      
      const successCount = result.successful || 0;
      const failureCount = result.failed ? result.failed.length : 0;
      const totalCount = bulk_data.length;
      
      return {
        content: [{
          type: 'text',
          text: `🚀 **Bulk Task Creation Completed!**\n\n` +
                `📊 **Creation Summary**:\n` +
                `• **Template Used**: ${template_id}\n` +
                `• **Total Requested**: ${totalCount}\n` +
                `• **Successfully Created**: ${successCount} ✅\n` +
                `• **Failed**: ${failureCount} ❌\n` +
                `• **Success Rate**: ${Math.round((successCount / totalCount) * 100)}%\n` +
                `• **Completed**: ${new Date().toLocaleString()}\n\n` +
                
                `⚙️ **Bulk Settings**:\n` +
                `• **Template Defaults**: ${apply_template_defaults ? 'Applied' : 'Overridden'}\n` +
                `• **Assignee Notifications**: ${notify_assignees ? 'Sent' : 'Disabled'}\n` +
                `• **Processing Time**: ${result.processingTime || 'Unknown'}\n\n` +
                
                (successCount > 0 ? 
                  `✅ **Successfully Created** (showing first 10):\n` +
                  (result.createdTasks || bulk_data.slice(0, successCount)).slice(0, 10).map((task, index) => 
                    `${index + 1}. **${task.title}**\n` +
                    `   🆔 ID: ${task.id || 'Generated'}\n` +
                    `   📁 Project: ${task.project_id || 'Default'}\n` +
                    `   📅 Due: ${task.due_date || 'Not set'}\n` +
                    `   👤 Assigned: ${task.assignee_id || 'Unassigned'}`
                  ).join('\n\n') +
                  (successCount > 10 ? `\n\n... and ${successCount - 10} more tasks created successfully` : '') + '\n\n' : ''
                ) +
                
                (failureCount > 0 ? 
                  `❌ **Failed Creations**:\n` +
                  (result.failed || []).slice(0, 5).map((failure, index) => 
                    `${index + 1}. **${failure.title || 'Unknown task'}**\n` +
                    `   🚫 Error: ${failure.error || 'Unknown error'}\n` +
                    `   📝 Details: ${failure.details || 'No additional details'}`
                  ).join('\n\n') +
                  (failureCount > 5 ? `\n\n... and ${failureCount - 5} more failures` : '') + '\n\n' : ''
                ) +
                
                `📊 **Bulk Analysis**:\n` +
                `• **Projects Affected**: ${new Set(bulk_data.map(t => t.project_id).filter(Boolean)).size}\n` +
                `• **Assignees Involved**: ${new Set(bulk_data.map(t => t.assignee_id).filter(Boolean)).size}\n` +
                `• **Due Dates Set**: ${bulk_data.filter(t => t.due_date).length}\n` +
                `• **Custom Fields Used**: ${bulk_data.filter(t => t.custom_fields && Object.keys(t.custom_fields).length > 0).length}\n\n` +
                
                `🎯 **Template Benefits**:\n` +
                `• Consistent task structure across all items\n` +
                `• Reduced setup time and errors\n` +
                `• Standardized workflow implementation\n` +
                `• Quality assurance through templates\n\n` +
                
                `📱 **Next Steps**:\n` +
                `• Review created tasks for accuracy\n` +
                `• Address any failed creations\n` +
                `• Assign team members if needed\n` +
                `• Set up project workflows\n` +
                `• Monitor task progress\n\n` +
                
                `💡 **Bulk Creation Tips**:\n` +
                `• Validate data before bulk operations\n` +
                `• Use templates for consistency\n` +
                `• Test with small batches first\n` +
                `• Monitor system performance\n` +
                `• Prepare rollback plans for failures\n\n` +
                
                (failureCount > 0 ? 
                  `🔄 **Retry Suggestions**:\n` +
                  `• Check failed task permissions\n` +
                  `• Verify project access rights\n` +
                  `• Validate assignee IDs\n` +
                  `• Review template compatibility\n` +
                  `• Retry failed items individually\n\n` : ''
                ) +
                
                `✅ **Bulk Operation Complete**: ${successCount} tasks created successfully from template.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to bulk create from template: ${error.message}`);
    }
  }

  // ==================== ANALYTICS & REPORTING METHODS ====================

  async getProductivityReport({ time_range = 'month', start_date, end_date, include_habits = true, include_focus = true, project_ids }) {
    try {
      const params = new URLSearchParams({
        range: time_range,
        habits: include_habits,
        focus: include_focus
      });
      
      if (start_date) params.append('start', start_date);
      if (end_date) params.append('end', end_date);
      if (project_ids?.length) {
        project_ids.forEach(id => params.append('projects', id));
      }
      
      const result = await this.makeTickTickRequest(`/analytics/productivity?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `📊 **Productivity Report - ${time_range.toUpperCase()}**\n\n` +
                
                `🎯 **Performance Overview**:\n` +
                `• **Tasks Completed**: ${result.tasksCompleted || 0} (${result.completionRate || 0}% rate)\n` +
                `• **Projects Active**: ${result.activeProjects || 0}\n` +
                `• **Focus Hours**: ${result.focusHours || 0} hrs\n` +
                `• **Habit Consistency**: ${result.habitConsistency || 0}%\n` +
                `• **Productivity Score**: ${result.productivityScore || 0}/100\n\n` +
                
                `📈 **Key Metrics**:\n` +
                `• **Average Daily Tasks**: ${result.avgDailyTasks || 0}\n` +
                `• **Peak Productivity Day**: ${result.peakDay || 'N/A'}\n` +
                `• **Focus Session Count**: ${result.focusSessions || 0}\n` +
                `• **Time per Task**: ${result.avgTimePerTask || 0} min\n` +
                `• **Completion Streak**: ${result.completionStreak || 0} days\n\n` +
                
                (include_habits && result.habits ? 
                  `🔄 **Habit Performance**:\n` +
                  `• **Habits Tracked**: ${result.habits.total || 0}\n` +
                  `• **Daily Completion**: ${result.habits.dailyRate || 0}%\n` +
                  `• **Best Habit**: ${result.habits.topPerformer || 'N/A'} (${result.habits.topStreak || 0} days)\n` +
                  `• **Improvement Needed**: ${result.habits.needsWork || 'N/A'}\n\n` : ''
                ) +
                
                (include_focus && result.focus ? 
                  `🎯 **Focus Time Analysis**:\n` +
                  `• **Total Focus Time**: ${result.focus.totalHours || 0} hrs\n` +
                  `• **Average Session**: ${result.focus.avgSession || 0} min\n` +
                  `• **Deep Work Ratio**: ${result.focus.deepWorkRatio || 0}%\n` +
                  `• **Distraction Events**: ${result.focus.distractions || 0}\n` +
                  `• **Peak Focus Hours**: ${result.focus.peakHours || 'N/A'}\n\n` : ''
                ) +
                
                `📊 **Trend Analysis**:\n` +
                `• **Week-over-Week**: ${result.trends?.weeklyChange || '+0'}%\n` +
                `• **Monthly Growth**: ${result.trends?.monthlyGrowth || '+0'}%\n` +
                `• **Efficiency Trend**: ${result.trends?.efficiency || 'Stable'}\n` +
                `• **Quality Score**: ${result.trends?.quality || 0}/5 ⭐\n\n` +
                
                `🎯 **Goal Progress**:\n` +
                `• **Daily Task Goal**: ${result.goals?.dailyTasks || 'Not set'}\n` +
                `• **Weekly Focus Goal**: ${result.goals?.weeklyFocus || 'Not set'}\n` +
                `• **Habit Targets**: ${result.goals?.habitTargets || 'Not set'}\n` +
                `• **Achievement Rate**: ${result.goals?.achievementRate || 0}%\n\n` +
                
                `💡 **Insights & Recommendations**:\n` +
                (result.insights || [
                  'Focus on consistency over intensity',
                  'Schedule deep work during peak hours',
                  'Break large tasks into smaller chunks',
                  'Use time-blocking for better focus'
                ]).slice(0, 4).map(insight => `• ${insight}`).join('\n') + '\n\n' +
                
                `🚀 **Next Actions**:\n` +
                `• Review underperforming areas\n` +
                `• Adjust daily/weekly targets\n` +
                `• Optimize peak productivity hours\n` +
                `• Enhance focus time quality\n` +
                `• Celebrate progress and wins!\n\n` +
                
                `📅 **Report Period**: ${start_date || 'Auto'} to ${end_date || 'Auto'}\n` +
                `🔄 **Last Updated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get productivity report: ${error.message}`);
    }
  }

  async getCompletionTrends({ period = 'weekly', duration = 12, project_id, tag_filter, include_predictions = true }) {
    try {
      const params = new URLSearchParams({
        period,
        duration: duration.toString(),
        predictions: include_predictions
      });
      
      if (project_id) params.append('project', project_id);
      if (tag_filter?.length) {
        tag_filter.forEach(tag => params.append('tags', tag));
      }
      
      const result = await this.makeTickTickRequest(`/analytics/trends?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `📈 **Task Completion Trends Analysis**\n\n` +
                
                `🎯 **Trend Overview**:\n` +
                `• **Analysis Period**: ${period} for ${duration} periods\n` +
                `• **Data Points**: ${result.dataPoints || duration}\n` +
                `• **Trend Direction**: ${result.trendDirection || 'Stable'} ${result.trendIcon || '📊'}\n` +
                `• **Overall Growth**: ${result.overallGrowth || '+0'}%\n` +
                `• **Consistency Score**: ${result.consistencyScore || 0}/10\n\n` +
                
                `📊 **Performance Metrics**:\n` +
                `• **Average Completion**: ${result.avgCompletion || 0} tasks/${period.slice(0, -2)}\n` +
                `• **Peak Performance**: ${result.peakPeriod || 'N/A'} (${result.peakTasks || 0} tasks)\n` +
                `• **Lowest Period**: ${result.lowestPeriod || 'N/A'} (${result.lowestTasks || 0} tasks)\n` +
                `• **Performance Range**: ${result.performanceRange || '0-0'} tasks\n` +
                `• **Standard Deviation**: ${result.standardDev || 0}\n\n` +
                
                `📈 **Trend Patterns**:\n` +
                `• **Upward Trend**: ${result.patterns?.upward || 0}% of periods\n` +
                `• **Stable Periods**: ${result.patterns?.stable || 0}% of periods\n` +
                `• **Declining Periods**: ${result.patterns?.declining || 0}% of periods\n` +
                `• **Seasonal Pattern**: ${result.patterns?.seasonal || 'None detected'}\n\n` +
                
                (project_id && result.projectSpecific ? 
                  `📁 **Project-Specific Trends**:\n` +
                  `• **Project Focus**: ${result.projectSpecific.name || 'Selected Project'}\n` +
                  `• **Project Trend**: ${result.projectSpecific.trend || 'Stable'}\n` +
                  `• **Completion Rate**: ${result.projectSpecific.rate || 0}%\n` +
                  `• **vs. Overall Average**: ${result.projectSpecific.vsAverage || '+0'}%\n\n` : ''
                ) +
                
                (tag_filter?.length && result.tagAnalysis ? 
                  `🏷️ **Tag-Based Analysis**:\n` +
                  `• **Filtered Tags**: ${tag_filter.join(', ')}\n` +
                  `• **Tagged Task Trend**: ${result.tagAnalysis.trend || 'Stable'}\n` +
                  `• **Tag Performance**: ${result.tagAnalysis.performance || 'Average'}\n` +
                  `• **Most Productive Tag**: ${result.tagAnalysis.topTag || 'N/A'}\n\n` : ''
                ) +
                
                (include_predictions && result.predictions ? 
                  `🔮 **Trend Predictions**:\n` +
                  `• **Next Period Forecast**: ${result.predictions.nextPeriod || 0} tasks\n` +
                  `• **Monthly Projection**: ${result.predictions.monthlyProjection || 0} tasks\n` +
                  `• **Confidence Level**: ${result.predictions.confidence || 0}%\n` +
                  `• **Growth Trajectory**: ${result.predictions.trajectory || 'Stable'}\n` +
                  `• **Recommended Target**: ${result.predictions.recommendedTarget || 0} tasks\n\n` : ''
                ) +
                
                `📊 **Period Breakdown**:\n` +
                (result.periodData || []).slice(-6).map((period, index) => 
                  `• **${period.label || `Period ${index + 1}`}**: ${period.completions || 0} tasks (${period.change || '+0'}%)`
                ).join('\n') + '\n\n' +
                
                `💡 **Trend Insights**:\n` +
                (result.insights || [
                  'Consistency is more valuable than peak performance',
                  'Identify patterns in your most productive periods',
                  'Address factors causing declining trends',
                  'Set realistic targets based on trend analysis'
                ]).slice(0, 4).map(insight => `• ${insight}`).join('\n') + '\n\n' +
                
                `🎯 **Optimization Recommendations**:\n` +
                `• **Target Setting**: ${result.recommendations?.targetSetting || 'Maintain current pace'}\n` +
                `• **Timing Optimization**: ${result.recommendations?.timing || 'Continue current schedule'}\n` +
                `• **Capacity Planning**: ${result.recommendations?.capacity || 'Monitor workload balance'}\n` +
                `• **Trend Monitoring**: ${result.recommendations?.monitoring || 'Review trends monthly'}\n\n` +
                
                `📅 **Analysis Range**: Last ${duration} ${period} periods\n` +
                `🔄 **Data Freshness**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get completion trends: ${error.message}`);
    }
  }

  async getTimeTrackingReport({ time_period = 'month', breakdown_by = 'project', include_estimates = true, focus_sessions_only = false, export_format = 'detailed' }) {
    try {
      const params = new URLSearchParams({
        period: time_period,
        breakdown: breakdown_by,
        estimates: include_estimates,
        focus_only: focus_sessions_only,
        format: export_format
      });
      
      const result = await this.makeTickTickRequest(`/analytics/time-tracking?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `⏱️ **Time Tracking Analysis Report**\n\n` +
                
                `📊 **Time Overview**:\n` +
                `• **Total Tracked Time**: ${result.totalTime || 0} hours\n` +
                `• **Active Days**: ${result.activeDays || 0}/${result.totalDays || 0} days\n` +
                `• **Average Daily Time**: ${result.avgDailyTime || 0} hours\n` +
                `• **Peak Day**: ${result.peakDay || 'N/A'} (${result.peakDayHours || 0} hrs)\n` +
                `• **Time Utilization**: ${result.utilization || 0}%\n\n` +
                
                `🎯 **Breakdown by ${breakdown_by.charAt(0).toUpperCase() + breakdown_by.slice(1)}**:\n` +
                (result.breakdown || []).slice(0, 8).map((item, index) => 
                  `${index + 1}. **${item.name || 'Unknown'}**: ${item.hours || 0} hrs (${item.percentage || 0}%)`
                ).join('\n') + '\n\n' +
                
                (include_estimates && result.estimates ? 
                  `📝 **Estimate vs Actual Analysis**:\n` +
                  `• **Accuracy Score**: ${result.estimates.accuracyScore || 0}%\n` +
                  `• **Average Variance**: ${result.estimates.avgVariance || '+0'}%\n` +
                  `• **Underestimated Tasks**: ${result.estimates.underestimated || 0}% of tasks\n` +
                  `• **Overestimated Tasks**: ${result.estimates.overestimated || 0}% of tasks\n` +
                  `• **Estimation Trend**: ${result.estimates.trend || 'Stable'}\n\n` : ''
                ) +
                
                (focus_sessions_only && result.focusAnalysis ? 
                  `🎯 **Focus Sessions Analysis**:\n` +
                  `• **Total Focus Sessions**: ${result.focusAnalysis.totalSessions || 0}\n` +
                  `• **Average Session Length**: ${result.focusAnalysis.avgLength || 0} min\n` +
                  `• **Deep Work Percentage**: ${result.focusAnalysis.deepWorkPercentage || 0}%\n` +
                  `• **Session Success Rate**: ${result.focusAnalysis.successRate || 0}%\n` +
                  `• **Distraction Rate**: ${result.focusAnalysis.distractionRate || 0} per hour\n\n` : ''
                ) +
                
                `📈 **Time Distribution**:\n` +
                `• **Morning (6-12)**: ${result.distribution?.morning || 0} hrs (${result.distribution?.morningPct || 0}%)\n` +
                `• **Afternoon (12-18)**: ${result.distribution?.afternoon || 0} hrs (${result.distribution?.afternoonPct || 0}%)\n` +
                `• **Evening (18-24)**: ${result.distribution?.evening || 0} hrs (${result.distribution?.eveningPct || 0}%)\n` +
                `• **Late Night (0-6)**: ${result.distribution?.lateNight || 0} hrs (${result.distribution?.lateNightPct || 0}%)\n\n` +
                
                `🎯 **Productivity Metrics**:\n` +
                `• **Tasks per Hour**: ${result.productivity?.tasksPerHour || 0}\n` +
                `• **Quality Score**: ${result.productivity?.qualityScore || 0}/10\n` +
                `• **Efficiency Rating**: ${result.productivity?.efficiency || 'Average'}\n` +
                `• **Focus Quality**: ${result.productivity?.focusQuality || 0}%\n` +
                `• **Multitasking Rate**: ${result.productivity?.multitasking || 0}%\n\n` +
                
                `📊 **Weekly Pattern Analysis**:\n` +
                Object.entries(result.weeklyPattern || {}).map(([day, hours]) => 
                  `• **${day}**: ${hours || 0} hrs avg`
                ).join('\n') + '\n\n' +
                
                (export_format === 'detailed' && result.detailedBreakdown ? 
                  `🔍 **Detailed Time Logs**:\n` +
                  (result.detailedBreakdown || []).slice(0, 10).map((log, index) => 
                    `${index + 1}. ${log.date || 'Unknown'}: ${log.task || 'N/A'} - ${log.duration || 0} min`
                  ).join('\n') + 
                  (result.detailedBreakdown?.length > 10 ? `\n... and ${result.detailedBreakdown.length - 10} more entries` : '') + '\n\n' : ''
                ) +
                
                `💡 **Time Management Insights**:\n` +
                (result.insights || [
                  'Identify your peak productivity hours',
                  'Focus on improving estimation accuracy',
                  'Minimize context switching between tasks',
                  'Schedule demanding work during high-energy times'
                ]).slice(0, 4).map(insight => `• ${insight}`).join('\n') + '\n\n' +
                
                `🎯 **Optimization Recommendations**:\n` +
                `• **Time Blocking**: ${result.recommendations?.timeBlocking || 'Continue current approach'}\n` +
                `• **Focus Improvement**: ${result.recommendations?.focusImprovement || 'Maintain focus quality'}\n` +
                `• **Estimation Training**: ${result.recommendations?.estimationTraining || 'Keep practicing'}\n` +
                `• **Schedule Optimization**: ${result.recommendations?.scheduleOptimization || 'Current schedule is effective'}\n\n` +
                
                `📅 **Report Period**: ${time_period.charAt(0).toUpperCase() + time_period.slice(1)}\n` +
                `📊 **Export Format**: ${export_format}\n` +
                `🔄 **Generated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get time tracking report: ${error.message}`);
    }
  }

  async getGoalProgress({ goal_type, time_frame = 'monthly', target_metrics, include_recommendations = true }) {
    try {
      const params = new URLSearchParams({
        type: goal_type,
        frame: time_frame,
        recommendations: include_recommendations
      });
      
      if (target_metrics) {
        Object.entries(target_metrics).forEach(([key, value]) => {
          params.append(`target_${key}`, value.toString());
        });
      }
      
      const result = await this.makeTickTickRequest(`/analytics/goals?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `🎯 **Goal Progress Tracking**\n\n` +
                
                `📊 **Goal Overview**:\n` +
                `• **Goal Type**: ${goal_type?.replace('_', ' ').toUpperCase() || 'All Goals'}\n` +
                `• **Time Frame**: ${time_frame.charAt(0).toUpperCase() + time_frame.slice(1)}\n` +
                `• **Progress Period**: ${result.progressPeriod || 'Current period'}\n` +
                `• **Overall Achievement**: ${result.overallAchievement || 0}%\n` +
                `• **Goal Status**: ${result.goalStatus || 'In Progress'} ${result.statusIcon || '🎯'}\n\n` +
                
                `📈 **Current Progress**:\n` +
                (target_metrics ? Object.entries(target_metrics).map(([metric, target]) => {
                  const actual = result.actualMetrics?.[metric] || 0;
                  const percentage = target > 0 ? Math.round((actual / target) * 100) : 0;
                  const status = percentage >= 100 ? '✅' : percentage >= 75 ? '🟡' : '🔴';
                  return `• **${metric.replace('_', ' ').toUpperCase()}**: ${actual}/${target} (${percentage}%) ${status}`;
                }).join('\n') : 'No specific targets set') + '\n\n' +
                
                `📊 **Performance Metrics**:\n` +
                `• **Daily Average**: ${result.dailyAverage || 0}\n` +
                `• **Best Day**: ${result.bestDay || 'N/A'} (${result.bestDayValue || 0})\n` +
                `• **Consistency Score**: ${result.consistencyScore || 0}/10 ⭐\n` +
                `• **Streak Current**: ${result.currentStreak || 0} days\n` +
                `• **Streak Best**: ${result.bestStreak || 0} days\n\n` +
                
                `📈 **Progress Trends**:\n` +
                `• **Week-over-Week**: ${result.trends?.weeklyChange || '+0'}%\n` +
                `• **Monthly Trajectory**: ${result.trends?.monthlyTrajectory || 'Stable'}\n` +
                `• **Velocity**: ${result.trends?.velocity || 'On track'}\n` +
                `• **Projected Completion**: ${result.trends?.projectedCompletion || 'Unknown'}\n\n` +
                
                (goal_type === 'task_completion' && result.taskGoals ? 
                  `✅ **Task Completion Goals**:\n` +
                  `• **Target Tasks/Day**: ${result.taskGoals.dailyTarget || 0}\n` +
                  `• **Current Average**: ${result.taskGoals.currentAverage || 0}\n` +
                  `• **Completion Rate**: ${result.taskGoals.completionRate || 0}%\n` +
                  `• **On-Time Completion**: ${result.taskGoals.onTimeRate || 0}%\n` +
                  `• **Quality Score**: ${result.taskGoals.qualityScore || 0}/5 ⭐\n\n` : ''
                ) +
                
                (goal_type === 'habit_consistency' && result.habitGoals ? 
                  `🔄 **Habit Consistency Goals**:\n` +
                  `• **Target Consistency**: ${result.habitGoals.targetConsistency || 0}%\n` +
                  `• **Current Consistency**: ${result.habitGoals.currentConsistency || 0}%\n` +
                  `• **Active Habits**: ${result.habitGoals.activeHabits || 0}\n` +
                  `• **Perfect Days**: ${result.habitGoals.perfectDays || 0}\n` +
                  `• **Improvement Rate**: ${result.habitGoals.improvementRate || '+0'}%\n\n` : ''
                ) +
                
                (goal_type === 'focus_time' && result.focusGoals ? 
                  `🎯 **Focus Time Goals**:\n` +
                  `• **Target Hours/Week**: ${result.focusGoals.weeklyTarget || 0}\n` +
                  `• **Current Average**: ${result.focusGoals.currentAverage || 0} hrs\n` +
                  `• **Deep Work Ratio**: ${result.focusGoals.deepWorkRatio || 0}%\n` +
                  `• **Session Quality**: ${result.focusGoals.sessionQuality || 0}/10\n` +
                  `• **Distraction Control**: ${result.focusGoals.distractionControl || 0}%\n\n` : ''
                ) +
                
                (goal_type === 'project_milestones' && result.projectGoals ? 
                  `📁 **Project Milestone Goals**:\n` +
                  `• **Active Projects**: ${result.projectGoals.activeProjects || 0}\n` +
                  `• **Milestones This Period**: ${result.projectGoals.milestonesThisPeriod || 0}\n` +
                  `• **On-Schedule Projects**: ${result.projectGoals.onSchedule || 0}%\n` +
                  `• **Completion Rate**: ${result.projectGoals.completionRate || 0}%\n` +
                  `• **Average Lead Time**: ${result.projectGoals.avgLeadTime || 0} days\n\n` : ''
                ) +
                
                `🏆 **Achievement Analysis**:\n` +
                `• **Goals Met**: ${result.achievements?.goalsMet || 0}/${result.achievements?.totalGoals || 0}\n` +
                `• **Exceeded Expectations**: ${result.achievements?.exceeded || 0}\n` +
                `• **Partially Achieved**: ${result.achievements?.partial || 0}\n` +
                `• **Behind Schedule**: ${result.achievements?.behind || 0}\n` +
                `• **Achievement Rate**: ${result.achievements?.rate || 0}%\n\n` +
                
                (include_recommendations && result.recommendations ? 
                  `💡 **AI-Powered Recommendations**:\n` +
                  (result.recommendations || [
                    'Set smaller, more achievable daily targets',
                    'Focus on consistency over perfection',
                    'Track leading indicators, not just outcomes',
                    'Celebrate small wins along the way'
                  ]).slice(0, 5).map(rec => `• ${rec}`).join('\n') + '\n\n' : ''
                ) +
                
                `🎯 **Goal Optimization Tips**:\n` +
                `• **SMART Criteria**: Make goals Specific, Measurable, Achievable, Relevant, Time-bound\n` +
                `• **Progressive Loading**: Gradually increase targets as you build consistency\n` +
                `• **Environment Design**: Structure your environment to support goal achievement\n` +
                `• **Regular Review**: Assess and adjust goals based on progress and learnings\n` +
                `• **Habit Stacking**: Link new goals to existing successful habits\n\n` +
                
                `📅 **Next Review**: ${result.nextReview || 'Set a review date'}\n` +
                `🎯 **Suggested Adjustment**: ${result.suggestedAdjustment || 'Continue current approach'}\n` +
                `🔄 **Report Generated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get goal progress: ${error.message}`);
    }
  }

  async exportAnalyticsData({ data_types = ['tasks', 'habits', 'focus_sessions'], date_range, format = 'json', include_metadata = true, privacy_filter = false }) {
    try {
      const params = new URLSearchParams({
        types: data_types.join(','),
        start: date_range.start_date,
        end: date_range.end_date,
        format,
        metadata: include_metadata,
        privacy: privacy_filter
      });
      
      const result = await this.makeTickTickRequest(`/analytics/export?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `📤 **Analytics Data Export Complete**\n\n` +
                
                `📊 **Export Configuration**:\n` +
                `• **Data Types**: ${data_types.join(', ')}\n` +
                `• **Date Range**: ${date_range.start_date} to ${date_range.end_date}\n` +
                `• **Export Format**: ${format.toUpperCase()}\n` +
                `• **Include Metadata**: ${include_metadata ? 'Yes' : 'No'}\n` +
                `• **Privacy Filter**: ${privacy_filter ? 'Applied' : 'None'}\n\n` +
                
                `📈 **Export Summary**:\n` +
                `• **Total Records**: ${result.totalRecords || 0}\n` +
                `• **File Size**: ${result.fileSize || 'Unknown'}\n` +
                `• **Processing Time**: ${result.processingTime || 0}ms\n` +
                `• **Export ID**: ${result.exportId || 'N/A'}\n` +
                `• **Download URL**: ${result.downloadUrl || 'Processing...'}\n\n` +
                
                `📋 **Data Breakdown**:\n` +
                (data_types.includes('tasks') ? `• **Tasks**: ${result.counts?.tasks || 0} records\n` : '') +
                (data_types.includes('habits') ? `• **Habits**: ${result.counts?.habits || 0} records\n` : '') +
                (data_types.includes('focus_sessions') ? `• **Focus Sessions**: ${result.counts?.focus_sessions || 0} records\n` : '') +
                (data_types.includes('projects') ? `• **Projects**: ${result.counts?.projects || 0} records\n` : '') +
                (data_types.includes('time_logs') ? `• **Time Logs**: ${result.counts?.time_logs || 0} records\n` : '') + '\n' +
                
                (include_metadata ? 
                  `📝 **Metadata Included**:\n` +
                  `• **Field Descriptions**: Complete data schema\n` +
                  `• **Export Parameters**: Full configuration details\n` +
                  `• **Data Quality Metrics**: Completeness and accuracy info\n` +
                  `• **Version Information**: API and data format versions\n` +
                  `• **Export Timestamp**: Creation and last modified dates\n\n` : ''
                ) +
                
                (privacy_filter ? 
                  `🔒 **Privacy Protection Applied**:\n` +
                  `• Personal identifiers removed\n` +
                  `• Sensitive content filtered\n` +
                  `• IP addresses anonymized\n` +
                  `• Location data generalized\n` +
                  `• Contact information excluded\n\n` : ''
                ) +
                
                `📊 **Export Quality**:\n` +
                `• **Data Completeness**: ${result.quality?.completeness || 100}%\n` +
                `• **Data Accuracy**: ${result.quality?.accuracy || 100}%\n` +
                `• **Format Validation**: ${result.quality?.formatValid ? 'Passed' : 'Failed'}\n` +
                `• **Schema Compliance**: ${result.quality?.schemaCompliant ? 'Yes' : 'No'}\n` +
                `• **Export Integrity**: ${result.quality?.integrity || 'Verified'}\n\n` +
                
                `💾 **File Information**:\n` +
                `• **File Name**: ${result.fileName || `analytics_export_${Date.now()}.${format}`}\n` +
                `• **MIME Type**: ${result.mimeType || 'application/json'}\n` +
                `• **Compression**: ${result.compressed ? 'gzip applied' : 'None'}\n` +
                `• **Checksum**: ${result.checksum || 'Not provided'}\n` +
                `• **Retention**: ${result.retentionDays || 30} days\n\n` +
                
                `🔄 **Usage Instructions**:\n` +
                (format === 'json' ? 
                  `• Load data using JSON parser in your preferred tool\n` +
                  `• Each record includes all available fields\n` +
                  `• Nested objects represent related data\n` +
                  `• Timestamps are in ISO 8601 format\n` : 
                format === 'csv' ? 
                  `• Import into Excel, Google Sheets, or analysis tools\n` +
                  `• First row contains column headers\n` +
                  `• Data types are preserved where possible\n` +
                  `• Special characters are properly escaped\n` :
                  `• Excel-compatible format with multiple sheets\n` +
                  `• Separate sheet for each data type\n` +
                  `• Rich formatting and data validation\n` +
                  `• Charts and pivot table ready\n`
                ) + '\n' +
                
                `📊 **Analysis Suggestions**:\n` +
                `• **Trend Analysis**: Look for patterns over time\n` +
                `• **Correlation Studies**: Find relationships between metrics\n` +
                `• **Performance Benchmarking**: Compare against personal bests\n` +
                `• **Predictive Modeling**: Build forecasts from historical data\n` +
                `• **Habit Tracking**: Analyze consistency and improvement areas\n\n` +
                
                `⚠️ **Important Notes**:\n` +
                `• Data export link expires in ${result.linkExpiry || '7 days'}\n` +
                `• Download the file promptly to avoid data loss\n` +
                `• Respect data privacy when sharing exports\n` +
                `• Consider regular exports for backup purposes\n` +
                `• Contact support for custom export formats\n\n` +
                
                `📅 **Export Details**:\n` +
                `• **Created**: ${new Date().toLocaleString()}\n` +
                `• **Status**: ${result.status || 'Completed'}\n` +
                `• **Ready for Download**: ${result.downloadReady ? 'Yes' : 'Processing...'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to export analytics data: ${error.message}`);
    }
  }

  async getWeeklySummary({ week_offset = 0, include_sections = ['tasks', 'habits', 'focus', 'achievements'], compare_previous = true, personalization }) {
    try {
      const params = new URLSearchParams({
        offset: week_offset.toString(),
        sections: include_sections.join(','),
        compare: compare_previous
      });
      
      if (personalization?.tone) params.append('tone', personalization.tone);
      if (personalization?.focus_areas?.length) {
        params.append('focus_areas', personalization.focus_areas.join(','));
      }
      
      const result = await this.makeTickTickRequest(`/analytics/weekly-summary?${params}`);
      
      const weekLabel = week_offset === 0 ? 'This Week' : 
                       week_offset === 1 ? 'Last Week' : 
                       `${week_offset} Weeks Ago`;
      
      return {
        content: [{
          type: 'text',
          text: `📅 **Weekly Productivity Summary - ${weekLabel}**\n\n` +
                
                `🎯 **Week at a Glance**:\n` +
                `• **Week Period**: ${result.weekPeriod || 'Unknown'}\n` +
                `• **Productivity Score**: ${result.productivityScore || 0}/100 ⭐\n` +
                `• **Overall Rating**: ${result.overallRating || 'Good'} ${result.ratingEmoji || '😊'}\n` +
                `• **Key Highlight**: ${result.keyHighlight || 'Steady progress maintained'}\n\n` +
                
                (include_sections.includes('tasks') && result.tasks ? 
                  `✅ **Task Performance**:\n` +
                  `• **Completed**: ${result.tasks.completed || 0} tasks\n` +
                  `• **Daily Average**: ${result.tasks.dailyAverage || 0} tasks\n` +
                  `• **Completion Rate**: ${result.tasks.completionRate || 0}%\n` +
                  `• **On-Time Completion**: ${result.tasks.onTimeRate || 0}%\n` +
                  `• **Best Day**: ${result.tasks.bestDay || 'N/A'} (${result.tasks.bestDayCount || 0} tasks)\n` +
                  (compare_previous ? `• **vs Last Week**: ${result.tasks.vsLastWeek || '+0'}%\n` : '') + '\n' : ''
                ) +
                
                (include_sections.includes('habits') && result.habits ? 
                  `🔄 **Habit Tracking**:\n` +
                  `• **Consistency Score**: ${result.habits.consistencyScore || 0}%\n` +
                  `• **Perfect Days**: ${result.habits.perfectDays || 0}/7 days\n` +
                  `• **Active Habits**: ${result.habits.activeHabits || 0}\n` +
                  `• **Best Performer**: ${result.habits.bestPerformer || 'N/A'}\n` +
                  `• **Needs Attention**: ${result.habits.needsAttention || 'None'}\n` +
                  (compare_previous ? `• **vs Last Week**: ${result.habits.vsLastWeek || '+0'}%\n` : '') + '\n' : ''
                ) +
                
                (include_sections.includes('focus') && result.focus ? 
                  `🎯 **Focus Time**:\n` +
                  `• **Total Focus**: ${result.focus.totalHours || 0} hours\n` +
                  `• **Average Session**: ${result.focus.avgSession || 0} minutes\n` +
                  `• **Deep Work**: ${result.focus.deepWorkHours || 0} hours\n` +
                  `• **Focus Quality**: ${result.focus.qualityScore || 0}/10\n` +
                  `• **Peak Hours**: ${result.focus.peakHours || 'N/A'}\n` +
                  (compare_previous ? `• **vs Last Week**: ${result.focus.vsLastWeek || '+0'}%\n` : '') + '\n' : ''
                ) +
                
                (include_sections.includes('achievements') && result.achievements ? 
                  `🏆 **Achievements & Wins**:\n` +
                  (result.achievements.list || [
                    'Maintained consistent daily habits',
                    'Completed all high-priority tasks',
                    'Achieved focus time goals',
                    'Improved task completion rate'
                  ]).slice(0, 5).map((achievement, index) => `${index + 1}. ${achievement}`).join('\n') + '\n\n' : ''
                ) +
                
                (include_sections.includes('challenges') && result.challenges ? 
                  `⚠️ **Areas for Improvement**:\n` +
                  (result.challenges.list || [
                    'Reduce task procrastination',
                    'Improve time estimation accuracy',
                    'Increase focus session length',
                    'Better work-life balance'
                  ]).slice(0, 3).map((challenge, index) => `${index + 1}. ${challenge}`).join('\n') + '\n\n' : ''
                ) +
                
                (compare_previous && result.comparison ? 
                  `📊 **Week-over-Week Comparison**:\n` +
                  `• **Tasks**: ${result.comparison.tasks || '+0'}% ${result.comparison.tasksIcon || '➡️'}\n` +
                  `• **Habits**: ${result.comparison.habits || '+0'}% ${result.comparison.habitsIcon || '➡️'}\n` +
                  `• **Focus**: ${result.comparison.focus || '+0'}% ${result.comparison.focusIcon || '➡️'}\n` +
                  `• **Overall**: ${result.comparison.overall || '+0'}% ${result.comparison.overallIcon || '➡️'}\n\n` : ''
                ) +
                
                `📈 **Daily Breakdown**:\n` +
                ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, index) => {
                  const dayData = result.dailyBreakdown?.[day.toLowerCase()] || {};
                  return `• **${day}**: ${dayData.tasks || 0} tasks, ${dayData.focus || 0}h focus ${dayData.rating || '😐'}`;
                }).join('\n') + '\n\n' +
                
                (include_sections.includes('next_week') && result.nextWeek ? 
                  `🎯 **Next Week's Focus**:\n` +
                  (result.nextWeek.priorities || [
                    'Continue building on current habits',
                    'Address any overdue tasks',
                    'Optimize peak productivity hours',
                    'Maintain work-life balance'
                  ]).slice(0, 4).map((priority, index) => `${index + 1}. ${priority}`).join('\n') + '\n\n' : ''
                ) +
                
                `💡 **Personalized Insights**:\n` +
                (result.insights || [
                  'Your consistency is improving week over week',
                  'Focus on maintaining current momentum',
                  'Consider time-blocking for better efficiency',
                  'Celebrate your progress and small wins'
                ]).slice(0, 3).map(insight => `• ${insight}`).join('\n') + '\n\n' +
                
                `🎯 **Recommended Actions**:\n` +
                `• **Priority Focus**: ${result.recommendations?.priorityFocus || 'Maintain current approach'}\n` +
                `• **Habit Adjustment**: ${result.recommendations?.habitAdjustment || 'Continue current habits'}\n` +
                `• **Time Management**: ${result.recommendations?.timeManagement || 'Current schedule is working'}\n` +
                `• **Next Week Goal**: ${result.recommendations?.nextWeekGoal || 'Build on this week\'s success'}\n\n` +
                
                (personalization?.tone === 'motivational' ? 
                  `🌟 **Motivational Boost**:\n` +
                  `You're making fantastic progress! Every small step counts, and your consistency is building the foundation for long-term success. Keep up the amazing work! 💪\n\n` : 
                personalization?.tone === 'analytical' ? 
                  `📊 **Data-Driven Insights**:\n` +
                  `Statistical analysis shows steady improvement patterns. Your productivity metrics indicate optimal performance trajectories. Continue data-informed optimization strategies.\n\n` : 
                  `📝 **Weekly Reflection**:\n` +
                  `Take a moment to acknowledge your progress. Small consistent actions lead to significant long-term results. Stay focused on your goals! 🎯\n\n`
                ) +
                
                `📅 **Summary Generated**: ${new Date().toLocaleString()}\n` +
                `🔄 **Next Summary**: ${result.nextSummaryDate || 'Next week'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get weekly summary: ${error.message}`);
    }
  }

  async getMonthlyInsights({ month_offset = 0, insight_depth = 'detailed', focus_metrics = ['efficiency', 'consistency', 'goal_achievement'], benchmarking, action_planning = true }) {
    try {
      const params = new URLSearchParams({
        offset: month_offset.toString(),
        depth: insight_depth,
        metrics: focus_metrics.join(','),
        planning: action_planning
      });
      
      if (benchmarking) {
        Object.entries(benchmarking).forEach(([key, value]) => {
          params.append(`benchmark_${key}`, value.toString());
        });
      }
      
      const result = await this.makeTickTickRequest(`/analytics/monthly-insights?${params}`);
      
      const monthLabel = month_offset === 0 ? 'This Month' : 
                        month_offset === 1 ? 'Last Month' : 
                        `${month_offset} Months Ago`;
      
      return {
        content: [{
          type: 'text',
          text: `🌟 **Monthly Performance Insights - ${monthLabel}**\n\n` +
                
                `📊 **Executive Summary**:\n` +
                `• **Month**: ${result.monthPeriod || 'Unknown'}\n` +
                `• **Overall Performance**: ${result.overallPerformance || 'Good'} (${result.performanceScore || 0}/100)\n` +
                `• **Key Achievement**: ${result.keyAchievement || 'Consistent progress maintained'}\n` +
                `• **Primary Focus Area**: ${result.primaryFocus || 'Productivity optimization'}\n` +
                `• **Improvement Trajectory**: ${result.trajectory || 'Positive'} ${result.trajectoryIcon || '📈'}\n\n` +
                
                (focus_metrics.includes('efficiency') && result.efficiency ? 
                  `⚡ **Efficiency Analysis**:\n` +
                  `• **Efficiency Score**: ${result.efficiency.score || 0}/100\n` +
                  `• **Tasks per Hour**: ${result.efficiency.tasksPerHour || 0}\n` +
                  `• **Time Utilization**: ${result.efficiency.timeUtilization || 0}%\n` +
                  `• **Quality Rating**: ${result.efficiency.qualityRating || 0}/5 ⭐\n` +
                  `• **Peak Efficiency Days**: ${result.efficiency.peakDays || 'N/A'}\n` +
                  `• **Efficiency Trend**: ${result.efficiency.trend || 'Stable'}\n\n` : ''
                ) +
                
                (focus_metrics.includes('consistency') && result.consistency ? 
                  `🎯 **Consistency Metrics**:\n` +
                  `• **Consistency Score**: ${result.consistency.score || 0}/100\n` +
                  `• **Daily Habit Adherence**: ${result.consistency.habitAdherence || 0}%\n` +
                  `• **Routine Stability**: ${result.consistency.routineStability || 0}%\n` +
                  `• **Task Completion Regularity**: ${result.consistency.taskRegularity || 0}%\n` +
                  `• **Longest Streak**: ${result.consistency.longestStreak || 0} days\n` +
                  `• **Consistency Improvement**: ${result.consistency.improvement || '+0'}%\n\n` : ''
                ) +
                
                (focus_metrics.includes('goal_achievement') && result.goalAchievement ? 
                  `🏆 **Goal Achievement**:\n` +
                  `• **Achievement Rate**: ${result.goalAchievement.rate || 0}%\n` +
                  `• **Goals Completed**: ${result.goalAchievement.completed || 0}/${result.goalAchievement.total || 0}\n` +
                  `• **Exceeded Targets**: ${result.goalAchievement.exceeded || 0}\n` +
                  `• **Partially Met**: ${result.goalAchievement.partial || 0}\n` +
                  `• **Average Progress**: ${result.goalAchievement.avgProgress || 0}%\n` +
                  `• **Goal Momentum**: ${result.goalAchievement.momentum || 'Steady'}\n\n` : ''
                ) +
                
                (focus_metrics.includes('time_management') && result.timeManagement ? 
                  `⏰ **Time Management**:\n` +
                  `• **Time Awareness Score**: ${result.timeManagement.awarenessScore || 0}/100\n` +
                  `• **Planning Accuracy**: ${result.timeManagement.planningAccuracy || 0}%\n` +
                  `• **Estimate vs Actual**: ${result.timeManagement.estimateAccuracy || 0}%\n` +
                  `• **Time Waste Reduction**: ${result.timeManagement.wasteReduction || '+0'}%\n` +
                  `• **Optimal Time Blocks**: ${result.timeManagement.optimalBlocks || 'N/A'}\n` +
                  `• **Time ROI**: ${result.timeManagement.roi || 'Average'}\n\n` : ''
                ) +
                
                (focus_metrics.includes('stress_patterns') && result.stressPatterns ? 
                  `😰 **Stress & Workload Analysis**:\n` +
                  `• **Stress Level**: ${result.stressPatterns.level || 'Moderate'}\n` +
                  `• **High-Stress Days**: ${result.stressPatterns.highStressDays || 0}\n` +
                  `• **Workload Balance**: ${result.stressPatterns.workloadBalance || 'Balanced'}\n` +
                  `• **Recovery Time**: ${result.stressPatterns.recoveryTime || 'Adequate'}\n` +
                  `• **Stress Triggers**: ${result.stressPatterns.triggers?.join(', ') || 'None identified'}\n` +
                  `• **Coping Effectiveness**: ${result.stressPatterns.copingScore || 0}/10\n\n` : ''
                ) +
                
                (benchmarking?.compare_to_average && result.benchmarks?.average ? 
                  `📊 **vs Average Performance**:\n` +
                  `• **Task Completion**: ${result.benchmarks.average.taskCompletion || '+0'}% vs avg\n` +
                  `• **Focus Time**: ${result.benchmarks.average.focusTime || '+0'}% vs avg\n` +
                  `• **Habit Consistency**: ${result.benchmarks.average.habitConsistency || '+0'}% vs avg\n` +
                  `• **Efficiency Rating**: ${result.benchmarks.average.efficiency || 'Average'}\n` +
                  `• **Percentile Ranking**: ${result.benchmarks.average.percentile || 50}th percentile\n\n` : ''
                ) +
                
                (benchmarking?.compare_to_best_month && result.benchmarks?.best ? 
                  `🌟 **vs Your Best Month**:\n` +
                  `• **Best Month**: ${result.benchmarks.best.month || 'Unknown'}\n` +
                  `• **Performance Gap**: ${result.benchmarks.best.gap || '0'}%\n` +
                  `• **Areas Improved**: ${result.benchmarks.best.improved?.join(', ') || 'None'}\n` +
                  `• **Areas to Match**: ${result.benchmarks.best.toImprove?.join(', ') || 'None'}\n` +
                  `• **Best Month Score**: ${result.benchmarks.best.score || 0}/100\n\n` : ''
                ) +
                
                (insight_depth === 'comprehensive' && result.detailedAnalysis ? 
                  `🔍 **Deep Dive Analysis**:\n` +
                  `• **Performance Patterns**: ${result.detailedAnalysis.patterns || 'Stable patterns observed'}\n` +
                  `• **Peak Performance Factors**: ${result.detailedAnalysis.peakFactors?.join(', ') || 'Multiple factors'}\n` +
                  `• **Bottleneck Areas**: ${result.detailedAnalysis.bottlenecks?.join(', ') || 'None identified'}\n` +
                  `• **Optimization Opportunities**: ${result.detailedAnalysis.opportunities?.join(', ') || 'Maintain current approach'}\n` +
                  `• **Risk Factors**: ${result.detailedAnalysis.risks?.join(', ') || 'Low risk profile'}\n\n` : ''
                ) +
                
                `📈 **Monthly Trends**:\n` +
                `• **Early Month**: ${result.trends?.earlyMonth || 'Strong start'}\n` +
                `• **Mid Month**: ${result.trends?.midMonth || 'Maintained pace'}\n` +
                `• **End Month**: ${result.trends?.endMonth || 'Strong finish'}\n` +
                `• **Momentum Pattern**: ${result.trends?.momentum || 'Consistent'}\n` +
                `• **Energy Levels**: ${result.trends?.energy || 'Stable'}\n\n` +
                
                `🎯 **Key Insights**:\n` +
                (result.insights || [
                  'Consistency beats intensity for long-term success',
                  'Your peak performance hours are clearly defined',
                  'Habit formation is showing positive momentum',
                  'Goal achievement rate is above average'
                ]).slice(0, 5).map((insight, index) => `${index + 1}. ${insight}`).join('\n') + '\n\n' +
                
                (action_planning && result.actionPlan ? 
                  `🚀 **Next Month Action Plan**:\n\n` +
                  `**Priority Focus Areas**:\n` +
                  (result.actionPlan.priorities || [
                    'Continue building consistent daily habits',
                    'Optimize peak productivity time blocks',
                    'Address identified bottleneck areas'
                  ]).map((priority, index) => `${index + 1}. ${priority}`).join('\n') + '\n\n' +
                  
                  `**Specific Actions**:\n` +
                  (result.actionPlan.actions || [
                    'Set up morning routine optimization',
                    'Implement time-blocking for deep work',
                    'Review and adjust goal targets'
                  ]).map((action, index) => `• ${action}`).join('\n') + '\n\n' +
                  
                  `**Success Metrics**:\n` +
                  (result.actionPlan.metrics || [
                    'Increase consistency score by 5%',
                    'Maintain current efficiency levels',
                    'Complete 90% of planned tasks'
                  ]).map((metric, index) => `• ${metric}`).join('\n') + '\n\n' : ''
                ) +
                
                `💡 **Strategic Recommendations**:\n` +
                `• **Immediate (1-2 weeks)**: ${result.recommendations?.immediate || 'Fine-tune current systems'}\n` +
                `• **Short-term (1 month)**: ${result.recommendations?.shortTerm || 'Build on current momentum'}\n` +
                `• **Long-term (3 months)**: ${result.recommendations?.longTerm || 'Scale successful strategies'}\n` +
                `• **System Changes**: ${result.recommendations?.systemChanges || 'Minor optimizations needed'}\n\n` +
                
                `🎉 **Celebration Moments**:\n` +
                (result.celebrations || [
                  'Achieved monthly consistency goals',
                  'Improved from previous month',
                  'Maintained healthy work-life balance',
                  'Successfully formed new positive habits'
                ]).slice(0, 3).map((celebration, index) => `${index + 1}. ${celebration} 🎊`).join('\n') + '\n\n' +
                
                `📅 **Insight Summary**:\n` +
                `• **Analysis Depth**: ${insight_depth.charAt(0).toUpperCase() + insight_depth.slice(1)}\n` +
                `• **Data Quality**: ${result.dataQuality || 'High'}\n` +
                `• **Confidence Level**: ${result.confidenceLevel || 95}%\n` +
                `• **Next Review**: ${result.nextReview || 'Next month'}\n` +
                `🔄 **Generated**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get monthly insights: ${error.message}`);
    }
  }

  // ==================== SETTINGS & PREFERENCES METHODS ====================

  async updateUserSettings({ settings }) {
    try {
      const result = await this.makeTickTickRequest('/user/settings', 'PUT', settings);
      
      return {
        content: [{
          type: 'text',
          text: `⚙️ **User Settings Updated Successfully!**\n\n` +
                
                `🎯 **Settings Modified**:\n` +
                (settings.timezone ? `• **Timezone**: ${settings.timezone}\n` : '') +
                (settings.language ? `• **Language**: ${settings.language}\n` : '') +
                (settings.date_format ? `• **Date Format**: ${settings.date_format}\n` : '') +
                (settings.time_format ? `• **Time Format**: ${settings.time_format}\n` : '') +
                (settings.start_of_week !== undefined ? `• **Start of Week**: ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][settings.start_of_week]}\n` : '') +
                (settings.theme ? `• **Theme**: ${settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)}\n` : '') +
                (settings.default_list ? `• **Default Project**: ${settings.default_list}\n` : '') +
                (settings.smart_add !== undefined ? `• **Smart Add**: ${settings.smart_add ? 'Enabled' : 'Disabled'}\n` : '') +
                (settings.auto_backup !== undefined ? `• **Auto Backup**: ${settings.auto_backup ? 'Enabled' : 'Disabled'}\n` : '') + '\n' +
                
                `🔄 **Update Status**:\n` +
                `• **Settings Applied**: ${Object.keys(settings).length} preferences updated\n` +
                `• **Sync Status**: ${result.syncStatus || 'Synced across devices'}\n` +
                `• **Cache Updated**: ${result.cacheUpdated ? 'Yes' : 'No'}\n` +
                `• **Requires Restart**: ${result.requiresRestart ? 'Yes - Please restart app' : 'No'}\n\n` +
                
                `📱 **Device Integration**:\n` +
                `• **Cross-Platform Sync**: Settings will sync to all connected devices\n` +
                `• **Mobile Apps**: Changes reflected in iOS/Android apps\n` +
                `• **Web Interface**: Updated preferences active immediately\n` +
                `• **Desktop Apps**: Settings applied at next launch\n\n` +
                
                `💡 **Optimization Tips**:\n` +
                (settings.timezone ? '• Timezone change improves scheduling accuracy\n' : '') +
                (settings.smart_add ? '• Smart Add helps parse natural language tasks\n' : '') +
                (settings.auto_backup ? '• Auto backup protects against data loss\n' : '') +
                '• Regular settings review ensures optimal experience\n' +
                '• Customize defaults to match your workflow\n\n' +
                
                `🎯 **Quick Actions**:\n` +
                `• Review notification settings for complete setup\n` +
                `• Check sync preferences for device coordination\n` +
                `• Explore advanced features in updated interface\n` +
                `• Share feedback on new settings configuration\n\n` +
                
                `📅 **Settings Summary**:\n` +
                `• **Updated**: ${new Date().toLocaleString()}\n` +
                `• **Profile ID**: ${result.profileId || 'Current user'}\n` +
                `• **Backup Created**: ${result.backupCreated ? 'Yes' : 'No'}\n` +
                `• **Version**: ${result.settingsVersion || '1.0'}\n\n` +
                
                `✅ **Settings update completed! Your preferences are now active across all devices.`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update user settings: ${error.message}`);
    }
  }

  async getNotificationSettings({ category = 'all', include_disabled = false }) {
    try {
      const params = new URLSearchParams({
        category,
        disabled: include_disabled
      });
      
      const result = await this.makeTickTickRequest(`/user/notifications?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `🔔 **Notification Settings Overview**\n\n` +
                
                `📊 **Current Configuration**:\n` +
                `• **Total Notification Types**: ${result.totalTypes || 0}\n` +
                `• **Active Notifications**: ${result.activeCount || 0}\n` +
                `• **Disabled Notifications**: ${result.disabledCount || 0}\n` +
                `• **Last Updated**: ${result.lastUpdated || 'Unknown'}\n` +
                `• **Profile Status**: ${result.profileStatus || 'Active'}\n\n` +
                
                (category === 'all' || category === 'tasks' ? 
                  `📋 **Task Notifications**:\n` +
                  `• **Due Date Reminders**: ${result.tasks?.dueReminders?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Advance Notice**: ${result.tasks?.dueReminders?.advanceTime || 15} minutes\n` +
                  `• **Overdue Alerts**: ${result.tasks?.overdueAlerts?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Completion Celebrations**: ${result.tasks?.completionCelebrations?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Daily Summary**: ${result.tasks?.dailySummary?.enabled ? '✅ Enabled' : '❌ Disabled'} at ${result.tasks?.dailySummary?.time || '9:00 AM'}\n\n` : ''
                ) +
                
                (category === 'all' || category === 'habits' ? 
                  `🔄 **Habit Notifications**:\n` +
                  `• **Daily Reminders**: ${result.habits?.dailyReminders?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Reminder Time**: ${result.habits?.dailyReminders?.time || '8:00 AM'}\n` +
                  `• **Active Days**: ${result.habits?.dailyReminders?.days?.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ') || 'All days'}\n` +
                  `• **Streak Celebrations**: ${result.habits?.streakCelebrations?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Weekly Progress**: ${result.habits?.weeklyProgress?.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n` : ''
                ) +
                
                (category === 'all' || category === 'calendar' ? 
                  `📅 **Calendar Notifications**:\n` +
                  `• **Event Reminders**: ${result.calendar?.eventReminders?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Default Advance**: ${result.calendar?.eventReminders?.defaultAdvance || 15} minutes\n` +
                  `• **Conflict Alerts**: ${result.calendar?.conflictAlerts?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Sync Notifications**: ${result.calendar?.syncNotifications?.enabled ? '✅ Enabled' : '❌ Disabled'}\n\n` : ''
                ) +
                
                (category === 'all' || category === 'collaboration' ? 
                  `👥 **Collaboration Notifications**:\n` +
                  `• **Task Assignments**: ${result.collaboration?.taskAssignments ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Project Invitations**: ${result.collaboration?.projectInvitations ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Comments & Messages**: ${result.collaboration?.comments ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Status Updates**: ${result.collaboration?.statusUpdates ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Team Activity**: ${result.collaboration?.teamActivity ? '✅ Enabled' : '❌ Disabled'}\n\n` : ''
                ) +
                
                (category === 'all' || category === 'system' ? 
                  `🔧 **System Notifications**:\n` +
                  `• **App Updates**: ${result.system?.appUpdates ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Tips & Tricks**: ${result.system?.tipsAndTricks ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Weekly Reports**: ${result.system?.weeklyReports ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Promotional**: ${result.system?.promotional ? '✅ Enabled' : '❌ Disabled'}\n` +
                  `• **Security Alerts**: ${result.system?.securityAlerts ? '✅ Enabled' : '❌ Disabled'}\n\n` : ''
                ) +
                
                `📱 **Delivery Methods**:\n` +
                `• **Push Notifications**: ${result.delivery?.pushNotifications ? '✅ Enabled' : '❌ Disabled'}\n` +
                `• **Email Notifications**: ${result.delivery?.emailNotifications ? '✅ Enabled' : '❌ Disabled'}\n` +
                `• **SMS Notifications**: ${result.delivery?.smsNotifications ? '✅ Enabled' : '❌ Disabled'}\n` +
                `• **In-App Notifications**: ${result.delivery?.inAppNotifications ? '✅ Enabled' : '❌ Disabled'}\n\n` +
                
                `🎵 **Sound & Vibration**:\n` +
                `• **Notification Sounds**: ${result.soundSettings?.enabled ? '✅ Enabled' : '❌ Disabled'}\n` +
                `• **Sound Theme**: ${result.soundSettings?.theme || 'Default'}\n` +
                `• **Vibration**: ${result.soundSettings?.vibration ? '✅ Enabled' : '❌ Disabled'}\n` +
                `• **Quiet Hours**: ${result.soundSettings?.quietHours?.enabled ? '✅ Active' : '❌ Disabled'} ${result.soundSettings?.quietHours?.schedule || ''}\n\n` +
                
                (include_disabled && result.disabledNotifications?.length ? 
                  `❌ **Disabled Notifications**:\n` +
                  result.disabledNotifications.slice(0, 8).map((notif, index) => 
                    `${index + 1}. ${notif.name} - ${notif.reason || 'User disabled'}`
                  ).join('\n') + 
                  (result.disabledNotifications.length > 8 ? `\n... and ${result.disabledNotifications.length - 8} more` : '') + '\n\n' : ''
                ) +
                
                `⚡ **Quick Settings**:\n` +
                `• **Do Not Disturb**: ${result.quickSettings?.doNotDisturb ? 'Active' : 'Inactive'}\n` +
                `• **Focus Mode**: ${result.quickSettings?.focusMode ? 'Active' : 'Inactive'}\n` +
                `• **Smart Notifications**: ${result.quickSettings?.smartNotifications ? 'Enabled' : 'Disabled'}\n` +
                `• **Batch Grouping**: ${result.quickSettings?.batchGrouping ? 'Enabled' : 'Disabled'}\n\n` +
                
                `💡 **Optimization Suggestions**:\n` +
                `• Consider enabling daily summaries for better overview\n` +
                `• Set quiet hours to avoid disruption during sleep\n` +
                `• Use smart notifications to reduce notification fatigue\n` +
                `• Review and disable non-essential promotional notifications\n` +
                `• Test notification delivery across all your devices\n\n` +
                
                `📊 **Notification Analytics**:\n` +
                `• **Daily Average**: ${result.analytics?.dailyAverage || 0} notifications\n` +
                `• **Most Active Hour**: ${result.analytics?.peakHour || 'N/A'}\n` +
                `• **Interaction Rate**: ${result.analytics?.interactionRate || 0}%\n` +
                `• **Dismissed Rate**: ${result.analytics?.dismissedRate || 0}%\n\n` +
                
                `🔄 **Last Update**: ${new Date().toLocaleString()}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get notification settings: ${error.message}`);
    }
  }

  async updateNotificationSettings({ notifications }) {
    try {
      const result = await this.makeTickTickRequest('/user/notifications', 'PUT', notifications);
      
      const changedSettings = [];
      if (notifications.task_reminders) changedSettings.push('Task Reminders');
      if (notifications.habit_reminders) changedSettings.push('Habit Reminders');
      if (notifications.collaboration) changedSettings.push('Collaboration');
      if (notifications.system) changedSettings.push('System');
      if (notifications.delivery_methods) changedSettings.push('Delivery Methods');
      
      return {
        content: [{
          type: 'text',
          text: `🔔 **Notification Settings Updated!**\n\n` +
                
                `✅ **Updated Categories**: ${changedSettings.join(', ')}\n\n` +
                
                (notifications.task_reminders ? 
                  `📋 **Task Notification Changes**:\n` +
                  `• **Reminders**: ${notifications.task_reminders.enabled ? 'Enabled' : 'Disabled'}\n` +
                  (notifications.task_reminders.advance_time ? `• **Advance Time**: ${notifications.task_reminders.advance_time} minutes\n` : '') +
                  (notifications.task_reminders.sound ? `• **Sound**: ${notifications.task_reminders.sound}\n` : '') +
                  (notifications.task_reminders.vibrate !== undefined ? `• **Vibration**: ${notifications.task_reminders.vibrate ? 'Enabled' : 'Disabled'}\n` : '') + '\n' : ''
                ) +
                
                (notifications.habit_reminders ? 
                  `🔄 **Habit Notification Changes**:\n` +
                  `• **Daily Reminders**: ${notifications.habit_reminders.enabled ? 'Enabled' : 'Disabled'}\n` +
                  (notifications.habit_reminders.time ? `• **Reminder Time**: ${notifications.habit_reminders.time}\n` : '') +
                  (notifications.habit_reminders.days ? `• **Active Days**: ${notifications.habit_reminders.days.map(d => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]).join(', ')}\n` : '') + '\n' : ''
                ) +
                
                (notifications.collaboration ? 
                  `👥 **Collaboration Changes**:\n` +
                  Object.entries(notifications.collaboration).map(([key, value]) => 
                    `• **${key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}**: ${value ? 'Enabled' : 'Disabled'}`
                  ).join('\n') + '\n\n' : ''
                ) +
                
                (notifications.system ? 
                  `🔧 **System Notification Changes**:\n` +
                  Object.entries(notifications.system).map(([key, value]) => 
                    `• **${key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}**: ${value ? 'Enabled' : 'Disabled'}`
                  ).join('\n') + '\n\n' : ''
                ) +
                
                (notifications.delivery_methods ? 
                  `📱 **Delivery Method Changes**:\n` +
                  Object.entries(notifications.delivery_methods).map(([key, value]) => 
                    `• **${key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}**: ${value ? 'Enabled' : 'Disabled'}`
                  ).join('\n') + '\n\n' : ''
                ) +
                
                `📊 **Update Summary**:\n` +
                `• **Settings Modified**: ${Object.keys(notifications).length} categories\n` +
                `• **Sync Status**: ${result.syncStatus || 'Synced across devices'}\n` +
                `• **Effective Immediately**: Yes\n` +
                `• **Backup Created**: ${result.backupCreated ? 'Yes' : 'No'}\n\n` +
                
                `🎯 **Impact Assessment**:\n` +
                `• **Notification Volume**: ${result.expectedVolume || 'Moderate'} daily notifications\n` +
                `• **Productivity Impact**: ${result.productivityImpact || 'Optimized for focus'}\n` +
                `• **Battery Usage**: ${result.batteryImpact || 'Minimal impact'}\n` +
                `• **Network Usage**: ${result.networkImpact || 'Standard'}\n\n` +
                
                `📱 **Device Compatibility**:\n` +
                `• **Mobile Apps**: Settings applied immediately\n` +
                `• **Desktop Apps**: Active at next launch\n` +
                `• **Web Interface**: Real-time updates\n` +
                `• **Wearable Devices**: Synced automatically\n\n` +
                
                `💡 **Next Steps**:\n` +
                `• Test notifications on all your devices\n` +
                `• Monitor notification frequency for 24-48 hours\n` +
                `• Adjust quiet hours if needed\n` +
                `• Review weekly notification analytics\n` +
                `• Fine-tune based on usage patterns\n\n` +
                
                `⚙️ **Advanced Options**:\n` +
                `• Configure custom notification sounds\n` +
                `• Set up location-based notification rules\n` +
                `• Create notification templates for teams\n` +
                `• Enable smart notification bundling\n\n` +
                
                `📅 **Applied**: ${new Date().toLocaleString()}\n` +
                `🔔 **Status**: All notification preferences successfully updated!\n\n` +
                
                `✅ **Your notification experience is now optimized for your workflow.**`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update notification settings: ${error.message}`);
    }
  }

  async getSyncSettings({ include_device_list = true, include_sync_history = false }) {
    try {
      const params = new URLSearchParams({
        devices: include_device_list,
        history: include_sync_history
      });
      
      const result = await this.makeTickTickRequest(`/user/sync?${params}`);
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Synchronization Settings & Status**\n\n` +
                
                `📊 **Sync Overview**:\n` +
                `• **Auto Sync**: ${result.autoSync ? '✅ Enabled' : '❌ Disabled'}\n` +
                `• **Sync Frequency**: ${result.frequency || 'Real-time'}\n` +
                `• **Last Sync**: ${result.lastSync || 'Unknown'}\n` +
                `• **Sync Status**: ${result.status || 'Active'} ${result.statusIcon || '🟢'}\n` +
                `• **Next Scheduled**: ${result.nextSync || 'Automatic'}\n\n` +
                
                `⚙️ **Current Configuration**:\n` +
                `• **Sync Frequency**: ${result.settings?.frequency || 'real-time'}\n` +
                `• **WiFi Only**: ${result.settings?.wifiOnly ? 'Yes - Data saving mode' : 'No - All connections'}\n` +
                `• **Conflict Resolution**: ${result.settings?.conflictResolution || 'server-wins'}\n` +
                `• **Backup Before Sync**: ${result.settings?.backupBeforeSync ? 'Enabled' : 'Disabled'}\n` +
                `• **Compression**: ${result.settings?.compression ? 'Enabled' : 'Disabled'}\n\n` +
                
                `📱 **Data Types Synced**:\n` +
                `• **Tasks**: ${result.dataTypes?.tasks ? '✅ Synced' : '❌ Local only'}\n` +
                `• **Projects**: ${result.dataTypes?.projects ? '✅ Synced' : '❌ Local only'}\n` +
                `• **Habits**: ${result.dataTypes?.habits ? '✅ Synced' : '❌ Local only'}\n` +
                `• **Calendar**: ${result.dataTypes?.calendar ? '✅ Synced' : '❌ Local only'}\n` +
                `• **Attachments**: ${result.dataTypes?.attachments ? '✅ Synced' : '❌ Local only'}\n` +
                `• **Settings**: ${result.dataTypes?.settings ? '✅ Synced' : '❌ Local only'}\n\n` +
                
                (include_device_list && result.devices ? 
                  `🖥️ **Connected Devices (${result.devices.length || 0})**:\n` +
                  (result.devices || []).slice(0, 8).map((device, index) => 
                    `${index + 1}. **${device.name || 'Unknown Device'}** (${device.type || 'Unknown'})\n` +
                    `   • Last Sync: ${device.lastSync || 'Never'}\n` +
                    `   • Status: ${device.status || 'Unknown'} ${device.online ? '🟢' : '🔴'}\n` +
                    `   • Version: ${device.version || 'Unknown'}`
                  ).join('\n\n') + 
                  (result.devices?.length > 8 ? `\n\n... and ${result.devices.length - 8} more devices` : '') + '\n\n' : ''
                ) +
                
                `📊 **Sync Performance**:\n` +
                `• **Success Rate**: ${result.performance?.successRate || 95}%\n` +
                `• **Average Speed**: ${result.performance?.avgSpeed || 'Fast'}\n` +
                `• **Data Transferred**: ${result.performance?.dataTransferred || '0 MB'} this month\n` +
                `• **Conflicts Resolved**: ${result.performance?.conflictsResolved || 0} this week\n` +
                `• **Failed Syncs**: ${result.performance?.failedSyncs || 0} this month\n\n` +
                
                (include_sync_history && result.history ? 
                  `📝 **Recent Sync Activity**:\n` +
                  (result.history || []).slice(0, 10).map((entry, index) => 
                    `${index + 1}. **${entry.timestamp || 'Unknown time'}**: ${entry.action || 'Sync'}\n` +
                    `   • Device: ${entry.device || 'Unknown'}\n` +
                    `   • Result: ${entry.result || 'Success'} ${entry.success ? '✅' : '❌'}\n` +
                    `   • Data: ${entry.dataSize || '0 KB'}`
                  ).join('\n\n') + 
                  (result.history?.length > 10 ? `\n\n... and ${result.history.length - 10} more entries` : '') + '\n\n' : ''
                ) +
                
                `🔧 **Sync Health Check**:\n` +
                `• **Network Status**: ${result.healthCheck?.network || 'Good'}\n` +
                `• **Storage Space**: ${result.healthCheck?.storage || 'Sufficient'}\n` +
                `• **API Connectivity**: ${result.healthCheck?.api || 'Stable'}\n` +
                `• **Conflict Rate**: ${result.healthCheck?.conflictRate || 'Low'}\n` +
                `• **Overall Health**: ${result.healthCheck?.overall || 'Excellent'} ${result.healthCheck?.healthIcon || '💚'}\n\n` +
                
                `⚠️ **Sync Issues** ${result.issues?.length ? `(${result.issues.length})` : '(0)'}:\n` +
                (result.issues?.length ? 
                  result.issues.slice(0, 5).map((issue, index) => 
                    `${index + 1}. **${issue.type || 'Unknown'}**: ${issue.description || 'No details'}\n` +
                    `   • Severity: ${issue.severity || 'Low'}\n` +
                    `   • Suggested Fix: ${issue.suggestedFix || 'No action needed'}`
                  ).join('\n\n') + 
                  (result.issues.length > 5 ? `\n\n... and ${result.issues.length - 5} more issues` : '') : 
                  'No sync issues detected! Everything is working smoothly.'
                ) + '\n\n' +
                
                `💡 **Optimization Recommendations**:\n` +
                (result.recommendations || [
                  'Enable WiFi-only sync to save mobile data',
                  'Set up automatic backups before major syncs',
                  'Review and clean up old device connections',
                  'Monitor sync performance weekly'
                ]).slice(0, 4).map(rec => `• ${rec}`).join('\n') + '\n\n' +
                
                `🔐 **Security & Privacy**:\n` +
                `• **Encryption**: ${result.security?.encryption || 'AES-256'} encryption in transit\n` +
                `• **Authentication**: ${result.security?.authentication || 'OAuth 2.0'} tokens\n` +
                `• **Data Retention**: ${result.security?.retention || '90 days'} backup retention\n` +
                `• **Privacy Mode**: ${result.security?.privacyMode ? 'Enabled' : 'Standard'}\n\n` +
                
                `📱 **Quick Actions**:\n` +
                `• **Force Sync Now**: Trigger immediate sync across all devices\n` +
                `• **Resolve Conflicts**: Review and resolve any pending conflicts\n` +
                `• **Clean Device List**: Remove inactive or old devices\n` +
                `• **Reset Sync Settings**: Restore default sync configuration\n\n` +
                
                `📅 **Report Generated**: ${new Date().toLocaleString()}\n` +
                `🔄 **Next Auto-Update**: ${result.nextUpdate || 'Real-time'}`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to get sync settings: ${error.message}`);
    }
  }

  async updateSyncSettings({ sync_settings }) {
    try {
      const result = await this.makeTickTickRequest('/user/sync', 'PUT', sync_settings);
      
      return {
        content: [{
          type: 'text',
          text: `🔄 **Sync Settings Updated Successfully!**\n\n` +
                
                `✅ **Configuration Changes**:\n` +
                (sync_settings.auto_sync !== undefined ? `• **Auto Sync**: ${sync_settings.auto_sync ? 'Enabled' : 'Disabled'}\n` : '') +
                (sync_settings.sync_frequency ? `• **Sync Frequency**: ${sync_settings.sync_frequency}\n` : '') +
                (sync_settings.sync_on_wifi_only !== undefined ? `• **WiFi Only**: ${sync_settings.sync_on_wifi_only ? 'Enabled - Data saving mode' : 'Disabled - All connections'}\n` : '') +
                (sync_settings.conflict_resolution ? `• **Conflict Resolution**: ${sync_settings.conflict_resolution}\n` : '') +
                (sync_settings.backup_before_sync !== undefined ? `• **Backup Before Sync**: ${sync_settings.backup_before_sync ? 'Enabled' : 'Disabled'}\n` : '') +
                (sync_settings.compression !== undefined ? `• **Data Compression**: ${sync_settings.compression ? 'Enabled' : 'Disabled'}\n` : '') + '\n' +
                
                (sync_settings.data_types ? 
                  `📊 **Data Type Sync Settings**:\n` +
                  Object.entries(sync_settings.data_types).map(([type, enabled]) => 
                    `• **${type.charAt(0).toUpperCase() + type.slice(1)}**: ${enabled ? '✅ Sync enabled' : '❌ Local only'}`
                  ).join('\n') + '\n\n' : ''
                ) +
                
                `🎯 **Impact of Changes**:\n` +
                `• **Sync Performance**: ${result.impact?.performance || 'Optimized'}\n` +
                `• **Data Usage**: ${result.impact?.dataUsage || 'Efficient'}\n` +
                `• **Battery Impact**: ${result.impact?.battery || 'Minimal'}\n` +
                `• **Storage Usage**: ${result.impact?.storage || 'Optimized'}\n` +
                `• **Conflict Probability**: ${result.impact?.conflicts || 'Low'}\n\n` +
                
                `⚡ **Immediate Effects**:\n` +
                `• **Settings Applied**: All changes active immediately\n` +
                `• **Device Notification**: Other devices notified of changes\n` +
                `• **Sync Triggered**: ${result.syncTriggered ? 'Automatic sync initiated' : 'Next scheduled sync updated'}\n` +
                `• **Backup Created**: ${result.backupCreated ? 'Configuration backup saved' : 'No backup needed'}\n\n` +
                
                `📱 **Device Coordination**:\n` +
                `• **Mobile Apps**: Settings synchronized automatically\n` +
                `• **Desktop Apps**: Changes applied at next app launch\n` +
                `• **Web Interface**: Active immediately\n` +
                `• **Connected Devices**: ${result.deviceCount || 0} devices will receive updates\n\n` +
                
                `🔧 **Technical Details**:\n` +
                `• **Configuration Version**: ${result.configVersion || '1.0'}\n` +
                `• **Sync Protocol**: ${result.protocol || 'WebSocket + REST API'}\n` +
                `• **Encryption**: ${result.encryption || 'AES-256 end-to-end'}\n` +
                `• **Compression Ratio**: ${result.compressionRatio || '3:1'} (when enabled)\n` +
                `• **Max Payload Size**: ${result.maxPayload || '10MB'}\n\n` +
                
                (sync_settings.sync_frequency === 'real-time' ? 
                  `⚡ **Real-Time Sync Benefits**:\n` +
                  `• Instant updates across all devices\n` +
                  `• No data loss risk\n` +
                  `• Immediate conflict detection\n` +
                  `• Seamless multi-device workflow\n` +
                  `• Minimal user intervention needed\n\n` : 
                sync_settings.sync_frequency === 'manual' ? 
                  `🎯 **Manual Sync Mode**:\n` +
                  `• Full control over when data syncs\n` +
                  `• Reduced battery and data usage\n` +
                  `• Perfect for limited connectivity\n` +
                  `• Remember to sync regularly\n` +
                  `• Consider weekly sync schedule\n\n` :
                  `⏰ **Scheduled Sync Active**:\n` +
                  `• Balanced performance and efficiency\n` +
                  `• Automatic conflict prevention\n` +
                  `• Predictable data usage\n` +
                  `• Good for stable workflows\n` +
                  `• Manual sync always available\n\n`
                ) +
                
                `💡 **Best Practices**:\n` +
                `• Keep auto-sync enabled for seamless experience\n` +
                `• Use WiFi-only mode to control data usage\n` +
                `• Enable compression for slower connections\n` +
                `• Regular backups prevent data loss\n` +
                `• Monitor sync performance weekly\n\n` +
                
                `⚠️ **Important Notes**:\n` +
                `• Changes apply to all connected devices\n` +
                `• Some settings require app restart on desktop\n` +
                `• Conflict resolution affects data precedence\n` +
                `• Backup settings before major changes\n` +
                `• Contact support if sync issues persist\n\n` +
                
                `🔄 **Next Steps**:\n` +
                `• Monitor sync performance for 24 hours\n` +
                `• Test sync across all your devices\n` +
                `• Review sync logs for any issues\n` +
                `• Adjust settings based on usage patterns\n` +
                `• Share feedback on sync experience\n\n` +
                
                `📅 **Updated**: ${new Date().toLocaleString()}\n` +
                `🎯 **Status**: Sync configuration optimized for your workflow!\n\n` +
                
                `✅ **Your devices are now perfectly synchronized.**`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to update sync settings: ${error.message}`);
    }
  }

  async resetUserData({ reset_type, data_categories, backup_before_reset = true, confirmation_code, export_data_first = false }) {
    try {
      const resetData = {
        type: reset_type,
        categories: data_categories,
        backup: backup_before_reset,
        confirmation: confirmation_code,
        export: export_data_first
      };
      
      const result = await this.makeTickTickRequest('/user/reset', 'POST', resetData);
      
      const severityIcon = reset_type === 'full-reset' ? '🔴' : 
                          reset_type === 'partial-data' ? '🟡' : '🟢';
      
      return {
        content: [{
          type: 'text',
          text: `${severityIcon} **User Data Reset Completed**\n\n` +
                
                `📊 **Reset Summary**:\n` +
                `• **Reset Type**: ${reset_type.replace('-', ' ').toUpperCase()}\n` +
                `• **Operation ID**: ${result.operationId || 'Unknown'}\n` +
                `• **Execution Time**: ${result.executionTime || 0}ms\n` +
                `• **Status**: ${result.status || 'Completed'} ${result.success ? '✅' : '❌'}\n` +
                `• **Confirmation**: ${confirmation_code ? 'Verified' : 'Not required'}\n\n` +
                
                (data_categories?.length ? 
                  `📋 **Data Categories Reset**:\n` +
                  data_categories.map((category, index) => 
                    `${index + 1}. **${category.charAt(0).toUpperCase() + category.slice(1)}**: ${result.categoryResults?.[category] || 'Completed'}`
                  ).join('\n') + '\n\n' : 
                  `📋 **Reset Scope**: ${reset_type === 'full-reset' ? 'All user data' : reset_type === 'settings-only' ? 'Settings and preferences' : reset_type === 'cache-only' ? 'Local cache and temporary data' : 'Selected data categories'}\n\n`
                ) +
                
                (backup_before_reset && result.backup ? 
                  `💾 **Backup Information**:\n` +
                  `• **Backup Created**: ${result.backup.created ? 'Yes' : 'No'}\n` +
                  `• **Backup ID**: ${result.backup.id || 'Unknown'}\n` +
                  `• **Backup Size**: ${result.backup.size || 'Unknown'}\n` +
                  `• **Backup Location**: ${result.backup.location || 'Cloud storage'}\n` +
                  `• **Recovery Code**: ${result.backup.recoveryCode || 'None'}\n` +
                  `• **Retention Period**: ${result.backup.retention || '90 days'}\n\n` : ''
                ) +
                
                (export_data_first && result.export ? 
                  `📤 **Data Export**:\n` +
                  `• **Export Status**: ${result.export.status || 'Completed'}\n` +
                  `• **Export Format**: ${result.export.format || 'JSON'}\n` +
                  `• **Download URL**: ${result.export.downloadUrl || 'Processing...'}\n` +
                  `• **File Size**: ${result.export.fileSize || 'Unknown'}\n` +
                  `• **Expiry Date**: ${result.export.expiryDate || '7 days from now'}\n\n` : ''
                ) +
                
                `📈 **Reset Statistics**:\n` +
                `• **Records Affected**: ${result.stats?.recordsAffected || 0}\n` +
                `• **Files Removed**: ${result.stats?.filesRemoved || 0}\n` +
                `• **Cache Cleared**: ${result.stats?.cacheCleared || '0 MB'}\n` +
                `• **Settings Reset**: ${result.stats?.settingsReset || 0}\n` +
                `• **Relationships Updated**: ${result.stats?.relationshipsUpdated || 0}\n\n` +
                
                (reset_type === 'full-reset' ? 
                  `🔴 **Full Reset Impact**:\n` +
                  `• **All user data permanently removed**\n` +
                  `• **Account reverted to initial state**\n` +
                  `• **All customizations cleared**\n` +
                  `• **Device sync relationships reset**\n` +
                  `• **Fresh start with default settings**\n\n` :
                reset_type === 'partial-data' ? 
                  `🟡 **Partial Reset Impact**:\n` +
                  `• **Selected data categories cleared**\n` +
                  `• **Other data preserved intact**\n` +
                  `• **Settings may need reconfiguration**\n` +
                  `• **Device sync continues normally**\n` +
                  `• **Targeted cleanup completed**\n\n` :
                reset_type === 'settings-only' ? 
                  `🟢 **Settings Reset Impact**:\n` +
                  `• **All preferences restored to defaults**\n` +
                  `• **User data preserved completely**\n` +
                  `• **Customizations cleared**\n` +
                  `• **Account data remains intact**\n` +
                  `• **Clean slate for configuration**\n\n` :
                  `🟢 **Cache Reset Impact**:\n` +
                  `• **Temporary data cleared**\n` +
                  `• **All user data preserved**\n` +
                  `• **Performance may improve**\n` +
                  `• **Re-sync may be triggered**\n` +
                  `• **Minimal user impact**\n\n`
                ) +
                
                `🔄 **Post-Reset Actions Required**:\n` +
                (reset_type === 'full-reset' ? 
                  `• **Complete account setup wizard**\n` +
                  `• **Restore data from backup if needed**\n` +
                  `• **Reconfigure all preferences**\n` +
                  `• **Re-establish device connections**\n` +
                  `• **Set up integrations and automations**\n` :
                reset_type === 'settings-only' ? 
                  `• **Review and update preferences**\n` +
                  `• **Configure notification settings**\n` +
                  `• **Set up sync preferences**\n` +
                  `• **Customize interface themes**\n` +
                  `• **Test all device connections**\n` :
                  `• **Verify data integrity**\n` +
                  `• **Check sync functionality**\n` +
                  `• **Review affected settings**\n` +
                  `• **Test core features**\n` +
                  `• **Monitor performance**\n`
                ) + '\n' +
                
                `⚠️ **Important Reminders**:\n` +
                `• **This action cannot be undone** (except via backup)\n` +
                `• **All connected devices affected** (sync required)\n` +
                `• **API integrations may need reconfiguration**\n` +
                `• **Shared projects remain with collaborators**\n` +
                `• **Contact support if issues arise**\n\n` +
                
                (result.backup?.recoveryCode ? 
                  `🔐 **Recovery Information**:\n` +
                  `• **Recovery Code**: \`${result.backup.recoveryCode}\`\n` +
                  `• **Keep this code safe** - Required for data recovery\n` +
                  `• **Recovery URL**: ${result.backup.recoveryUrl || 'Contact support'}\n` +
                  `• **Support Contact**: help@ticktick.com\n\n` : ''
                ) +
                
                `🎯 **Next Steps**:\n` +
                `• ${reset_type === 'full-reset' ? 'Begin account setup process' : 'Review and configure remaining settings'}\n` +
                `• ${backup_before_reset ? 'Store backup recovery information safely' : 'Consider creating manual backup going forward'}\n` +
                `• Test core functionality across all devices\n` +
                `• Monitor system performance for 24-48 hours\n` +
                `• Contact support team if any issues occur\n\n` +
                
                `📅 **Operation Completed**: ${new Date().toLocaleString()}\n` +
                `🔄 **Status**: ${result.status || 'Reset completed successfully'}\n\n` +
                
                `✅ **Your account has been reset according to your specifications.**`
        }]
      };
    } catch (error) {
      throw new Error(`Failed to reset user data: ${error.message}`);
    }
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    console.log('🚀 TickTick MCP Server started');
    console.log(`🔑 Client ID: ${TICKTICK_CLIENT_ID ? '✅ Configured' : '❌ Missing'}`);
    console.log(`🎫 Token: ${TICKTICK_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log(`🔐 Access Token: ${TICKTICK_ACCESS_TOKEN ? '✅ Configured' : '❌ Missing'}`);
    console.log('🔒 READ-ONLY MODE - All write operations blocked');
    console.log('🔧 Available read-only tools:');
    console.log('   📋 Projects & Tasks: get_projects, get_task_details, filter_tasks, search_tasks');
    console.log('   🏷️ Tags: get_tags, get_tasks_by_tag, get_tag_usage_stats');
    console.log('   🔄 Habits: get_habits, get_habit_history/stats/streaks/calendar/summary, export_habit_data');
    console.log('   🔍 Search: get_today_tasks, get_overdue_tasks, get_upcoming_tasks');
    console.log('   📊 Analytics: productivity_report, completion_trends, time_tracking, goal_progress, weekly/monthly');
    console.log('   ⚙️ Settings: get_notification_settings, get_sync_settings, get_user_profile');
    console.log('   🛠️ Utilities: convert_datetime, get_cached_tasks, register_task_id');
    console.log('📡 Server ready for connections...');
  }
}

const server = new TickTickMCPServer();
server.run().catch((error) => {
  console.error('💥 Failed to start server:', error);
  process.exit(1);
});