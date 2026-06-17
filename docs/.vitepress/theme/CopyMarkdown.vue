<script setup lang="ts">
import { useData } from 'vitepress'
import { ref } from 'vue'

const { frontmatter } = useData()
const copied = ref(false)

async function copy() {
  try {
    await navigator.clipboard.writeText(frontmatter.value.rawMarkdown ?? '')
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  } catch {
    // Clipboard write can fail in restricted contexts (e.g. non-HTTPS, Firefox
    // without a user gesture, or embedded iframes). Fail silently — the button
    // simply does nothing rather than emitting an unhandled promise rejection.
  }
}
</script>

<template>
  <div class="copy-md-wrap">
    <button class="copy-md-btn" @click="copy">
      {{ copied ? '✓ Copied' : 'Copy as Markdown' }}
    </button>
  </div>
</template>

<style scoped>
.copy-md-wrap {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 1.5rem;
}

.copy-md-btn {
  font-size: 0.75rem;
  line-height: 1;
  padding: 0.35rem 0.8rem;
  border: 1px solid var(--vp-c-border);
  border-radius: 4px;
  background: transparent;
  color: var(--vp-c-text-2);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.copy-md-btn:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}
</style>