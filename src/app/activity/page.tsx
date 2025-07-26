'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { ActivityLogWithReservation, ActivityLogSummary } from '@/lib/types';
import { logApiError } from '@/lib/client-logger';

interface ActivityFilters {
  search: string;
  actionType: string;
  performedBy: string;
  dateFrom: string;
  dateTo: string;
  roomId: string;
}

export default function ActivityPage() {
  const [activityLogs, setActivityLogs] = useState<ActivityLogWithReservation[]>([]);
  const [summary, setSummary] = useState<ActivityLogSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [filters, setFilters] = useState<ActivityFilters>({
    search: '',
    actionType: '',
    performedBy: '',
    dateFrom: '',
    dateTo: '',
    roomId: '',
  });

  // Load initial data
  useEffect(() => {
    loadActivityLogs();
    loadSummary();
  }, []);

  const loadActivityLogs = async (searchFilters?: Partial<ActivityFilters>) => {
    try {
      setSearching(true);
      const params = new URLSearchParams();
      
      const currentFilters = { ...filters, ...searchFilters };
      
      if (currentFilters.search) {
        params.append('search', currentFilters.search);
      } else {
        if (currentFilters.actionType) params.append('action_type', currentFilters.actionType);
        if (currentFilters.performedBy) params.append('performed_by', currentFilters.performedBy);
        if (currentFilters.dateFrom) params.append('performed_at_from', currentFilters.dateFrom);
        if (currentFilters.dateTo) params.append('performed_at_to', currentFilters.dateTo);
        if (currentFilters.roomId) params.append('room_id', currentFilters.roomId);
      }
      
      params.append('limit', '100');

      const response = await fetch(`/api/activity-logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch activity logs');
      
      const data = await response.json();
      setActivityLogs(data);
    } catch (error) {
      logApiError('/api/activity-logs', error as Error);
    } finally {
      setSearching(false);
      setLoading(false);
    }
  };

  const loadSummary = async () => {
    try {
      const response = await fetch('/api/activity-logs?summary=true&days=30');
      if (!response.ok) throw new Error('Failed to fetch summary');
      
      const data = await response.json();
      setSummary(data);
    } catch (error) {
      logApiError('/api/activity-logs?summary=true', error as Error);
    }
  };

  const handleFilterChange = (key: keyof ActivityFilters, value: string) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
  };

  const handleSearch = () => {
    loadActivityLogs();
  };

  const handleClearFilters = () => {
    const clearedFilters = {
      search: '',
      actionType: '',
      performedBy: '',
      dateFrom: '',
      dateTo: '',
      roomId: '',
    };
    setFilters(clearedFilters);
    loadActivityLogs(clearedFilters);
  };

  const getActionTypeColor = (actionType: string) => {
    switch (actionType) {
      case 'updated': return 'text-info';
      case 'cancelled': return 'text-error';
      default: return 'text-base-content';
    }
  };

  const getActionTypeLabel = (actionType: string) => {
    switch (actionType) {
      case 'updated': return 'Zaktualizowano';
      case 'cancelled': return 'Anulowano';
      default: return actionType;
    }
  };

  const formatDateTime = (date: string) => {
    return new Date(date).toLocaleString('pl-PL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderFieldChanges = (changes: Record<string, { old: any; new: any }> | null) => {
    if (!changes || Object.keys(changes).length === 0) return null;

    return (
      <div className="mt-3 p-3 bg-base-200 rounded-lg">
        <h4 className="text-sm font-semibold text-base-content mb-2">Zmiany:</h4>
        <div className="space-y-2">
          {Object.entries(changes).map(([field, change]) => (
            <div key={field} className="text-sm">
              <span className="font-medium capitalize">{field.replace('_', ' ')}:</span>
              <div className="ml-2">
                <span className="text-error">❌ {change.old || 'brak'}</span>
                <span className="mx-2">→</span>
                <span className="text-success">✅ {change.new || 'brak'}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base-100 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-base-300 rounded w-1/4 mb-6"></div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-24 bg-base-300 rounded"></div>
              ))}
            </div>
            <div className="h-96 bg-base-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-base-content mb-2">
            Aktywność Rezerwacji
          </h1>
          <p className="text-base-content/70">
            Przegląd i wyszukiwanie zmian w rezerwacjach
          </p>
        </div>

        {/* Summary Cards */}
        {summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{summary.total_activities}</div>
                <div className="text-sm text-base-content/70">Łącznie aktywności</div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-info">{summary.activities_by_type.updated}</div>
                <div className="text-sm text-base-content/70">Zaktualizowano</div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-error">{summary.activities_by_type.cancelled}</div>
                <div className="text-sm text-base-content/70">Anulowano</div>
              </div>
            </Card>
          </div>
        )}

        {/* Filters */}
        <Card className="p-6 mb-6">
          <h2 className="text-xl font-semibold text-base-content mb-4">Filtry</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-base-content mb-2">
                Wyszukaj
              </label>
              <Input
                type="text"
                placeholder="Imię gościa, telefon, pracownik..."
                value={filters.search}
                onChange={(e) => handleFilterChange('search', e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-base-content mb-2">
                Typ akcji
              </label>
              <select
                className="w-full p-3 border border-base-300 rounded-lg bg-base-100 text-base-content focus:outline-none focus:ring-2 focus:ring-primary"
                value={filters.actionType}
                onChange={(e) => handleFilterChange('actionType', e.target.value)}
              >
                <option value="">Wszystkie</option>
                <option value="updated">Zaktualizowano</option>
                <option value="cancelled">Anulowano</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-base-content mb-2">
                Pracownik
              </label>
              <Input
                type="text"
                placeholder="Nazwa pracownika"
                value={filters.performedBy}
                onChange={(e) => handleFilterChange('performedBy', e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-base-content mb-2">
                Data od
              </label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange('dateFrom', e.target.value)}
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-base-content mb-2">
                Data do
              </label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange('dateTo', e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <Button onClick={handleSearch} disabled={searching}>
              {searching ? 'Wyszukiwanie...' : 'Wyszukaj'}
            </Button>
            <Button variant="secondary" onClick={handleClearFilters}>
              Wyczyść filtry
            </Button>
          </div>
        </Card>

        {/* Activity Logs */}
        <Card className="p-6">
          <h2 className="text-xl font-semibold text-base-content mb-4">
            Historia aktywności ({activityLogs.length})
          </h2>
          
          {activityLogs.length === 0 ? (
            <div className="text-center py-12 text-base-content/60">
              <div className="text-4xl mb-4">📋</div>
              <p className="text-lg">Brak aktywności do wyświetlenia</p>
              <p className="text-sm">Spróbuj zmienić filtry wyszukiwania</p>
            </div>
          ) : (
            <div className="space-y-4">
              {activityLogs.map((log) => (
                <div
                  key={log.id}
                  className="border border-base-300 rounded-lg p-4 transition-all duration-150 hover:shadow-md hover:-translate-y-1"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className={`font-semibold ${getActionTypeColor(log.action_type)}`}>
                        {getActionTypeLabel(log.action_type)}
                      </span>
                      <span className="text-base-content font-medium">
                        {log.reservation_snapshot?.guest_name || 'Nieznany gość'}
                      </span>
                      {log.table_number && log.room_name && (
                        <span className="text-base-content/70 text-sm">
                          {log.room_name} - Stolik {log.table_number}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-base-content/70">
                      {formatDateTime(log.performed_at.toString())}
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Pracownik:</span> {log.performed_by || 'System'}
                    </div>
                    {log.reservation_snapshot?.guest_phone && (
                      <div>
                        <span className="font-medium">Telefon:</span> {log.reservation_snapshot.guest_phone}
                      </div>
                    )}
                    {log.reservation_snapshot?.reservation_date && (
                      <div>
                        <span className="font-medium">Data rezerwacji:</span>{' '}
                        {new Date(log.reservation_snapshot.reservation_date + 'T12:00:00').toLocaleDateString('pl-PL')}
                      </div>
                    )}
                    {log.reservation_snapshot?.reservation_time && (
                      <div>
                        <span className="font-medium">Czas:</span> {log.reservation_snapshot.reservation_time}
                      </div>
                    )}
                  </div>
                  
                  {log.field_changes && renderFieldChanges(log.field_changes)}
                  
                  {log.notes && (
                    <div className="mt-3 p-3 bg-base-200 rounded-lg">
                      <span className="font-medium">Notatki:</span> {log.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
} 