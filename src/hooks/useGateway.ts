import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { io } from 'socket.io-client';
import { API_BASE_URL, HEARTBEAT_INTERVAL_MS } from '../config/api';
import { api } from '../services/api';
import { Credentials, Device, Sms } from '../types';
import { usePathname } from 'expo-router';

const STORAGE_KEY = 'a2z.device.v1';
const errorText = (e: unknown) => e instanceof Error ? e.message : 'Something went wrong. Please retry.';

export function useGateway() {
  const pathname = usePathname();
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(false);
  const [socketConnected, setSocketConnected] = useState(false);
  const [active, setActive] = useState(AppState.currentState === 'active');
  const [device, setDevice] = useState<Device | null>(null);
  const [pending, setPending] = useState<Sms[]>([]);
  const [history, setHistory] = useState<Sms[]>([]);
  const [lastHeartbeat, setLastHeartbeat] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [registering, setRegistering] = useState(false);
  const refreshRef = useRef<() => void>(() => {});

  useEffect(() => {
    let alive = true;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (!raw || !alive) return;
      const saved = JSON.parse(raw);
      if (!Number.isSafeInteger(saved.deviceId) || typeof saved.deviceToken !== 'string' || typeof saved.deviceName !== 'string') {
        throw new Error('Saved registration is invalid. Register the device again.');
      }
      setCredentials(saved);
    }).catch(e => { if (alive) setError(errorText(e)); })
      .finally(() => { if (alive) setReady(true); });
    const listener = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => { alive = false; listener.remove(); };
  }, []);

  useEffect(() => {
    if (!ready || !active || pathname !== '/') return;
    let cancelled = false;
    let busy = false;
    let requested = false;
    async function sync() {
      if (busy) { requested = true; return; }
      busy = true;
      setSyncing(true);
      try {
        if (credentials) {
          // Expo Go cannot inspect the physical SIM.
          await api.heartbeat(credentials.deviceToken, 'UNKNOWN');
          if (!cancelled) setLastHeartbeat(new Date().toISOString());
        }
        const [devices, messages, allHistory] = await Promise.all([
          api.devices(), credentials ? api.pending(credentials.deviceToken) : Promise.resolve([]),
          credentials ? api.history() : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setDevice(devices.find(d => d.deviceId === credentials?.deviceId) || null);
        setPending(messages);
        setHistory(allHistory.filter(m => m.device_id === credentials?.deviceId));
        setOnline(true); setError(null);
      } catch (e) {
        if (!cancelled) { setOnline(false); setError(errorText(e)); }
      } finally {
        busy = false;
        if (!cancelled) {
          setSyncing(false);
          if (requested) { requested = false; void sync(); }
        }
      }
    }
    refreshRef.current = () => { void sync(); };
    const socket = credentials ? io(API_BASE_URL, {
      auth: { deviceToken: credentials.deviceToken }, autoConnect: false, reconnection: true, timeout: 10_000,
    }) : null;
    socket?.on('connect', () => { if (!cancelled) { setSocketConnected(true); void sync(); } });
    socket?.on('disconnect', () => { if (!cancelled) { setSocketConnected(false); void sync(); } });
    socket?.on('connect_error', () => { if (!cancelled) setSocketConnected(false); });
    socket?.on('sms:new', () => { void sync(); });
    socket?.connect();
    void sync();
    const timer = setInterval(() => { void sync(); }, HEARTBEAT_INTERVAL_MS);
    return () => {
      cancelled = true; clearInterval(timer); refreshRef.current = () => {};
      socket?.removeAllListeners(); socket?.disconnect(); setSocketConnected(false);
    };
  }, [credentials, ready, active, pathname]);

  const register = useCallback(async (name: string) => {
    if (!name.trim() || name.trim().length > 100) { setError('Enter a device name of 1–100 characters.'); return false; }
    setRegistering(true); setError(null);
    try {
      const saved = await api.register(name.trim());
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ deviceId: saved.deviceId, deviceToken: saved.deviceToken, deviceName: saved.deviceName }));
      setCredentials(saved); setOnline(true);
      return true;
    } catch (e) { setError(errorText(e)); return false; }
    finally { setRegistering(false); }
  }, []);
  return { credentials, ready, online, socketConnected, device, pending, history, lastHeartbeat, error, syncing,
    registering, register, refresh: () => refreshRef.current() };
}
