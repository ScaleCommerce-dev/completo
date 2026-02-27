<script setup lang="ts">
withDefaults(defineProps<{
  name: string
  color: string
  size?: 'sm' | 'lg'
}>(), {
  size: 'sm'
})
</script>

<template>
  <span
    class="tag-pill inline-flex items-center rounded-full font-bold leading-none tracking-wide uppercase"
    :class="size === 'sm' ? 'px-1.5 py-[2px] text-[10.5px]' : 'px-2.5 py-1 text-[11px]'"
    :style="{
      color,
      backgroundColor: color + '25',
      boxShadow: `inset 0 0 0 1px ${color}40`
    }"
  >
    <slot>{{ name }}</slot>
  </span>
</template>
