import React, { useId } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export function Input({ 
  label, 
  error, 
  fullWidth = false,
  className = '',
  id,
  ...props 
}: InputProps) {
  const defaultId = useId();
  const inputId = id || defaultId;
  
  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-base-content mb-1">
          {label}
        </label>
      )}
      <input
        id={inputId}
        className={`
          w-full px-3 py-2 
          border border-base-300 
          rounded-[var(--radius-field)] 
          bg-base-100 
          text-base-content 
          placeholder-base-content/50
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-error focus:ring-error focus:border-error' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-error">{error}</p>
      )}
    </div>
  );
}

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export function Textarea({ 
  label, 
  error, 
  fullWidth = false,
  className = '',
  id,
  ...props 
}: TextareaProps) {
  const defaultId = useId();
  const inputId = id || defaultId;
  
  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-base-content mb-1">
          {label}
        </label>
      )}
      <textarea
        id={inputId}
        className={`
          w-full px-3 py-2 
          border border-base-300 
          rounded-[var(--radius-field)] 
          bg-base-100 
          text-base-content 
          placeholder-base-content/50
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
          disabled:opacity-50 disabled:cursor-not-allowed
          resize-vertical
          ${error ? 'border-error focus:ring-error focus:border-error' : ''}
          ${className}
        `}
        {...props}
      />
      {error && (
        <p className="mt-1 text-sm text-error">{error}</p>
      )}
    </div>
  );
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  fullWidth?: boolean;
  options: { value: string | number; label: string }[];
}

export function Select({ 
  label, 
  error, 
  fullWidth = false,
  className = '',
  id,
  options,
  ...props 
}: SelectProps) {
  const defaultId = useId();
  const inputId = id || defaultId;
  
  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-base-content mb-1">
          {label}
        </label>
      )}
      <select
        id={inputId}
        className={`
          w-full px-3 py-2 
          border border-base-300 
          rounded-[var(--radius-field)] 
          bg-base-100 
          text-base-content 
          focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
          disabled:opacity-50 disabled:cursor-not-allowed
          ${error ? 'border-error focus:ring-error focus:border-error' : ''}
          ${className}
        `}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p className="mt-1 text-sm text-error">{error}</p>
      )}
    </div>
  );
} 