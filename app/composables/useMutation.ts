/**
 * Wraps an async operation with standardized error toast handling.
 * Reduces the repetitive try/catch/toast.add pattern across composables.
 */
export function useMutation() {
  const toast = useToast()

  async function mutate<T>(
    fn: () => Promise<T>,
    errorTitle: string
  ): Promise<T> {
    try {
      return await fn()
    } catch (e) {
      toast.add({ title: errorTitle, description: getErrorMessage(e, 'Unknown error'), color: 'error' })
      throw e
    }
  }

  return { mutate, toast }
}
