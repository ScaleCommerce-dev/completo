<script setup lang="ts">
definePageMeta({ layout: 'default' })

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
  <div class="flex items-start justify-center px-6 pt-[8vh]">
    <div class="w-full max-w-[520px]">
      <!-- Header with icon -->
      <div class="flex items-center gap-3 mb-6">
        <div class="flex items-center justify-center w-9 h-9 rounded-lg bg-primary/10 bg-primary/15">
          <UIcon
            name="i-lucide-folder-plus"
            class="text-lg text-primary"
          />
        </div>
        <div>
          <h1 class="text-lg font-bold tracking-[-0.02em] text-highlighted">
            New Project
          </h1>
          <p class="text-sm text-dimmed">
            Create a project to organize your boards
          </p>
        </div>
      </div>

      <ProjectForm
        mode="create"
        :loading="loading"
        :error="error"
        @submit="handleSubmit"
        @cancel="navigateTo('/projects')"
      />
    </div>
  </div>
</template>
