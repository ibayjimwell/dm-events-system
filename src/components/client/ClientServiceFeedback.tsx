'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, MessageSquareHeart, Star } from 'lucide-react';
import { api, json } from '@/api-client/http';
import styles from './ClientServiceFeedback.module.css';

type Feedback = { rating: number; comment: string; publish: boolean; updatedAt: string };

export default function ClientServiceFeedback({ bookingId }: { bookingId: string }) {
  const [rating,setRating] = useState(0);
  const [comment,setComment] = useState('');
  const [publish,setPublish] = useState(false);
  const [loading,setLoading] = useState(true);
  const [saving,setSaving] = useState(false);
  const [existing,setExisting] = useState(false);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setSuccess(''); setExisting(false);
    api<{feedback: Feedback|null}>(`/api/bookings/${bookingId}/feedback`).then(result => {
      if (!active) return;
      setRating(result.feedback?.rating ?? 0);
      setComment(result.feedback?.comment ?? '');
      setPublish(result.feedback?.publish ?? false);
      setExisting(Boolean(result.feedback));
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : 'Unable to load feedback.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bookingId]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(''); setSuccess('');
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) { setError('Please select a star rating.'); return; }
    if (comment.trim().length < 20 || comment.trim().length > 1500) { setError('Feedback must be 20–1,500 characters.'); return; }
    setSaving(true);
    try {
      const result = await api<{success:boolean;message:string}>(`/api/bookings/${bookingId}/feedback`,json('PUT',{rating,comment:comment.trim(),publish}));
      setExisting(true); setSuccess(result.message);
    } catch (e) { setError(e instanceof Error ? e.message : 'Unable to save your review.'); }
    finally { setSaving(false); }
  }

  return <section id="service-feedback" className={styles.section} aria-labelledby="service-feedback-title">
    <div className={styles.heading}><span className={styles.icon}><MessageSquareHeart size={24}/></span><div>
      <p className={styles.eyebrow}>YOUR EXPERIENCE MATTERS</p>
      <h2 id="service-feedback-title">Rate the DM Events service</h2>
      <p>We would love to hear how your celebration went. Your feedback helps us improve.</p>
    </div></div>
    {loading ? <p role="status" className={styles.helper}>Loading your feedback…</p> : <form onSubmit={submit} className={styles.form}>
      <fieldset disabled={saving} className={styles.fieldset}>
        <legend>Overall service rating <span aria-hidden="true">*</span></legend>
        <div className={styles.stars} role="group" aria-label="Service rating out of five stars">
          {[1,2,3,4,5].map(value => <button type="button" key={value} aria-label={`Rate ${value} out of 5 stars`} aria-pressed={rating === value} onClick={() => { setRating(value); setSuccess(''); }} className={styles.starButton}>
            <Star size={29} fill={value <= rating ? 'currentColor' : 'none'} strokeWidth={1.6}/>
          </button>)}
          <span className={styles.ratingText}>{rating ? `${rating} / 5` : 'Choose a rating'}</span>
        </div>
      </fieldset>
      <label className={styles.label} htmlFor="dm-service-feedback-comment">Your feedback</label>
      <textarea id="dm-service-feedback-comment" className={styles.textarea} rows={4} required minLength={20} maxLength={1500} disabled={saving} value={comment} onChange={e => {setComment(e.target.value);setSuccess('');}} placeholder="Tell us what went well and what we can do better…"/>
      <p className={styles.helper}>{comment.trim().length}/1500 characters · Minimum 20 characters</p>
      <label className={styles.consent}><input type="checkbox" checked={publish} disabled={saving} onChange={e=>{setPublish(e.target.checked);setSuccess('');}}/>
        <span>I agree to have my rating and written feedback displayed publicly on the DM Events website. My name and booking details will not be shown.</span>
      </label>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {success && <p role="status" className={styles.success}><CheckCircle2 size={18}/>{success}</p>}
      <button type="submit" disabled={saving || rating<1 || comment.trim().length<20} className={styles.submit}>{saving ? 'Saving feedback…' : existing ? 'Update feedback' : 'Submit feedback'}</button>
      <p className={styles.helper}>You can edit your rating, review or publication preference later from this completed booking.</p>
    </form>}
  </section>;
}
