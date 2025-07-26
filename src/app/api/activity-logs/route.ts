import { NextResponse } from 'next/server';
import { getActivityLogs, getActivityLogSummary, searchActivityLogs } from '@/lib/services';
import { ActivityLogFilters } from '@/lib/types';
import { createRequestLogger, timeOperation, logError } from '@/lib/logger';

export async function GET(request: Request) {
  const logger = createRequestLogger(request);
  
  return timeOperation(logger, 'get_activity_logs', async () => {
    const { searchParams } = new URL(request.url);
    
    // Check if this is a summary request
    if (searchParams.get('summary') === 'true') {
      const days = parseInt(searchParams.get('days') || '30');
      
      logger.debug({ days }, 'Fetching activity log summary');
      
      const summary = await getActivityLogSummary(days);
      
      logger.info({ 
        days,
        total_activities: summary.total_activities,
        activities_by_type: Object.keys(summary.activities_by_type).length
      }, 'Activity log summary fetched successfully');
      
      return NextResponse.json(summary);
    }
    
    // Check if this is a search request
    const searchTerm = searchParams.get('search');
    if (searchTerm) {
      const limit = parseInt(searchParams.get('limit') || '50');
      
      logger.debug({ search_term: searchTerm, limit }, 'Searching activity logs');
      
      const results = await searchActivityLogs(searchTerm, limit);
      
      logger.info({ 
        search_term: searchTerm,
        result_count: results.length,
        limit 
      }, 'Activity log search completed');
      
      return NextResponse.json(results);
    }
    
    // Regular filtered request
    const filters: ActivityLogFilters = {
      reservation_id: searchParams.get('reservation_id') || undefined,
      action_type: searchParams.get('action_type') as any || undefined,
      performed_by: searchParams.get('performed_by') || undefined,
      performed_at_from: searchParams.get('performed_at_from') || undefined,
      performed_at_to: searchParams.get('performed_at_to') || undefined,
      guest_name: searchParams.get('guest_name') || undefined,
      table_id: searchParams.get('table_id') || undefined,
      room_id: searchParams.get('room_id') || undefined,
    };

    // Remove undefined values
    const cleanFilters = Object.fromEntries(
      Object.entries(filters).filter(([_, value]) => value !== undefined)
    );

    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    logger.debug({ 
      filters: cleanFilters,
      limit,
      offset 
    }, 'Fetching filtered activity logs');

    const activityLogs = await getActivityLogs(cleanFilters, limit, offset);
    
    logger.info({ 
      filter_count: Object.keys(cleanFilters).length,
      result_count: activityLogs.length,
      limit,
      offset
    }, 'Activity logs fetched successfully');
    
    return NextResponse.json(activityLogs);
  }).catch((error) => {
    logError(logger, error, { 
      context: 'get_activity_logs_failed',
      url_params: Object.fromEntries(new URL(request.url).searchParams)
    });
    
    return NextResponse.json(
      { error: 'Nie udało się pobrać logów aktywności' },
      { status: 500 }
    );
  });
} 