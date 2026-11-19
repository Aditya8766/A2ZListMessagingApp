import { API_BASE_URL } from '../config/api';
import { Credentials, Device, SimStatus, Sms } from '../types';

async function request<T>(path: string, token?: string, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data as T;
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Backend timed out. Check the LAN IP, Wi-Fi and server.');
    throw error;
  } finally { clearTimeout(timeout); }
}

export const api = {
  register: (deviceName: string) => request<Credentials>('/api/device/register', undefined, { deviceName }),
  heartbeat: (token: string, simStatus: SimStatus) => request<{ status: string }>('/api/device/heartbeat', token, { simStatus }),
  devices: () => request<Device[]>('/api/device/status'),
  pending: (token: string) => request<Sms[]>('/api/sms/pending', token),
  history: () => request<Sms[]>('/api/sms/history'),
  // For future native SMS callbacks only. This Expo UI never calls these methods.
  reportResult: (token: string, messageId: number, status: 'SENT' | 'FAILED', errorMessage: string | null = null) =>
    request<{ messageId: number; status: string }>('/api/sms/result', token, { messageId, status, errorMessage }),
  reportIncoming: (token: string, phoneNumber: string, message: string) =>
    request<{ messageId: number; status: string }>('/api/sms/incoming', token, { phoneNumber, message }),
};
