<script setup lang="ts">
interface ProjectMember {
  id: string
  name: string
  avatarUrl?: string | null
  role: 'owner' | 'member'
}

interface ProjectInvitation {
  id: string
  email: string
}

interface SearchUser {
  id: string
  name: string
  avatarUrl?: string | null
}

const props = defineProps<{
  projectId: string
}>()

const { user: currentUser } = useUserSession()
const toast = useToast()

const { data: members, refresh } = useFetch<ProjectMember[]>(`/api/projects/${props.projectId}/members`)

const sortedMembers = computed(() => {
  return [...(members.value || [])].sort((a, b) =>
    (a.name || '').localeCompare(b.name || '')
  )
})

const isOwnerOrAdmin = computed(() => {
  if (currentUser.value?.isAdmin) return true
  const memberList = members.value || []
  const me = memberList.find(m => m.id === currentUser.value?.id)
  return me?.role === 'owner'
})

// Pending invitations
const { data: invitations, refresh: refreshInvitations } = useFetch<ProjectInvitation[]>(`/api/projects/${props.projectId}/invitations`, {
  immediate: false
})

watch(isOwnerOrAdmin, (val) => {
  if (val) refreshInvitations()
}, { immediate: true })

const cancellingInvitation = ref<string | null>(null)
const resendingInvitation = ref<string | null>(null)

async function resendInvitation(invitationId: string) {
  resendingInvitation.value = invitationId
  try {
    await $fetch(`/api/projects/${props.projectId}/invitations/${invitationId}/resend`, {
      method: 'POST'
    })
    toast.add({ title: 'Invitation resent', color: 'success' })
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    toast.add({ title: 'Failed to resend invitation', description: err?.data?.message, color: 'error' })
  } finally {
    resendingInvitation.value = null
  }
}

async function cancelInvitation(invitationId: string) {
  cancellingInvitation.value = invitationId
  try {
    await $fetch(`/api/projects/${props.projectId}/invitations/${invitationId}`, {
      method: 'DELETE'
    })
    await refreshInvitations()
    toast.add({ title: 'Invitation cancelled', color: 'success' })
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    toast.add({ title: 'Failed to cancel invitation', description: err?.data?.message, color: 'error' })
  } finally {
    cancellingInvitation.value = null
  }
}

// Add member — search-based
const searchQuery = ref('')
const searchResults = ref<SearchUser[]>([])
const searching = ref(false)
const addError = ref('')
const adding = ref(false)
const showResults = ref(false)
const highlightIndex = ref(-1)
let searchTimeout: ReturnType<typeof setTimeout> | null = null

function isValidEmail(str: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)
}

watch(searchQuery, (val) => {
  addError.value = ''
  highlightIndex.value = -1
  if (searchTimeout) clearTimeout(searchTimeout)
  const q = val.trim()
  if (q.length < 2) {
    searchResults.value = []
    showResults.value = false
    return
  }
  searching.value = true
  showResults.value = true
  searchTimeout = setTimeout(async () => {
    try {
      const results = await $fetch<SearchUser[]>('/api/users/search', { params: { q } })
      if (searchQuery.value.trim() === q) {
        const memberIds = new Set((members.value || []).map(m => m.id))
        searchResults.value = results.filter(u => !memberIds.has(u.id))
      }
    } catch {
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 200)
})

async function addMember(user: SearchUser) {
  adding.value = true
  addError.value = ''
  try {
    await $fetch(`/api/projects/${props.projectId}/members`, {
      method: 'POST',
      body: { userId: user.id }
    })
    searchQuery.value = ''
    searchResults.value = []
    showResults.value = false
    await refresh()
    toast.add({ title: `${user.name} added to project`, color: 'success' })
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    addError.value = err?.data?.message || 'Failed to add member'
  } finally {
    adding.value = false
  }
}

async function inviteByEmail() {
  const emailVal = searchQuery.value.trim()
  if (!isValidEmail(emailVal)) return
  adding.value = true
  addError.value = ''
  try {
    await $fetch(`/api/projects/${props.projectId}/members`, {
      method: 'POST',
      body: { email: emailVal }
    })
    searchQuery.value = ''
    searchResults.value = []
    showResults.value = false
    toast.add({ title: `Added or invited ${emailVal}`, color: 'success' })
    await refresh()
    await refreshInvitations()
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    addError.value = err?.data?.message || 'Failed to invite user'
  } finally {
    adding.value = false
  }
}

function onInputBlur() {
  setTimeout(() => {
    showResults.value = false
    highlightIndex.value = -1
  }, 200)
}

function onInputKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault()
    // If a search result is highlighted, add that user
    if (showResults.value && highlightIndex.value >= 0 && highlightIndex.value < searchResults.value.length) {
      const selected = searchResults.value[highlightIndex.value]
      if (selected) addMember(selected)
      return
    }
    // If no results and looks like an email, invite
    if (searchResults.value.length === 0 && isValidEmail(searchQuery.value.trim())) {
      inviteByEmail()
      return
    }
  }
  if (!showResults.value || searchResults.value.length === 0) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    highlightIndex.value = (highlightIndex.value + 1) % searchResults.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    highlightIndex.value = highlightIndex.value <= 0
      ? searchResults.value.length - 1
      : highlightIndex.value - 1
  } else if (e.key === 'Escape') {
    showResults.value = false
    highlightIndex.value = -1
  }
}

