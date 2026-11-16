<script setup lang="ts">
/**
 * A colour dot that opens the palette: the colour control for a new status,
 * column or tag, and for an existing column's colour in view settings.
 *
 * Written out five times as a `UPopover`, a hand-styled round button and a
 * `ColorPicker`, each with its own open flag in the parent.
 */
const props = withDefaults(defineProps<{
  modelValue: string
  /** The dot: `sm` 14px, `md` 16px, `lg` 20px. */
  size?: 'sm' | 'md' | 'lg'
  /** The palette's own size. */
  pickerSize?: 'sm' | 'md'
  label?: string
  /** Close once a colour is picked, for a colour that commits on pick. */
  closeOnPick?: boolean
}>(), {
  size: 'lg',
  pickerSize: 'sm',
  label: 'Choose colour'
})

const emit = defineEmits<{ 'update:modelValue': [color: string] }>()

const open = ref(false)
const SIZES = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' }

function pick(color: string) {
  emit('update:modelValue', color)
  if (props.closeOnPick) open.value = false
}
</script>

<template>
  <UPopover v-model:open="open">
    <button
      type="button"
      :aria-label="label"
      class="rounded-full shrink-0 ring-1 ring-black/10 dark:ring-white/10 hover:ring-2 hover:ring-primary transition"
      :class="SIZES[size]"
      :style="{ backgroundColor: modelValue }"
    />
    <template #content>
      <div class="p-2">
        <ColorPicker
          :model-value="modelValue"
          :size="pickerSize"
          @update:model-value="pick"
        />
      </div>
    </template>
  </UPopover>
</template>
