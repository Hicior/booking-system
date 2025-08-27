import React from 'react';
import { TimeInput } from './TimeInput';
import { getTodayInPoland, extractDateString } from '@/lib/date-utils';

interface DatePickerProps {
  selectedDate?: string;
  selectedTime?: string;
  onDateChange: (date: string) => void;
  onTimeChange: (time: string) => void;
  minDate?: string;
  label?: string;
  error?: string;
}

export function DatePicker({
  selectedDate,
  selectedTime,
  onDateChange,
  onTimeChange,
  minDate,
  label,
  error,
}: DatePickerProps) {
  const today = getTodayInPoland();

  return (
    <div className="space-y-4">
      {label && (
        <label className="block text-sm font-medium text-base-content">
          {label}
        </label>
      )}
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-base-content mb-2">
            Data
          </label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => onDateChange(e.target.value)}
            min={minDate || today}
            className="w-full px-3 py-2 border border-base-300 rounded-lg bg-base-100 text-base-content focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div>
          <TimeInput
            label="Godzina"
            value={selectedTime || ''}
            onChange={onTimeChange}
            error={error}
            fullWidth
          />
        </div>
      </div>

      {error && (
        <div className="text-error text-sm">{error}</div>
      )}
    </div>
  );
}

interface QuickDateSelectorProps {
  onSelect: (date: string) => void;
}

export function QuickDateSelector({ onSelect }: QuickDateSelectorProps) {
  const getDateOptions = () => {
    const today = new Date();
    const options = [];

    // Dzisiaj
    options.push({
      label: 'Dzisiaj',
      date: extractDateString(today),
      dayName: 'dzisiaj'
    });

    // Jutro
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    options.push({
      label: 'Jutro',
      date: extractDateString(tomorrow),
      dayName: 'jutro'
    });

    // Następne 6 dni (zamiast 5)
    for (let i = 2; i <= 7; i++) {
      const futureDate = new Date(today);
      futureDate.setDate(today.getDate() + i);
      const dayName = futureDate.toLocaleDateString('pl', { weekday: 'long' });
      const formattedDate = futureDate.toLocaleDateString('pl', { 
        month: 'long', 
        day: 'numeric' 
      });

      options.push({
        label: `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${formattedDate}`,
        date: extractDateString(futureDate),
        dayName: dayName
      });
    }

    return options;
  };

  const dateOptions = getDateOptions();

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-base-content">
        Szybki wybór daty
      </label>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {dateOptions.map((option) => (
          <button
            key={option.date}
            onClick={() => onSelect(option.date)}
            className="
              p-4 text-left 
              border border-base-300 
              rounded-[var(--radius-selector)] 
              bg-base-100 
              hover:bg-base-200/50 hover:border-base-300
              focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
              transition-all duration-150
              group
            "
          >
            <div className="font-medium text-base-content transition-colors">
              {option.label}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
