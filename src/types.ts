export type Credentials = { deviceId: number; deviceToken: string; deviceName: string };
export type SimStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';
export type Device = { deviceId: number; deviceName: string; isOnline: boolean; simStatus: SimStatus; lastSeen: string | null };
export type Sms = { id: number; phone_number: string; message: string; device_id: number;
  direction: 'INCOMING' | 'OUTGOING'; status: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'RECEIVED';
  error_message: string | null; created_at: string; updated_at: string };