// Change role
const changingRole = ref<string | null>(null)

const ownerCount = computed(() => {
  return (members.value || []).filter(m => m.role === 'owner').length
})

function canChangeRole(m: ProjectMember): boolean {
  if (!isOwnerOrAdmin.value) return false
  // Prevent demoting the last owner
  if (m.role === 'owner' && ownerCount.value <= 1) return false
  return true
}

async function changeRole(m: ProjectMember, newRole: 'owner' | 'member') {
  if (newRole === m.role) return
  changingRole.value = m.id
  try {
    await $fetch(`/api/projects/${props.projectId}/members/${m.id}`, {
      method: 'PATCH',
      body: { role: newRole }
    })
    await refresh()
    toast.add({ title: `${m.name} is now ${newRole === 'owner' ? 'an owner' : 'a member'}`, color: 'success' })
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    toast.add({ title: 'Failed to change role', description: err?.data?.message, color: 'error' })
  } finally {
    changingRole.value = null
  }
}

function roleMenuItems(m: ProjectMember) {
  const canRemove = !(m.role === 'owner' && m.id === currentUser.value?.id)
  const roleAction = m.role === 'member'
    ? { label: 'Promote to owner', icon: 'i-lucide-shield', onSelect: () => changeRole(m, 'owner') }
    : { label: 'Demote to member', icon: 'i-lucide-user', onSelect: () => changeRole(m, 'member') }
  const items: { label: string, icon: string, color?: string, onSelect: () => void }[][] = [[roleAction]]
  if (canRemove) {
    items.push([{
      label: 'Remove from project',
      icon: 'i-lucide-user-minus',
      color: 'error',
      onSelect: () => removeMember(m)
    }])
  }
  return items
}

// Remove member
const removing = ref<string | null>(null)
const pendingRemove = ref<ProjectMember | null>(null)

function removeMember(m: ProjectMember) {
  pendingRemove.value = m
}

async function confirmRemoveMember() {
  const m = pendingRemove.value
  if (!m) return
  removing.value = m.id
  pendingRemove.value = null
  try {
    await $fetch(`/api/projects/${props.projectId}/members/${m.id}`, {
      method: 'DELETE'
    })
    await refresh()
    toast.add({ title: `${m.name} removed from project`, color: 'success' })
  } catch (e: unknown) {
    const err = e as { data?: { message?: string } }
    toast.add({ title: 'Failed to remove member', description: err?.data?.message, color: 'error' })
  } finally {
    removing.value = null
  }
}

// Invitation dropdown items
function invitationMenuItems(inv: ProjectInvitation) {
  return [
    [{
      label: 'Resend invitation',
      icon: 'i-lucide-refresh-cw',
      onSelect: () => resendInvitation(inv.id)
    }],
    [{
      label: 'Cancel invitation',
      icon: 'i-lucide-x',
      color: 'error',
      onSelect: () => cancelInvitation(inv.id)
    }]
  ]
}
</script>

