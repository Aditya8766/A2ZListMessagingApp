import { useRef, useState, type ComponentRef } from 'react';
import { Alert, Keyboard, Linking, PermissionsAndroid, Platform, Pressable, ScrollView, Share, StatusBar, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { smsBridge, type DeviceSms } from '../finance/native';
import { api, type Recipient } from '../services/api';
import { parseRecipients } from '../sms/recipients';

type SmsPermission = typeof PermissionsAndroid.PERMISSIONS.READ_SMS | typeof PermissionsAndroid.PERMISSIONS.SEND_SMS;
type Feedback = { message: string; error?: boolean; success?: boolean };
type Delivery = { transactionId: string; number: string; status: 'SENT' | 'FAILED' | 'UNCONFIRMED'; detail?: string };

function transactionId() {
  return `A2Z-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

async function allow(permission: SmsPermission) {
  const result = await PermissionsAndroid.request(permission);
  if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
    Alert.alert('Allow SMS access', 'In Android app settings, select Permissions, then SMS, then Allow.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Open settings', onPress: () => { void Linking.openSettings(); } },
    ]);
  }
  return false;
}

function Action({ label, onPress, disabled, secondary }: {
  label: string; onPress: () => void; disabled?: boolean; secondary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
      style={({ pressed }) => [styles.action, secondary && styles.secondary, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={[styles.actionText, secondary && styles.secondaryText]}>{label}</Text>
    </Pressable>
  );
}

function Status({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null;
  return <Text accessibilityLiveRegion="polite" style={[styles.status, feedback.error && styles.error, feedback.success && styles.success]}>{feedback.message}</Text>;
}

export default function SmsScreen() {
  const [tab, setTab] = useState<'compose' | 'inbox'>('compose');
  const [recipients, setRecipients] = useState('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [messages, setMessages] = useState<DeviceSms[] | null>(null);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readStatus, setReadStatus] = useState<Feedback | null>(null);
  const [sendStatus, setSendStatus] = useState<Feedback | null>(null);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);
  const [recipientStatus, setRecipientStatus] = useState<Feedback | null>(null);
  const [recipientNames, setRecipientNames] = useState<Record<string, string>>({});
  const [fieldError, setFieldError] = useState<{ field: 'phone' | 'message'; message: string } | null>(null);
  const phoneInput = useRef<ComponentRef<typeof TextInput>>(null);
  const messageInput = useRef<ComponentRef<typeof TextInput>>(null);
  const sending = useRef(false);
  const bridge = Platform.OS === 'android' ? smsBridge : null;
  const heading = title.trim();
  const message = heading ? `${heading}\n${body}` : body;

  async function read(older = false) {
    if (!bridge) return;
    setBusy(true);
    setReadStatus(null);
    try {
      if (!await allow(PermissionsAndroid.PERMISSIONS.READ_SMS)) {
        setReadStatus({ message: 'Allow SMS access to read messages.', error: true });
        return;
      }
      const page = await bridge.readDeviceSms(older ? messages?.at(-1)?.id ?? null : null);
      setMessages(previous => older ? [...(previous ?? []), ...page] : page);
      setMore(page.length === 50);
    } catch (error) {
      setReadStatus({ message: error instanceof Error ? error.message : 'Could not read device SMS.', error: true });
    } finally {
      setBusy(false);
    }
  }

  async function send(numbers: string[]) {
    if (!bridge || sending.current) return;
    sending.current = true;
    setBusy(true);
    setSendStatus({ message: 'Sending SMS…' });
    try {
      if (!await allow(PermissionsAndroid.PERMISSIONS.SEND_SMS)) {
        setSendStatus({ message: 'Allow SMS access to send messages.', error: true });
        return;
      }
      const report: Delivery[] = [];
      for (const number of numbers) {
        const id = transactionId();
        try {
          const personalizedMessage = message.replace(/\{\{\s*name\s*\}\}/gi, recipientNames[number] ?? 'there');
          const confirmed = await bridge.sendDeviceSms(number, personalizedMessage);
          report.push({ transactionId: id, number, status: confirmed ? 'SENT' : 'UNCONFIRMED', detail: confirmed ? 'Android confirmed submission' : 'No confirmation received' });
        } catch (error) {
          report.push({ transactionId: id, number, status: 'FAILED', detail: error instanceof Error ? error.message : 'Android rejected the request.' });
        }
      }
      setDeliveries(report);
      const sent = report.filter(item => item.status === 'SENT').length;
      const failed = report.filter(item => item.status === 'FAILED').map(item => item.number);
      const unconfirmed = report.filter(item => item.status === 'UNCONFIRMED').map(item => item.number);
      const failureReason = report.find(item => item.status === 'FAILED')?.detail ?? '';
      if (sent === numbers.length) {
        setSendStatus({ message: numbers.length === 1 ? 'SMS sent successfully' : `SMS sent successfully to ${sent} recipients`, success: true });
      } else {
        const details = [
          `Sent to ${sent} of ${numbers.length} recipients.`,
          failed.length ? `Send failed for ${failed.join(', ')}. ${failureReason}` : '',
          unconfirmed.length ? `Android hasn’t confirmed sending to ${unconfirmed.join(', ')}. Check before sending again.` : '',
        ];
        setSendStatus({ message: details.filter(Boolean).join(' '), error: failed.length > 0 });
      }
    } catch (error) {
      setSendStatus({ message: error instanceof Error ? error.message : 'Could not send SMS.', error: true });
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  function confirmSend() {
    setSendStatus(null);
    const { numbers, invalid } = parseRecipients(recipients);
    if (numbers.length > 20) {
      setFieldError({ field: 'phone', message: 'Bulk sending is limited to 20 recipients per batch.' });
      phoneInput.current?.focus();
      return;
    }
    if (!numbers.length || invalid.length) {
      setFieldError({ field: 'phone', message: invalid.length ? 'Use 7–15 digits per number. An initial +, spaces, parentheses and dashes are accepted.' : 'Enter a recipient phone number.' });
      phoneInput.current?.focus();
      return;
    }
    if (!body.trim() || message.length > 1600) {
      setFieldError({ field: 'message', message: body.trim() ? 'Shorten the title and message to 1,600 characters combined.' : 'Enter an SMS message.' });
      messageInput.current?.focus();
      return;
    }
    setFieldError(null);
    Keyboard.dismiss();
    Alert.alert('Send SMS?', `Send from your SIM to ${numbers.length === 1 ? numbers[0] : `${numbers.length} recipients`}?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Send', onPress: () => { void send(numbers); } },
    ]);
  }

  async function importRecipients() {
    setRecipientsLoading(true);
    setRecipientStatus(null);
    try {
      const imported: Recipient[] = await api.recipients();
      setRecipients(imported.map(item => item.phoneNumber).join(', '));
      setRecipientNames(Object.fromEntries(imported.map(item => [item.phoneNumber, item.name])));
      setRecipientStatus({ message: `${imported.length} test recipients imported from the backend.`, success: true });
      setFieldError(null);
    } catch (error) {
      setRecipientStatus({ message: error instanceof Error ? error.message : 'Could not import recipients. Start the backend and check the phone Wi-Fi.', error: true });
    } finally {
      setRecipientsLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.title}>SMS</Text>
        <View style={styles.tabs}>
          {(['compose', 'inbox'] as const).map(key => (
            <Pressable key={key} accessibilityRole="tab" accessibilityState={{ selected: tab === key, disabled: busy }} disabled={busy}
              onPress={() => { Keyboard.dismiss(); setTab(key); }} style={[styles.tab, tab === key && styles.selectedTab]}>
              <Text style={[styles.tabText, tab === key && styles.selectedText]}>{key === 'compose' ? 'Compose' : 'Device SMS'}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!bridge && <Status feedback={{ message: 'Open the installed Android app to read and send SMS.' }} />}
        {tab === 'compose' ? (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>New message</Text>
            <Text style={styles.label}>To</Text>
            <TextInput ref={phoneInput} accessibilityLabel="Recipient phone numbers" editable={!!bridge && !busy}
              keyboardType="phone-pad" multiline placeholder="e.g. +91 98765 43210" placeholderTextColor="#68758a"
              value={recipients} onChangeText={value => { setRecipients(value); setFieldError(null); setSendStatus(null); }}
              style={[styles.input, fieldError?.field === 'phone' && styles.invalid]} />
            <Text style={styles.hint}>Add up to 20 numbers. Use {'{{name}}'} to personalize imported users.</Text>
            <Action secondary label={recipientsLoading ? 'Importing…' : 'Import recipients'} disabled={!bridge || busy || recipientsLoading} onPress={() => { void importRecipients(); }} />
            <Status feedback={recipientStatus} />
            {fieldError?.field === 'phone' && <Status feedback={{ message: fieldError.message, error: true }} />}
            <Text style={styles.label}>Title <Text style={styles.hint}>(optional)</Text></Text>
            <TextInput accessibilityLabel="Title" editable={!!bridge && !busy} maxLength={80} value={title}
              onChangeText={value => { setTitle(value); setFieldError(null); setSendStatus(null); }} style={styles.input} />
            <Text style={styles.label}>Message</Text>
            <TextInput ref={messageInput} accessibilityLabel="Message" editable={!!bridge && !busy} multiline maxLength={1600}
              placeholder="Write your SMS" placeholderTextColor="#68758a" value={body}
              onChangeText={value => { setBody(value); setFieldError(null); setSendStatus(null); }}
              style={[styles.input, styles.message, fieldError?.field === 'message' && styles.invalid]} />
            <Text style={styles.count}>{message.length}/1,600</Text>
            {fieldError?.field === 'message' && <Status feedback={{ message: fieldError.message, error: true }} />}
            {!!heading && !!body.trim() && (
              <View style={styles.preview}>
                <Text style={styles.label}>SMS preview</Text>
                <Text style={styles.body}>{message}</Text>
              </View>
            )}
            <Action label={busy ? 'Sending…' : 'Review and send SMS'} disabled={!bridge || busy} onPress={confirmSend} />
            {!!deliveries.length && <View style={styles.report}>
              <View style={styles.reportHeader}><Text style={styles.label}>Transaction report</Text><Action secondary label="Share report" onPress={() => { void Share.share({ message: deliveries.map(item => `${item.transactionId} | ${item.number} | ${item.status}${item.detail ? ` | ${item.detail}` : ''}`).join('\n') }); }} /></View>
              {deliveries.map(item => <Text key={item.transactionId} style={styles.reportRow}>{item.transactionId} · {item.number} · {item.status}</Text>)}
            </View>}
          </View>
        ) : (
          <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.heading}>Device SMS</Text>
            <Action secondary label={busy ? 'Loading…' : messages ? 'Refresh messages' : 'Read messages'} disabled={!bridge || busy} onPress={() => { void read(); }} />
            <Status feedback={readStatus} />
            {messages?.length === 0 && <Text style={styles.hint}>No SMS found on this phone.</Text>}
            {messages?.map(item => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.label}>{item.address}</Text>
                <Text style={styles.hint}>{new Date(item.timestamp).toLocaleString()}{item.type === 1 ? ' · Received' : item.type === 2 ? ' · Sent' : ''}</Text>
                <Text selectable style={styles.body}>{item.body}</Text>
              </View>
            ))}
            {more && <Action secondary label="Load older messages" disabled={busy} onPress={() => { void read(true); }} />}
          </View>
        )}
      </ScrollView>
      {!!sendStatus && tab === 'compose' && (
        <View style={styles.banner}><Status feedback={sendStatus} /></View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#f2f5fa' },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 14, gap: 12 },
  title: { fontSize: 34, fontWeight: '800', color: '#13233b' },
  tabs: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: 14, backgroundColor: '#e2e9f4' },
  tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4, borderRadius: 10 },
  selectedTab: { backgroundColor: '#fff' },
  tabText: { color: '#40536e', fontWeight: '600', textAlign: 'center' },
  selectedText: { color: '#133f91' },
  content: { paddingHorizontal: 18, paddingBottom: 24, gap: 12 },
  banner: { paddingHorizontal: 18, paddingVertical: 10 },
  card: { padding: 16, gap: 10, backgroundColor: '#fff', borderRadius: 18, borderWidth: 1, borderColor: '#e0e7f1' },
  heading: { fontSize: 22, fontWeight: '700', color: '#13233b', marginBottom: 4 },
  label: { fontWeight: '700', color: '#13233b' },
  body: { color: '#172a46', lineHeight: 21 },
  hint: { color: '#53647e', fontSize: 13 },
  count: { alignSelf: 'flex-end', color: '#53647e', fontSize: 12 },
  input: { minHeight: 50, padding: 12, borderWidth: 1, borderColor: '#8898ad', borderRadius: 10, backgroundColor: '#f9fbfe', color: '#13233b', fontSize: 16 },
  message: { minHeight: 112, textAlignVertical: 'top' },
  invalid: { borderColor: '#a12625' },
  preview: { backgroundColor: '#eef3fb', padding: 12, gap: 5, borderRadius: 10 },
  report: { backgroundColor: '#f3f6fb', padding: 12, gap: 8, borderRadius: 12 },
  reportHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  reportRow: { color: '#172a46', fontSize: 12 },
  action: { minHeight: 50, justifyContent: 'center', alignItems: 'center', padding: 12, borderRadius: 12, backgroundColor: '#17479e' },
  secondary: { backgroundColor: '#e8effc' },
  pressed: { opacity: 0.78 },
  disabled: { opacity: 0.55 },
  actionText: { color: '#fff', fontWeight: '700', textAlign: 'center' },
  secondaryText: { color: '#153f89' },
  status: { padding: 12, borderRadius: 10, backgroundColor: '#edf4ff', color: '#153f89', lineHeight: 20 },
  error: { backgroundColor: '#fff0ee', color: '#8c211f' },
  success: { backgroundColor: '#e6f6ed', color: '#115432', fontWeight: '700' },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#8898ad', paddingVertical: 10, gap: 4 },
});
