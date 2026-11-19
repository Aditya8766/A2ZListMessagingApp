import React, { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { API_BASE_URL } from './src/config/api';
import { useGateway } from './src/hooks/useGateway';
import { Sms } from './src/types';
import { router } from 'expo-router';

type Screen = 'Dashboard' | 'Registration' | 'SMS Testing';
const time = (value: string | null) => value ? new Date(value).toLocaleString() : 'Not yet';

function Button({ title, onPress, disabled = false }: { title: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.button, disabled && s.disabled]}><Text style={s.buttonText}>{title}</Text></Pressable>;
}
function Card({ label, value, positive = false }: { label: string; value: string; positive?: boolean }) {
  return <View style={s.card}><Text style={s.label}>{label}</Text><Text style={[s.value, positive && s.green]}>{value}</Text></View>;
}
function Message({ sms }: { sms: Sms }) {
  return <View style={s.message}><View style={s.row}><Text style={s.phone}>{sms.phone_number}</Text><Text style={s.badge}>{sms.status}</Text></View><Text style={s.body}>{sms.message}</Text><Text style={s.caption}>#{sms.id} · {sms.direction} · {time(sms.created_at)}</Text>{sms.error_message && <Text style={s.errorText}>{sms.error_message}</Text>}</View>;
}

