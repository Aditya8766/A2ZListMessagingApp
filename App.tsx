import { SafeAreaProvider } from 'react-native-safe-area-context';
import SmsScreen from './src/app/index';

export default function App() {
  return <SafeAreaProvider><SmsScreen /></SafeAreaProvider>;
}
