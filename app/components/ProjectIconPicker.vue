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
  <div class="bg-white dark:bg-zinc-800/50">
    <div
      class="flex items-center px-3 py-2.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
      @click="showIconPicker = !showIconPicker"
    >
      <div class="flex items-center gap-2 w-28 shrink-0">
        <UIcon
          name="i-lucide-smile"
          class="text-sm text-zinc-400"
        />
        <span class="text-[13px] font-medium text-zinc-500 dark:text-zinc-400">Icon</span>
      </div>
      <div class="flex-1 flex items-center gap-2.5">
        <UIcon
          :name="`i-lucide-${props.modelValue}`"
          class="text-[16px] text-zinc-700 dark:text-zinc-200"
        />
        <span class="text-[14px] font-medium text-zinc-600 dark:text-zinc-300">{{ props.modelValue }}</span>
        <span class="ml-auto text-[12px] font-semibold text-indigo-500 dark:text-indigo-400 transition-colors">
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
        class="w-full text-[13px] text-zinc-600 dark:text-zinc-300 placeholder-zinc-300 dark:placeholder-zinc-600 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/50 rounded-md px-2.5 py-1.5 outline-none focus:border-indigo-300 dark:focus:border-indigo-600 transition-colors"
        @keydown.enter.prevent="applyFilterAsIcon"
      >
      <div class="grid grid-cols-8 gap-1">
        <button
          v-for="ic in filteredIcons"
          :key="ic"
          type="button"
          class="flex items-center justify-center w-full aspect-square rounded-md transition-all"
          :class="props.modelValue === ic
            ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-300 dark:ring-indigo-500/50'
            : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50 hover:text-zinc-700 dark:hover:text-zinc-200'"
          :title="ic"
          @click.stop="selectIcon(ic)"
        >
          <UIcon
            :name="`i-lucide-${ic}`"
            class="text-[16px]"
          />
        </button>
      </div>
      <div
        v-if="filteredIcons.length === 0"
        class="text-center py-2 text-[12px] text-zinc-400"
      >
        No matching icons — press Enter to use "{{ iconFilter }}"
      </div>
      <p class="text-[12px] text-zinc-400 dark:text-zinc-500">
        Can't find what you need? Find a name on
        <a
          href="https://lucide.dev/icons"
          target="_blank"
          class="text-indigo-500 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-300"
        >lucide.dev/icons<UIcon
          name="i-lucide-external-link"
          class="text-[9px] ml-0.5 inline-block align-[1px]"
        /></a>
      </p>
    </div>
  </div>
</template>
