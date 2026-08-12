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
      neutral: 'zinc'
    },

    // Buttons carry the app's shape language: 10px corners, semibold labels.
    // Matches what ~50 hand-rolled `<button>`s were doing by hand.
    button: {
      slots: {
        base: 'rounded-lg font-semibold'
      },
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
        title: 'text-base font-bold tracking-[-0.02em] text-highlighted',
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
        label: 'text-xs font-semibold uppercase tracking-[0.06em] text-dimmed',
        error: 'text-xs mt-1',
        help: 'text-xs mt-1'
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
