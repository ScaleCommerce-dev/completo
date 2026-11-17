<script setup lang="ts">
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
    { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
    { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
    { rel: 'icon', sizes: '48x48', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }
  ],
  htmlAttrs: {
    lang: 'en'
  }
})

const HOME_TITLE = 'Completo: All the Toppings. None of the Mess.'

useSeoMeta({
  title: HOME_TITLE,
  description: 'Drag. Drop. Completo.'
})

// Pages give their own title, and the app's name is appended once, here: twelve
// pages used to spell out " · Completo" each.
useHead({
  titleTemplate: (title?: string) => !title ? 'Completo' : title === HOME_TITLE ? title : `${title}`
})
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
