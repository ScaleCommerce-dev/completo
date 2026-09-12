// Design system defaults.
//
// `colors` is the single source of truth for the brand. It used to say
// `primary: 'blue'` / `neutral: 'slate'` while every hand-written utility in the
// app used indigo and zinc — so Nuxt UI components (UButton, USelect, UCalendar,
// the active nav item) rendered blue-on-slate right next to indigo-on-zinc
// chrome. Two accents and two greys shipped side by side, and the slate/zinc
// clash was the visible navy-vs-charcoal seam in dark mode: both are ~21%
// lightness, but slate carries 7x the chroma.
//
// The per-component blocks below exist so variants stop being restated at every
// call site. `slots` entries are merged into the theme with tailwind-merge, so a
// class here overrides the theme's equivalent (e.g. `rounded-lg` beats the
// theme's `rounded-md`) and anything not mentioned is left alone.
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      // Violet marks AI-assisted features (the write button, skill pickers, the
      // AI review bar). It was already being used for exactly that, hardcoded in
      // four files; naming it means those surfaces stay in step with each other.
      secondary: 'violet',
      neutral: 'zinc',
      // All six roles are named, not just the ones whose default was wrong.
      // Nuxt UI defaults `success` to green and `warning` to yellow, while every
      // success surface in the app was hand-written emerald and every warning
      // surface amber — the indigo-vs-blue seam one family out, and it was
      // already visible inside single class strings: `StatusManager` drew a
      // `bg-emerald-50` fill inside a `ring-success/30` ring, two greens 13 hue
      // degrees apart in the same rounded rectangle. There is no `green-*` or
      // `yellow-*` utility anywhere in `app/`, so the markup's own choice names
      // those two unambiguously.
      //
      // `error` and `info` restate their defaults on purpose. A role the
      // templates paint with but this file does not name is a role whose family
      // lives in Nuxt UI's defaults rather than here, which is precisely how the
      // green/yellow mismatch stayed invisible; `design-tokens.test.ts` reads the
      // roles out of the templates and requires every one of them to appear
      // below, so the brand is legible in one place.
      success: 'emerald',
      warning: 'amber',
      error: 'red',
      info: 'blue'
    },

    // Buttons carry the app's shape language: 10px corners, semibold labels.
    // Matches what ~50 hand-rolled `<button>`s were doing by hand.
    //
    // The disabled opacity is deliberately lower than the theme's 0.75: at that
    // value a solid primary button still reads as active, which matters most on
    // the Save buttons that stay disabled until something is actually dirty.
    // `focus-visible:ring-accented` names the *resting* ring, so focus does not
    // change it. Focus is stated on text entry only (see the FOCUS block in
    // `main.css`), and the outline half of Nuxt UI's treatment is reset there —
    // but the ring half is a `box-shadow`, which no reset can generically undo,
    // and the theme's own `focus-visible:ring-inverted` took the ring on the
    // bordered variants from a light hairline to near-black. That was the only
    // focus marker left on a non-text control anywhere in the app.
    //
    // A ghost neutral button is the app's *retreat* — Cancel, Close, Back, Keep
    // editing — and Nuxt UI rests it at `text-default`, which is body-copy
    // weight. Beside a solid primary that merely competes; measured on the
    // board's quick-add composer, "Cancel" read as the strongest mark in the
    // row while "Add" carried the action. Twelve hand-rolled `<button>`s had
    // already worked around it — byte-identical geometry to `size="md"`
    // (`px-2.5 py-1.5` + the base below) and the one thing they changed was
    // exactly this: rest at `text-dimmed`, rise to `text-toned` on hover. That
    // is the correct call, so it belongs here rather than at twelve call sites.
    // `hover:` and not `hover:not-focus-visible:` because this is a colour, not
    // a border — it cannot outrank the focus rule, which never paints a fill.
    button: {
      slots: {
        base: 'rounded-lg font-semibold disabled:opacity-45 aria-disabled:opacity-45 focus-visible:ring-accented'
      },
      compoundVariants: [{
        color: 'neutral',
        variant: 'ghost',
        class: 'text-dimmed hover:text-toned'
      }],
      defaultVariants: {
        size: 'md'
      }
    },

    badge: {
      slots: {
        base: 'rounded-full font-bold uppercase tracking-wide'
      },
      defaultVariants: {
        size: 'sm',
        variant: 'subtle'
      }
    },

    card: {
      slots: {
        root: 'rounded-xl',
        header: 'px-4 py-3 sm:px-5',
        body: 'p-4 sm:p-5',
        footer: 'px-4 py-3 sm:px-5'
      }
    },

    modal: {
      slots: {
        content: 'rounded-xl',
        header: 'px-5 py-4 min-h-0 gap-3',
        title: 'text-base font-bold tracking-heading text-highlighted',
        description: 'text-sm text-muted mt-0.5',
        body: 'px-5 py-4',
        footer: 'px-5 py-4 justify-end gap-2'
      }
    },

    input: {
      slots: {
        base: 'rounded-lg'
      },
      defaultVariants: {
        size: 'md'
      }
    },

    textarea: {
      slots: {
        base: 'rounded-lg'
      }
    },

    select: {
      slots: {
        base: 'rounded-lg'
      }
    },

    selectMenu: {
      slots: {
        base: 'rounded-lg'
      }
    },

    formField: {
      slots: {
        label: 'text-xs font-semibold uppercase tracking-label text-dimmed',
        error: 'text-xs mt-1',
        help: 'text-xs mt-1'
      }
    },

    // The editor's content styling, which Nuxt UI's `editor` theme deliberately
    // leaves incomplete: it styles what its own extensions render, and tables and
    // task lists arrive with extensions we add ourselves (`PROSE_EXTENSIONS`). So
    // without this block a GFM table has no borders and a checklist draws a bullet
    // beside every checkbox with the text on the next line.
    //
    // Adapted from the official Nuxt UI editor template, which puts the same rules
    // in the same place, with its raw palette swapped for our semantic tokens.
    //
    // Do **not** add Tailwind Typography's `prose` to this element instead. It was
    // tried: two complete stylesheets on one element is what produced the bulleted
    // checkboxes and the borderless tables in the first place. See `ProseEditor`.
    editor: {
      slots: {
        base: [
          // Tables. `border-separate` with zero spacing, so the rounded corners
          // below have something to clip and adjacent cells share one hairline.
          '[&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_table]:rounded-md [&_table]:my-5',
          '[&_th]:py-2 [&_th]:px-3 [&_th]:font-semibold [&_th]:text-sm [&_th]:text-left [&_th]:bg-muted [&_th]:border-t [&_th]:border-b [&_th]:border-e [&_th]:first:border-s [&_th]:border-default',
          '[&_td]:py-2 [&_td]:px-3 [&_td]:text-sm [&_td]:text-left [&_td]:border-b [&_td]:border-e [&_td]:first:border-s [&_td]:border-default',
          // A cell's paragraph is a block like any other and would otherwise
          // inherit the editor's 20px block rhythm inside a 32px row.
          '[&_th_p]:my-0 [&_th_p]:leading-5 [&_td_p]:my-0 [&_td_p]:leading-5',
          '[&_td_ul]:my-0 [&_td_ol]:my-0 [&_td_li]:my-0.5',
          '[&_tr:first-child_th:first-child]:rounded-tl-md [&_tr:first-child_th:last-child]:rounded-tr-md [&_tr:last-child_td:first-child]:rounded-bl-md [&_tr:last-child_td:last-child]:rounded-br-md',
          // ProseMirror's own cell selection, which is invisible without this and
          // is why clicking across a table felt like landing somewhere unmarked.
          '[&_.selectedCell]:bg-primary/10 [&_.selectedCell]:ring-2 [&_.selectedCell]:ring-primary [&_.selectedCell]:ring-inset',

          // Task lists. The bullet has to go explicitly: the theme's `[&_ul]:list-disc`
          // has no idea this `ul` is a checklist.
          '[&_ul[data-type=taskList]]:list-none [&_ul[data-type=taskList]]:ps-1',
          '[&_ul[data-type=taskList]_li]:flex [&_ul[data-type=taskList]_li]:items-start [&_ul[data-type=taskList]_li]:ps-0',
          '[&_ul[data-type=taskList]_li>div>p]:my-0',
          '[&_ul[data-type=taskList]_li_label]:inline-flex [&_ul[data-type=taskList]_li_label]:pr-2.5 [&_ul[data-type=taskList]_li_label]:pt-1',
          '[&_ul[data-type=taskList]_li_label_input]:appearance-none [&_ul[data-type=taskList]_li_label_input]:size-4 [&_ul[data-type=taskList]_li_label_input]:rounded-sm [&_ul[data-type=taskList]_li_label_input]:ring [&_ul[data-type=taskList]_li_label_input]:ring-inset [&_ul[data-type=taskList]_li_label_input]:ring-accented [&_ul[data-type=taskList]_li_label_input]:bg-center',
          '[&_ul[data-type=taskList]_li_label_input:checked]:bg-primary [&_ul[data-type=taskList]_li_label_input:checked]:ring-primary [&_ul[data-type=taskList]_li_label_input:checked]:bg-[url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNCIgaGVpZ2h0PSIxNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDZMOSAxN2wtNS01Ii8+PC9zdmc+)] dark:[&_ul[data-type=taskList]_li_label_input:checked]:bg-[url(data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNCIgaGVpZ2h0PSIxNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9ImJsYWNrIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCI+PHBhdGggZD0iTTIwIDZMOSAxN2wtNS01Ii8+PC9zdmc+)]',
          '[&_ul[data-type=taskList]_li[data-checked=true]>div>p]:line-through [&_ul[data-type=taskList]_li[data-checked=true]>div>p]:opacity-50',

          // Headings, matched to what the *renderer* draws rather than left at the
          // theme's defaults. Nuxt UI sizes them `text-3xl`/`text-2xl`/`text-xl`, and
          // this app has overridden `--text-2xl` and `--text-3xl` into the display
          // tier (26/32/38, `font-display`) — which is banned on the card panel, and
          // which put a 26px h2 in a 360px-tall editor. The renderer runs Tailwind
          // Typography at `prose-sm` on a 14px body, giving 30 / 20 / 18 / 14; those
          // are the numbers to hit, because an editor whose heading changes size on
          // save is not showing you what you get.
          //
          // 30px and 18px are off the app's closed working scale on purpose: prose has
          // its own scale, set by typography and already shipped by `ProseDescription`.
          // Mirroring it here is what keeps the two surfaces agreeing.
          '[&_h1]:text-[1.875rem] [&_h2]:text-xl [&_h3]:text-[1.125rem] [&_h4]:text-base [&_h5]:text-base [&_h6]:text-base',

          // The toolbar wraps rather than clipping: the card panel is narrower than
          // the button row, and the AI control sits after it.
          // (see ProseEditor for the row itself)

          // The mention pill, so a mention looks the same being written as it does
          // once saved — `ProseDescription` paints the same shape for the renderer.
          '[&_.mention]:text-primary [&_.mention]:font-semibold [&_.mention]:bg-primary/8 [&_.mention]:rounded-full [&_.mention]:px-1.5 [&_.mention]:py-0.5 [&_.mention]:whitespace-nowrap'
        ]
      }
    },

    // Menus and popovers share one floating surface.
    dropdownMenu: {
      slots: {
        content: 'rounded-lg shadow-float',
        item: 'text-sm'
      }
    },

    popover: {
      slots: {
        content: 'rounded-lg shadow-float'
      }
    },

    tooltip: {
      slots: {
        content: 'rounded-md text-xs font-medium'
      }
    },

    // Single-slot components take `base` directly rather than a `slots` object.
    kbd: {
      base: 'rounded-md font-mono'
    },

    skeleton: {
      base: 'rounded-lg bg-elevated animate-pulse'
    }
  }
})
