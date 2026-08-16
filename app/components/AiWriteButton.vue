<script setup lang="ts">
const props = defineProps<{
  title: string
  description: string
  tags?: string[]
  priority?: string
  isGenerating: boolean
  error?: string | null
  scope?: AiSkillScope
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
    <UTooltip
      v-if="isGenerating"
      text="Cancel AI generation"
    >
      <button
        type="button"
        class="ai-btn-cancel flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold tracking-wide uppercase text-warning bg-warning/10 ring-1 ring-warning/30 hover:bg-warning/20 transition-colors"
        @mousedown.prevent
        @click="emit('cancel')"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="text-sm animate-spin"
        />
        <span>Stop</span>
      </button>
    </UTooltip>

    <!-- Normal state: AI button -->
    <UPopover
      v-else
      v-model:open="menuOpen"
    >
      <UTooltip text="AI writing assistant">
        <button
          type="button"
          class="ai-pill group flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold tracking-wide uppercase transition-colors"
          :class="error
            ? 'text-error bg-error/10 ring-1 ring-error/30 hover:bg-error/20'
            : 'text-white ring-0'"
          @mousedown.prevent
        >
          <UIcon
            name="i-lucide-sparkles"
            class="text-sm"
          />
          <span>AI</span>
        </button>
      </UTooltip>

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
              class="w-full flex items-center gap-2 px-3 py-2 text-sm text-default hover:bg-elevated transition-colors text-left"
              @click="handleSkill(skill.id)"
            >
              <UIcon
                name="i-lucide-wand-sparkles"
                class="text-base text-secondary shrink-0"
              />
              <span class="font-medium truncate">{{ skill.name }}</span>
            </button>
          </div>

          <!-- Divider -->
          <div
            v-if="(skills as any[])?.length"
            class="border-t border-muted"
          />

          <!-- Free-text input -->
          <div class="px-2.5 py-2">
            <div class="flex items-center gap-1.5">
              <input
                v-model="customPrompt"
                type="text"
                aria-label="Custom AI prompt"
                placeholder="Custom prompt..."
                class="flex-1 min-w-0 px-2.5 py-1.5 text-sm text-default placeholder:text-dimmed bg-muted border border-default rounded-lg transition-colors"
                @keydown.enter.prevent="handleCustomPrompt"
                @keydown.stop
              >
              <button
                type="button"
                class="p-1.5 rounded-lg text-dimmed hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                :disabled="!customPrompt.trim()"
                @click="handleCustomPrompt"
              >
                <UIcon
                  name="i-lucide-send"
                  class="text-base"
                />
              </button>
            </div>
          </div>

          <!-- Error feedback -->
          <div
            v-if="error"
            class="px-3 py-2 text-xs text-error border-t border-muted"
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

.ai-pill:not(.text-error) {
  background: linear-gradient(-45deg, #7c3aed, #a855f7, #6366f1, #8b5cf6, #c084fc, #7c3aed);
  background-size: 300% 300%;
  animation: gradient-shift 6s ease infinite;
}

.ai-pill:not(.text-error):hover {
  animation-duration: 2s;
  box-shadow: 0 0 16px rgba(139, 92, 246, 0.35);
}
</style>
