"use client";

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { Button } from './Button';

export interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'reservation';
  title: string;
  message: string;
  actions?: Array<{
    label: string;
    onClick: () => void;
    variant?: 'primary' | 'secondary' | 'success' | 'error';
  }>;
  persistent?: boolean; // If true, won't auto-dismiss
  dismissible?: boolean; // If true, shows X button
}

interface ToastContextType {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  clearAllToasts: () => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto-remove after 5 seconds if not persistent
    if (!toast.persistent) {
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 5000);
    }
    
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const clearAllToasts = useCallback(() => {
    setToasts([]);
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast, clearAllToasts }}>
      {children}
      <ToastContainer />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

function ToastContainer() {
  const { toasts } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 space-y-2 max-w-sm">
      {toasts.map((toast) => (
        <ToastComponent key={toast.id} toast={toast} />
      ))}
    </div>
  );
}

function ToastComponent({ toast }: { toast: Toast }) {
  const { removeToast } = useToast();

  const getToastStyles = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-success/10 border-success text-success-content';
      case 'error':
        return 'bg-error/10 border-error text-error-content';
      case 'warning':
        return 'bg-warning/10 border-warning text-warning-content';
      case 'reservation':
        return 'bg-primary/10 border-primary text-primary-content';
      default:
        return 'bg-info/10 border-info text-info-content';
    }
  };

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return '✅';
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'reservation':
        return '🍽️';
      default:
        return 'ℹ️';
    }
  };

  return (
    <div
      className={`
        relative p-4 rounded-lg border-2 shadow-lg
        transition-all duration-100 ease-in
        hover:-translate-y-1 hover:shadow-xl
        ${getToastStyles()}
      `}
    >
      {/* Dismiss button */}
      {toast.dismissible && (
        <button
          onClick={() => removeToast(toast.id)}
          className="absolute top-2 right-2 text-base-content/50 hover:text-base-content transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      )}

      {/* Content */}
      <div className="flex items-start space-x-3">
        <span className="text-xl flex-shrink-0">{getIcon()}</span>
        <div className="flex-1">
          <h4 className="font-semibold text-base-content">{toast.title}</h4>
          <p className="text-sm text-base-content/80 mt-1">{toast.message}</p>
          
          {/* Actions */}
          {toast.actions && toast.actions.length > 0 && (
            <div className="flex space-x-2 mt-3">
              {toast.actions.map((action, index) => (
                <Button
                  key={index}
                  size="sm"
                  variant={action.variant || 'primary'}
                  onClick={() => {
                    action.onClick();
                    removeToast(toast.id);
                  }}
                >
                  {action.label}
                </Button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
} 