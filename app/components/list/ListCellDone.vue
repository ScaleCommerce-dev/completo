<script setup lang="ts">
defineProps<{
  isDone: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  toggle: []
}>()
</script>

<template>
  <div
    class="flex items-center justify-center"
    @click.stop
  >
    <button
      type="button"
      class="flex items-center justify-center w-[18px] h-[18px] rounded border transition-all"
      :class="isDone
        ? 'bg-emerald-500 border-emerald-500 text-white'
        : 'border-zinc-300 dark:border-zinc-600 hover:border-zinc-400 dark:hover:border-zinc-500 text-transparent'"
      :disabled="disabled"
      @click="emit('toggle')"
    >
      <UIcon
        v-if="isDone"
        name="i-lucide-check"
        class="text-[13px]"
      />
    </button>
  </div>
</template>
