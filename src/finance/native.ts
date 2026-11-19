import { requireOptionalNativeModule } from 'expo';
import { SmsInput } from './parser';
export type DeviceSms = { id: string; address: string; body: string; timestamp: number; type: number };
type Bridge = {
  available: boolean;
  enabled(): boolean;
  setEnabled(value: boolean): void;
  pending(): SmsInput[];
  acknowledge(ids: string[]): void;
  clear(): void;
  readDeviceSms(beforeId: string | null): Promise<DeviceSms[]>;
  sendDeviceSms(number: string, body: string): Promise<boolean>;
};
export const smsBridge = requireOptionalNativeModule<Bridge>('FinanceSms');
