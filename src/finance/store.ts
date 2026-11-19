import { create } from 'zustand';
import { PermissionsAndroid, Platform } from 'react-native';
import Constants from 'expo-constants';
import { smsBridge } from './native';
import { Transaction } from './parser';
import { clearFinance, ingestSms, listTransactions } from './repository';
export const policyReady = Constants.expoConfig?.extra?.financeSmsPolicyReady === true;
type State = { transactions: Transaction[]; ready: boolean; enabled: boolean; permission: boolean; error: string; notice: string; refresh(): Promise<void>; enable(): Promise<void>; disable(): void; clear(): Promise<void> };
let refreshing = false;
export const useFinance = create<State>((set, get) => ({
  transactions: [], ready: false, enabled: false, permission: false, error: '', notice: '',
  async refresh() {
    if (refreshing) return;
    refreshing = true;
    try {
      const permission = Platform.OS === 'android' && await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      if (!permission) smsBridge?.setEnabled(false);
      const messages = smsBridge?.pending() || [];
      const count = await ingestSms(messages);
      smsBridge?.acknowledge(messages.map(message => message.id));
      set({ transactions: await listTransactions(), ready: true, permission, enabled: smsBridge?.enabled() || false, error: '', notice: count ? `${count} new bank transaction${count === 1 ? '' : 's'} detected` : get().notice });
    } catch (error) { set({ ready: true, error: String(error) }); }
    finally { refreshing = false; }
  },
  async enable() {
    if (!policyReady || !smsBridge || Platform.OS !== 'android') { set({ error: 'Automatic detection requires an Android development build with the distribution policy gate configured.' }); return; }
    try {
      const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS);
      const granted = result === PermissionsAndroid.RESULTS.GRANTED;
      smsBridge.setEnabled(granted);
      set({ enabled: granted, permission: granted, error: granted ? '' : 'SMS permission denied. You can enable it later in Android app settings.' });
    } catch (error) { set({ error: String(error) }); }
  },
  disable() { smsBridge?.setEnabled(false); set({ enabled: false }); },
  async clear() { try { get().disable(); smsBridge?.clear(); await clearFinance(); set({ transactions: [], notice: 'All local finance data deleted.', error: '' }); } catch (error) { set({ error: String(error) }); } },
}));
