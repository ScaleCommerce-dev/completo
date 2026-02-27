<script setup lang="ts">
const props = withDefaults(defineProps<{
  modelValue?: string
  size?: 'sm' | 'md'
}>(), {
  modelValue: '#6366f1',
  size: 'sm'
})

const emit = defineEmits<{
  'update:modelValue': [color: string]
}>()

const hexInput = ref(props.modelValue)

watch(() => props.modelValue, (v) => {
  hexInput.value = v
})

function pickColor(color: string) {
  emit('update:modelValue', color)
}

function onHexInput(e: Event) {
  const raw = (e.target as HTMLInputElement).value.trim()
  hexInput.value = raw
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    emit('update:modelValue', hex.toLowerCase())
  }
}

function onHexBlur() {
  const raw = hexInput.value.trim()
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) {
    hexInput.value = hex.toLowerCase()
    emit('update:modelValue', hex.toLowerCase())
  } else {
    hexInput.value = props.modelValue
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="grid grid-cols-4 gap-1.5">
      <button
        v-for="c in COLOR_PALETTE"
        :key="c"
        type="button"
        class="rounded-full ring-1 ring-black/10 dark:ring-white/10 hover:scale-125 transition-transform"
        :class="[
          size === 'md' ? 'w-6 h-6' : 'w-5 h-5',
          modelValue === c ? (size === 'md' ? 'ring-2 ring-offset-1 ring-offset-white dark:ring-offset-zinc-800 ring-indigo-500' : 'ring-2 ring-indigo-500') : ''
        ]"
        :style="{ backgroundColor: c }"
        @click="pickColor(c)"
      />
    </div>
    <div class="flex items-center gap-1.5 pt-0.5">
      <div
        class="w-5 h-5 rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10"
        :style="{ backgroundColor: modelValue }"
      />
      <input
        :value="hexInput"
        type="text"
        placeholder="#000000"
        maxlength="7"
        class="flex-1 min-w-0 text-[12px] font-mono text-zinc-700 dark:text-zinc-300 placeholder-zinc-300 dark:placeholder-zinc-600 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/50 rounded-md px-2 py-1 outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors"
        @input="onHexInput"
        @blur="onHexBlur"
        @keydown.enter.prevent="onHexBlur"
      >
    </div>
  </div>
</template>
