'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft, CalendarDays, Check, CheckCheck, ImagePlus, LockKeyhole,
  MessageCircle, Paperclip, Search, Send, X,
} from 'lucide-react';
import { api, json } from '@/api-client/http';
import { subscribeToChatEvents } from '@/lib/live-events';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';
import styles from './MessagesPanel.module.css';

type Role = 'CLIENT' | 'COORDINATOR' | 'ADMIN';
type Thread = {
  id: string; reference: string; clientName: string; eventType: string;
  eventDate: string; status: string; source: string;
  latest: { body: string; hasAttachment: boolean; senderId: string; createdAt: string } | null;
  unread: number;
};
type Message = {
  id: string; bookingId: string; senderId: string; senderName: string;
  senderRole: Role; body: string; assetId: string | null; createdAt: string;
};
type Read = { userId: string; role: Role; lastReadAt: string };
type Conversation = {
  viewerId: string; messages: Message[]; reads: Read[];
  typing: { userId: string; expiresAt: string }[];
};
const philippinesDate = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
const philippinesTime = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit' });
function dayKey(date: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
}
const formatDate = (date: string) => philippinesDate.format(new Date(date));
const formatTime = (date: string) => philippinesTime.format(new Date(date));
function initials(text: string) { return text.split(/\s+/).filter(Boolean).slice(0, 2).map(v => v[0].toUpperCase()).join('') || 'DM'; }
function latestText(thread: Thread) {
  if (!thread.latest) return `Booking ${thread.reference} · Start a conversation`;
  if (thread.latest.body.trim()) return thread.latest.body;
  return thread.latest.hasAttachment ? 'Sent a photo' : 'New message';
}
async function signalTyping(bookingId: string, typing: boolean) {
  // Do not activate the global API spinner for a background typing pulse.
  try {
    await fetch('/api/messages/typing', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId, typing }),
      cache: 'no-store',
    });
  } catch { /* Typing is ephemeral; do not interrupt message composition. */ }
}

