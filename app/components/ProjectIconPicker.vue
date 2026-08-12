<script setup lang="ts">
const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const showIconPicker = ref(false)
const iconFilter = ref('')

const filteredIcons = computed(() => {
  if (!iconFilter.value) return PROJECT_ICONS as readonly string[]
  const q = iconFilter.value.toLowerCase()
  return ALL_LUCIDE_ICONS.filter(i => i.includes(q))
})

function selectIcon(name: string) {
  emit('update:modelValue', name)
  showIconPicker.value = false
  iconFilter.value = ''
}

function applyFilterAsIcon() {
  const cleaned = iconFilter.value.trim().toLowerCase().replace(/^i-lucide-/, '')
  if (cleaned) {
    emit('update:modelValue', cleaned)
    showIconPicker.value = false
    iconFilter.value = ''
  }
}
</script>

<template>
  <div class="bg-default">
    <div
      class="flex items-center px-3 py-2.5 cursor-pointer hover:bg-muted transition-colors"
      @click="showIconPicker = !showIconPicker"
    >
      <div class="flex items-center gap-2 w-28 shrink-0">
        <UIcon
          name="i-lucide-smile"
          class="text-sm text-dimmed"
        />
        <span class="text-sm font-medium text-muted">Icon</span>
      </div>
      <div class="flex-1 flex items-center gap-2.5">
        <UIcon
          :name="`i-lucide-${props.modelValue}`"
          class="text-lg text-default"
        />
        <span class="text-base font-medium text-toned">{{ props.modelValue }}</span>
        <span class="ml-auto text-xs font-semibold text-primary transition-colors">
          {{ showIconPicker ? 'Close' : 'Change' }}
        </span>
      </div>
    </div>
    <!-- Icon picker panel -->
    <div
      v-if="showIconPicker"
      class="px-3 pb-3 space-y-2.5"
    >
      <input
        v-model="iconFilter"
        type="text"
        placeholder="Search or type any icon name..."
        class="w-full text-sm text-toned placeholder-zinc-300 dark:placeholder-zinc-600 bg-muted border border-default rounded-md px-2.5 py-1.5 outline-none focus:border-primary transition-colors"
        @keydown.enter.prevent="applyFilterAsIcon"
      >
      <!-- Bounded and scrollable: an unfiltered list is 50 icons (~7 rows), but typing in
           the filter searches all ~1770 Lucide names, so the grid would otherwise grow to
           over a hundred rows and push the form's action bar out of the modal. -->
      <div class="grid grid-cols-8 gap-1 max-h-56 overflow-y-auto">
        <button
          v-for="ic in filteredIcons"
          :key="ic"
          type="button"
          class="flex items-center justify-center w-full aspect-square rounded-md transition-all"
          :class="props.modelValue === ic
            ? 'bg-primary/15 bg-primary/20 text-primary ring-1 ring-primary ring-primary/50'
            : 'text-muted hover:bg-elevated hover:text-default'"
          :title="ic"
          @click.stop="selectIcon(ic)"
        >
          <UIcon
            :name="`i-lucide-${ic}`"
            class="text-lg"
          />
        </button>
      </div>
      <div
        v-if="filteredIcons.length === 0"
        class="text-center py-2 text-xs text-dimmed"
      >
        No matching icons — press Enter to use "{{ iconFilter }}"
      </div>
      <p class="text-xs text-dimmed">
        Can't find what you need? Find a name on
        <a
          href="https://lucide.dev/icons"
          target="_blank"
          class="text-primary hover:text-primary"
        >lucide.dev/icons<UIcon
          name="i-lucide-external-link"
          class="text-2xs ml-0.5 inline-block align-[1px]"
        /></a>
      </p>
    </div>
  </div>
</template>
