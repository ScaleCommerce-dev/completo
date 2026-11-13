import { DEFAULT_INTERFACE_MODE, type InterfaceMode } from '#shared/utils/workspace-settings'

interface WorkspaceSettings {
  interfaceMode: InterfaceMode
  issueTemplate: string
}

/**
 * The workspace settings every signed-in page reads (`GET /api/settings`):
 * which interface the workspace uses, and the template new issues start with.
 *
 * One copy per session, in `useState`, refreshed on navigation once it is
 * older than `MAX_AGE_MS`. `middleware/interface.global.ts` loads
 * it before the first signed-in page renders, so a page knows its interface
 * before it fetches anything: the tracker and the standard version of a page
 * never both run. The admin Settings page writes the saved values back here,
 * so switching applies without a reload.
 *
 * A failed load leaves the standard interface, which is what an install that
 * never touched the setting gets anyway, and is retried on the next navigation.
 */
/**
 * How long a loaded copy is trusted. Navigation asks again after this, so an
 * admin's switch reaches sessions that are already open without a request on
 * every page change.
 */
const MAX_AGE_MS = 5 * 60 * 1000

export function useWorkspaceSettings() {
  const settings = useState<WorkspaceSettings | null>('workspace-settings', () => null)
  const loadedAt = useState('workspace-settings-loaded-at', () => 0)

  async function load(): Promise<void> {
    if (settings.value && Date.now() - loadedAt.value < MAX_AGE_MS) return
    try {
      settings.value = await $fetch<WorkspaceSettings>('/api/settings')
      loadedAt.value = Date.now()
    } catch {
      // Keeps what it had (or the default); the next navigation asks again.
    }
  }

  const interfaceMode = computed<InterfaceMode>(() => settings.value?.interfaceMode ?? DEFAULT_INTERFACE_MODE)
  const isTracker = computed(() => interfaceMode.value === 'tracker')
  const issueTemplate = computed(() => settings.value?.issueTemplate ?? '')

  return { settings, load, interfaceMode, isTracker, issueTemplate }
}
