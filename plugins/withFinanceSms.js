const { withAndroidManifest } = require('expo/config-plugins');
module.exports = (config, { policyReady = false } = {}) => withAndroidManifest(config, config => {
  const manifest = config.modResults.manifest;
  manifest.application = manifest.application || [{}];
  manifest.application[0].$ = manifest.application[0].$ || {};
  manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
  manifest['uses-permission'] = (manifest['uses-permission'] || []).filter(entry => entry.$['android:name'] !== 'android.permission.RECEIVE_SMS');
  if (policyReady) manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.RECEIVE_SMS' } });
  return config;
});
