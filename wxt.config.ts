import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  outDir: 'dist',
  manifest: {
    name: 'UBuddy',
    description: 'AI study companion for UWorld, AMBOSS, and NBME Step 2 CK questions',
    // version is taken from package.json by WXT — keep it bumped there.
    // `webNavigation` is needed so the panel can enumerate the iframes of the
    // active tab and dispatch `panel:requestParse` into the NBME question
    // frame (which is a child of starttest.com, not the top doc).
    // `contextMenus` powers a right-click → "Open UBuddy panel" entry —
    // the only way to reach the side panel from NBME's toolbar-less kiosk
    // window, where the extension action icon isn't visible.
    permissions: [
      'storage',
      'sidePanel',
      'activeTab',
      'scripting',
      'webNavigation',
      'contextMenus',
    ],
    host_permissions: [
      '*://*.uworld.com/*',
      '*://*.amboss.com/*',
      '*://*.starttest.com/*',
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
