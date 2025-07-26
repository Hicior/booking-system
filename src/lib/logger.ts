import pino from 'pino';
import path from 'path';

// Determine if we're in development
const isDevelopment = process.env.NODE_ENV === 'development';

// Logger configuration
const loggerConfig = {
  level: process.env.PINO_LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  formatters: {
    level: (label: string) => {
      return { level: label.toUpperCase() };
    },
    bindings: (bindings: any) => {
      return {
        pid: bindings.pid,
        hostname: bindings.hostname,
        app: 'booking-system',
        version: process.env.npm_package_version || '0.1.0',
      };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: process.env.NODE_ENV || 'development',
  },
};

// Simple destination for Next.js compatibility
const createDestination = () => {
  // In Next.js environment, just use stdout with optional file destination
  if (typeof window !== 'undefined') {
    // Client-side: just use stdout (this shouldn't happen but safety check)
    return process.stdout;
  }

  // Server-side: Try to create file destination, fallback to stdout
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    
    // For development, also log to file but don't use transports
    if (isDevelopment) {
      return pino.destination({
        dest: path.join(logsDir, 'app-dev.log'),
        mkdir: true,
        sync: false
      });
    } else {
      return pino.destination({
        dest: path.join(logsDir, 'app.log'),
        mkdir: true,
        sync: false
      });
    }
  } catch (error) {
    // Fallback to stdout if file destination fails
    console.warn('Failed to create log file destination, using stdout:', error);
    return process.stdout;
  }
};

// Create the main logger - simplified for Next.js compatibility
export const logger = pino(loggerConfig, createDestination());

// Helper function to create child loggers with context
export function createChildLogger(context: Record<string, any>) {
  return logger.child(context);
}

// Helper function to create request-scoped logger
export function createRequestLogger(request: Request) {
  const url = new URL(request.url);
  return logger.child({
    request_id: generateRequestId(),
    method: request.method,
    path: url.pathname,
    user_agent: request.headers.get('user-agent'),
    ip: request.headers.get('x-forwarded-for') || 'unknown',
  });
}

// Helper function to create database operation logger
export function createDbLogger(operation: string, table?: string) {
  return logger.child({
    component: 'database',
    operation,
    table,
  });
}

// Helper function to create service logger
export function createServiceLogger(service: string, operation?: string) {
  return logger.child({
    component: 'service',
    service,
    operation,
  });
}

// Simple request ID generator
function generateRequestId(): string {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

// Performance timing helper
export function timeOperation<T>(
  logger: pino.Logger,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  const operationLogger = logger.child({ operation });
  
  operationLogger.debug('Operation started');
  
  return fn()
    .then((result) => {
      const duration = Date.now() - start;
      operationLogger.info({ duration_ms: duration }, 'Operation completed successfully');
      return result;
    })
    .catch((error) => {
      const duration = Date.now() - start;
      operationLogger.error({ 
        error: error.message,
        stack: error.stack,
        duration_ms: duration 
      }, 'Operation failed');
      throw error;
    });
}

// Error logging helper
export function logError(logger: pino.Logger, error: Error, context?: Record<string, any>) {
  logger.error({
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack,
    },
    ...context,
  }, 'Error occurred');
}

// Alternative logger for standalone scripts that CAN use transports
export function createScriptLogger() {
  const logsDir = path.join(process.cwd(), 'logs');
  
  if (isDevelopment) {
    // Development: pretty console + file using transports (works in standalone scripts)
    return pino(loggerConfig, pino.transport({
      targets: [
        {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname,app,version',
            singleLine: false,
          },
        },
        {
          target: 'pino/file',
          options: {
            destination: path.join(logsDir, 'script-dev.log'),
            mkdir: true,
          },
        },
      ],
    }));
  } else {
    // Production: JSON to file + console
    return pino(loggerConfig, pino.transport({
      targets: [
        {
          target: 'pino/file',
          options: {
            destination: path.join(logsDir, 'script.log'),
            mkdir: true,
          },
        },
        {
          target: 'pino/file',
          options: {
            destination: 1, // stdout
          },
        },
      ],
    }));
  }
}

// Default export
export default logger; 