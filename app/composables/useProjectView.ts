/**
 * How the tracker interface last showed a project's issues, in this browser:
 * as the list (the project page's Issues tab) or on its board. Read by the
 * project page to open the project that way, written by `TrackerViewToggle`.
 */
export function useProjectView(projectSlug: string) {
  return useLocalPref<'list' | 'board'>(`tracker:project-view:${projectSlug}`, 'list')
}

/** The board a project's Board opens: its first board in the project's own order. */
export function firstBoardPath(projectSlug: string, boards: Array<{ id: string, slug: string, position: number }> | undefined): string | null {
  const board = [...(boards ?? [])].sort((a, b) => a.position - b.position)[0]
  return board ? `/projects/${projectSlug}/boards/${board.slug || board.id}` : null
}
