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
  <div class="mt-6 rounded-xl border border-zinc-200/80 dark:border-zinc-700/50 bg-white dark:bg-zinc-800/80 shadow-sm overflow-hidden">
    <div class="px-5 pt-4 pb-2 flex items-center gap-2">
      <UIcon
        name="i-lucide-key-round"
        class="text-[14px] text-zinc-400"
      />
      <span class="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">API Tokens</span>
    </div>

    <div class="px-5 pb-3">
      <p class="text-[13px] text-zinc-400 dark:text-zinc-500 leading-relaxed">
        Create personal access tokens to authenticate with the API. Tokens have the same permissions as your account.
      </p>
    </div>

    <!-- Create token form -->
    <div class="mx-5 rounded-lg border border-zinc-200 dark:border-zinc-700/50 overflow-hidden">
      <div class="flex items-center gap-2 px-3 py-2.5 bg-white dark:bg-zinc-800/50">
        <input
          v-model="tokenName"
          type="text"
          placeholder="Token name (e.g. CI Pipeline)"
          maxlength="100"
          class="flex-1 text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-300 dark:placeholder-zinc-600 bg-transparent border-0 outline-none! ring-0!"
          @keydown.enter.prevent="createToken"
        >
        <select
          v-model="tokenExpiry"
          class="text-[13px] text-zinc-500 dark:text-zinc-400 bg-transparent border-0 outline-none! ring-0! cursor-pointer"
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
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          :disabled="!tokenName.trim() || tokenLoading"
          @click="createToken"
        >
          <UIcon
            v-if="!tokenLoading"
            name="i-lucide-plus"
            class="text-[14px]"
          />
          <UIcon
            v-else
            name="i-lucide-loader-2"
            class="text-[14px] animate-spin"
          />
          Create
        </button>
      </div>
    </div>

    <!-- Created token banner (one-time display) -->
    <div
      v-if="createdToken"
      class="mx-5 mt-3 rounded-lg border border-emerald-200/60 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20 p-3"
    >
      <div class="flex items-center gap-2 mb-2">
        <UIcon
          name="i-lucide-check-circle"
          class="text-[14px] text-emerald-500 shrink-0"
        />
        <span class="text-[13px] font-medium text-emerald-600 dark:text-emerald-400">Token "{{ createdTokenName }}" created. Copy it now — it won't be shown again.</span>
      </div>
      <div class="flex items-center gap-2">
        <code class="flex-1 text-[12px] font-mono text-zinc-700 dark:text-zinc-300 bg-white dark:bg-zinc-800 rounded px-2 py-1.5 border border-zinc-200 dark:border-zinc-700 truncate select-all">{{ createdToken }}</code>
        <button
          type="button"
          class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[12px] font-semibold transition-all shrink-0"
          :class="tokenCopied ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30' : 'text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700/50'"
          @click="copyToken"
        >
          <UIcon
            :name="tokenCopied ? 'i-lucide-check' : 'i-lucide-copy'"
            class="text-[13px]"
          />
          {{ tokenCopied ? 'Copied!' : 'Copy' }}
        </button>
        <button
          type="button"
          class="text-[12px] font-medium text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
          @click="createdToken = null"
        >
          Dismiss
        </button>
      </div>
    </div>

    <!-- Token list -->
    <div
      v-if="tokens.length > 0"
      class="mx-5 mt-3 mb-5 rounded-lg border border-zinc-200 dark:border-zinc-700/50 divide-y divide-zinc-100 dark:divide-zinc-700/40 overflow-hidden"
    >
      <div
        v-for="token in tokens"
        :key="token.id"
        class="flex items-center px-3 py-2.5 bg-white dark:bg-zinc-800/50"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-[13px] font-medium text-zinc-700 dark:text-zinc-300 truncate">{{ token.name }}</span>
            <code class="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded px-1.5 py-0.5 shrink-0">{{ token.tokenPrefix }}...</code>
            <span
              v-if="token.isExpired"
              class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-red-50 dark:bg-red-950/30 text-red-500 dark:text-red-400 shrink-0"
            >Expired</span>
          </div>
          <div class="flex items-center gap-3 mt-0.5">
            <span class="text-[11px] text-zinc-400 dark:text-zinc-500">Created {{ formatTokenDate(token.createdAt) }}</span>
            <span
              v-if="token.expiresAt"
              class="text-[11px] text-zinc-400 dark:text-zinc-500"
            >
              {{ token.isExpired ? 'Expired' : 'Expires' }} {{ formatTokenDate(token.expiresAt) }}
            </span>
            <span
              v-if="token.lastUsedAt"
              class="text-[11px] text-zinc-400 dark:text-zinc-500"
            >Last used {{ relativeTime(token.lastUsedAt) }}</span>
          </div>
        </div>

        <!-- Delete button / confirmation -->
        <div class="shrink-0 ml-3">
          <UTooltip
            v-if="deletingTokenId !== token.id"
            text="Delete token"
          >
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 rounded-md text-[12px] font-medium text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all opacity-0 sm:group-hover:opacity-100 max-sm:opacity-60"
              style="opacity: 0.6"
              @click="startDeleteToken(token.id)"
            >
              <UIcon
                name="i-lucide-trash-2"
                class="text-[13px]"
              />
            </button>
          </UTooltip>
          <div
            v-else
            class="flex items-center gap-1.5"
          >
            <button
              type="button"
              class="px-2 py-1 rounded-md text-[12px] font-semibold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all"
              @click="confirmDeleteToken(token.id)"
            >
              Delete
            </button>
            <button
              type="button"
              class="px-2 py-1 rounded-md text-[12px] font-medium text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
              @click="cancelDeleteToken"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="px-5 pb-5 pt-2"
    >
      <div class="flex items-center gap-2 text-[13px] text-zinc-400 dark:text-zinc-500">
        <UIcon
          name="i-lucide-key-round"
          class="text-[14px]"
        />
        <span>No API tokens yet</span>
      </div>
    </div>
  </div>
</template>
