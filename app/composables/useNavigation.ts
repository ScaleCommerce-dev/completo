interface Project {
  id: string
  name: string
  slug: string
  icon?: string | null
  boards?: { id: string, name: string }[]
}

export function useNavigation() {
  const { data: projects, refresh: refreshProjects } = useFetch<Project[]>('/api/projects')
  const { user } = useUserSession()

  const navItems = computed(() => {
    const sections: any[][] = [
      [
        {
          label: 'My Tasks',
          icon: 'i-lucide-check-square',
          to: '/my-tasks'
        },
        {
          label: 'All Projects',
          icon: 'i-lucide-layout-grid',
          to: '/projects'
        }
      ]
    ]

    const projectList = projects.value || []
    if (projectList.length > 0) {
      sections.push(
        projectList.map((p: any) => ({
          label: p.name,
          to: `/projects/${p.slug}`,
          icon: `i-lucide-${p.icon || 'folder'}`
        }))
      )
    }

    if (user.value?.isAdmin) {
      sections.push([
        {
          label: 'User Management',
          icon: 'i-lucide-users',
          to: '/admin/users'
        },
        {
          label: 'AI Skills',
          icon: 'i-lucide-sparkles',
          to: '/admin/skills'
        },
        {
          label: 'Settings',
          icon: 'i-lucide-settings',
          to: '/admin/settings'
        }
      ])
    }

    return sections
  })

  return { navItems, projects, refreshProjects }
}
