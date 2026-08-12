<script setup lang="ts">
/**
 * A bordered stack of label/control rows, divided by hairlines.
 *
 * The container class string was duplicated in five files (ProjectForm,
 * CreateViewModal, ProfileSecurity, ProfileSettings, ProfileTokens) and the rows
 * inside it were `<span>` pseudo-labels rather than real ones, with the label
 * width hardcoded per file.
 */
</script>

<template>
  <div class="rounded-lg border border-default divide-y divide-default overflow-hidden">
    <slot />
  </div>
</template>
