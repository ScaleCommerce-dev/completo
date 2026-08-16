<script setup lang="ts">
/**
 * The one dialog shell.
 *
 * Eleven UModal call sites had grown four mutually incompatible structures:
 * `#body` only with `header: 'hidden'`, `#body` + `#footer`, a full `#content`
 * override, and — in exactly one place — UModal's own `:title` prop. Six of them
 * overrode `#content`, which discards UModal's panel styling, so each re-declared
 * the panel's radius, background and overflow by hand and then rebuilt the same
 * icon + title + subtitle header underneath. The icon container
 * was 40px and round in three files and 32px with an 8px radius in another; the
 * title was 14px everywhere except one screen where it was 15px.
 *
 * Hiding the header also left every dialog without an accessible name.
 *
 * This uses UModal's real `#header` slot, so the title is announced, Esc and
 * focus trapping behave, and the panel styling comes from app.config.
 *
 * The eleven are not all migrated, and reading this as "the one dialog shell"
 * is how that goes unnoticed. Two consumers so far — `admin/users.vue` and
 * `ui/ConfirmDialog` — against seven raw `<UModal>` sites still hand-rolling the
 * structures above: `CreateViewModal:200`, `ProjectMembers:518`,
 * `ViewConfigModal:373`, `projects/index:317`, `projects/[slug]/index:654` and
 * `admin/skills:192,290`. Several re-commit the exact defects this documents —
 * hand-rebuilt icon+title headers at `admin/skills:192,290` and
 * `ProjectMembers:518`, and `header: 'hidden'` with no accessible name at
 * `ViewConfigModal:373`. That migration is owed; this component is where it
 * lands, not a record that it happened.
 */
const props = withDefaults(defineProps<{
  /** Leading icon. Omit for dialogs whose title carries enough meaning. */
  icon?: string
  title: string
  description?: string
  /** Tints the icon. `error` for destructive, `secondary` for AI surfaces. */
  tone?: 'neutral' | 'primary' | 'error' | 'warning' | 'success' | 'secondary'
  /** sm 400px · md 520px · lg 640px · xl 780px */
  size?: 'sm' | 'md' | 'lg' | 'xl'
  /** Drop the body padding when the content manages its own (e.g. a card form). */
  flush?: boolean
  dismissible?: boolean
}>(), {
  tone: 'neutral',
  size: 'md',
  dismissible: true
})

const open = defineModel<boolean>('open', { required: true })

const WIDTHS = {
  sm: 'sm:max-w-[400px]',
  md: 'sm:max-w-[520px]',
  lg: 'sm:max-w-[640px]',
  xl: 'sm:max-w-[780px]'
}

const TONES = {
  neutral: 'bg-elevated text-toned',
  primary: 'bg-primary/10 text-primary',
  secondary: 'bg-secondary/10 text-secondary',
  error: 'bg-error/10 text-error',
  warning: 'bg-warning/10 text-warning',
  success: 'bg-success/10 text-success'
}

const ui = computed(() => ({
  content: WIDTHS[props.size],
  body: props.flush ? 'p-0' : undefined
}))
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title"
    :description="description"
    :dismissible="dismissible"
    :ui="ui"
  >
    <template
      v-if="$slots.trigger"
      #default
    >
      <slot name="trigger" />
    </template>

    <!-- Overriding #header replaces UModal's default header, which is where the
         close button lives — so it has to be put back explicitly, or the dialog
         has no visible dismiss affordance at all. -->
    <template #header="{ close }">
      <div class="flex items-start gap-3 w-full">
        <div
          v-if="icon"
          class="flex items-center justify-center size-9 rounded-lg shrink-0"
          :class="TONES[tone]"
        >
          <UIcon
            :name="icon"
            class="text-base"
          />
        </div>
        <div class="min-w-0 flex-1">
          <h2 class="text-base font-bold tracking-heading text-highlighted">
            {{ title }}
          </h2>
          <p
            v-if="description"
            class="text-sm text-muted mt-0.5"
          >
            {{ description }}
          </p>
        </div>
        <slot name="header-actions" />
        <UButton
          v-if="dismissible"
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          size="sm"
          aria-label="Close"
          class="shrink-0 -mr-1 -mt-1"
          @click="close"
        />
      </div>
    </template>

    <template #body>
      <slot name="body" />
    </template>

    <template
      v-if="$slots.footer"
      #footer
    >
      <slot name="footer" />
    </template>
  </UModal>
</template>
