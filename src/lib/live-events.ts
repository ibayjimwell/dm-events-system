/** Backward-compatible re-export. All realtime transport lives in src/connection. */
export {
  closeLiveEvents,
  subscribeToLiveChanges,
  subscribeToChatEvents,
} from '@/connection/events';
export type { ChatEvent } from '@/connection/events';
