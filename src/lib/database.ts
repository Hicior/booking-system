import { Pool, PoolClient } from 'pg';
import { createDbLogger, timeOperation, logError } from './logger';

// Create database logger
const dbLogger = createDbLogger('connection');

// Database configuration using environment variables
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'booking_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'password',
  max: 10, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return error after 2 seconds if connection could not be established
};

// Log database configuration (without sensitive data)
dbLogger.info({
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user,
  max: dbConfig.max,
}, 'Database configuration loaded');

// Create connection pool
export const pool = new Pool(dbConfig);

// Pool event listeners for monitoring
pool.on('connect', (client) => {
  dbLogger.debug('New client connected to database pool');
});

pool.on('remove', (client) => {
  dbLogger.debug('Client removed from database pool');
});

pool.on('error', (err, client) => {
  logError(dbLogger, err, { context: 'pool_error' });
});

// Database connection test
export async function testConnection(): Promise<boolean> {
  const logger = createDbLogger('test', 'connection');
  
  return timeOperation(logger, 'database_connection_test', async () => {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
      logger.info('Database connection test successful');
      return true;
    } finally {
      client.release();
    }
  }).catch((error) => {
    logError(logger, error, { context: 'connection_test_failed' });
    return false;
  });
}

// Execute a query with automatic connection handling
export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const logger = createDbLogger('query');
  const queryLogger = logger.child({
    query_text: text,
    param_count: params?.length || 0,
  });

  return timeOperation(queryLogger, 'database_query', async () => {
    const client = await pool.connect();
    try {
      queryLogger.debug('Executing database query');
      const result = await client.query(text, params);
      queryLogger.debug({
        rows_returned: result.rows.length,
        rows_affected: result.rowCount,
      }, 'Query executed successfully');
      return result.rows;
    } finally {
      client.release();
    }
  });
}

// Execute a query and return a single row
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const logger = createDbLogger('queryOne');
  
  return timeOperation(logger, 'database_query_one', async () => {
    const rows = await query<T>(text, params);
    const result = rows.length > 0 ? rows[0] : null;
    
    logger.debug({
      found_row: !!result,
      total_rows: rows.length,
    }, 'Single row query completed');
    
    return result;
  });
}

// Transaction helper
export async function transaction<T>(
  callback: (client: PoolClient) => Promise<T>
): Promise<T> {
  const logger = createDbLogger('transaction');
  
  return timeOperation(logger, 'database_transaction', async () => {
    const client = await pool.connect();
    try {
      logger.debug('Starting transaction');
      await client.query('BEGIN');
      
      const result = await callback(client);
      
      await client.query('COMMIT');
      logger.debug('Transaction committed successfully');
      
      return result;
    } catch (error) {
      logger.warn('Rolling back transaction due to error');
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });
}

// Graceful shutdown
export async function closePool(): Promise<void> {
  const logger = createDbLogger('shutdown');
  
  return timeOperation(logger, 'database_pool_shutdown', async () => {
    await pool.end();
    logger.info('Database pool closed successfully');
  });
}

// Health check function
export async function healthCheck(): Promise<{
  status: 'healthy' | 'unhealthy';
  details: {
    total_connections: number;
    idle_connections: number;
    waiting_count: number;
  };
}> {
  const logger = createDbLogger('health_check');
  
  try {
    const isConnected = await testConnection();
    
    const details = {
      total_connections: pool.totalCount,
      idle_connections: pool.idleCount,
      waiting_count: pool.waitingCount,
    };
    
    logger.debug(details, 'Database health check completed');
    
    return {
      status: isConnected ? 'healthy' : 'unhealthy',
      details,
    };
  } catch (error) {
    logError(logger, error as Error, { context: 'health_check_failed' });
    return {
      status: 'unhealthy',
      details: {
        total_connections: pool.totalCount,
        idle_connections: pool.idleCount,
        waiting_count: pool.waitingCount,
      },
    };
  }
}

// Handle process exit
process.on('SIGINT', async () => {
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await closePool();
  process.exit(0);
}); 