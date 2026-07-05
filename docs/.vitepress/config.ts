import { defineConfig } from 'vitepress'
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  title: 'Hypersonic.js',
  description: 'A modern Django-inspired full-stack TypeScript framework.',

  base: '/',

  head: [['link', { rel: 'icon', href: '/favicon.ico' }]],

  transformPageData(pageData) {
    const filePath = resolve(__dirname, '..', pageData.relativePath)
    try {
      pageData.frontmatter.rawMarkdown = readFileSync(filePath, 'utf-8')
    } catch {
      pageData.frontmatter.rawMarkdown = ''
    }
  },

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
            { text: 'Rate Limiting', link: '/guide/rate-limiting' },
            { text: 'Security', link: '/guide/security' },
            { text: 'CLI', link: '/guide/cli' },
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