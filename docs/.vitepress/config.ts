import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Hypersonic.js',
  description: 'A modern Django-inspired full-stack TypeScript framework.',

  base: '/',

  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  themeConfig: {
    logo: '/logo.svg',

    nav: [
      { text: 'Guide', link: '/guide/' },
      {
        text: 'GitHub',
        link: 'https://github.com/hypersonic-js/hypersonic-js',
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Getting Started',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Quick Start', link: '/guide/quickstart' },
          ],
        },
        {
          text: 'Guides',
          items: [
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Routing & Controllers', link: '/guide/routing' },
            { text: 'Frontend (Inertia + React)', link: '/guide/frontend' },
            { text: 'Authentication', link: '/guide/authentication' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/hypersonic-js/hypersonic-js' },
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