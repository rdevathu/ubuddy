import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: 'dist',
  manifest: {
    name: 'UBuddy',
    description: 'Voice + AI study companion for UWorld questions',
    version: '0.1.0',
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
    commands: {
      'toggle-panel': {
        suggested_key: { default: 'Ctrl+Shift+U', mac: 'Command+Shift+U' },
        description: 'Toggle UBuddy side panel',
      },
      'read-question': {
        suggested_key: { default: 'Ctrl+Shift+R', mac: 'Command+Shift+R' },
        description: 'Read current question aloud',
      },
    },
  },
});
