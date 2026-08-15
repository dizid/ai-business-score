<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import Icon from '../../shared/Icon.vue';

defineProps<{ email: string }>();
const emit = defineEmits<{ (e: 'sign-out'): void }>();

const open = ref(false);
const rootEl = ref<HTMLElement | null>(null);

function toggle() {
  open.value = !open.value;
}
function close() {
  open.value = false;
}
function onDocClick(e: MouseEvent) {
  if (open.value && rootEl.value && !rootEl.value.contains(e.target as Node)) close();
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close();
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeydown);
});
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div class="account-menu" ref="rootEl">
    <button type="button" class="trigger" :aria-expanded="open" @click="toggle">
      <span class="email">{{ email }}</span>
      <Icon name="caret-down" class="caret" :class="{ open }" />
    </button>
    <div class="panel" v-if="open" @click="close">
      <a href="/how-it-works">How this works</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms of Service</a>
      <div class="divider"></div>
      <button type="button" class="sign-out" @click="emit('sign-out')">Sign out</button>
    </div>
  </div>
</template>

<style scoped>
.account-menu { position: relative; }
.trigger {
  display: flex; align-items: center; gap: 8px; padding: 4px 2px;
  background: none; border: none; color: var(--muted); font: inherit; font-size: 0.85rem;
  cursor: pointer; transition: color 0.15s ease;
}
.trigger:hover { color: var(--fg); }
.email { max-width: 40vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.caret { color: var(--faint); transition: transform 0.15s ease; }
.caret.open { transform: rotate(180deg); }

.panel {
  position: absolute; top: calc(100% + 8px); right: 0; z-index: 30;
  display: flex; flex-direction: column; min-width: 190px;
  background: var(--card); border: 1px solid var(--border); border-radius: 10px;
  padding: 6px; box-shadow: var(--shadow);
}
.panel a, .panel button.sign-out {
  display: block; width: 100%; text-align: left; padding: 8px 10px; border-radius: 6px;
  font-size: 0.85rem; color: var(--fg); text-decoration: none;
  background: none; border: none; font: inherit; cursor: pointer;
  transition: background 0.15s ease;
}
.panel a:hover, .panel button.sign-out:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.panel button.sign-out { color: var(--critical); }
.divider { height: 1px; background: var(--border); margin: 6px 4px; }
</style>
