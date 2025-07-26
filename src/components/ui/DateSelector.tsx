'use client';

import React, { useState } from 'react';
import { Button } from './Button';

interface DateSelectorProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
  label?: string;
}

export function DateSelector({ selectedDate, onDateChange, label }: DateSelectorProps) {
  const [showWeekView, setShowWeekView] = useState(true);

  // Helper functions
  const formatDate = (date: Date): string => {
    return date.toISOString().split('T')[0];
  };

  const parseDate = (dateString: string): Date => {
    return new Date(dateString + 'T12:00:00'); // Add time to avoid timezone issues
  };

  const addDays = (dateString: string, days: number): string => {
    const date = parseDate(dateString);
    date.setDate(date.getDate() + days);
    return formatDate(date);
  };

  const getWeekDays = (centerDate: string): Array<{ date: string; day: string; dayName: string; isToday: boolean; isSelected: boolean }> => {
    const center = parseDate(centerDate);
    const today = new Date();
    const todayString = formatDate(today);
    
    // Get the start of the week (Monday)
    const startOfWeek = new Date(center);
    const dayOfWeek = startOfWeek.getDay();
    const daysToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek; // Sunday = 0, Monday = 1
    startOfWeek.setDate(startOfWeek.getDate() + daysToMonday);

    const weekDays = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(date.getDate() + i);
      const dateString = formatDate(date);
      
      weekDays.push({
        date: dateString,
        day: date.getDate().toString(),
        dayName: date.toLocaleDateString('pl-PL', { weekday: 'short' }),
        isToday: dateString === todayString,
        isSelected: dateString === selectedDate,
      });
    }
    
    return weekDays;
  };



  const handleWeekNavigation = (direction: 'prev' | 'next') => {
    const days = direction === 'prev' ? -7 : 7;
    onDateChange(addDays(selectedDate, days));
  };

  const weekDays = getWeekDays(selectedDate);

  return (
    <div className="space-y-4">
      {label && (
        <label className="block text-sm font-medium text-base-content">
          {label}
        </label>
      )}
      
      {/* Week View */}
      {showWeekView && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-base-content">Tydzień</span>
            <div className="flex gap-1">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleWeekNavigation('prev')}
                className="text-xs px-2"
              >
                ← Poprzedni
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleWeekNavigation('next')}
                className="text-xs px-2"
              >
                Następny →
              </Button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {weekDays.map((day) => (
              <button
                key={day.date}
                onClick={() => onDateChange(day.date)}
                className={`
                  p-2 text-center rounded-lg text-xs transition-all duration-150
                  ${day.isSelected
                    ? 'bg-primary text-primary-content shadow-md scale-105'
                    : day.isToday
                    ? 'bg-accent text-accent-content'
                    : 'bg-base-200 text-base-content hover:bg-base-300'
                  }
                `}
              >
                <div className="font-medium">{day.dayName}</div>
                <div className="text-xs opacity-75">{day.day}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Fallback Date Input */}
      <details className="group">
        <summary className="cursor-pointer text-sm text-base-content/70 hover:text-base-content">
          📅 Wybierz konkretną datę
        </summary>
        <div className="mt-2">
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-base-300 rounded-lg bg-base-100 text-base-content focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>
      </details>
    </div>
  );
} 