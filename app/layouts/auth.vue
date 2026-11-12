<script setup lang="ts">
/**
 * The access pages — sign in, register, password reset, account setup, OAuth
 * consent (handoff `03-layout-navigation.md` › Seitentypen › Zugang): a form
 * column on the left on the page surface, a dark image area on the right,
 * and below 780px the form alone.
 *
 * The image area shows the product: a real board screenshot on the shell's
 * near-black, lit by the accent and the brand's blue-violet, with one card
 * lifted out of it. It enters with the guideline's large-preview motion once,
 * on mount; nothing loops, so nothing has to stop offscreen. `main.css` ›
 * ACCESS PAGES holds the geometry and the motion.
 */
const { phase } = useAuthTransition()
</script>

<template>
  <div
    class="c2s-auth min-h-dvh grid bg-default"
    :data-auth-phase="phase"
  >
    <!-- "Where am I signing in?" The product's name is this column's headline,
         above the page's own title; the image area beside it explains what
         the product is and carries no logo of its own. -->
    <main class="c2s-auth-form flex flex-col min-w-0 px-6 py-8 sm:px-12">
      <div class="flex-1 flex items-center py-4">
        <div class="w-full max-w-[400px]">
          <NuxtLink
            to="/login"
            class="flex items-center gap-4 mb-10 w-fit"
            aria-label="Completo"
          >
            <span class="brand-tile flex items-center justify-center size-14 rounded-xl shrink-0">
              <img
                src="/completo-icon.svg"
                alt=""
                class="size-10 invert"
              >
            </span>
            <span class="text-4xl font-display font-extrabold tracking-display text-highlighted">Completo</span>
          </NuxtLink>
          <slot />
        </div>
      </div>
    </main>

    <!--
      The image area is the product itself: a real board (the "Spring Launch"
      demo project, dark theme) bleeding off the panel's edges, with one card
      lifted out of it mid-drag in the app's own drag treatment. "Drag. Drop."
      shown rather than said. Decorative to a screen reader — the form column
      carries everything a visitor needs.
    -->
    <aside
      class="c2s-auth-art dark c2s-theme c2s-shell relative overflow-hidden max-[780px]:hidden"
      data-theme="dark"
      aria-hidden="true"
    >
      <div class="c2s-auth-copy relative z-10 px-12 pt-16 max-w-[34rem]">
        <p class="font-mono text-xs font-medium uppercase tracking-label text-dimmed">
          Drag. Drop. Completo.
        </p>
        <p class="mt-5 text-lg leading-relaxed text-default max-w-md">
          Plan and track your team's work on one shared board. Open any card to discuss it, drag it forward as work moves, and let AI agents pick up tasks too.
        </p>
      </div>

      <div class="c2s-auth-stage">
        <img
          src="/auth/board-preview.jpg"
          alt=""
          width="1440"
          height="900"
          class="c2s-auth-preview"
        >
        <!-- The card's own slot, as the board draws it during a drag. -->
        <div class="c2s-auth-ghost" />
        <!-- The same card as the one in the slot, row for row, so the slot is
             exactly its footprint. -->
        <div class="c2s-auth-lifted">
          <div>
            <!-- Broken where the board breaks it, so the card fills its slot's
                 height with content rather than with an empty gap. -->
            <p class="c2s-auth-lifted-title">
              Collect press quotes for the<br>launch page
            </p>
            <p class="c2s-auth-lifted-text">
              Three short quotes from beta customers, approved for print.
            </p>
            <span
              class="swatch-outline c2s-auth-lifted-tag"
              style="--swatch: #f59e0b"
            >Discuss</span>
          </div>
          <div class="c2s-auth-lifted-meta">
            <span class="card-id">SL-11</span>
            <span
              class="swatch-avatar c2s-auth-lifted-avatar"
              style="--swatch: #f97316"
            ><span>GT</span></span>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>
