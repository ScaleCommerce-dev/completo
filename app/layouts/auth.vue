<script setup lang="ts">
/**
 * The access pages — sign in, register, password reset, account setup, OAuth
 * consent (handoff `03-layout-navigation.md` › Seitentypen › Zugang): a form
 * column on the left on the page surface, a dark image area on the right,
 * and below 780px the form alone.
 *
 * The image area is the shell's near-black with the brand gradient as its one
 * picture — the guideline's "designed surface" device, and the only brand
 * moment on these pages. It replaced four colour washes, a glow orb, a noise
 * overlay and a glassy card, which were Completo's own brand moment before the
 * company styleguide; nothing in it loops, so there is nothing to stop
 * offscreen or under reduced motion.
 */
const { phase } = useAuthTransition()
</script>

<template>
  <div
    class="c2s-auth min-h-dvh grid bg-default"
    :data-auth-phase="phase"
  >
    <main class="c2s-auth-form flex flex-col min-w-0 px-6 py-8 sm:px-12">
      <NuxtLink
        to="/login"
        class="flex items-center gap-2.5 self-start"
      >
        <span class="brand-tile flex items-center justify-center size-7 rounded-lg shrink-0">
          <img
            src="/completo-icon.svg"
            alt=""
            class="size-5 invert"
          >
        </span>
        <span class="text-base font-extrabold tracking-heading text-highlighted">Completo</span>
      </NuxtLink>

      <div class="flex-1 flex items-center py-10">
        <div class="w-full max-w-[400px]">
          <slot />
        </div>
      </div>
    </main>

    <aside
      class="c2s-auth-art dark c2s-shell relative overflow-hidden max-[780px]:hidden"
      aria-hidden="true"
    >
      <div class="c2s-auth-picture absolute inset-6 rounded-content overflow-hidden flex flex-col justify-end p-10">
        <span class="brand-tile flex items-center justify-center size-16 rounded-xl mb-8 ring-1 ring-on-accent/30">
          <img
            src="/completo-icon.svg"
            alt=""
            class="size-11 invert"
          >
        </span>
        <p class="text-3xl font-display font-extrabold tracking-display text-on-accent">
          All the toppings.
        </p>
        <p class="text-3xl font-display font-extrabold tracking-display text-on-accent/70">
          None of the mess.
        </p>
      </div>
    </aside>
  </div>
</template>