export default function MessagesPanel({ role }: { role: Role }) {
  const search = useSearchParams();
  const requestedBooking = search.get('booking') || '';
  const [selected, setSelected] = useState(requestedBooking);
  const [searchTerm, setSearchTerm] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [assetId, setAssetId] = useState('');
  const [fileLabel, setFileLabel] = useState('');
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [typedBy, setTypedBy] = useState<Record<string, number>>({});
  const [tick, setTick] = useState(Date.now());
  const [mobileThread, setMobileThread] = useState(!!requestedBooking);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingPulseRef = useRef(0);
  const stopTypingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readBusyRef = useRef(new Set<string>());
  // Chat emits its own precise events. Coalesce events instead of refetching
  // the inbox + conversation via both generic and chat subscriptions.
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshThreadsRef = useRef(false);
  const refreshConversationRef = useRef(false);


  const all = useLiveQuery(() => api<{ threads: Thread[]; viewerId: string }>('/api/messages/threads'), [],
    { subscribeToChanges: false, refreshOnFocus: false });
  const conversation = useLiveQuery<Conversation>(() => selected
    ? api(`/api/messages?bookingId=${encodeURIComponent(selected)}`)
    : Promise.resolve({ viewerId: '', messages: [], reads: [], typing: [] }), [selected],
    { subscribeToChanges: false, refreshOnFocus: false });
  const threads = all.data?.threads || [];
  const active = threads.find(t => t.id === selected);
  const text = drafts[selected] || '';
  const viewerId = conversation.data?.viewerId || all.data?.viewerId || '';

  useEffect(() => {
    if (requestedBooking && threads.some(t => t.id === requestedBooking)) {
      setSelected(requestedBooking);
      setMobileThread(true);
      return;
    }
    if (threads.length && !threads.some(t => t.id === selected)) setSelected(threads[0].id);
  }, [requestedBooking, threads, selected]);

  useEffect(() => {
    setAssetId(''); setFileLabel(''); setError(''); setTypedBy({});
    typingPulseRef.current = 0;
    return () => { if (stopTypingRef.current) clearTimeout(stopTypingRef.current); };
  }, [selected]);

  useEffect(() => {
    const queueRefresh = (includeConversation: boolean) => {
      refreshThreadsRef.current = true;
      refreshConversationRef.current ||= includeConversation;
      if (refreshTimerRef.current) return;
      refreshTimerRef.current = setTimeout(() => {
        refreshTimerRef.current = null;
        const threadsNeeded = refreshThreadsRef.current;
        const conversationNeeded = refreshConversationRef.current;
        refreshThreadsRef.current = false;
        refreshConversationRef.current = false;
        if (threadsNeeded) void all.refresh();
        if (conversationNeeded) void conversation.refresh();
      }, 300);
    };

    const unsub = subscribeToChatEvents(event => {
      if (event.kind === 'message' || event.kind === 'read') {
        if (event.bookingId) queueRefresh(event.bookingId === selected);
      }
      if (event.kind === 'typing' && event.bookingId === selected && event.userId && event.userId !== viewerId) {
        setTypedBy(prev => {
          const updated = { ...prev };
          if (event.typing && event.expiresAt) updated[event.userId!] = new Date(event.expiresAt).getTime();
          else updated[event.userId!] = 0;
          return updated;
        });
      }
    });
    return () => {
      unsub();
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
      refreshTimerRef.current = null;
      refreshThreadsRef.current = false;
      refreshConversationRef.current = false;
    };
  }, [selected, viewerId, all.refresh, conversation.refresh]);

  // A tab that was suspended may have missed ephemeral SSE events. Refresh
  // at most once on return after a substantial absence; never refetch on
  // every window focus or message typing keystroke.
  useEffect(() => {
    let lastSync = Date.now();
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastSync < 30_000) return;
      lastSync = Date.now();
      void all.refresh();
      void conversation.refresh();
    };
    window.addEventListener('focus', onReturn);
    document.addEventListener('visibilitychange', onReturn);
    return () => {
      window.removeEventListener('focus', onReturn);
      document.removeEventListener('visibilitychange', onReturn);
    };
  }, [all.refresh, conversation.refresh]);

  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const markRead = useCallback(async () => {
    if (!selected || !conversation.data || role === 'ADMIN' || document.visibilityState !== 'visible') return;
    const ownRead = conversation.data.reads.find(r => r.userId === viewerId)?.lastReadAt;
    const lastIncoming = [...conversation.data.messages].reverse().find(m => m.senderId !== viewerId);
    if (!lastIncoming || (ownRead && new Date(ownRead).getTime() >= new Date(lastIncoming.createdAt).getTime())) return;
    if (readBusyRef.current.has(selected)) return;
    readBusyRef.current.add(selected);
    try {
      await api('/api/messages', json('PATCH', { bookingId: selected }));
      await all.refresh();
      await conversation.refresh();
    } catch { /* Already-loaded conversation remains usable if a receipt fails. */ }
    finally { readBusyRef.current.delete(selected); }
  }, [selected, viewerId, role, conversation.data, all.refresh, conversation.refresh]);

  useEffect(() => {
    void markRead();
    const onFocus = () => void markRead();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => { window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus); };
  }, [markRead]);

  const lastMessageId = conversation.data?.messages.at(-1)?.id;
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [selected, lastMessageId]);

  const filtered = useMemo(() => threads.filter(t =>
    [t.clientName, t.reference, t.eventType].some(value => value.toLowerCase().includes(searchTerm.toLowerCase()))
  ), [threads, searchTerm]);
  const unreadTotal = threads.reduce((sum, t) => sum + t.unread, 0);
  const othersTyping = Object.entries(typedBy).some(([id, expiry]) => id !== viewerId && expiry > tick)
    || !!conversation.data?.typing.some(t => t.userId !== viewerId && typedBy[t.userId] === undefined && new Date(t.expiresAt).getTime() > tick);

  function changeDraft(value: string) {
    setDrafts(previous => ({ ...previous, [selected]: value }));
    if (!selected || role === 'ADMIN') return;
    if (!value.trim()) { void signalTyping(selected, false); return; }
    if (Date.now() - typingPulseRef.current >= 2300) {
      typingPulseRef.current = Date.now();
      void signalTyping(selected, true);
    }
    if (stopTypingRef.current) clearTimeout(stopTypingRef.current);
    stopTypingRef.current = setTimeout(() => { void signalTyping(selected, false); typingPulseRef.current = 0; }, 2900);
  }
  function switchThread(id: string) {
    if (id !== selected && selected && role !== 'ADMIN' && text.trim()) void signalTyping(selected, false);
    setSelected(id); setMobileThread(true);
    setError('');
  }
  async function uploadFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 1_048_576) { setError('Message photos must be 1 MB or smaller.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG or WebP image.'); return; }
    setUploading(true); setError('');
    try {
      const data = new FormData(); data.append('kind', 'MESSAGE'); data.append('image', file);
      const uploaded = await api<{ asset: { id: string; name: string } }>('/api/uploads', { method: 'POST', body: data });
      setAssetId(uploaded.asset.id);
      setFileLabel(uploaded.asset.name);
    } catch (e) { setError(e instanceof Error ? e.message : 'Photo upload failed'); }
    finally { setUploading(false); }
  }
  async function send(event?: FormEvent) {
    event?.preventDefault();
    if (!selected || sending || uploading || role === 'ADMIN' || (!text.trim() && !assetId)) return;
    setSending(true); setError('');
    try {
      await api('/api/messages', json('POST', { bookingId: selected, body: text.trim(), assetId: assetId || null }));
      if (stopTypingRef.current) clearTimeout(stopTypingRef.current);
      void signalTyping(selected, false);
      setDrafts(prev => ({ ...prev, [selected]: '' }));
      setAssetId(''); setFileLabel('');
      await Promise.all([conversation.refresh(), all.refresh()]);
      inputRef.current?.focus();
    } catch (e) { setError(e instanceof Error ? e.message : 'Message could not be sent. You can retry.'); }
    finally { setSending(false); }
  }
  function handleKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send();
    }
  }
  function wasSeen(message: Message) {
    if (!conversation.data || message.senderId !== viewerId) return false;
    const recipientRole = role === 'CLIENT' ? 'COORDINATOR' : 'CLIENT';
    return conversation.data.reads.some(read => read.role === recipientRole && read.userId !== viewerId
      && new Date(read.lastReadAt).getTime() >= new Date(message.createdAt).getTime());
  }
  const messages = conversation.data?.messages || [];
  const lastOwn = [...messages].reverse().find(m => m.senderId === viewerId)?.id;
  let previousDay = '';

  return <main className={styles.page} aria-label="DM Events messaging" data-messenger-edge-to-edge="true">
    <div className={styles.shell}>
      <aside className={`${styles.sidebar} ${mobileThread ? styles.mobileHidden : ''}`} aria-label="Conversations">
        <div className={styles.sidebarHead}>
          <div className={styles.sidebarTitle}>
            <Link href={role === 'CLIENT' ? '/client' : role === 'ADMIN' ? '/admin' : '/coordinator'}
              aria-label="Return to portal" title="Return to portal" className={styles.exitLink}><ArrowLeft size={19}/></Link>
            <h2>Inbox</h2>{unreadTotal > 0 && <span className={styles.totalCount}>{unreadTotal}</span>}
          </div>
          <p>Stay connected with every booking.</p>
          <label className={styles.search}><Search size={18}/><input aria-label="Search conversations" placeholder="Search events or bookings" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/></label>
        </div>
        <div className={styles.threadList}>
          {all.loading && !all.data && <div className={styles.loadingPad}><ListSkeleton rows={4} label="Loading conversations"/></div>}
          {all.error && <p role="alert" className={styles.inlineError}>{all.error}</p>}
          {filtered.map(thread => {
            const selectedThread = thread.id === selected;
            const title = role === 'CLIENT' ? 'DM Events Team' : thread.clientName;
            return <button key={thread.id} type="button" onClick={() => switchThread(thread.id)}
              aria-current={selectedThread ? 'true' : undefined}
              className={`${styles.threadItem} ${selectedThread ? styles.activeThread : ''}`}>
              <span className={styles.avatar} aria-hidden="true">{role === 'CLIENT' ? 'DM' : initials(title)}</span>
              <span className={styles.threadInfo}>
                <span className={styles.threadTop}><strong>{title}</strong><small>{thread.latest?.createdAt ? formatDate(thread.latest.createdAt) : ''}</small></span>
                <span className={styles.reference}>{thread.reference} · {thread.eventType}</span>
                <span className={styles.preview}>{latestText(thread)}</span>
              </span>
              {thread.unread > 0 && <span className={styles.unread} aria-label={`${thread.unread} unread messages`}>{thread.unread > 99 ? '99+' : thread.unread}</span>}
            </button>;
          })}
          {!all.loading && !filtered.length && <div className={styles.emptyInbox}><MessageCircle size={30}/><strong>No conversations found</strong><p>{searchTerm ? 'Try searching by booking reference or event name.' : 'Your booking conversations will appear here.'}</p></div>}
        </div>
        <footer className={styles.sidebarFooter}><LockKeyhole size={15}/> Private, booking-linked messaging</footer>
      </aside>
      <section className={`${styles.chat} ${!mobileThread ? styles.mobileHiddenChat : ''}`} aria-label="Message conversation">
        {active ? <>
          <header className={styles.chatHeader}>
            <button type="button" className={styles.back} onClick={() => setMobileThread(false)} aria-label="Back to conversations"><ArrowLeft size={20}/></button>
            <span className={styles.headerAvatar}>{role === 'CLIENT' ? 'DM' : initials(active.clientName)}</span>
            <div className={styles.chatHeading}><strong>{role === 'CLIENT' ? 'DM Events Team' : active.clientName}</strong>
              <span>{active.reference} <span className={styles.dot}>·</span> {active.eventType}</span></div>
            <span className={styles.status}>{active.status.toLowerCase()}</span>
            <Link href={role === 'CLIENT' ? `/client/bookings/${active.id}` : role === 'ADMIN' ? `/admin/bookings/${active.id}` : `/coordinator/requests/${active.id}`}
              className={styles.detailLink} aria-label="View booking details" title="View booking details">
              <CalendarDays size={18}/><span className={styles.detailText}>Booking</span>
            </Link>
          </header>
          {active.source === 'WALK_IN' && <div className={styles.walkin}>Walk-in booking: these are internal staff notes, not messages delivered to the client.</div>}
          <div className={styles.messageScroll} aria-live="polite" aria-label="Messages" role="log">
            {conversation.loading && !conversation.data && <div className={styles.loadingMessages}><ListSkeleton rows={4} label="Loading messages"/></div>}
            {conversation.error && <p role="alert" className={styles.inlineError}>{conversation.error}</p>}
            {!conversation.loading && !messages.length && <div className={styles.emptyConversation}><div className={styles.emptyArt}><MessageCircle size={34}/></div><h3>A conversation starts here</h3><p>Share questions, event details and updates in this secure space.</p></div>}
            {messages.map((message, index) => {
              const mine = message.senderId === viewerId;
              const day = dayKey(message.createdAt);
              const showDay = day !== previousDay;
              previousDay = day;
              const previous = messages[index - 1];
              const grouped = previous && previous.senderId === message.senderId && dayKey(previous.createdAt) === day && (new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime()) < 5 * 60_000;
              return <div key={message.id}>
                {showDay && <div className={styles.dayLabel}><span>{formatDate(message.createdAt)}</span></div>}
                <div className={`${styles.messageRow} ${mine ? styles.myRow : styles.theirRow} ${grouped ? styles.grouped : ''}`}>
                  {!mine && !grouped && <span className={styles.tinyAvatar}>{initials(message.senderName)}</span>}
                  <div className={`${styles.messageUnit} ${mine ? styles.ownUnit : ''}`}>
                    {!mine && !grouped && <span className={styles.sender}>{message.senderName}{message.senderRole === 'COORDINATOR' ? ' · DM Events' : ''}</span>}
                    <div className={`${styles.bubble} ${mine ? styles.ownBubble : styles.otherBubble}`}>
                      {message.body && <p>{message.body}</p>}
                      {message.assetId && <a target="_blank" rel="noreferrer" href={`/api/assets/${message.assetId}`} className={styles.attachedImage} title="Open message photo"><img src={`/api/assets/${message.assetId}`} alt="Attached event photo" loading="lazy"/></a>}
                    </div>
                    <div className={`${styles.messageMeta} ${mine ? styles.ownMeta : ''}`}>
                      <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
                      {mine && message.id === lastOwn && <span className={wasSeen(message) ? styles.seen : ''}>{wasSeen(message) ? <><CheckCheck size={15}/> Seen</> : <><Check size={15}/> Sent</>}</span>}
                    </div>
                  </div>
                </div>
              </div>;
            })}
            {othersTyping && <div className={styles.typing}><span className={styles.typingDots}><i/><i/><i/></span><span>{role === 'CLIENT' ? 'DM Events is typing' : 'Someone is typing'}…</span></div>}
            <div ref={endRef}/>
          </div>
          {error && <div className={styles.composeError} role="alert">{error}<button type="button" aria-label="Dismiss error" onClick={() => setError('')}><X size={15}/></button></div>}
          {role !== 'ADMIN' ? <form className={styles.composer} onSubmit={send}>
            {assetId && <div className={styles.uploadChip}><ImagePlus size={16}/><span>{fileLabel || 'Attached photo'}</span><button type="button" onClick={() => { setAssetId(''); setFileLabel(''); }} aria-label="Remove attached photo"><X size={16}/></button></div>}
            <div className={styles.composeRow}>
              <label className={styles.attach} title="Attach an event photo"><Paperclip size={21}/><span className="sr-only">Attach photo</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={uploadFile} disabled={uploading || sending} hidden/></label>
              <textarea ref={inputRef} rows={1} aria-label="Write a message" placeholder="Write a message…" maxLength={3000} value={text} onChange={e => changeDraft(e.target.value)} onKeyDown={handleKey} disabled={sending || uploading}/>
              <button type="submit" className={styles.sendButton} disabled={sending || uploading || (!text.trim() && !assetId)} aria-label={sending ? 'Sending message' : 'Send message'}><Send size={19}/></button>
            </div>
            <div className={styles.composeHint}><span>{uploading ? 'Uploading photo…' : sending ? 'Sending securely…' : 'Enter to send · Shift + Enter for a new line'}</span><span>{text.length}/3000</span></div>
          </form> : <div className={styles.readOnly}><LockKeyhole size={16}/> Administrator oversight is read-only.</div>}
        </> : <div className={styles.selectConversation}><MessageCircle size={40}/><h3>Select a conversation</h3><p>Choose an event booking to view its messages.</p></div>}
      </section>
    </div>
  </main>;
}
