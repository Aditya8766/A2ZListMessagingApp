import { API_BASE_URL } from '../config/api';

export type Recipient = { id: number; name: string; phoneNumber: string };

async function recipients(): Promise<Recipient[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/recipients`, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Recipient API failed (${response.status})`);
    if (!Array.isArray(data)) throw new Error('Recipient API returned an invalid list.');
    return data as Recipient[];
  } catch (error) {
    if (controller.signal.aborted) throw new Error('Recipient API timed out. Check Wi-Fi and the server.');
    if (error instanceof TypeError) throw new Error('Cannot reach recipient API. Check the computer IP, Wi-Fi, and Windows Firewall.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = { recipients };
