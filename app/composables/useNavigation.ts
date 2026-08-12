/**
 * Only what `/api/projects` actually returns and this composable actually uses.
 * It previously also declared `boards?: { id, name }[]`, which that endpoint has
 * never returned — it returns `boardCount`. Anything reading it got `undefined`.
 */
interface Project {
  id: string
  name: string
  slug: string
  icon?: string | null
}

export function useNavigation() {
  const { data: projects, refresh: refreshProjects } = useFetch<Project[]>('/api/projects')
  const { user } = useUserSession()

  /**
   * Sidebar sections. `label` on a section renders a heading above it — the three
   * groups previously ran together as one flat list, so a project was
   * indistinguishable from a navigation destination.
   */
  const navSections = computed(() => {
    const sections: Array<{
      label?: string
      items: Array<{ label: string, icon: string, to: string }>
    }> = [
      {
        items: [
          { label: 'My Tasks', icon: 'i-lucide-check-square', to: '/my-tasks' },
          { label: 'All Projects', icon: 'i-lucide-layout-grid', to: '/projects' }
        ]
      }
    ]

    const projectList = projects.value || []
    if (projectList.length > 0) {
      sections.push({
        label: 'Projects',
        items: projectList.map(p => ({
          label: p.name,
          to: `/projects/${p.slug}`,
          icon: `i-lucide-${p.icon || 'folder'}`
        }))
      })
    }

    if (user.value?.isAdmin) {
      sections.push({
        label: 'Admin',
        items: [
          { label: 'User Management', icon: 'i-lucide-users', to: '/admin/users' },
          { label: 'AI Skills', icon: 'i-lucide-sparkles', to: '/admin/skills' },
          { label: 'Settings', icon: 'i-lucide-settings', to: '/admin/settings' }
        ]
      })
    }

    return sections
  })

  /** Flat list, kept for the command palette. */
  const navItems = computed(() => navSections.value.map(s => s.items))

  return { navSections, navItems, projects, refreshProjects }
}
