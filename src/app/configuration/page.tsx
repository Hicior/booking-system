'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Modal } from '@/components/ui';
import { Employee } from '@/lib/types';

interface EmployeeFormData {
  first_name: string;
  last_name: string;
  display_name: string;
  employee_code: string;
  is_active: boolean;
}

const defaultFormData: EmployeeFormData = {
  first_name: '',
  last_name: '',
  display_name: '',
  employee_code: '',
  is_active: true,
};

export default function ConfigurationPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [employeeDeletable, setEmployeeDeletable] = useState<Record<string, boolean>>({});
  
  // Modal state
  const [modal, setModal] = useState({
    isOpen: false,
    mode: 'create' as 'create' | 'edit',
    employee: null as Employee | null,
  });

  // Form state
  const [formData, setFormData] = useState<EmployeeFormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Load employees
  useEffect(() => {
    loadEmployees();
  }, []);

  // Check if a single employee can be deleted
  const checkSingleEmployeeDeletable = async (employee: Employee): Promise<boolean> => {
    try {
      // Check reservations (any status - active, completed, cancelled)
      const reservationsResponse = await fetch(`/api/reservations?created_by=${encodeURIComponent(employee.display_name)}&status=all`);
      if (reservationsResponse.ok) {
        const reservations = await reservationsResponse.json();
        if (reservations.length > 0) {
          return false;
        }
      }

      // Check activity logs  
      const activityResponse = await fetch(`/api/activity-logs?performed_by=${encodeURIComponent(employee.display_name)}`);
      if (activityResponse.ok) {
        const activities = await activityResponse.json();
        if (activities.length > 0) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error(`Error checking employee dependencies for ${employee.display_name}:`, error);
      return false; // If we can't check, err on the side of caution
    }
  };

  const loadEmployees = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/employees?include_inactive=true');
      if (!response.ok) throw new Error('Failed to fetch employees');
      const data = await response.json();
      setEmployees(data);

      // Check deletability for each employee
      const deletabilityChecks = await Promise.all(
        data.map(async (employee: Employee) => ({
          id: employee.id,
          deletable: await checkSingleEmployeeDeletable(employee)
        }))
      );

      // Convert to object for easy lookup
      const deletabilityMap = deletabilityChecks.reduce((acc, { id, deletable }) => {
        acc[id] = deletable;
        return acc;
      }, {} as Record<string, boolean>);

      setEmployeeDeletable(deletabilityMap);
    } catch (err) {
      console.error('Error loading employees:', err);
      setError('Nie udało się załadować pracowników');
    } finally {
      setLoading(false);
    }
  };

  // Form validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.first_name.trim()) {
      errors.first_name = 'Imię jest wymagane';
    }

    if (!formData.last_name.trim()) {
      errors.last_name = 'Nazwisko jest wymagane';
    }

    if (!formData.display_name.trim()) {
      errors.display_name = 'Nazwa wyświetlana jest wymagana';
    }

    // Check if display name is unique (excluding current employee when editing)
    const existingEmployee = employees.find(emp => 
      emp.display_name.toLowerCase() === formData.display_name.toLowerCase() &&
      emp.id !== modal.employee?.id
    );
    if (existingEmployee) {
      errors.display_name = 'Nazwa wyświetlana musi być unikalna';
    }

    // Check if employee code is unique (if provided)
    if (formData.employee_code.trim()) {
      const existingCode = employees.find(emp => 
        emp.employee_code === formData.employee_code &&
        emp.id !== modal.employee?.id
      );
      if (existingCode) {
        errors.employee_code = 'Kod pracownika musi być unikalny';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setSubmitting(true);
    try {
      const url = modal.mode === 'create' 
        ? '/api/employees'
        : `/api/employees/${modal.employee?.id}`;
      
      const method = modal.mode === 'create' ? 'POST' : 'PUT';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save employee');
      }

      await loadEmployees();
      handleCloseModal();
      
      // Small delay to ensure UI updates, then recheck deletability
      setTimeout(async () => {
        await loadEmployees();
      }, 500);
    } catch (err) {
      console.error('Error saving employee:', err);
      setError(err instanceof Error ? err.message : 'Nie udało się zapisać pracownika');
    } finally {
      setSubmitting(false);
    }
  };

  // Handle employee deletion (simplified since we pre-check deletability)
  const handleDeleteEmployee = async (employee: Employee) => {
    if (!confirm(`Czy na pewno chcesz usunąć pracownika "${employee.display_name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/employees/${employee.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete employee');
      }

      await loadEmployees();
    } catch (err) {
      console.error('Error deleting employee:', err);
      setError(err instanceof Error ? err.message : 'Nie udało się usunąć pracownika');
    }
  };

  // Handle employee deactivation
  const handleDeactivateEmployee = async (employee: Employee) => {
    if (!confirm(`Czy na pewno chcesz dezaktywować pracownika "${employee.display_name}"? Pracownik będzie ukryty z listy, ale wszystkie powiązane dane zostaną zachowane.`)) {
      return;
    }

    const response = await fetch(`/api/employees/${employee.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_active: false }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to deactivate employee');
    }

    await loadEmployees();
    console.log(`Pracownik "${employee.display_name}" został pomyślnie dezaktywowany.`);
  };

  // Handle employee activation
  const handleActivateEmployee = async (employee: Employee) => {
    if (!confirm(`Czy na pewno chcesz ponownie aktywować pracownika "${employee.display_name}"?`)) {
      return;
    }

    const response = await fetch(`/api/employees/${employee.id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ is_active: true }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to activate employee');
    }

    await loadEmployees();
    console.log(`Pracownik "${employee.display_name}" został pomyślnie aktywowany.`);
  };

  // Modal handlers
  const handleOpenCreateModal = () => {
    setModal({
      isOpen: true,
      mode: 'create',
      employee: null,
    });
    setFormData(defaultFormData);
    setFormErrors({});
  };

  const handleOpenEditModal = (employee: Employee) => {
    setModal({
      isOpen: true,
      mode: 'edit',
      employee,
    });
    setFormData({
      first_name: employee.first_name,
      last_name: employee.last_name,
      display_name: employee.display_name,
      employee_code: employee.employee_code || '',
      is_active: employee.is_active,
    });
    setFormErrors({});
  };

  const handleCloseModal = () => {
    setModal({
      isOpen: false,
      mode: 'create',
      employee: null,
    });
    setFormData(defaultFormData);
    setFormErrors({});
  };

  // Auto-generate display name
  const handleFirstLastNameChange = (field: 'first_name' | 'last_name', value: string) => {
    const newFormData = { ...formData, [field]: value };
    
    // Auto-generate display name if it's empty or follows the pattern "FirstName LastName"
    if (!formData.display_name || formData.display_name === `${formData.first_name} ${formData.last_name}`.trim()) {
      newFormData.display_name = `${newFormData.first_name} ${newFormData.last_name}`.trim();
    }
    
    setFormData(newFormData);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-base-100 p-6">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse">
            <div className="h-8 bg-base-300 rounded w-1/4 mb-6"></div>
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
            Konfiguracja Systemu
          </h1>
          <p className="text-base-content/70">
            Zarządzanie pracownikami i ustawieniami systemu
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <Card className="mb-6 border-error">
            <CardContent>
              <div className="text-error">{error}</div>
              <Button 
                variant="secondary" 
                size="sm" 
                onClick={() => setError('')}
                className="mt-2"
              >
                Zamknij
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Employees Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Zarządzanie Pracownikami</CardTitle>
                <p className="text-sm text-base-content/70 mt-1">
                  Lista wszystkich pracowników (aktywnych i nieaktywnych)
                </p>
              </div>
              <Button onClick={handleOpenCreateModal}>
                Dodaj Pracownika
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {employees.length === 0 ? (
              <div className="text-center py-12 text-base-content/60">
                <div className="text-4xl mb-4">👥</div>
                <p className="text-lg">Brak pracowników w systemie</p>
                <p className="text-sm">Dodaj pierwszego pracownika używając przycisku powyżej</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-base-300">
                      <th className="text-left py-3 px-2">Imię</th>
                      <th className="text-left py-3 px-2">Nazwisko</th>
                      <th className="text-left py-3 px-2">Nazwa wyświetlana</th>
                      <th className="text-left py-3 px-2">Kod pracownika</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-left py-3 px-2">Data utworzenia</th>
                      <th className="text-left py-3 px-2">
                        <div>Akcje</div>
                        <div className="text-xs text-base-content/50 font-normal">
                          Usuń: tylko gdy brak jakichkolwiek rezerwacji/logów
                        </div>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((employee) => (
                      <tr
                        key={employee.id}
                        className="border-b border-base-300 hover:bg-base-200"
                      >
                        <td className="py-3 px-2">{employee.first_name}</td>
                        <td className="py-3 px-2">{employee.last_name}</td>
                        <td className="py-3 px-2 font-medium">{employee.display_name}</td>
                        <td className="py-3 px-2">{employee.employee_code || '-'}</td>
                        <td className="py-3 px-2">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              employee.is_active
                                ? 'bg-success/20 text-success'
                                : 'bg-error/20 text-error'
                            }`}
                          >
                            {employee.is_active ? 'Aktywny' : 'Nieaktywny'}
                          </span>
                        </td>
                        <td className="py-3 px-2 text-base-content/70">
                          {new Date(employee.created_at).toLocaleDateString('pl-PL')}
                        </td>
                        <td className="py-3 px-2">
                          <div className="flex space-x-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => handleOpenEditModal(employee)}
                            >
                              Edytuj
                            </Button>
                            {employee.is_active ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="warning"
                                  onClick={async () => {
                                    try {
                                      await handleDeactivateEmployee(employee);
                                    } catch (err) {
                                      console.error('Error deactivating employee:', err);
                                      setError(err instanceof Error ? err.message : 'Nie udało się dezaktywować pracownika');
                                    }
                                  }}
                                >
                                  Dezaktywuj
                                </Button>
                                {(employeeDeletable[employee.id] ?? true) && (
                                  <Button
                                    size="sm"
                                    variant="error"
                                    onClick={() => handleDeleteEmployee(employee)}
                                  >
                                    Usuń
                                  </Button>
                                )}
                              </>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={async () => {
                                    try {
                                      await handleActivateEmployee(employee);
                                    } catch (err) {
                                      console.error('Error activating employee:', err);
                                      setError(err instanceof Error ? err.message : 'Nie udało się aktywować pracownika');
                                    }
                                  }}
                                >
                                  Aktywuj
                                </Button>
                                {(employeeDeletable[employee.id] ?? true) && (
                                  <Button
                                    size="sm"
                                    variant="error"
                                    onClick={() => handleDeleteEmployee(employee)}
                                  >
                                    Usuń
                                  </Button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          <Card padding="sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">{employees.length}</div>
              <div className="text-sm text-base-content/70">Łącznie pracowników</div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-success">
                {employees.filter(emp => emp.is_active).length}
              </div>
              <div className="text-sm text-base-content/70">Aktywni</div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="text-center">
              <div className="text-2xl font-bold text-error">
                {employees.filter(emp => !emp.is_active).length}
              </div>
              <div className="text-sm text-base-content/70">Nieaktywni</div>
            </div>
          </Card>
        </div>

        {/* Employee Modal */}
        <Modal
          isOpen={modal.isOpen}
          onClose={handleCloseModal}
          title={modal.mode === 'create' ? 'Dodaj Pracownika' : 'Edytuj Pracownika'}
          size="md"
        >
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Imię *"
                value={formData.first_name}
                onChange={(e) => handleFirstLastNameChange('first_name', e.target.value)}
                error={formErrors.first_name}
                fullWidth
              />

              <Input
                label="Nazwisko *"
                value={formData.last_name}
                onChange={(e) => handleFirstLastNameChange('last_name', e.target.value)}
                error={formErrors.last_name}
                fullWidth
              />
            </div>

            <Input
              label="Nazwa wyświetlana *"
              value={formData.display_name}
              onChange={(e) => setFormData(prev => ({ ...prev, display_name: e.target.value }))}
              error={formErrors.display_name}
              fullWidth
            />

            <Input
              label="Kod pracownika (opcjonalny)"
              value={formData.employee_code}
              onChange={(e) => setFormData(prev => ({ ...prev, employee_code: e.target.value }))}
              error={formErrors.employee_code}
              fullWidth
            />

            <div className="flex items-center space-x-3">
              <input
                type="checkbox"
                id="is_active"
                checked={formData.is_active}
                onChange={(e) => setFormData(prev => ({ ...prev, is_active: e.target.checked }))}
                className="w-4 h-4 text-primary bg-base-100 border-base-300 rounded focus:ring-primary"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-base-content">
                Pracownik aktywny
              </label>
            </div>

            <div className="flex justify-end space-x-3 mt-6">
              <Button
                type="button"
                variant="secondary"
                onClick={handleCloseModal}
                disabled={submitting}
              >
                Anuluj
              </Button>
              <Button
                type="submit"
                disabled={submitting}
                loading={submitting}
              >
                {modal.mode === 'create' ? 'Dodaj Pracownika' : 'Zapisz Zmiany'}
              </Button>
            </div>
          </form>
        </Modal>
      </div>
    </div>
  );
} 