/** Shared, ephemeral request activity. No credentials or response data are cached. */
type Subscriber = () => void;
const listeners = new Set<Subscriber>();
let pending = 0;
function emit() { for (const listener of listeners) listener(); }
export function beginApiRequest(): () => void {
  pending += 1;
  emit();
  let finished = false;
  return () => {
    if (finished) return;
    finished = true;
    pending = Math.max(0, pending - 1);
    emit();
  };
}
export const subscribeApiActivity = (listener: Subscriber) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getPendingApiCount = () => pending;
export const getServerPendingApiCount = () => 0;
