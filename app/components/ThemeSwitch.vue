<script setup lang="ts">
/**
 * The topbar's theme switch (handoff `03-layout-navigation.md` › Topbar):
 * a 64×36 pill with a 28px thumb that travels `translateX(28px)` over 180ms.
 *
 * A two-state switch, light ↔ dark, because that is what the guideline draws.
 * "System" is still reachable from the command palette's Theme group and from
 * Profile; flipping this switch sets an explicit preference, which is what a
 * person reaching for a visible switch means.
 */
const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

function toggle() {
  colorMode.preference = isDark.value ? 'light' : 'dark'
}
</script>

<template>
  <UTooltip :text="isDark ? 'Switch to light theme' : 'Switch to dark theme'">
    <button
      type="button"
      role="switch"
      :aria-checked="isDark"
      aria-label="Dark theme"
      class="theme-switch"
      @click="toggle"
    >
      <span
        class="theme-switch-thumb"
        :data-on="isDark || undefined"
      >
        <UIcon
          :name="isDark ? 'i-lucide-moon' : 'i-lucide-sun'"
          class="size-4"
        />
      </span>
    </button>
  </UTooltip>
</template>

<style>
/* Not scoped: the thumb's `[data-on]` is set from this component, but the
   shell's colours are custom properties set by `.c2s-shell` on an ancestor. */
.theme-switch {
  position: relative;
  width: 64px;
  height: 36px;
  flex-shrink: 0;
  border-radius: var(--c2s-radius-pill);
  background: var(--c2s-shell-ancestor);
  box-shadow: inset 0 0 0 1px var(--c2s-shell-divider);
}
.theme-switch-thumb {
  position: absolute;
  top: 4px;
  left: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--c2s-radius-pill);
  background: var(--c2s-shell-text-strong);
  color: var(--c2s-shell);
}
.theme-switch-thumb[data-on] {
  transform: translateX(28px);
}
@media (prefers-reduced-motion: no-preference) {
  .theme-switch-thumb {
    transition: transform var(--c2s-duration-fast) ease;
  }
}
</style>
