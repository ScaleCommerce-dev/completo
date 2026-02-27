export default defineNuxtPlugin(() => {
  const { user } = useUserSession()
  const colorMode = useColorMode()

  watch(() => user.value?.colorMode, (mode) => {
    if (mode) {
      colorMode.preference = mode
    }
  }, { immediate: true })
})
