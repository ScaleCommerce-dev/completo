<script setup lang="ts">
import type { ApiToken } from '~/composables/useApiTokens'

/**
 * A token list with its create form and one-time reveal: the profile's own tokens
 * and an agent's, through `useApiTokens`.
 *
 * It was written out twice, once in `ProfileTokens` and once on the agent page, and
 * the copies had drifted: different expiry choices, a raw Dismiss beside a
 * `UButton` one, an unused token showing nothing on one page and "Not used yet" on
 * the other. The differences that are real (the wording, the verb, what the reveal
 * offers next) are props and a slot; the rest is this one block.
 */
const props = withDefaults(defineProps<{
  /** Where tokens are listed and created; the caller's own by default. */
  endpoint?: string
  /** A list the caller already holds, with how to reload it (an agent's). */
  list?: { tokens: Readonly<Ref<ApiToken[]>>, reload: () => Promise<unknown> }
  title?: string
  placeholder?: string
  createLabel?: string
  /** "Delete" for your own tokens, "Revoke" for an agent's. */
  verb?: 'Delete' | 'Revoke'
  emptyText?: string
  /** Shown in place of the create form, when no token may be created. */
  blocked?: string | null
  showCount?: boolean
}>(), {
  title: 'API tokens',
  placeholder: 'Token name (e.g. CI Pipeline)',
  createLabel: 'Create',
  verb: 'Delete',
  emptyText: 'No API tokens yet',
  blocked: null
})

defineSlots<{
  /** What the tokens are for, under the heading. */
  default(): unknown
  /** Shown with the one-time reveal, for the token just created. */
  created(props: { token: string }): unknown
}>()

const {
  tokens,
  tokenName,
  tokenExpiry,
  tokenLoading,
  createdToken,
  createdTokenName,
  tokenCopied,
  deletingTokenId,
  createToken,
  copyToken,
  startDeleteToken,
  cancelDeleteToken,
  confirmDeleteToken,
  formatTokenDate
} = useApiTokens({ endpoint: props.endpoint, list: props.list })

