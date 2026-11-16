import type { CardFieldSyncCard } from './useCardFieldSync'

/** What the editor needs from a card: the synced properties plus the description. */
export type CardEditorCard = CardFieldSyncCard & { description: string | null }

/**
 * The editing state of one card, shared by the card panel (`CardModal`) and the
 * card's own page.
 *
 * Both carried the same refs and handlers under the same names, and the page
 * pointed at the panel with "See CardModal" six times. Two copies of the same
 * contract drift, and the description draft is where that would hurt.
 *
 * The callers keep what genuinely differs:
 * - **When to populate.** The panel repopulates whenever its host hands it a
 *   card object (another card, or the view refetched); the page populates once
 *   on load, then only when a different card is opened, because each save
 *   replaces its card object and repopulating then would overwrite the title
 *   being typed. Both call `populate`.
 * - **How a write reaches the server.** The panel emits to its view, which
 *   patches the row; the page sends its own request. Both pass `save`/`saveTags`.
 * - **Creating.** Only the panel creates, and that stays in the panel: the form
 *   uses the same refs, but nothing here saves while `enabled` is false.
 */
export function useCardEditor(opts: {
  /** The card as the server last confirmed it; null while creating. */
  card: () => CardEditorCard | null | undefined
  /** The project's tags, for the names the tag control shows. */
  tags: () => ReadonlyArray<{ id: string, name: string }>
  /** Whether edits save as they happen. False while creating. */
  enabled: () => boolean
  /**
   * Persist card columns. A rejection or `false` means the save failed (the host
   * has already said so in a toast); anything else is success.
   */
  save: (updates: Record<string, unknown>) => unknown
  saveTags: (tagIds: string[]) => unknown
}) {
  /** The assignee control's value for "nobody". */
  const UNASSIGNED = '__unassigned__'

  const title = ref('')
  const description = ref('')
  const priority = ref('medium')
  const selectedStatusId = ref('')
  const selectedAssigneeId = ref(UNASSIGNED)
  const selectedTagIds = ref<string[]>([])
  const selectedDueDate = ref<string | null>(null)
  const editingDescription = ref(false)
  const savingDescription = ref(false)

  const titleInput = ref<HTMLTextAreaElement>()
  const descriptionEditorRef = ref<{ startEditing: () => void }>()

  /**
   * The title wraps instead of scrolling out of sight.
   *
   * It was an `<input>`, so a long one simply ran off the right edge with no
   * ellipsis and no way to read the rest without arrowing through it: a
   * 100-character title showed about 70 of its characters and nothing said so.
   * Enter still commits rather than inserting a newline, so it stays a
   * single-line field that happens to be able to show all of itself.
   */
  function resizeTitle() {
    const el = titleInput.value
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  watch(title, () => nextTick(resizeTitle))

  const selectedTagNames = computed(() =>
    opts.tags().filter(t => selectedTagIds.value.includes(t.id)).map(t => t.name)
  )

  /**
   * The description is the one field on an existing card that is still an
   * explicit draft, so it is the one field a close or a navigation can destroy.
   * Persisting it locally makes an accidental close, a reload or a crash
   * recoverable, which is what lets the editor offer a plain Cancel rather than a
   * confirmation. The key is the card, not the surface, so a draft typed in the
   * panel comes back on the page and the other way round.
   *
   * Explicit discard still discards (`cancelEditingDescription` clears the
   * draft), because restoring text somebody deliberately threw away is worse
   * than losing it.
   */
  const descriptionDraft = useTextDraft(
    () => {
      const c = opts.card()
      return c ? `card:${c.id}:description` : null
    },
    description,
    () => opts.card()?.description || ''
  )

  function populate(card: CardEditorCard) {
    title.value = card.title || ''
    description.value = card.description || ''
    priority.value = card.priority || 'medium'
    selectedStatusId.value = card.statusId || ''
    selectedAssigneeId.value = card.assigneeId || UNASSIGNED
    selectedTagIds.value = (card.tags || []).map(t => t.id)
    selectedDueDate.value = toDateInput(card.dueDate)
    editingDescription.value = false
    // After the card's own text, so a draft wins over what the server holds, and
    // straight into the editor, because a restored draft rendered as prose would
    // read exactly like a saved description. That is the bug
    // `cancelEditingDescription` exists to prevent; restoring must not
    // reintroduce it.
    descriptionDraft.load()
    if (descriptionDraft.restored.value) editingDescription.value = true
  }

  /**
   * One save, reported as success or failure. The panel's host used to be reached
   * by an emit, which returns at once, so a failed description save closed the
   * editor and cleared the draft while the server still held the old text: the
   * panel showed unsaved text as prose, and closing it lost the text for good.
   */
  async function attempt(updates: Record<string, unknown>): Promise<boolean> {
    try {
      return (await opts.save(updates)) !== false
    } catch {
      return false
    }
  }

  /**
   * Property and title saves. A rejected title is put back to what the server
   * holds: `syncProperties` pulls the other fields back on a revert, but leaves the
   * title alone so as not to overwrite typing, which left a rejected title on screen.
   */
  async function saveField(updates: Record<string, unknown>) {
    const ok = await attempt(updates)
    if (!ok && 'title' in updates) {
      const c = opts.card()
      if (c && title.value.trim() === updates.title) title.value = c.title
    }
  }

  /**
   * Editing an existing card saves each property as it changes, matching the
   * board and the list. Creating is still batched: there is no card to save to
   * until Create runs, which is what `enabled` says.
   */
  const { flushTitle, syncProperties } = useCardFieldSync({
    card: () => opts.card() ?? null,
    fields: {
      title,
      statusId: selectedStatusId,
      assigneeId: selectedAssigneeId,
      priority,
      dueDate: selectedDueDate,
      tagIds: selectedTagIds
    },
    unassignedValue: UNASSIGNED,
    enabled: opts.enabled,
    save: saveField,
    saveTags: opts.saveTags,
    // A different card: everything repopulates, title and description included.
    onCardChanged: () => {
      const c = opts.card()
      if (c) populate(c)
    }
  })

  function startEditingDescription() {
    editingDescription.value = true
    nextTick(() => descriptionEditorRef.value?.startEditing())
  }

  /**
   * Leaving the editor without saving must not leave the typed text on screen
   * looking saved.
   *
   * It used to do exactly that: Escape only unmounted the editor, so the panel
   * rendered the *unsaved* value as prose, indistinguishable from a stored
   * description, and the text went silently on close.
   */
  function cancelEditingDescription() {
    description.value = opts.card()?.description || ''
    editingDescription.value = false
    descriptionDraft.clear()
  }

  const descriptionDirty = computed(() =>
    description.value.trim() !== (opts.card()?.description || '').trim()
  )

  /**
   * The description commits itself, from a button under the editor it belongs
   * to. Every other field saves where it lives; this one stays explicit because
   * the editor is a mode, and a mode you leave by saving is honest about that.
   */
  async function saveDescription() {
    if (!opts.card() || !descriptionDirty.value) return
    savingDescription.value = true
    try {
      // On failure the editor stays open with the text and its draft: the host's
      // toast says what went wrong, and Save can be pressed again.
      if (!await attempt({ description: description.value.trim() })) return
      editingDescription.value = false
      descriptionDraft.clear()
    } finally {
      savingDescription.value = false
    }
  }

  /**
   * Reading a description and editing one are separate acts, and clicking the
   * prose used to be both: a click that starts a selection (click a word, then
   * shift-click to extend) is indistinguishable from "edit this", so copying half
   * a sentence threw you into the editor. Editing is now only the pencil, and
   * copying the markdown is the control that replaced the gesture.
   */
  const { copied: descriptionCopied, copy: copyText } = useCopyText()
  function copyDescription() {
    copyText(description.value)
  }

  return {
    UNASSIGNED,
    title,
    description,
    priority,
    selectedStatusId,
    selectedAssigneeId,
    selectedTagIds,
    selectedDueDate,
    selectedTagNames,
    editingDescription,
    savingDescription,
    titleInput,
    descriptionEditorRef,
    resizeTitle,
    descriptionDraft,
    descriptionDirty,
    populate,
    flushTitle,
    syncProperties,
    startEditingDescription,
    cancelEditingDescription,
    saveDescription,
    descriptionCopied,
    copyDescription
  }
}
