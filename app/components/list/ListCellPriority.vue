<script setup lang="ts">
const props = defineProps<{
  priority: string
  popoverOpen: boolean
}>()

const emit = defineEmits<{
  'select': [priority: string]
  'update:popoverOpen': [open: boolean]
}>()

const label = computed(() => priorityLabel(props.priority))
</script>

<template>
  <UPopover
    :open="popoverOpen"
    @update:open="emit('update:popoverOpen', $event)"
  >
    <!-- A button, not a div: this was one of five inline list editors that were
         unreachable by keyboard because the popover trigger had no tabindex. -->
    <button
      type="button"
      :aria-label="`Priority: ${label}. Change priority`"
      class="flex items-center gap-1 text-sm font-medium rounded-md px-1 -mx-1 hover:bg-elevated transition-colors cursor-pointer"
      :class="[priorityTextClass(priority), priority === 'urgent' ? 'priority-urgent-pulse' : '']"
      @click.stop
    >
      <UIcon
        :name="priorityIcon(priority)"
        class="text-sm"
      />
      <span>{{ label }}</span>
      <UIcon
        name="i-lucide-chevron-down"
        class="text-2xs shrink-0 opacity-0 group-hover:opacity-60 transition-opacity"
      />
    </button>
    <template #content>
      <div class="py-1 min-w-[140px]">
        <button
          v-for="p in PRIORITIES"
          :key="p.value"
          type="button"
          class="flex items-center gap-2 w-full px-2.5 py-1.5 text-left text-sm font-medium transition-colors"
          :class="[
            priorityTextClass(p.value),
            priority === p.value ? 'bg-primary/10' : 'hover:bg-elevated'
          ]"
          @click="emit('select', p.value)"
        >
          <UIcon
            :name="p.icon"
            class="text-sm shrink-0"
          />
          <span class="flex-1">{{ p.label }}</span>
          <UIcon
            v-if="priority === p.value"
            name="i-lucide-check"
            class="text-sm shrink-0 text-primary"
          />
        </button>
      </div>
    </template>
  </UPopover>
</template>
