import type { CalendarFilters } from '#shared/utils/calendar-filter'

export interface SavedCalendar {
  id: string
  name: string
  position: number
  filters: CalendarFilters
}

/**
 * The caller's saved calendars, under one key so the sidebar and the Calendar
 * page share one list: saving, renaming or deleting on the page shows in the
 * sidebar at once.
 */
export function useCalendars() {
  const { data: calendars, refresh } = useFetch<SavedCalendar[]>('/api/calendars', { key: 'calendars', default: () => [] })
  const toast = useToast()

  async function create(name: string, filters: CalendarFilters): Promise<SavedCalendar | null> {
    try {
      const saved = await $fetch<SavedCalendar>('/api/calendars', { method: 'POST', body: { name, filters } })
      calendars.value = [...(calendars.value ?? []), saved]
      return saved
    } catch (e) {
      toast.add({ title: 'Could not save the calendar', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      return null
    }
  }

  async function update(id: string, changes: { name?: string, filters?: CalendarFilters }): Promise<boolean> {
    try {
      const saved = await $fetch<SavedCalendar>(`/api/calendars/${id}` as string, { method: 'PUT' as const, body: changes })
      calendars.value = (calendars.value ?? []).map(c => c.id === id ? saved : c)
      return true
    } catch (e) {
      toast.add({ title: 'Could not update the calendar', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      return false
    }
  }

  async function remove(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/calendars/${id}` as string, { method: 'DELETE' as const })
      calendars.value = (calendars.value ?? []).filter(c => c.id !== id)
      return true
    } catch (e) {
      toast.add({ title: 'Could not delete the calendar', description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      return false
    }
  }

  return { calendars, refresh, create, update, remove }
}
