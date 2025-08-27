/**
 * Client-safe date utilities
 * These functions can be safely imported in both client and server components
 * No server-side dependencies (database, Node.js modules, etc.)
 */

/**
 * Safely converts any date input to YYYY-MM-DD string format for database storage
 * Handles Date objects, strings, and edge cases without timezone issues
 */
export function normalizeDateForDb(date: Date | string): string {
  if (!date) throw new Error('Date is required');
  
  if (typeof date === 'string') {
    // Handle various string formats: YYYY-MM-DD, YYYY-MM-DDTHH:mm:ss, etc.
    const cleanDate = date.split('T')[0];
    // Validate format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      throw new Error(`Invalid date format: ${date}. Expected YYYY-MM-DD`);
    }
    return cleanDate;
  }
  
  if (date instanceof Date) {
    // Use local date components to avoid timezone conversion
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  throw new Error(`Invalid date type: ${typeof date}`);
}

/**
 * Safely extracts date string from Date | string union type
 * Centralizes the repetitive type checking pattern used throughout the codebase
 * Uses local date components to avoid timezone conversion issues
 */
export function extractDateString(date: Date | string): string {
  if (typeof date === 'string') {
    return date.split('T')[0]; // Remove time part if present
  }
  
  if (date instanceof Date) {
    // Use local date components to avoid timezone conversion
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  throw new Error(`Invalid date type: ${typeof date}`);
}

/**
 * Format date for display in Polish format (DD.MM.YYYY)
 * Safely handles both Date objects and string inputs
 */
export function formatDateForDisplay(date: Date | string): string {
  if (!date) return '';
  
  try {
    if (typeof date === 'string') {
      // Add noon time to avoid timezone edge cases
      const parsedDate = new Date(date + 'T12:00:00');
      return parsedDate.toLocaleDateString('pl-PL');
    }
    
    if (date instanceof Date) {
      return date.toLocaleDateString('pl-PL');
    }
    
    return '';
  } catch (error) {
    console.error('Error formatting date for display:', error);
    return '';
  }
}

/**
 * Creates a safe Date object from Date | string input
 * Useful for date arithmetic operations
 */
export function createDateObject(date: Date | string): Date {
  if (date instanceof Date) {
    return new Date(date);
  }
  
  if (typeof date === 'string') {
    // Add noon time to avoid timezone issues
    return new Date(date + 'T12:00:00');
  }
  
  throw new Error(`Cannot create Date object from: ${typeof date}`);
}

/**
 * Get today's date in YYYY-MM-DD format using Poland timezone
 * Safe for use in client-side components
 */
export function getTodayInPoland(): string {
  const now = new Date();
  // Use local date components to avoid timezone conversion issues
  const year = now.getFullYear();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Check if a date string is today in Poland timezone
 */
export function isToday(dateString: string): boolean {
  return extractDateString(dateString) === getTodayInPoland();
}

/**
 * Check if a date string is in the past (before today in Poland timezone)
 */
export function isPastDate(dateString: string): boolean {
  return extractDateString(dateString) < getTodayInPoland();
}
