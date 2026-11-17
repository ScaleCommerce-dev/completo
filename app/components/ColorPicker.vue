<script setup lang="ts">
import { DEFAULT_COLOR, isHexColor } from '#shared/utils/colors'

const props = withDefaults(defineProps<{
  modelValue?: string
  size?: 'sm' | 'md'
}>(), {
  modelValue: DEFAULT_COLOR,
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

function onHexInput(value: string | number) {
  const raw = String(value).trim()
  hexInput.value = raw
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  if (isHexColor(hex)) {
    emit('update:modelValue', hex.toLowerCase())
  }
}

function onHexBlur() {
  const raw = hexInput.value.trim()
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  if (isHexColor(hex)) {
    hexInput.value = hex.toLowerCase()
    // Typing the sixth character already sent it; sending it again on blur was a
    // second PUT for every tag and agent colour typed by hand.
    if (hex.toLowerCase() !== props.modelValue) emit('update:modelValue', hex.toLowerCase())
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
        :aria-label="`Colour ${c}`"
        type="button"
        class="rounded-full hover:scale-125 transition-transform"
        :class="[
          size === 'md' ? 'w-6 h-6' : 'w-5 h-5',
          // One ring colour per state, from the tokens: the resting ring was a
          // hand-kept light/dark pair, and it sat beside `ring-primary` on the
          // selected swatch, two utilities for one property.
          modelValue === c ? (size === 'md' ? 'ring-2 ring-offset-1 ring-offset-bg ring-primary' : 'ring-2 ring-primary') : 'ring-1 ring-default'
        ]"
        :style="{ backgroundColor: c }"
        @click="pickColor(c)"
      />
    </div>
    <div class="flex items-center gap-1.5 pt-0.5">
      <div
        class="w-5 h-5 rounded-full shrink-0 ring-1 ring-default"
        :style="{ backgroundColor: modelValue }"
      />
      <UInput
        :model-value="hexInput"
        aria-label="Hex colour"
        placeholder="#000000"
        maxlength="7"
        size="xs"
        class="flex-1 min-w-0"
        :ui="{ base: 'font-mono' }"
        @update:model-value="onHexInput"
        @blur="onHexBlur"
        @keydown.enter.prevent="onHexBlur"
      />
    </div>
  </div>
</template>
