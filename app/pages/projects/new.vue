<script setup lang="ts">
definePageMeta({ layout: 'default' })
useSeoMeta({ title: 'New project · Completo' })

const loading = ref(false)
const error = ref('')
const { refreshProjects } = useNavigation()

async function handleSubmit(data: Record<string, unknown>) {
  loading.value = true
  error.value = ''
  try {
    const project = await $fetch<{ slug: string }>('/api/projects', {
      method: 'POST',
      body: data
    })
    await refreshProjects()
    await navigateTo(`/projects/${project.slug}`)
  } catch (e: unknown) {
    error.value = getErrorMessage(e, 'Failed to create project')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UiPage
    title="New project"
    description="A project owns its statuses, tags and cards"
    width="narrow"
  >
    <template #leading>
      <UButton
        to="/projects"
        icon="i-lucide-arrow-left"
        variant="ghost"
        color="neutral"
        aria-label="Back to projects"
      />
    </template>

    <ProjectForm
      mode="create"
      :loading="loading"
      :error="error"
      @submit="handleSubmit"
      @cancel="navigateTo('/projects')"
    />
  </UiPage>
</template>
