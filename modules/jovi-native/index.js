// JS entry for the local Android-only JoviNative module (Play Integrity and
// read-only calendar queries). null on web, in Expo Go, or whenever the native
// module is missing, so every caller must handle null.
import { requireOptionalNativeModule } from 'expo';

export default requireOptionalNativeModule('JoviNative');
