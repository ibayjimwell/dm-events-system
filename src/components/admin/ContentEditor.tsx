'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Eye, FileText, ImagePlus, Layers, Save, Send, Settings2, Sparkles, Undo2 } from 'lucide-react';
import { api, json } from '@/api-client/http';
import { uploadImage } from '@/api-client/uploadImage';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { DetailSkeleton } from '@/components/ui/LoadingSkeleton';
import HomeShowcase from '@/components/marketing/HomeShowcase';
import type { PublicPackage } from '@/components/marketing/PackageShowcaseCard';
import { DEFAULT_HOMEPAGE, normalizeHomepage, type HomepageContent } from '@/lib/sitePresentation';

type Site = {
  heroTitle: string;
  heroSubtitle: string;
  heroImageId: string | null;
  contactEmail: string;
  contactPhone: string;
  privacyPolicy: string;
  homepage: unknown;
  draft?: unknown;
};
type ContentForm = Omit<Site, 'homepage' | 'draft'> & { homepage: HomepageContent };

const blank: ContentForm = {
  heroTitle: 'Your Vision. Our Celebration.',
  heroSubtitle: 'Plan memorable events with DM Events — from your first idea to the confirmed date.',
  heroImageId: null,
  contactEmail: '', contactPhone: '', privacyPolicy: '', homepage: DEFAULT_HOMEPAGE,
};
function fromSite(value: unknown): ContentForm {
  const p = value && typeof value === 'object' ? value as Partial<Site> : {};
  return {
    heroTitle: p.heroTitle ?? blank.heroTitle,
    heroSubtitle: p.heroSubtitle ?? blank.heroSubtitle,
    heroImageId: p.heroImageId || null,
    contactEmail: p.contactEmail ?? '',
    contactPhone: p.contactPhone ?? '',
    privacyPolicy: p.privacyPolicy ?? '',
    homepage: normalizeHomepage(p.homepage),
  };
}
const keys = ['heroEyebrow', 'aboutEyebrow', 'aboutTitle', 'aboutBody', 'featuresEyebrow',
  'featuresTitle', 'packagesEyebrow', 'packagesTitle', 'packagesBody', 'stepsEyebrow',
  'stepsTitle', 'ctaEyebrow', 'ctaTitle', 'ctaBody'] as const;
type CopyKey = typeof keys[number];

function EditorInput({ title, value, onChange, multiline = false, maxLength = 600 }: {
  title: string; value: string; onChange: (value: string) => void; multiline?: boolean; maxLength?: number;
}) {
  return <label>{title}{multiline
    ? <textarea value={value} onChange={e => onChange(e.target.value)} maxLength={maxLength} required minLength={2} rows={3} />
    : <input value={value} onChange={e => onChange(e.target.value)} maxLength={maxLength} required minLength={2} />}
    <span className="dm-editor-help" style={{ textAlign: 'right' }}>{value.length}/{maxLength}</span>
  </label>;
}

