<script setup lang="ts">
const props = defineProps<{
  title: string
  description: string
  tags?: string[]
  priority?: string
  isGenerating: boolean
  error?: string | null
  scope?: 'card' | 'board'
}>()

const emit = defineEmits<{
  generate: [payload: { skillId?: string, userPrompt?: string }]
  cancel: []
}>()

const menuOpen = ref(false)
const customPrompt = ref('')

const { data: skills } = useFetch('/api/skills', {
  query: { scope: props.scope || 'card' },
  default: () => []
})

function handleSkill(skillId: string) {
  menuOpen.value = false
  emit('generate', { skillId })
}

function handleCustomPrompt() {
  if (!customPrompt.value.trim()) return
  menuOpen.value = false
  const prompt = customPrompt.value.trim()
  customPrompt.value = ''
  emit('generate', { userPrompt: prompt })
}
</script>

<template>
  <div class="relative">
    <!-- Generating state: show cancel button -->
    <button
      v-if="isGenerating"
      type="button"
      title="Cancel AI generation"
      class="ai-btn-cancel flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11.5px] font-semibold tracking-wide uppercase text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 ring-1 ring-amber-200 dark:ring-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-950/60 transition-all"
      @mousedown.prevent
      @click="emit('cancel')"
    >
      <UIcon
        name="i-lucide-loader-2"
        class="text-[13px] animate-spin"
      />
      <span>Stop</span>
    </button>

    <!-- Normal state: AI button -->
    <UPopover
      v-else
      v-model:open="menuOpen"
    >
      <button
        type="button"
        title="AI writing assistant"
        class="ai-pill group flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase transition-all"
        :class="error
          ? 'text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 ring-1 ring-red-200 dark:ring-red-800/50 hover:bg-red-100 dark:hover:bg-red-950/50'
          : 'text-white dark:text-white ring-0'"
        @mousedown.prevent
      >
        <UIcon
          name="i-lucide-sparkles"
          class="text-[13px]"
        />
        <span>AI</span>
      </button>

      <template #content>
        <div class="min-w-[220px] max-w-[280px]">
          <!-- Skills list -->
          <div
            v-if="(skills as any[])?.length"
            class="py-1"
          >
            <button
              v-for="skill in (skills as any[])"
              :key="skill.id"
              type="button"
              class="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors text-left"
              @click="handleSkill(skill.id)"
            >
              <UIcon
                name="i-lucide-wand-sparkles"
                class="text-[14px] text-violet-500 shrink-0"
              />
              <span class="font-medium truncate">{{ skill.name }}</span>
            </button>
          </div>

          <!-- Divider -->
          <div
            v-if="(skills as any[])?.length"
            class="border-t border-zinc-100 dark:border-zinc-700/50"
          />

          <!-- Free-text input -->
          <div class="px-2.5 py-2">
            <div class="flex items-center gap-1.5">
              <input
                v-model="customPrompt"
                type="text"
                placeholder="Custom prompt..."
                class="flex-1 min-w-0 px-2.5 py-1.5 text-[13px] text-zinc-700 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-700/50 border border-zinc-200 dark:border-zinc-600/50 rounded-lg outline-none focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors"
                @keydown.enter.prevent="handleCustomPrompt"
                @keydown.stop
              >
              <button
                type="button"
                class="p-1.5 rounded-lg text-zinc-400 dark:text-zinc-500 hover:text-indigo-500 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="!customPrompt.trim()"
                @click="handleCustomPrompt"
              >
                <UIcon
                  name="i-lucide-send"
                  class="text-[14px]"
                />
              </button>
            </div>
          </div>

          <!-- Error feedback -->
          <div
            v-if="error"
            class="px-3 py-2 text-[11px] text-red-500 dark:text-red-400 border-t border-zinc-100 dark:border-zinc-700/50"
          >
            {{ error }}
          </div>
        </div>
      </template>
    </UPopover>
  </div>
</template>

<style scoped>
@keyframes gradient-shift {
  0% {
    background-position: 0% 50%;
  }
  50% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.ai-pill:not(.text-red-500) {
  background: linear-gradient(-45deg, #7c3aed, #a855f7, #6366f1, #8b5cf6, #c084fc, #7c3aed);
  background-size: 300% 300%;
  animation: gradient-shift 6s ease infinite;
}

.ai-pill:not(.text-red-500):hover {
  animation-duration: 2s;
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.35);
}
</style>
