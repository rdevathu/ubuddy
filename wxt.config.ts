import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: 'dist',
  manifest: {
    name: 'UBuddy',
    description: 'AI study companion for UWorld questions',
    // version is taken from package.json by WXT — keep it bumped there.
    permissions: ['storage', 'sidePanel', 'activeTab', 'scripting'],
    host_permissions: [
      '*://*.uworld.com/*',
      'https://dlivcxwafmssxwebzccb.supabase.co/*',
    ],
    action: {
      default_title: 'Open UBuddy panel',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
  },
});