const EXPIRY = [
  { value: '', label: 'No expiry' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' }
]

// A token revealed a moment ago is revoked with the rest when creating is blocked
// (an agent suspended), so the reveal goes with it.
watch(() => props.blocked, (b) => {
  if (b) createdToken.value = null
})

const nameInput = useTemplateRef<HTMLInputElement>('nameInput')
defineExpose({ focus: () => nameInput.value?.focus() })
</script>

<template>
  <div class="rounded-xl border border-default bg-default shadow-raise overflow-hidden">
    <div class="px-card pt-4 pb-2 flex items-center gap-2">
      <UIcon
        name="i-lucide-key-round"
        class="text-base text-dimmed"
      />
      <UiSectionLabel :label="title" />
      <span
        v-if="showCount"
        class="ml-auto c2s-count"
      >{{ tokens.length }}</span>
    </div>

    <div class="px-card pb-3">
      <p class="text-sm text-dimmed leading-relaxed">
        <slot />
      </p>
    </div>

    <p
      v-if="blocked"
      class="mx-card rounded-lg border border-default bg-muted px-3 py-2.5 text-sm text-muted"
    >
      {{ blocked }}
    </p>
    <div
      v-else
      class="mx-card rounded-lg border border-default overflow-hidden"
    >
      <div
        data-focus-field="inset"
        class="flex items-center gap-2 px-3 py-2.5 bg-default border-b border-transparent"
      >
        <input
          ref="nameInput"
          v-model="tokenName"
          type="text"
          aria-label="Token name"
          :placeholder="placeholder"
          maxlength="100"
          class="flex-1 min-w-0 text-base text-highlighted placeholder:text-dimmed bg-transparent border-0"
          @keydown.enter.prevent="createToken"
        >
        <select
          v-model="tokenExpiry"
          aria-label="Token expiry"
          class="text-sm text-muted bg-transparent border-0 cursor-pointer"
        >
          <option
            v-for="o in EXPIRY"
            :key="o.value"
            :value="o.value"
          >
            {{ o.label }}
          </option>
        </select>
        <UButton
          :label="createLabel"
          icon="i-lucide-plus"
          class="shrink-0"
          :disabled="!tokenName.trim()"
          :loading="tokenLoading"
          @click="createToken"
        />
      </div>
    </div>

    <!-- One-time reveal -->
    <div
      v-if="createdToken"
      class="mx-card mt-3 rounded-lg border border-success/30 bg-success/5 p-3"
    >
      <div class="flex items-center gap-2 mb-2">
        <UIcon
          name="i-lucide-check-circle"
          class="text-base text-success shrink-0"
        />
        <span class="text-sm font-medium text-success">Token "{{ createdTokenName }}" created. Copy it now, it won't be shown again.</span>
      </div>
      <div class="flex items-center gap-2">
        <code class="flex-1 min-w-0 text-xs font-mono text-default bg-default rounded-md px-2 py-1.5 border border-default truncate select-all">{{ createdToken }}</code>
        <!-- `text-success!` rather than `text-success`: the variant already sets a
             colour, and an explicit winner is what keeps stylesheet order out of
             it. Same spelling as the description's copy button. -->
        <UButton
          :label="tokenCopied ? 'Copied!' : 'Copy'"
          :icon="tokenCopied ? 'i-lucide-check' : 'i-lucide-copy'"
          variant="ghost"
          color="neutral"
          size="sm"
          class="shrink-0"
          :class="tokenCopied ? 'text-success! bg-success/10' : ''"
          @click="copyToken"
        />
        <UButton
          label="Dismiss"
          variant="ghost"
          color="neutral"
          size="xs"
          class="shrink-0"
          @click="createdToken = null"
        />
      </div>
      <slot
        name="created"
        :token="createdToken"
      />
    </div>

    <!-- Token list. `group` is what makes the delete button's `group-hover`
         reveal fire. -->
    <div
      v-if="tokens.length"
      class="mx-card mt-3 mb-5 rounded-lg border border-default divide-y divide-default overflow-hidden"
    >
      <div
        v-for="token in tokens"
        :key="token.id"
        class="group flex items-center px-3 py-2.5 bg-default"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-default truncate">{{ token.name }}</span>
            <code class="text-xs font-mono text-dimmed bg-elevated rounded-md px-1.5 py-0.5 shrink-0">{{ token.tokenPrefix }}...</code>
            <UBadge
              v-if="token.isExpired"
              label="Expired"
              color="error"
              variant="soft"
              class="shrink-0"
            />
          </div>
          <div class="flex flex-wrap items-center gap-x-3 mt-0.5 text-xs text-dimmed">
            <span>Created {{ formatTokenDate(token.createdAt) }}</span>
            <span v-if="token.expiresAt">{{ token.isExpired ? 'Expired' : 'Expires' }} {{ formatTokenDate(token.expiresAt) }}</span>
            <span>{{ token.lastUsedAt ? `Last used ${relativeTime(token.lastUsedAt)}` : 'Not used yet' }}</span>
          </div>
        </div>
        <div class="shrink-0 ml-3">
          <UTooltip
            v-if="deletingTokenId !== token.id"
            :text="`${verb} token`"
          >
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="neutral"
              size="xs"
              :aria-label="`${verb} ${token.name}`"
              class="hover:text-error hover:bg-error/10 opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-60"
              @click="startDeleteToken(token.id)"
            />
          </UTooltip>
          <UiInlineConfirm
            v-else
            label="this token"
            @confirm="confirmDeleteToken(token.id)"
            @cancel="cancelDeleteToken"
          />
        </div>
      </div>
    </div>
    <div
      v-else
      class="px-card pb-5 pt-3 flex items-center gap-2 text-sm text-dimmed"
    >
      <UIcon
        name="i-lucide-key-round"
        class="text-base"
      />
      {{ emptyText }}
    </div>
  </div>
</template>