export default function ContentEditor() {
  const { data, loading, error, refresh } = useLiveQuery(() => api<{content: Site}>('/api/content'), []);
  const { data: packData } = useLiveQuery(() => api<{packages: (PublicPackage & {published:boolean})[]}>('/api/packages'), []);
  const [form, setForm] = useState<ContentForm>(() => structuredClone(blank));
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [showPreview, setShowPreview] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const editedSinceLoad = useRef(false);
  const publishedPackages = packData?.packages.filter(p => p.published).slice(0,3) ?? [];

  // Read draft first when present; never show draft changes on the public page until Publish.
  useEffect(() => {
    if (!data?.content || editedSinceLoad.current) return;
    setForm(fromSite(data.content.draft || data.content));
    setLoaded(true);
  }, [data]);

  function setTop<K extends keyof Omit<ContentForm, 'homepage'>>(key: K, value: ContentForm[K]) {
    editedSinceLoad.current = true;
    setForm(prev => ({ ...prev, [key]: value }));
  }
  function setCopy(key: CopyKey, value: string) {
    editedSinceLoad.current = true;
    setForm(prev => ({ ...prev, homepage: { ...prev.homepage, [key]: value } }));
  }
  function setBlock(group: 'features' | 'steps', index: number, field: 'title' | 'description', value: string) {
    editedSinceLoad.current = true;
    setForm(prev => {
      const next = prev.homepage[group].map((item, i) => i === index ? { ...item, [field]: value } : item);
      return { ...prev, homepage: { ...prev.homepage, [group]: next as HomepageContent[typeof group] } };
    });
  }
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.size || file.size > 10 * 1024 * 1024) { setStatus('Please choose a photo no larger than 10 MB.'); setIsError(true); return; }
    setBusy(true); setStatus('Uploading homepage photograph…'); setIsError(false);
    try {
      const uploaded = await uploadImage(file, 'HERO');
      setTop('heroImageId', uploaded.id);
      setStatus('Photo uploaded. Publish changes when you are ready for visitors to see it.');
    } catch (err) { setStatus((err as Error).message); setIsError(true); }
    finally { setBusy(false); }
  }
  async function save(action: 'draft' | 'publish') {
    if (!form.privacyPolicy.trim() || form.privacyPolicy.length < 100) {
      setStatus('Please provide an approved privacy policy of at least 100 characters before saving.'); setIsError(true); return;
    }
    setBusy(true); setStatus(''); setIsError(false);
    try {
      await api('/api/content', json('PATCH', { action, data: form }));
      editedSinceLoad.current = false;
      setStatus(action === 'publish' ? 'Published successfully. Your public homepage now shows these changes.' : 'Draft saved. The live website has not changed.');
      await refresh();
    } catch (err) { setStatus((err as Error).message); setIsError(true); }
    finally { setBusy(false); }
  }
  function restorePublished() {
    if (!data?.content) return;
    if (!window.confirm('Discard unsaved edits and the current draft preview? Published content will not be changed.')) return;
    editedSinceLoad.current = true;
    setForm(fromSite(data.content));
    setStatus('Showing currently published content. Save as draft or publish to keep your next edits.'); setIsError(false);
  }

  return <main className="page-wrap page-space dm-admin-editor">
    <div className="dm-editor-intro"><div><p className="eyebrow">WEBSITE CONTENT STUDIO</p><h2 style={{ margin: '8px 0' }}>Shape your homepage</h2><p className="hint">Edit the story visitors see. Save drafts privately, review the live preview, and publish when ready.</p></div><button className="btn btn-ghost" type="button" onClick={() => setShowPreview(p => !p)}><Eye size={16} /> {showPreview ? 'Hide preview' : 'Show preview'}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && !loaded ? <DetailSkeleton label="Loading website content" /> : <form onSubmit={(e: FormEvent) => { e.preventDefault(); void save('publish'); }}>
      <div className={showPreview ? 'dm-editor-layout' : ''}>
        <div className="dm-editor-panel">
          <div className="dm-editor-section"><div className="dm-editor-section__head"><span><ImagePlus size={16}/></span> Hero — the first impression</div>
            <div className="dm-editor-fields"><EditorInput title="Small introductory line" value={form.homepage.heroEyebrow} onChange={v=>setCopy('heroEyebrow',v)} maxLength={100}/><EditorInput title="Main headline" value={form.heroTitle} onChange={v=>setTop('heroTitle',v)} maxLength={180}/><EditorInput title="Supporting message" value={form.heroSubtitle} onChange={v=>setTop('heroSubtitle',v)} multiline maxLength={600}/>
              <label>Hero background photo (JPG, PNG, WebP · up to 10 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} /><span className="dm-editor-help">Large landscape photographs work best. Uploads are sent directly to Cloudinary.</span></label>
              {/* eslint-disable-next-line @next/next/no-img-element */}<img className="dm-editor-photo" alt="Current homepage hero preview" src={form.heroImageId ? `/api/assets/${form.heroImageId}` : '/images/venue.jpg'} />
              {form.heroImageId && <button className="btn btn-ghost btn-small" type="button" onClick={() => setTop('heroImageId', null)} disabled={busy}>Use original default photo</button>}
            </div>
          </div>
          <div className="dm-editor-section"><div className="dm-editor-section__head"><span><FileText size={16}/></span> Introduction</div><div className="dm-editor-fields"><EditorInput title="Section label" value={form.homepage.aboutEyebrow} onChange={v=>setCopy('aboutEyebrow',v)} maxLength={100}/><EditorInput title="Section heading" value={form.homepage.aboutTitle} onChange={v=>setCopy('aboutTitle',v)} maxLength={180}/><EditorInput title="Introduction text" value={form.homepage.aboutBody} onChange={v=>setCopy('aboutBody',v)} maxLength={1000} multiline /></div></div>
          <div className="dm-editor-section"><div className="dm-editor-section__head"><span><Sparkles size={16}/></span> Three service highlights</div><div className="dm-editor-fields"><EditorInput title="Section label" value={form.homepage.featuresEyebrow} onChange={v=>setCopy('featuresEyebrow',v)} maxLength={100}/><EditorInput title="Section heading" value={form.homepage.featuresTitle} onChange={v=>setCopy('featuresTitle',v)} maxLength={180}/>{form.homepage.features.map((item,i)=><div key={i} className="dm-editor-fields" style={{ background:'#f6f9fc', padding:14, borderRadius:8 }}><strong style={{fontSize:12}}>Highlight {i+1}</strong><EditorInput title="Title" value={item.title} onChange={v=>setBlock('features',i,'title',v)} maxLength={120}/><EditorInput title="Description" value={item.description} onChange={v=>setBlock('features',i,'description',v)} maxLength={420} multiline /></div>)}</div></div>
          <div className="dm-editor-section"><div className="dm-editor-section__head"><span><Layers size={16}/></span> Featured packages section</div><div className="dm-editor-fields"><EditorInput title="Section label" value={form.homepage.packagesEyebrow} onChange={v=>setCopy('packagesEyebrow',v)} maxLength={100}/><EditorInput title="Section heading" value={form.homepage.packagesTitle} onChange={v=>setCopy('packagesTitle',v)} maxLength={180}/><EditorInput title="Description" value={form.homepage.packagesBody} onChange={v=>setCopy('packagesBody',v)} maxLength={700} multiline /><p className="dm-editor-help">The three published packages with the lowest Sort order are shown here. Edit them under Manage Packages.</p></div></div>
          <div className="dm-editor-section"><div className="dm-editor-section__head"><span><Settings2 size={16}/></span> How booking works</div><div className="dm-editor-fields"><EditorInput title="Section label" value={form.homepage.stepsEyebrow} onChange={v=>setCopy('stepsEyebrow',v)} maxLength={100}/><EditorInput title="Section heading" value={form.homepage.stepsTitle} onChange={v=>setCopy('stepsTitle',v)} maxLength={180}/>{form.homepage.steps.map((item,i)=><div key={i} className="dm-editor-fields" style={{ background:'#f6f9fc', padding:14, borderRadius:8 }}><strong style={{fontSize:12}}>Step {i+1}</strong><EditorInput title="Title" value={item.title} onChange={v=>setBlock('steps',i,'title',v)} maxLength={120}/><EditorInput title="Description" value={item.description} onChange={v=>setBlock('steps',i,'description',v)} maxLength={420} multiline /></div>)}</div></div>
          <div className="dm-editor-section"><div className="dm-editor-section__head"><span><Send size={16}/></span> Closing invitation</div><div className="dm-editor-fields"><EditorInput title="Section label" value={form.homepage.ctaEyebrow} onChange={v=>setCopy('ctaEyebrow',v)} maxLength={100}/><EditorInput title="Heading" value={form.homepage.ctaTitle} onChange={v=>setCopy('ctaTitle',v)} maxLength={180}/><EditorInput title="Supporting text" value={form.homepage.ctaBody} onChange={v=>setCopy('ctaBody',v)} maxLength={700} multiline /></div></div>
          <div className="dm-editor-section"><div className="dm-editor-section__head"><span><FileText size={16}/></span> Contact and privacy</div><div className="dm-editor-fields"><div className="dm-editor-fields dm-editor-fields--two"><label>Business email<input type="email" value={form.contactEmail} maxLength={200} onChange={e=>setTop('contactEmail',e.target.value)} placeholder="hello@example.com" /></label><label>Business phone<input type="tel" value={form.contactPhone} maxLength={80} onChange={e=>setTop('contactPhone',e.target.value)} placeholder="Business number" /></label></div><label>Approved privacy policy<textarea value={form.privacyPolicy} minLength={100} maxLength={20000} required rows={7} onChange={e=>setTop('privacyPolicy',e.target.value)} /><span className="dm-editor-help">At least 100 characters. This text appears on /privacy. Have it approved before publishing.</span></label></div></div>
          {status && <p className={isError ? 'error' : 'notice'} role="status" style={{marginTop:18}}>{status}</p>}
          <div className="dm-editor-actions"><button className="btn btn-ghost" type="button" disabled={busy} onClick={restorePublished}><Undo2 size={15}/> Restore published</button><button className="btn btn-ghost" type="button" disabled={busy || !loaded} onClick={() => void save('draft')}><Save size={15}/> Save draft</button><button className="btn" type="submit" disabled={busy || !loaded}><Send size={15}/> {busy ? 'Working…' : 'Publish changes'}</button></div>
        </div>
        {showPreview && <aside className="dm-editor-panel dm-editor-preview" aria-label="Live unsaved website preview"><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:10,marginBottom:8}}><h3>Live preview</h3><span className="dm-editor-status dm-editor-status--hidden">LOCAL DRAFT</span></div><p className="dm-editor-panel__sub">Preview updates as you type. It is not published until you click Publish changes.</p><div className="dm-editor-preview__frame"><HomeShowcase site={form} featured={publishedPackages} preview /></div></aside>}
      </div>
    </form>}
  </main>;
}
