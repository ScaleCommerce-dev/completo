# Code Review: Completo

Focus: duplicate code, maintainability, Nuxt best practices, bad patterns.

## Summary

The codebase is well-structured with good composable patterns (`useViewData`, `useMutation`, `useKanban`/`useListView` extending a shared base). The main concerns are: freshly introduced clipboard logic duplicated across 4 components, inline card type definitions that should use the centralized types, and several large Vue components approaching the point where they'd benefit from extraction.

## Duplicate Code

### 1. Clipboard copy logic (4 components) — Medium

The copy-ticket-ID/URL pattern is duplicated identically in 4 places:
- `app/components/KanbanCard.vue`
- `app/components/list/ListCellTicketId.vue`
- `app/components/CardModal.vue`
- `app/pages/projects/[slug]/cards/[cardId].vue`

Each has the same `copiedState` ref, `showFeedback()` timer, `copyUrl()`, and `copyId()` functions plus identical template markup for the two hover icons.

**Fix:** Extract a `useCopyTicketId(projectSlug, projectKey, cardId)` composable that returns `{ copiedState, copyUrl, copyId }`. The template could also become a `<TicketIdCopy>` component since the markup is identical too.

### 2. Test setup boilerplate (18 test files) — Low

Every integration test repeats:
```ts
let user: TestUser
beforeAll(async () => {
  user = await registerTestUser()
})
```

This is standard vitest convention and not worth abstracting — test readability matters more.

### 3. Member-add pattern in tests (14 occurrences) — Low

`$fetch(/api/projects/${project.id}/members, { method: 'POST', body: { email }, headers })` repeated across tests. Could be a `addMember()` fixture helper alongside the existing `createInvitation()`, but low priority.

### 4. Alert icon pattern (10 occurrences) — Low

The red `i-lucide-alert-circle` destructive action icon pattern repeats across modals/forms. Not worth abstracting — it's just a UI convention.

## Architecture & Maintainability

### 5. Inline card type definitions vs centralized types — Medium

`app/types/card.ts` defines `BaseCard`, `CardWithStatus`, `Tag`, `Member`, `CardStatus` — but several components re-declare equivalent card shapes inline:
- `CardModal.vue` defines `CardData` (mirrors `BaseCard`)
- `KanbanColumn.vue` defines `KanbanCardData`
- `KanbanBoard.vue` defines `BoardCard`, `BoardColumn`
- `ListView.vue` inlines card type in props

These drift over time. Components should import from `~/types/card` and extend if needed.

### 6. Large Vue components — Low-Medium

Several components exceed 500 lines. These aren't broken yet, but are approaching the point where understanding them in full context becomes hard:

| Component | Lines | Suggestion |
|-----------|-------|------------|
| `cards/[cardId].vue` | 761 | Extract sidebar properties into a `CardProperties` component |
| `ViewConfigModal.vue` | 699 | Uses `mode` prop well, but column management could be extracted |
| `CardModal.vue` | 690 | Create/edit modes are well-separated — acceptable |
| `ListView.vue` | 525 | The switch statement (CC=48) in the template cell renderer is the real issue — see below |

### 7. ListView cell rendering switch (CC=48) — Medium

`ListView.vue:181` has a massive switch/if chain for rendering different cell types. This is the highest cyclomatic complexity in the codebase. The pattern is:
```html
<ListCellDone v-if="col.field === 'done'" ... />
<ListCellTicketId v-else-if="col.field === 'ticketId'" ... />
<ListCellTitle v-else-if="col.field === 'title'" ... />
<!-- ... 10+ more -->
```

This works but doesn't scale. A component map pattern would be cleaner:
```ts
const cellComponents = {
  done: ListCellDone,
  ticketId: ListCellTicketId,
  title: ListCellTitle,
  // ...
}
```
Then use `<component :is="cellComponents[col.field]" v-bind="cellProps" />`.

## Nuxt Best Practices

### 8. Mixed quote styles in email.ts — Low

`server/utils/email.ts` has 52 single quotes and 105 double quotes. ESLint should catch this — the file likely has HTML template strings that inflate the double-quote count. Not a real issue if lint passes.

### 9. console.log in scripts — Low (Intentional)

48 `console.log` calls flagged — all in `scripts/` (db-seed, db-cleanup, user management) and `tests/global-setup.ts`. These are CLI scripts, not app code — `console.log` is appropriate here.

## What's Good

- **Composable architecture is solid.** `useViewData` → `useKanban`/`useListView` inheritance avoids duplication at the data layer. `useMutation()` is a clean error-handling wrapper.
- **IDOR prevention is consistent.** Server endpoints validate resource ownership against the project — checked across card, tag, and board endpoints.
- **`enrichCardsWithMetadata()` server util** prevents N+1 queries for tags and attachment counts. Well-applied across card listing endpoints.
- **Type centralization exists.** `app/types/card.ts` is the right pattern — it just needs wider adoption.
- **Test coverage is good.** 481 tests across 53 files, covering happy paths and edge cases.

## Recommended Actions (Priority Order)

1. **Extract `useCopyTicketId` composable** — The 4-component clipboard duplication is fresh and easy to fix now before it spreads further.
2. **Adopt centralized card types** — Replace inline card interfaces with imports from `~/types/card`.
3. **Refactor ListView cell renderer** — Replace the if/else-if chain with a component map for maintainability.
4. **Consider extracting `CardProperties`** — The sidebar in `cards/[cardId].vue` is a self-contained unit that would simplify the 761-line page.
