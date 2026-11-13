/**
 * Only what `/api/projects` actually returns and this composable actually uses.
 * It previously also declared `boards?: { id, name }[]`, which that endpoint has
 * never returned — it returns `boardCount`. Anything reading it got `undefined`.
 */
interface Project {
  id: string
  name: string
  slug: string
  /** Prefixes ticket ids (`KEY-42`); the New issue dialog names a created issue by it. */
  key: string
  icon?: string | null
  starred: boolean
  /** The workspace's manual order, which the tracker interface lists by. */
  position: number
}

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
  // One call site, so one `useFetch` key: every caller of this composable —
  // the layout, All Projects, the star button — shares this `projects` ref,
  // which is what lets a star show up in the sidebar without a refetch.
  const { data: projects, refresh: refreshProjects } = useFetch<Project[]>('/api/projects')
  const { user } = useUserSession()
  const toast = useToast()

  const { isTracker } = useWorkspaceSettings()

  /**
   * The tracker interface names and orders its destinations as an issue
   * tracker does: Inbox and My issues for the signed-in person, then the workspace
   * (Projects, and Issues across every project, which only this interface
   * has). Same addresses, so the active-row and unread logic in the layout
   * hold unchanged; `UiPage` takes its breadcrumb labels from `trackerNavLabel`.
   */
  const trackerTopItems = computed<NavItem[]>(() => [
    { label: trackerNavLabel('/notifications'), icon: 'i-lucide-inbox', to: '/notifications' },
    { label: trackerNavLabel('/my-tasks'), icon: 'i-lucide-circle-user-round', to: '/my-tasks' }
  ])
  const trackerWorkspaceItems = computed<NavItem[]>(() => [
    { label: trackerNavLabel('/projects'), icon: 'i-lucide-box', to: '/projects' },
    { label: trackerNavLabel('/issues'), icon: 'i-lucide-copy', to: '/issues' },
    ...(user.value?.canManageAgents ? [{ label: 'Agents', icon: 'i-lucide-bot', to: '/agents' }] : [])
  ])

  const topItems = computed<NavItem[]>(() => [
    // Here, not in the page header: they are the signed-in person's, on every
    // page, and in the header they sat between a project's name and its
    // Settings as if they belonged to the project. The unread count is added
    // by the layout, which owns the poll.
    { label: 'Notifications', icon: 'i-lucide-bell', to: '/notifications' },
    { label: 'My Tasks', icon: 'i-lucide-check-square', to: '/my-tasks' },
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
  const navSections = computed<NavSection[]>(() => isTracker.value ? trackerSections() : standardSections())

  /**
   * The tracker interface's sidebar. Favorites are the starred projects, the
   * same stars as above, listed in the workspace's manual order (admins drag
   * it on the Projects page) rather than alphabetically.
   */
  function trackerSections(): NavSection[] {
    const sections: NavSection[] = [
      { items: trackerTopItems.value },
      { label: 'Workspace', items: trackerWorkspaceItems.value }
    ]
    if (projects.value) {
      sections.push({
        label: 'Favorites',
        items: projects.value.filter(p => p.starred).sort((a, b) => a.position - b.position).map(projectItem),
        empty: { to: '/projects' }
      })
    }
    if (adminItems.value.length) sections.push({ label: 'Admin', items: adminItems.value })
    return sections
  }

  function standardSections(): NavSection[] {
    const sections: NavSection[] = [{ items: topItems.value }]

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
  }

  /**
   * The command palette's "Go to" group. Built from every project, not from the
   * sidebar: stars decide what is *pinned*, and ⌘K is how you reach everything
   * that is not.
   */
  const paletteItems = computed<NavItem[]>(() => [
    ...(isTracker.value ? [...trackerTopItems.value, ...trackerWorkspaceItems.value] : topItems.value),
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

  return { navSections, paletteItems, projects, refreshProjects, setStarred }
}
