/**
 * Set the colour mode, and keep it on the account so it survives a reload.
 *
 * `plugins/color-mode-sync.client.ts` applies the account's stored `colorMode` on
 * every start, which is how a choice follows a person between browsers. The
 * topbar switch and the command palette's Theme group only set the local
 * preference, so once the account held a value (any Profile save writes one,
 * `'system'` by default) a switch to Dark lasted until the next reload. Both now
 * come through here.
 */
export function useThemePreference() {
  const colorMode = useColorMode()
  const { loggedIn, fetch: fetchSession } = useUserSession()
  const toast = useToast()

  async function setTheme(mode: 'light' | 'dark' | 'system') {
    colorMode.preference = mode
    if (!loggedIn.value) return
    try {
      await $fetch('/api/user/profile', { method: 'PUT', body: { colorMode: mode } })
      // The session carries `colorMode`, and the sync plugin and the Profile form
      // read it from there.
      await fetchSession()
    } catch (e: unknown) {
      toast.add({ title: 'Could not save your theme', description: getErrorMessage(e, 'It applies until you reload.'), color: 'warning' })
    }
  }

  return { setTheme }
}
