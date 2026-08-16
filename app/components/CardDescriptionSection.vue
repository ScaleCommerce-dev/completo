<script setup lang="ts">
import type { Member } from '~/types/card'

/**
 * The card's description, in all three of its states: editing, written, empty.
 *
 * The panel and the full card page are two presentations of one record, so this
 * block existed twice — around 90 lines of template each, byte-identical down to
 * the `pr-16` that keeps prose clear of the absolutely-positioned actions. The
 * tell that it had drifted out of anyone's control was in the tests:
 * `card-editors.test.ts` asserted that three files carry the *same class string*,
 * a guard that can only exist because the markup lives in three places. With one
 * component that assertion becomes structural — the row is spelled once — and
 * what the guard still checks is the genuinely separate third copy, the collapsed
 * comment composer, which is a different component that has to agree.
 *
 * What differs between the two surfaces stays a prop, because each difference is
 * a real decision rather than drift: the panel caps the editor at 360px because
 * it sits in a scrolling column beside other sections, while the page gives it
 * 240px of floor and no ceiling; and only the page shows a pending state on
 * Save, because only there is Save the request rather than a local commit.
 *
 * State stays with the callers. Both own a draft (`useTextDraft`), a dirty
 * comparison and a save that means different things — a PUT on the page, a
 * deferred commit in the panel — and pulling those in here would make this
 * component the thing that knows how a card is saved.
 */
withDefaults(defineProps<{
  editing: boolean
  /** A draft came back from localStorage, so the notice offers to discard it. */
  restored: boolean
  /** Save is only offered for text that differs from what the server holds. */
  dirty: boolean
  /** Page-only: Save is the request there, so it can be in flight. */
  saving?: boolean
  copied: boolean
  minHeight: number
  maxHeight?: number
  /** Context the editor needs for AI writing and @-mentions. */
  title: string
  tags: string[]
  priority: string
  projectSlug?: string
  projectKey?: string
  members?: Member[]
  cardId?: number
}>(), {
  saving: false
})

const description = defineModel<string>({ required: true })

const emit = defineEmits<{
  save: []
  cancel: []
  edit: []
  copy: []
}>()

const editorRef = ref<{ startEditing: () => void }>()

/** Both callers focus the editor after opening it — see their `startEditing`. */
defineExpose({ startEditing: () => editorRef.value?.startEditing() })
</script>

<template>
  <div v-if="editing">
    <UiDraftNotice
      v-if="restored"
      class="mb-1.5"
      @discard="emit('cancel')"
    />

    <DescriptionEditor
      ref="editorRef"
      v-model="description"
      :title="title"
      :tags="tags"
      :priority="priority"
      :project-slug="projectSlug"
      :project-key="projectKey"
      :members="members"
      :card-id="cardId"
      :min-height="minHeight"
      :max-height="maxHeight"
      @escape="emit('cancel')"
    />

    <!-- The description's own commit, under the editor it belongs to. Same shape
         as the comment composer's, because they are the same act: write prose,
         then decide to keep it — and now literally the same component, which is
         what makes "same shape" true rather than aspirational. -->
    <UiCommitRow
      class="mt-2"
      :loading="saving"
      :disabled="!dirty"
      @submit="emit('save')"
      @cancel="emit('cancel')"
    />
  </div>

  <!--
    No heading over the card's own body.

    "DESCRIPTION" labelled the one thing on the panel that needs no label — it is
    what the card *is*, sitting directly under the title — while the two headings
    below it label collections that grow and are worth counting. Three peer
    headings said the three regions were peers; they are a body and two
    appendices, and the hierarchy now says so.

    No inner scroll box either. The surface already scrolls, and a scroll area
    nested inside one traps the wheel over whichever half you happen to point at.
  -->
  <div
    v-else-if="description"
    class="relative"
  >
    <!-- Where the heading's actions were, minus the heading. Absolute, so the row
         costs no height; the prose is padded clear of it rather than running
         underneath. Always rendered, never hover-only: with click-to-edit gone
         the pencil is the only way in, and an affordance you have to find by
         sweeping the surface is not one. -->
    <div class="absolute top-0 right-0 flex items-center gap-0.5">
      <UTooltip :text="copied ? 'Copied!' : 'Copy as Markdown'">
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          color="neutral"
          variant="ghost"
          size="xs"
          :class="copied ? 'text-success!' : ''"
          aria-label="Copy the description as Markdown"
          @click="emit('copy')"
        />
      </UTooltip>
      <UTooltip text="Edit description">
        <UButton
          icon="i-lucide-pencil"
          color="neutral"
          variant="ghost"
          size="xs"
          aria-label="Edit the description"
          @click="emit('edit')"
        />
      </UTooltip>
    </div>

    <div class="select-text pr-16">
      <ProseDescription :content="description" />
    </div>
  </div>

  <!-- Empty: the placeholder is the button, the label and the empty state at
       once. Solid-bordered and icon-led, the same row the collapsed comment
       composer is — the icon is the one the deleted heading carried, doing more
       work here than it did there. -->
  <button
    v-else
    type="button"
    class="w-full flex items-center gap-2.5 rounded-lg border border-default bg-default px-3 py-2 text-left hover:bg-muted transition-colors"
    @click="emit('edit')"
  >
    <UIcon
      name="i-lucide-text"
      class="text-base text-dimmed shrink-0"
    />
    <span class="text-sm text-dimmed">Add a description…</span>
  </button>
</template>
