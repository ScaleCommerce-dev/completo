/**
 * What the tracker interface calls the top-level destinations it shares with
 * the standard one, by first path segment: the tracker's own words for them. The
 * sidebar (`useNavigation`) and the breadcrumb (`UiPage`) both read this, so
 * the breadcrumb and the active sidebar row agree in either interface.
 */
export const TRACKER_NAV_LABELS: Record<string, string> = {
  'notifications': 'Inbox',
  'my-tasks': 'My issues',
  'projects': 'Projects',
  'issues': 'Issues'
}

/** The tracker label of a top-level address such as `/my-tasks`. */
export function trackerNavLabel(to: string): string {
  const segment = to.split('/')[1] ?? ''
  return TRACKER_NAV_LABELS[segment] ?? segment
}
