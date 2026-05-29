import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Hypersonic.js',
  description: 'A modern Django-inspired full-stack TypeScript framework.',

  // Custom domain — no sub-path needed
  base: '/',

  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/' },
      {
        text: 'GitHub',
        link: 'https://github.com/Zesuperaker/hypersonic',
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [{ text: 'Introduction', link: '/guide/' }],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/Zesuperaker/hypersonic' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026-present Joaquim Dalton-Pereira',
    },

    search: {
      provider: 'local',
    },
  },
})