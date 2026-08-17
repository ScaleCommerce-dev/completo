<script setup lang="ts">
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
} = useApiTokens()
</script>

<template>
  <div class="mt-6 rounded-xl border border-default bg-default shadow-raise overflow-hidden">
    <div class="px-5 pt-4 pb-2 flex items-center gap-2">
      <UIcon
        name="i-lucide-key-round"
        class="text-base text-dimmed"
      />
      <span class="text-xs font-semibold uppercase tracking-label text-dimmed">API Tokens</span>
    </div>

    <div class="px-5 pb-3">
      <p class="text-sm text-dimmed leading-relaxed">
        Create personal access tokens to authenticate with the API. Tokens have the same permissions as your account.
      </p>
    </div>

    <!-- Create token form -->
    <div class="mx-5 rounded-lg border border-default overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2.5 bg-default border-b border-transparent focus-within:border-primary">
        <input
          v-model="tokenName"
          type="text"
          aria-label="Token name"
          placeholder="Token name (e.g. CI Pipeline)"
          maxlength="100"
          class="flex-1 min-w-0 text-base text-highlighted placeholder:text-dimmed bg-transparent border-0"
          @keydown.enter.prevent="createToken"
        >
        <select
          v-model="tokenExpiry"
          aria-label="Token expiry"
          class="text-sm text-muted bg-transparent border-0 cursor-pointer"
        >
          <option value="">
            No expiry
          </option>
          <option value="30">
            30 days
          </option>
          <option value="60">
            60 days
          </option>
          <option value="90">
            90 days
          </option>
          <option value="365">
            1 year
          </option>
        </select>
        <UButton
          label="Create"
          icon="i-lucide-plus"
          class="shrink-0"
          :disabled="!tokenName.trim()"
          :loading="tokenLoading"
          @click="createToken"
        />
      </div>
    </div>

    <!-- Created token banner (one-time display) -->
    <div
      v-if="createdToken"
      class="mx-5 mt-3 rounded-lg border border-success/30 bg-success/5 p-3"
    >
      <div class="flex items-center gap-2 mb-2">
        <UIcon
          name="i-lucide-check-circle"
          class="text-base text-success shrink-0"
        />
        <span class="text-sm font-medium text-success">Token "{{ createdTokenName }}" created. Copy it now — it won't be shown again.</span>
      </div>
      <div class="flex items-center gap-2">
        <code class="flex-1 text-xs font-mono text-default bg-default rounded-md px-2 py-1.5 border border-accented truncate select-all">{{ createdToken }}</code>
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
        <button
          type="button"
          class="text-xs font-medium text-dimmed hover:text-toned transition-colors"
          @click="createdToken = null"
        >
          Dismiss
        </button>
      </div>
    </div>

    <!-- Token list -->
    <div
      v-if="tokens.length > 0"
      class="mx-5 mt-3 mb-5 rounded-lg border border-default divide-y divide-default overflow-hidden"
    >
      <!-- `group` is what makes the delete button's `group-hover` reveal fire. It
           was missing, so those classes had never once applied and an inline
           `style="opacity: .6"` was holding the button visible instead — which
           also meant the row could not hide it on the way back out. Same reveal
           as `admin/skills` and the project cards now. -->
      <div
        v-for="token in tokens"
        :key="token.id"
        class="group flex items-center px-3 py-2.5 bg-default"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-sm font-medium text-default truncate">{{ token.name }}</span>
            <code class="text-xs font-mono text-dimmed bg-elevated rounded-md px-1.5 py-0.5 shrink-0">{{ token.tokenPrefix }}...</code>
            <span
              v-if="token.isExpired"
              class="text-2xs font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-error/10 text-error shrink-0"
            >Expired</span>
          </div>
          <div class="flex items-center gap-3 mt-0.5">
            <span class="text-xs text-dimmed">Created {{ formatTokenDate(token.createdAt) }}</span>
            <span
              v-if="token.expiresAt"
              class="text-xs text-dimmed"
            >
              {{ token.isExpired ? 'Expired' : 'Expires' }} {{ formatTokenDate(token.expiresAt) }}
            </span>
            <span
              v-if="token.lastUsedAt"
              class="text-xs text-dimmed"
            >Last used {{ relativeTime(token.lastUsedAt) }}</span>
          </div>
        </div>

        <!-- Delete button / confirmation -->
        <div class="shrink-0 ml-3">
          <UTooltip
            v-if="deletingTokenId !== token.id"
            text="Delete token"
          >
            <UButton
              icon="i-lucide-trash-2"
              variant="ghost"
              color="neutral"
              size="xs"
              aria-label="Delete this token"
              class="hover:text-error hover:bg-error/10 opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-60"
              @click="startDeleteToken(token.id)"
            />
          </UTooltip>
          <!-- The one row list that spelled this with labelled buttons rather than
               the compact "Delete?" the other four used. -->
          <UiInlineConfirm
            v-else
            label="this token"
            @confirm="confirmDeleteToken(token.id)"
            @cancel="cancelDeleteToken"
          />
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="px-5 pb-5 pt-2"
    >
      <div class="flex items-center gap-2 text-sm text-dimmed">
        <UIcon
          name="i-lucide-key-round"
          class="text-base"
        />
        <span>No API tokens yet</span>
      </div>
    </div>
  </div>
</template>