function Gateway() {
  const gateway = useGateway();
  const [screen, setScreen] = useState<Screen>('Dashboard');
  const [name, setName] = useState('');
  const [success, setSuccess] = useState(false);
  const { credentials, online, pending, history } = gateway;
  if (!gateway.ready) return <View style={s.center}><ActivityIndicator size="large" color="#2563eb" /><Text>Loading saved device…</Text></View>;
  return <SafeAreaView style={s.safe}>
    <StatusBar style="dark" />
    <Pressable accessibilityRole="button" onPress={() => router.push('/finance')} style={s.button}><Text style={s.buttonText}>Personal finance · On-device SMS detection</Text></Pressable>
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={s.header}><Text style={s.eyebrow}>ANDROID GATEWAY</Text><Text style={s.title}>A2Z Internal Messaging</Text><Text style={s.subtitle}>Your local SMS connection</Text></View>
      <View style={s.tabs}>{(['Dashboard', 'Registration', 'SMS Testing'] as Screen[]).map(tab => <Pressable key={tab} accessibilityRole="tab" accessibilityState={{ selected: screen === tab }} onPress={() => setScreen(tab)} style={[s.tab, screen === tab && s.selectedTab]}><Text style={[s.tabText, screen === tab && s.selectedText]}>{tab}</Text></Pressable>)}</View>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {gateway.error && <View accessibilityRole="alert" style={s.error}><Text style={s.errorText}>{gateway.error}</Text><Text style={s.caption}>Check the backend address and connection, then refresh.</Text></View>}
        {!online && <Text style={s.caption}>Offline · Previously loaded information may be out of date.</Text>}
        {screen === 'Dashboard' && <>
          <View style={s.sectionRow}><Text style={s.heading}>Overview</Text><Text style={[s.connection, online ? s.green : s.gray]}>● {online ? 'Online' : 'Offline'}</Text></View>
          <View style={s.grid}>
            <Card label="Backend connection" value={online ? 'Online' : 'Offline'} positive={online} />
            <Card label="Device registration" value={credentials ? 'Registered' : 'Not registered'} positive={!!credentials} />
            <Card label="SIM status" value={gateway.device?.simStatus === 'AVAILABLE' ? 'Available' : gateway.device?.simStatus === 'UNAVAILABLE' ? 'Unavailable' : 'Unknown'} />
            <Card label="Live updates" value={gateway.socketConnected ? 'Connected' : 'Disconnected'} positive={gateway.socketConnected} />
            <Card label="SMS sent" value={String(history.filter(m => m.direction === 'OUTGOING' && m.status === 'SENT').length)} />
            <Card label="SMS received" value={String(history.filter(m => m.direction === 'INCOMING' && m.status === 'RECEIVED').length)} />
          </View>
          <View style={s.message}><Text style={s.label}>Last successful heartbeat</Text><Text style={s.body}>{time(gateway.lastHeartbeat)}</Text><Text style={s.caption}>{credentials?.deviceName || 'Register a device to start heartbeats.'}</Text></View>
          <Text style={s.note}>Connectivity only. SIM detection and physical SMS sending/receiving require a native Android build. Counts reflect backend records for this device.</Text>
          <Button title={gateway.syncing ? 'Refreshing…' : 'Refresh connection'} onPress={gateway.refresh} disabled={gateway.syncing} />
        </>}
        {screen === 'Registration' && <>
          <Text style={s.heading}>Connect this device</Text><Text style={s.body}>Register once. Your device credentials are saved locally and restored when you reopen the app.</Text>
          {credentials ? <View style={s.message}><Text style={[s.value, s.green]}>Device registered</Text><Text style={s.body}>{credentials.deviceName}</Text><Text style={s.caption}>Device ID: {credentials.deviceId}</Text><Text style={s.note}>Your token is stored on this phone and is never displayed here.</Text></View> : <>
            <Text style={s.label}>Device name</Text><TextInput accessibilityLabel="Device name" style={s.input} placeholder="e.g. Office Android" value={name} onChangeText={setName} maxLength={100} editable={!gateway.registering} autoCapitalize="words" />
            <Button title={gateway.registering ? 'Registering…' : 'Register device'} disabled={gateway.registering || !name.trim()} onPress={() => { void gateway.register(name).then(setSuccess); }} />
          </>}
          {success && <Text accessibilityRole="alert" style={s.green}>Registration saved successfully.</Text>}
        </>}
        {screen === 'SMS Testing' && <>
          <View style={s.sectionRow}><Text style={s.heading}>Pending messages</Text><Text style={s.badge}>{pending.length}</Text></View>
          <Text style={s.body}>Messages assigned to this device. Refreshing or receiving an event does not send an SMS or change its status.</Text>
          <Button title={gateway.syncing ? 'Refreshing…' : 'Refresh messages'} onPress={gateway.refresh} disabled={!credentials || gateway.syncing} />
          {!credentials ? <Text style={s.note}>Register this device first.</Text> : pending.length ? pending.map(sms => <Message key={sms.id} sms={sms} />) : <View style={s.message}><Text style={s.body}>No pending messages loaded.</Text><Text style={s.caption}>Create an SMS through Postman after this device is online.</Text></View>}
          <Text style={s.heading}>Recent SMS activity</Text>
          {history.length ? history.slice(0, 20).map(sms => <Message key={sms.id} sms={sms} />) : <Text style={s.note}>No SMS history loaded for this device.</Text>}
        </>}
        {gateway.syncing && <ActivityIndicator color="#2563eb" />}
        <Text selectable style={s.footer}>{API_BASE_URL}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

export default function App() { return <SafeAreaProvider><Gateway /></SafeAreaProvider>; }

const s = StyleSheet.create({
  flex: { flex: 1 }, safe: { flex: 1, backgroundColor: '#f4f7fb' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  header: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 22 }, eyebrow: { color: '#2563eb', fontSize: 11, fontWeight: '800', letterSpacing: 2 },
  title: { fontSize: 25, fontWeight: '800', color: '#12233f', marginTop: 8 }, subtitle: { color: '#64748b', marginTop: 6 },
  tabs: { flexDirection: 'row', marginHorizontal: 18, padding: 4, backgroundColor: '#e5ebf4', borderRadius: 12 },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 9 }, selectedTab: { backgroundColor: '#fff' }, tabText: { color: '#59677c', fontSize: 12, fontWeight: '600' }, selectedText: { color: '#1d4ed8' },
  content: { padding: 20, gap: 16, paddingBottom: 40 }, heading: { fontSize: 20, fontWeight: '700', color: '#12233f' },
  sectionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, connection: { fontWeight: '700', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 }, card: { flexGrow: 1, flexBasis: '45%', backgroundColor: '#fff', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#e4eaf3', gap: 10 },
  label: { color: '#64748b', fontSize: 12, fontWeight: '600' }, value: { color: '#12233f', fontSize: 19, fontWeight: '700' }, green: { color: '#15803d' }, gray: { color: '#64748b' },
  message: { backgroundColor: '#fff', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#e4eaf3', gap: 10 }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  phone: { color: '#12233f', fontWeight: '700', fontSize: 15, flexShrink: 1 }, badge: { color: '#1d4ed8', backgroundColor: '#eff6ff', paddingHorizontal: 9, paddingVertical: 5, borderRadius: 6, fontSize: 11, fontWeight: '700' },
  body: { color: '#334155', fontSize: 14, lineHeight: 22 }, caption: { color: '#64748b', fontSize: 12, lineHeight: 18 }, note: { color: '#64748b', fontSize: 13, lineHeight: 21 },
  button: { backgroundColor: '#2563eb', minHeight: 48, borderRadius: 12, padding: 14, alignItems: 'center', justifyContent: 'center' }, buttonText: { color: '#fff', fontWeight: '700', fontSize: 14 }, disabled: { opacity: 0.5 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 12, padding: 15, fontSize: 16, color: '#12233f' },
  error: { padding: 14, backgroundColor: '#fef2f2', borderColor: '#fecaca', borderWidth: 1, borderRadius: 12, gap: 8 }, errorText: { color: '#b91c1c', fontSize: 13 }, footer: { color: '#94a3b8', fontSize: 11, textAlign: 'center', marginTop: 10 },
});
