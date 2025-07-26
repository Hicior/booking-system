// Client-side logging utility for frontend components
// This provides structured error handling and optional reporting to backend

interface ClientLogContext {
  component?: string;
  action?: string;
  userId?: string;
  sessionId?: string;
  url?: string;
  userAgent?: string;
  [key: string]: any;
}

interface ClientLogEntry {
  level: 'error' | 'warn' | 'info' | 'debug';
  message: string;
  timestamp: string;
  context?: ClientLogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class ClientLogger {
  private context: ClientLogContext = {};
  private isDevelopment = process.env.NODE_ENV === 'development';

  constructor() {
    // Set default context
    if (typeof window !== 'undefined') {
      this.context = {
        url: window.location.href,
        userAgent: navigator.userAgent,
      };
    }
  }

  setContext(context: ClientLogContext) {
    this.context = { ...this.context, ...context };
  }

  private createLogEntry(
    level: ClientLogEntry['level'],
    message: string,
    error?: Error,
    additionalContext?: ClientLogContext
  ): ClientLogEntry {
    return {
      level,
      message,
      timestamp: new Date().toISOString(),
      context: { ...this.context, ...additionalContext },
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };
  }

  private log(entry: ClientLogEntry) {
    // Always log to console in development
    if (this.isDevelopment) {
      const consoleMethod = entry.level === 'error' ? 'error' : 
                           entry.level === 'warn' ? 'warn' :
                           entry.level === 'info' ? 'info' : 'debug';
      
      console[consoleMethod](`[CLIENT] ${entry.message}`, {
        context: entry.context,
        error: entry.error,
      });
    }

    // In production, you could send logs to your backend
    // Example: this.sendToBackend(entry);
  }

  error(message: string, error?: Error, context?: ClientLogContext) {
    const entry = this.createLogEntry('error', message, error, context);
    this.log(entry);
  }

  warn(message: string, context?: ClientLogContext) {
    const entry = this.createLogEntry('warn', message, undefined, context);
    this.log(entry);
  }

  info(message: string, context?: ClientLogContext) {
    const entry = this.createLogEntry('info', message, undefined, context);
    this.log(entry);
  }

  debug(message: string, context?: ClientLogContext) {
    if (this.isDevelopment) {
      const entry = this.createLogEntry('debug', message, undefined, context);
      this.log(entry);
    }
  }

  // Helper method for API errors
  apiError(endpoint: string, error: Error, response?: Response) {
    this.error(`API request failed: ${endpoint}`, error, {
      component: 'api-client',
      endpoint,
      status: response?.status,
      statusText: response?.statusText,
    });
  }

  // Helper method for component errors
  componentError(component: string, action: string, error: Error) {
    this.error(`Component error in ${component}`, error, {
      component,
      action,
    });
  }

  // Optional: Send logs to backend (implement when needed)
  private async sendToBackend(entry: ClientLogEntry) {
    try {
      await fetch('/api/client-logs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(entry),
      });
    } catch (error) {
      // Fail silently - don't create infinite loops
      console.error('Failed to send log to backend:', error);
    }
  }
}

// Create singleton instance
export const clientLogger = new ClientLogger();

// Export helper functions for common patterns
export function logApiError(endpoint: string, error: Error, response?: Response) {
  clientLogger.apiError(endpoint, error, response);
}

export function logComponentError(component: string, action: string, error: Error) {
  clientLogger.componentError(component, action, error);
}

export function logError(message: string, error?: Error, context?: ClientLogContext) {
  clientLogger.error(message, error, context);
}

export function logWarn(message: string, context?: ClientLogContext) {
  clientLogger.warn(message, context);
}

export function logInfo(message: string, context?: ClientLogContext) {
  clientLogger.info(message, context);
}

export function logDebug(message: string, context?: ClientLogContext) {
  clientLogger.debug(message, context);
}

export default clientLogger; 