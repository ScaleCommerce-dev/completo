<script setup lang="ts">
definePageMeta({ layout: 'default' })

const loading = ref(false)
const error = ref('')
const { refreshProjects } = useNavigation()

async function handleSubmit(data: Record<string, any>) {
  loading.value = true
  error.value = ''
  try {
    const project = await $fetch('/api/projects', {
      method: 'POST',
      body: data
    }) as any
    await refreshProjects()
    await navigateTo(`/projects/${project.slug}`)
  } catch (e: any) {
    error.value = e?.data?.message || 'Failed to create project'
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
        <div class="flex items-center justify-center w-9 h-9 rounded-[10px] bg-indigo-500/10 dark:bg-indigo-500/15">
          <UIcon name="i-lucide-folder-plus" class="text-[18px] text-indigo-500" />
        </div>
        <div>
          <h1 class="text-[16px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">New Project</h1>
          <p class="text-[13px] text-zinc-400 dark:text-zinc-500">Create a project to organize your boards</p>
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
