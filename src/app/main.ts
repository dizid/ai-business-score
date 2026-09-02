import '../shared/theme.css';
import { createApp } from 'vue';
import App from './App.vue';
import router from './router';

createApp(App).use(router).mount('#app');

// PWA installability: root-scoped so it can register a /app-scoped worker
// with no Service-Worker-Allowed header needed. See public/sw.js.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/app' });
}
