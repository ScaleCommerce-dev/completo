/**
 * A row of `/api/projects`: what the sidebar and ⌘K use (name, slug, icon, the
 * star) and what All Projects shows on its cards. One type because it is one
 * response, read from one `useFetch` below.
 */
export interface ProjectListItem {
  id: string
  name: string
  slug: string
  key: string
  description: string | null
  briefing: string | null
  icon: string | null
  doneStatusId: string | null
  doneRetentionDays: number | null
  role: string
  starred: boolean
  boardCount: number
  listCount: number
  totalCards: number
  openCards: number
  memberCount: number
  memberAvatars: Array<{ name: string, avatarUrl: string | null, kind?: 'human' | 'agent', color?: string | null }>
  lastActivity: string | null
}

type Project = Pick<ProjectListItem, 'id' | 'name' | 'slug' | 'icon' | 'starred'>

interface NavItem { label: string, icon: string, to: string }

interface NavSection {
  label?: string
  items: NavItem[]
  /** Where an empty section points instead of disappearing. See `Starred` below. */
  empty?: { to: string }
}

function projectItem(p: Project): NavItem {
  return { label: p.name, to: `/projects/${p.slug}`, icon: `i-lucide-${p.icon || 'folder'}` }
}

export function useNavigation() {
  // One explicit key, so every caller (the layout, All Projects, the star
  // button, the project page) shares this one list and its status. All Projects
  // used to hold a second copy under its own auto-generated key, kept in step by
  // patching its row on every star and refreshing both after every edit.
  const {
    data: projects,
    refresh: refreshProjects,
    status: projectsStatus,
    error: projectsError
  } = useFetch<ProjectListItem[]>('/api/projects', { key: 'projects' })
  const { user } = useUserSession()
  const toast = useToast()
  // Saved calendars sit in the sidebar under their own heading, like starred
  // projects: one click back to "Redaktionskalender".
  const { calendars } = useCalendars()

  const topItems = computed<NavItem[]>(() => [
    // Notifications are not here: the sidebar holds areas you work in, and
    // notifications are a signal, so they are the topbar bell beside the
    // account (handoff `03` › Topbar), at every width.
    { label: 'My Tasks', icon: 'i-lucide-check-square', to: '/my-tasks' },
    { label: 'Calendar', icon: 'i-lucide-calendar-days', to: '/calendar' },
    { label: 'All Projects', icon: 'i-lucide-layout-grid', to: '/projects' },
    // In the top group rather than under Admin: people an admin allows
    // manage their own agents here too, and they have no Admin section.
    ...(user.value?.canManageAgents ? [{ label: 'Agents', icon: 'i-lucide-bot', to: '/agents' }] : [])
  ])

  const adminItems = computed<NavItem[]>(() => user.value?.isAdmin
    ? [
        { label: 'User Management', icon: 'i-lucide-users', to: '/admin/users' },
        { label: 'AI Skills', icon: 'i-lucide-sparkles', to: '/admin/skills' },
        { label: 'Settings', icon: 'i-lucide-settings', to: '/admin/settings' }
      ]
    : [])

  /**
   * Sidebar sections. `label` on a section renders a heading above it — the three
   * groups previously ran together as one flat list, so a project was
   * indistinguishable from a navigation destination.
   *
   * Projects are the *starred* ones only. Listing every project the caller can
   * see made the sidebar 23 rows long on a real install, and admins saw every
   * project on the instance. Every other project is one hop away through All
   * Projects or ⌘K, and the order is the API's, which is alphabetical.
   *
   * The section stays when it is empty, with a line saying how to fill it: on
   * the day this shipped nobody had starred anything, and a heading-less gap
   * where the projects used to be reads as the projects having gone.
   */
  const navSections = computed<NavSection[]>(() => {
    const sections: NavSection[] = [{ items: topItems.value }]

    if (calendars.value?.length) {
      sections.push({
        label: 'Calendars',
        items: calendars.value.map(c => ({ label: c.name, icon: 'i-lucide-calendar-heart', to: `/calendar/${c.id}` }))
      })
    }

    // Not before the first response: an empty-state flash on every load would
    // tell people with stars that they have none.
    if (projects.value) {
      sections.push({
        label: 'Starred',
        items: projects.value.filter(p => p.starred).map(projectItem),
        empty: { to: '/projects' }
      })
    }

    if (adminItems.value.length) {
      sections.push({ label: 'Admin', items: adminItems.value })
    }

    return sections
  })

  /**
   * The command palette's "Go to" group. Built from every project, not from the
   * sidebar: stars decide what is *pinned*, and ⌘K is how you reach everything
   * that is not.
   */
  const paletteItems = computed<NavItem[]>(() => [
    // Not a sidebar row any more, but still a place ⌘K can take you.
    { label: 'Notifications', icon: 'i-lucide-bell', to: '/notifications' },
    ...topItems.value,
    ...(calendars.value ?? []).map(c => ({ label: c.name, icon: 'i-lucide-calendar-heart', to: `/calendar/${c.id}` })),
    ...(projects.value || []).map(projectItem),
    ...adminItems.value
  ])

  /**
   * Star or unstar, patching the shared list first so the sidebar moves on the
   * click. Replaced rather than mutated: `useFetch` data is a shallowRef, so an
   * in-place `starred = true` would change the object and nothing would render.
   * Returns whether the server agreed, so the caller can roll its own copy back.
   */
  async function setStarred(projectId: string, starred: boolean): Promise<boolean> {
    const patch = (value: boolean) => {
      if (!projects.value) return
      projects.value = projects.value.map(p => p.id === projectId ? { ...p, starred: value } : p)
    }
    patch(starred)
    try {
      await $fetch(`/api/projects/${projectId}/star`, { method: starred ? 'PUT' : 'DELETE' })
      return true
    } catch (e) {
      patch(!starred)
      toast.add({
        title: starred ? 'Could not star project' : 'Could not unstar project',
        description: getErrorMessage(e, 'Unknown error'),
        color: 'error'
      })
      return false
    }
  }

  return { navSections, paletteItems, projects, projectsStatus, projectsError, refreshProjects, setStarred }
}
