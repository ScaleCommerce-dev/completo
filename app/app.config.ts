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
/**
 * Nuxt UI's fields mark focus by turning their inset ring primary. Under the
 * connect2scale focus model the marker is the outline `main.css` draws, so a
 * ring that also changed would be the doubled focus line the guideline rules
 * out ("genau eine Fokuslinie"). The resting ring stays where it was.
 */
const FIELD_FOCUS = [{ color: 'primary' as const, class: 'focus-visible:ring-accented focus-visible:outline-0' }]

export default defineAppConfig({
  ui: {
    // tailwind-merge resolves a conflict only between classes it knows belong
    // to one group, and it does not know this app's own token names: it read
    // `shadow-dialog` as a shadow *colour*, so the theme's `shadow-lg` survived
    // beside it, and it would read `text-dialog` as a text colour and drop it
    // in favour of `text-highlighted`. Registering the names makes a themed
    // override actually override.
    tv: {
      twMergeConfig: {
        extend: {
          theme: {
            spacing: ['dialog', 'card']
          },
          classGroups: {
            'shadow': [{ shadow: ['raise', 'float', 'drag', 'dialog'] }],
            'font-size': [{ text: ['2xs', 'dialog'] }],
            'rounded': [{ rounded: ['field', 'content', 'feedback'] }],
            'leading': [{ leading: ['dialog', 'feedback'] }],
            'bg-color': [{ bg: ['accent', 'accent-hover', 'accent-soft', 'canvas', 'shell', 'disabled', 'backdrop', 'danger-fill', 'danger-hover', 'action-hover', 'success-soft', 'danger-soft', 'table-header', 'row-hover', 'segment'] }]
          }
        }
      }
    },

    // connect2scale: `berry` is the company accent ramp (500 = #d4006a) and
    // `ink` the company neutrals, both declared in `main.css`. The semantic
    // tokens are pinned to the guideline's exact values there; these names only
    // decide what a Nuxt UI internal gets when it asks for a shade.
    colors: {
      primary: 'berry',
      // Violet marks AI-assisted features (the write button, skill pickers, the
      // AI review bar). It was already being used for exactly that, hardcoded in
      // four files; naming it means those surfaces stay in step with each other.
      secondary: 'violet',
      neutral: 'ink',
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
    //
    // connect2scale (handoff `04-komponenten.md` › Buttons):
    //  - md is the action size: at least 44px tall (the touch target), 9px icon
    //    gap. `xs`/`sm` stay as they were — they are the dense inline controls
    //    on cards and list cells, which the guideline's page-level buttons do
    //    not describe (recorded as a deviation in `docs/connect2scale.md`).
    //  - Primary is the brand magenta with white 700 text, in *both* themes,
    //    9px corners, #b8005a on hover. `bg-accent`, not `bg-primary`: the
    //    latter is the text-safe pink in dark mode (see main.css).
    //  - Secondary (neutral outline) has the deliberately strong
    //    `--c2s-button-border` edge and fills with the canvas on hover.
    //  - Danger is the fixed danger fill, the same in both themes.
    //  - Disabled filled/outlined buttons go neutral at full opacity rather
    //    than fading, and that beats every variant and hover rule.
    button: {
      slots: {
        base: 'rounded-lg font-semibold disabled:opacity-45 aria-disabled:opacity-45 focus-visible:ring-accented'
      },
      variants: {
        size: {
          md: {
            base: 'min-h-11 px-3.75 py-2 gap-2.25'
          },
          lg: {
            base: 'min-h-11 px-4 py-2.5 gap-2.25'
          }
        }
      },
      compoundVariants: [{
        color: 'neutral',
        variant: 'ghost',
        class: 'text-dimmed hover:text-toned'
      }, {
        color: 'primary',
        variant: 'solid',
        class: 'bg-accent hover:bg-accent-hover active:bg-accent-hover text-on-accent font-bold rounded-field disabled:opacity-100 aria-disabled:opacity-100 disabled:bg-disabled aria-disabled:bg-disabled disabled:text-disabled aria-disabled:text-disabled'
      }, {
        color: 'primary',
        variant: 'solid',
        size: 'md',
        class: 'px-4.25'
      }, {
        color: 'error',
        variant: 'solid',
        class: 'bg-danger-fill hover:bg-danger-hover active:bg-danger-hover text-on-accent font-bold disabled:opacity-100 aria-disabled:opacity-100 disabled:bg-disabled aria-disabled:bg-disabled disabled:text-disabled aria-disabled:text-disabled'
      }, {
        color: 'neutral',
        variant: 'outline',
        class: 'ring-control hover:bg-canvas active:bg-canvas disabled:opacity-100 aria-disabled:opacity-100 disabled:bg-disabled aria-disabled:bg-disabled disabled:text-disabled aria-disabled:text-disabled disabled:ring-disabled aria-disabled:ring-disabled'
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

    // A standard card: 12px corners, 23px padding (handoff `04` › Karten).
    card: {
      slots: {
        root: 'rounded-xl',
        header: 'px-card sm:px-card py-3',
        body: 'p-card sm:p-card',
        footer: 'px-card sm:px-card py-3'
      }
    },

    // Dialogs (handoff › Dialoge): 16px corners, 32px padding (25px on a
    // phone), the 22px title, body copy at 14px/1.8 in `muted`, actions to the
    // right 10px apart, the dialog shadow, and the shell-tinted backdrop with a
    // 4px blur. No rules between header, body and footer — the 32px gutters do
    // that work. Enter 280ms ease-out from 10px down at .98; leave 180ms
    // ease-in (handoff `06-motion.md`), keyframes in main.css.
    modal: {
      slots: {
        content: 'divide-y-0',
        header: 'px-dialog sm:px-dialog pt-dialog pb-0 min-h-0 gap-3',
        title: 'text-dialog font-bold text-highlighted',
        description: 'text-base leading-dialog text-muted mt-1',
        body: 'px-dialog sm:px-dialog py-5 sm:py-5 text-base text-muted',
        // `sm:` restated: the theme pads `p-4 sm:px-6`, and tailwind-merge only
        // replaces a class with the same variant, so a bare `px-dialog` lost to
        // `sm:px-6` from 640px up (measured: header 24px, body 32px).
        footer: 'px-dialog sm:px-dialog pb-7 pt-2 justify-end gap-2.5',
        close: 'top-5 end-5 sm:top-6 sm:end-6'
      },
      // The shape lives on the `fullscreen: false` variant because that is
      // where the theme puts its own `rounded-lg shadow-lg ring`, and a variant
      // class lands after the slot's — set on the slot, the radius lost the
      // merge and every dialog rendered at 8px (measured with getComputedStyle).
      variants: {
        fullscreen: {
          false: {
            content: 'rounded-2xl shadow-dialog ring-0'
          }
        },
        overlay: {
          true: {
            overlay: 'bg-backdrop backdrop-blur-xs'
          }
        },
        transition: {
          true: {
            overlay: 'data-[state=open]:animate-[fade-in_180ms_ease-out] data-[state=closed]:animate-[fade-out_180ms_ease-in]',
            content: 'data-[state=open]:animate-[c2s-dialog-in_280ms_var(--c2s-ease-out)] data-[state=closed]:animate-[c2s-dialog-out_180ms_ease-in]'
          }
        }
      }
    },

    // Fields (handoff › Eingabefelder): surface fill, 9px corners, at least
    // 44px tall at the default size, 14px text, placeholder in `muted` at
    // full opacity rather than the theme's `dimmed`.
    input: {
      slots: {
        base: 'rounded-field placeholder:text-muted'
      },
      compoundVariants: FIELD_FOCUS,
      variants: {
        size: {
          md: {
            base: 'min-h-11 px-3 py-2 text-base'
          },
          lg: {
            base: 'min-h-11 px-3.5 py-2.5 text-base'
          }
        }
      },
      defaultVariants: {
        size: 'md'
      }
    },

    textarea: {
      slots: {
        base: 'rounded-field placeholder:text-muted'
      },
      compoundVariants: FIELD_FOCUS
    },

    select: {
      slots: {
        base: 'rounded-field'
      },
      variants: {
        size: {
          md: { base: 'min-h-11 px-3 py-2 text-base' },
          lg: { base: 'min-h-11 px-3.5 py-2.5 text-base' }
        }
      },
      compoundVariants: FIELD_FOCUS
    },

    selectMenu: {
      slots: {
        base: 'rounded-field'
      },
      variants: {
        size: {
          md: { base: 'min-h-11 px-3 py-2 text-base' },
          lg: { base: 'min-h-11 px-3.5 py-2.5 text-base' }
        }
      },
      compoundVariants: FIELD_FOCUS
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

          // Block rhythm, matched to the renderer. Measured on a card: rendered prose
          // runs 14px on a 23.8px line (the 1.7 that `main.css` argues for) with a
          // 16px gap between paragraphs, while the editor theme's defaults are a
          // 28px line and a 20px gap. Four pixels of leading and four of gap is
          // plainly visible when you press Enter, and it made the editor feel airier
          // than the card it was editing.
          '[&_p]:leading-[1.7] *:my-4',

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

    // Menus and popovers share one floating surface. Context menus are at
    // least 210px wide with 12×10px entries (handoff `04` › Karten ›
    // Kontextmenü); a destructive entry is `color: 'error'` at its call site.
    dropdownMenu: {
      slots: {
        content: 'rounded-lg shadow-float min-w-[210px]'
      },
      // On the size variant, because that is where the theme pads the item —
      // set on the slot, the variant's `p-1.5` landed after it and won.
      variants: {
        size: {
          md: {
            // Not `label`: the due-date picker hand-builds a header from the
            // upstream label classes, and `menu-placement.test.ts` keeps it so.
            item: 'px-2.5 py-3 text-sm gap-2.5'
          }
        }
      }
    },

    // The command palette (⌘K). The dialog chrome comes from `modal`; this is
    // its list (handoff `04` › Select, Suche): the search field 44px, group
    // labels in the sidebar's 10px uppercase, rows on the menu's 12×10px
    // padding, the highlighted row on the menu hover (`--c2s-surface-subtle`)
    // and the current page's row at 600 — the guideline's "selected option".
    commandPalette: {
      slots: {
        label: 'text-2xs font-semibold uppercase tracking-label text-dimmed'
      },
      variants: {
        size: {
          md: {
            input: '[&>input]:h-11',
            label: 'px-2.5 pt-3 pb-1.5 text-2xs gap-1.5',
            item: 'px-2.5 py-2.5 text-sm gap-2.5'
          }
        },
        active: {
          true: {
            item: 'text-highlighted font-semibold before:bg-muted'
          },
          false: {
            item: 'text-default data-highlighted:not-data-disabled:text-highlighted data-highlighted:not-data-disabled:before:bg-muted'
          }
        }
      }
    },

    // The card panel. The guideline has no side panel, so it takes the
    // dialog's surface: the dialog shadow, and the dark backdrop tint at the
    // dialog's timings (enter 280ms ease-out, leave 180ms ease-in). Not the
    // dialog's blur — the panel exists so the board beside it stays readable
    // (`KanbanBoard.revealColumn`), and a blurred board is the thing it avoids.
    slideover: {
      slots: {
        overlay: 'bg-backdrop',
        content: 'sm:ring-0 sm:shadow-dialog'
      },
      compoundVariants: [{
        transition: true,
        side: 'right',
        class: {
          content: 'data-[state=open]:animate-[slide-in-from-right_280ms_var(--c2s-ease-out)] data-[state=closed]:animate-[slide-out-to-right_180ms_ease-in]'
        }
      }]
    },

    popover: {
      slots: {
        content: 'rounded-lg shadow-float'
      }
    },

    // The shell's mobile switch at the guideline's 980px rather than Nuxt UI's
    // 1024px (handoff `03` › Breakpoints). Added beside the theme's `lg:`
    // classes, which agree with these from 1024px up.
    dashboardSidebar: {
      slots: {
        root: 'nav:flex',
        content: 'nav:hidden',
        overlay: 'nav:hidden'
      }
    },
    dashboardSidebarToggle: {
      base: 'nav:hidden'
    },

    // Feedback (handoff `04` › Feedback): success and error on their soft
    // surfaces with their own edge and text colour, 10px corners, 16px
    // padding, 14px/1.6 text. Display time is set per toast by
    // `plugins/toast-duration.client.ts`.
    toast: {
      slots: {
        root: 'rounded-feedback p-4 shadow-float',
        title: 'text-base leading-feedback',
        description: 'text-base leading-feedback'
      },
      compoundVariants: [{
        color: 'success',
        class: { root: 'bg-success-soft ring-success-edge', title: 'text-success', description: 'text-success', icon: 'text-success' }
      }, {
        color: 'error',
        class: { root: 'bg-danger-soft ring-danger-edge', title: 'text-error', description: 'text-error', icon: 'text-error' }
      }]
    },

    // Tables (handoff `04` › Tabellen): an opaque header that sticks while the
    // table scrolls, row hover, 16px cell padding.
    table: {
      slots: {
        thead: 'sticky top-0 z-[1] bg-table-header',
        th: 'px-4',
        td: 'px-4',
        tbody: '[&>tr]:hover:bg-row-hover'
      }
    },

    // Segment switches (handoff `04` › Segment-Schalter): a hairline frame,
    // 8px corners, 3px padding, the active segment on the segment colours.
    tabs: {
      compoundVariants: [{
        color: 'primary',
        variant: 'pill',
        class: {
          list: 'bg-transparent ring ring-default rounded-lg p-[3px]',
          indicator: 'bg-segment shadow-none',
          trigger: 'data-[state=active]:text-segment'
        }
      }],
      // Tab content enters at opacity .55 from 4px down, 280ms ease-out
      // (handoff `06-motion.md`); keyframes in main.css.
      slots: {
        content: 'c2s-tab-in'
      }
    },

    // Switches carry the brand fill, not the text-safe pink, when on.
    switch: {
      compoundVariants: [{
        color: 'primary',
        class: { base: 'data-[state=checked]:bg-accent' }
      }]
    },

    tooltip: {
      slots: {
        content: 'rounded-md text-xs font-medium text-balance'
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
