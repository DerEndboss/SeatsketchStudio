import type { PlatformAdapter } from './types';
import { webAdapter } from './web';
import { createElectronAdapter } from './electron';

export const platform: PlatformAdapter =
  typeof window !== 'undefined' && window.seatsketchNative ? createElectronAdapter(window.seatsketchNative) : webAdapter;

export type { FileRef, PlatformAdapter, RecentFile } from './types';