<template>
  <div>
    <div class="rounded-xl border border-zinc-200/80 dark:border-zinc-700/50">
      <div
        v-for="(m, mIdx) in (sortedMembers)"
        :key="m.id"
        class="flex items-center gap-2 px-3 py-2 transition-colors group"
        :class="[
          mIdx % 2 === 0 ? 'bg-white dark:bg-zinc-800/50' : 'bg-zinc-50/50 dark:bg-zinc-800/30',
          mIdx === 0 ? 'rounded-t-xl' : '',
          mIdx === (sortedMembers).length - 1 && !isOwnerOrAdmin ? 'rounded-b-xl' : ''
        ]"
      >
        <UAvatar
          :src="m.avatarUrl ?? undefined"
          :alt="m.name"
          size="xs"
        />
        <span class="text-[14px] font-medium flex-1 truncate">
          {{ m.name }}
          <span
            v-if="m.id === currentUser?.id"
            class="text-[12px] text-zinc-400 dark:text-zinc-500 font-normal"
          >(you)</span>
        </span>
        <UDropdownMenu
          v-if="canChangeRole(m)"
          :items="roleMenuItems(m)"
        >
          <button
            type="button"
            class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer transition-all hover:ring-2 hover:ring-indigo-500/20 flex items-center gap-1"
            :class="m.role === 'owner'
              ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
              : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'"
            :disabled="changingRole === m.id"
          >
            <UIcon
              v-if="changingRole === m.id"
              name="i-lucide-loader-2"
              class="text-[10px] animate-spin"
            />
            <template v-else>
              {{ m.role }}
              <UIcon
                name="i-lucide-chevron-down"
                class="text-[10px] opacity-60"
              />
            </template>
          </button>
        </UDropdownMenu>
        <span
          v-else
          class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0"
          :class="m.role === 'owner'
            ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400'
            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'"
        >
          {{ m.role }}
        </span>
      </div>

      <!-- Pending invitations (owner/admin only) -->
      <template v-if="isOwnerOrAdmin && (invitations as ProjectInvitation[] | null)?.length">
        <div class="border-t border-zinc-100 dark:border-zinc-700/40 bg-white dark:bg-zinc-800/50 px-3 py-2">
          <div
            v-for="inv in (invitations as ProjectInvitation[] | null)"
            :key="inv.id"
            class="flex items-center gap-2 py-1.5 group/inv"
          >
            <UIcon
              name="i-lucide-mail"
              class="text-[14px] text-amber-400 shrink-0"
            />
            <span class="text-[13px] font-mono text-zinc-500 dark:text-zinc-400 flex-1 truncate">{{ inv.email }}</span>
            <UDropdownMenu :items="invitationMenuItems(inv)">
              <button
                type="button"
                class="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full shrink-0 cursor-pointer transition-all hover:ring-2 hover:ring-amber-500/20 flex items-center gap-1 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                :disabled="resendingInvitation === inv.id || cancellingInvitation === inv.id"
              >
                <UIcon
                  v-if="resendingInvitation === inv.id || cancellingInvitation === inv.id"
                  name="i-lucide-loader-2"
                  class="text-[10px] animate-spin"
                />
                <template v-else>
                  Pending
                  <UIcon
                    name="i-lucide-chevron-down"
                    class="text-[10px] opacity-60"
                  />
                </template>
              </button>
            </UDropdownMenu>
          </div>
        </div>
      </template>

      <!-- Add member section (owner/admin only) -->
      <template v-if="isOwnerOrAdmin">
        <div class="relative border-t border-zinc-100 dark:border-zinc-700/40 bg-white dark:bg-zinc-800/50 rounded-b-xl px-3 py-2">
          <div class="flex items-center gap-1.5 mb-2">
            <UIcon
              name="i-lucide-user-plus"
              class="text-[13px] text-zinc-400"
            />
            <span class="text-[10px] font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.08em]">Add Member</span>
          </div>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Search by name or enter email to invite..."
            class="w-full text-[14px] text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 bg-zinc-50 dark:bg-zinc-800/60 border border-zinc-200/80 dark:border-zinc-700/50 rounded-lg px-3 py-2 outline-none focus:border-indigo-300 dark:focus:border-indigo-600 focus:ring-2 focus:ring-indigo-500/10 transition-all"
            @focus="searchQuery.trim().length >= 2 && (showResults = true)"
            @blur="onInputBlur"
            @keydown="onInputKeydown"
          >
          <UIcon
            v-if="searching"
            name="i-lucide-loader-2"
            class="absolute right-6 bottom-4.5 text-[14px] text-zinc-400 animate-spin"
          />

          <!-- Search results dropdown -->
          <div
            v-if="showResults && searchQuery.trim().length >= 2"
            class="absolute z-50 left-3 right-3 mt-1 rounded-lg border border-zinc-200 dark:border-zinc-700/60 bg-white dark:bg-zinc-800 shadow-lg overflow-hidden"
          >
            <button
              v-for="(u, i) in searchResults"
              :key="u.id"
              type="button"
              class="flex items-center gap-2.5 w-full px-3 py-2 transition-colors text-left cursor-pointer"
              :class="i === highlightIndex
                ? 'bg-indigo-50 dark:bg-indigo-500/10'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-700/50'"
              :disabled="adding"
              @mousedown.prevent="addMember(u)"
              @mouseenter="highlightIndex = i"
            >
              <UAvatar
                :src="u.avatarUrl ?? undefined"
                :alt="u.name"
                size="xs"
              />
              <div class="min-w-0 flex-1">
                <div class="text-[14px] font-medium text-zinc-900 dark:text-zinc-100 truncate">
                  {{ u.name }}
                </div>
              </div>
              <UIcon
                name="i-lucide-plus"
                class="text-[14px] text-zinc-400 shrink-0"
              />
            </button>

            <!-- Invite by email option when no results and valid email -->
            <button
              v-if="!searching && searchResults.length === 0 && isValidEmail(searchQuery.trim())"
              type="button"
              class="flex items-center gap-2.5 w-full px-3 py-2.5 transition-colors text-left cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-500/10"
              :disabled="adding"
              @mousedown.prevent="inviteByEmail"
            >
              <div class="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-500/20">
                <UIcon
                  name="i-lucide-send"
                  class="text-[12px] text-indigo-500"
                />
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-[14px] font-medium text-indigo-600 dark:text-indigo-400">
                  Invite {{ searchQuery.trim() }}
                </div>
                <div class="text-[12px] text-zinc-400 dark:text-zinc-500">
                  Send an invitation email
                </div>
              </div>
              <UIcon
                name="i-lucide-mail-plus"
                class="text-[14px] text-indigo-400 shrink-0"
              />
            </button>

            <div
              v-if="!searching && searchResults.length === 0 && !isValidEmail(searchQuery.trim())"
              class="px-3 py-3 text-center text-[13px] text-zinc-400 dark:text-zinc-500"
            >
              No users found — enter a full email to invite
            </div>
          </div>

          <!-- Error -->
          <div
            v-if="addError"
            class="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200/60 dark:border-red-800/40"
          >
            <UIcon
              name="i-lucide-alert-circle"
              class="text-[14px] text-red-500 shrink-0"
            />
            <span class="text-[13px] font-medium text-red-600 dark:text-red-400">{{ addError }}</span>
          </div>
        </div>
      </template>
    </div>

    <div
      v-if="!(sortedMembers)?.length"
      class="py-4 text-center text-[14px] text-zinc-400 dark:text-zinc-500"
    >
      No members
    </div>

    <!-- Remove member confirmation modal -->
    <UModal
      :open="!!pendingRemove"
      :ui="{ content: 'sm:max-w-[400px]' }"
      @update:open="(val: boolean) => { if (!val) pendingRemove = null }"
    >
      <template #content>
        <div class="rounded-xl bg-white dark:bg-zinc-800/80 overflow-hidden">
          <div class="px-5 pt-5 pb-4">
            <div class="flex items-center gap-3 mb-4">
              <div class="flex items-center justify-center w-10 h-10 rounded-full bg-red-50 dark:bg-red-950/30">
                <UIcon
                  name="i-lucide-alert-triangle"
                  class="text-lg text-red-500"
                />
              </div>
              <div>
                <h2 class="text-[14px] font-bold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100">
                  Remove Member
                </h2>
                <p class="text-[13px] text-zinc-500 dark:text-zinc-400">
                  This action cannot be undone
                </p>
              </div>
            </div>
            <p
              v-if="pendingRemove"
              class="text-[13px] text-zinc-500 dark:text-zinc-400 leading-relaxed"
            >
              Are you sure you want to remove <strong class="text-zinc-700 dark:text-zinc-200">{{ pendingRemove.name }}</strong> from this project?
            </p>
          </div>
          <div class="flex items-center justify-end gap-2 px-5 pb-5 pt-2 border-t border-zinc-100 dark:border-zinc-700/40 mt-2">
            <button
              type="button"
              class="flex items-center px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              @click="pendingRemove = null"
            >
              Cancel
            </button>
            <button
              type="button"
              class="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[13px] font-semibold text-white bg-red-500 hover:bg-red-600 active:bg-red-700 shadow-sm shadow-red-500/20 hover:shadow-md hover:shadow-red-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              :disabled="removing === pendingRemove?.id"
              @click="confirmRemoveMember"
            >
              <UIcon
                v-if="removing !== pendingRemove?.id"
                name="i-lucide-user-minus"
                class="text-[14px]"
              />
              <UIcon
                v-else
                name="i-lucide-loader-2"
                class="text-[14px] animate-spin"
              />
              Remove
            </button>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
