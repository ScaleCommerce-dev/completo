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
    button: {
      slots: {
        base: 'rounded-lg font-semibold disabled:opacity-45 aria-disabled:opacity-45 focus-visible:ring-accented'
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
