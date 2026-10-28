'use client';

import { useState, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Eye, ImagePlus, Layers, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api, json } from '@/api-client/http';
import { uploadImage } from '@/api-client/uploadImage';
import { useLiveQuery } from '@/hooks/useLiveQuery';
import { ListSkeleton } from '@/components/ui/LoadingSkeleton';

type P = { id: string; name: string; description: string; inclusions: string[]; imageId: string | null; published: boolean; sortOrder: number };
type Form = { name: string; description: string; inclusions: string; imageId: string; published: boolean; sortOrder: number };
const blank: Form = { name: '', description: '', inclusions: '', published: false, sortOrder: 0, imageId: '' };

export default function PackageEditor() {
  const { data, loading, error, refresh } = useLiveQuery(() => api<{ packages: P[] }>('/api/packages'), []);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [statusError, setStatusError] = useState(false);
  const [filter, setFilter] = useState<'all' | 'published' | 'hidden'>('all');
  const [showPreview, setShowPreview] = useState(true);

  const packages = data?.packages ?? [];
  const visible = packages.filter(p => filter === 'all' || (filter === 'published' ? p.published : !p.published));
  const update = <K extends keyof Form>(key: K, value: Form[K]) => setForm(f => ({ ...f, [key]: value }));
  const reset = () => { setEditing(null); setForm(blank); setStatus(''); setStatusError(false); };
  const choose = (p: P) => {
    setEditing(p.id); setForm({ name: p.name, description: p.description, inclusions: p.inclusions.join('\n'), imageId: p.imageId ?? '', published: p.published, sortOrder: p.sortOrder });
    setStatus(''); setStatusError(false);
    window.scrollTo({top: 0, behavior: 'smooth'});
  };
  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!file.size || file.size > 10 * 1024 * 1024) { setStatus('Package images must be 10 MB or smaller.'); setStatusError(true); return; }
    setBusy(true); setStatus('Uploading image…'); setStatusError(false);
    try {
      const asset = await uploadImage(file, 'PACKAGE');
      update('imageId', asset.id);
      setStatus('Photograph uploaded. Save the package to keep this image.');
    } catch (err) { setStatus((err as Error).message); setStatusError(true); }
    finally { setBusy(false); }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.description.trim()) { setStatus('Add a package name and description.'); setStatusError(true); return; }
    setBusy(true); setStatus(''); setStatusError(false);
    try {
      const payload = {
        ...form, name: form.name.trim(), description: form.description.trim(),
        inclusions: form.inclusions.split('\n').map(v => v.trim()).filter(Boolean),
        imageId: form.imageId || null,
      };
      await api(editing ? `/api/packages/${editing}` : '/api/packages', json(editing ? 'PATCH' : 'POST', payload));
      await refresh();
      reset();
      setStatus(payload.published ? 'Package saved and published to the client website.' : 'Package saved as hidden. It is not visible to clients.');
    } catch (err) { setStatus((err as Error).message); setStatusError(true); }
    finally { setBusy(false); }
  }
  async function remove(p: P) {
    if (!window.confirm(`Delete “${p.name}”? Existing bookings retain their information, but links to this package may be removed.`)) return;
    setBusy(true); setStatus(''); setStatusError(false);
    try {
      await api(`/api/packages/${p.id}`, { method: 'DELETE' });
      if (editing === p.id) reset();
      await refresh(); setStatus('Package deleted.');
    } catch (err) { setStatus((err as Error).message); setStatusError(true); }
    finally { setBusy(false); }
  }

  return <main className="page-wrap page-space dm-admin-editor">
    <div className="dm-editor-intro"><div><p className="eyebrow">PACKAGE COLLECTION STUDIO</p><h2 style={{margin:'8px 0'}}>Create experiences worth exploring</h2><p className="hint">Add photos, describe what is included, and decide which packages clients can see and inquire about.</p></div><button className="btn btn-ghost" type="button" onClick={() => setShowPreview(v=>!v)}><Eye size={16}/> {showPreview?'Hide preview':'Show preview'}</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="dm-editor-layout">
      <div className="dm-editor-panel"><div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:15}}><h3>{editing ? 'Edit existing package' : 'Create a new package'}</h3><span className={`dm-editor-status ${form.published ? 'dm-editor-status--published' : 'dm-editor-status--hidden'}`}>{form.published ? 'PUBLISHED' : 'HIDDEN'}</span></div><p className="dm-editor-panel__sub">Published packages appear on the public Packages page and may be featured on the homepage.</p>
        <form onSubmit={save} className="dm-editor-fields"><label>Package name<input required minLength={2} maxLength={160} value={form.name} onChange={e=>update('name',e.target.value)} placeholder="e.g. Signature Celebration" /></label>
          <label>About the package<textarea required maxLength={3000} rows={4} value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Describe the experience and who it is designed for…" /></label>
          <label>Inclusions — one item per line<textarea rows={6} value={form.inclusions} onChange={e=>update('inclusions',e.target.value)} placeholder={'Event consultation\nCoordination support\n...'} /><span className="dm-editor-help">Each line becomes an inclusion on the client package page (up to 50, 240 characters per line).</span></label>
          <label>Cover photograph (JPG, PNG, WebP · maximum 10 MB)<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} /><span className="dm-editor-help">Images upload directly to Cloudinary, so high-quality photos do not exceed Vercel request limits.</span></label>
          {form.imageId && <div><img className="dm-editor-preview-image" src={`/api/assets/${form.imageId}`} alt="Chosen package cover" /><button type="button" className="btn btn-ghost btn-small" style={{marginTop:9}} onClick={()=>update('imageId','')} disabled={busy}><X size={14}/> Remove photo</button></div>}
          <div className="dm-editor-fields dm-editor-fields--two"><label>Display order<input type="number" min={0} max={1000} value={form.sortOrder} onChange={e=>update('sortOrder',Math.min(1000,Math.max(0,Number(e.target.value)||0)))} /></label><label style={{display:'flex',justifyContent:'center',flexDirection:'column'}}>Visibility<span style={{display:'flex',alignItems:'center',gap:8,marginTop:8,fontSize:13,fontWeight:500}}><input type="checkbox" checked={form.published} onChange={e=>update('published',e.target.checked)} /> Publish to clients</span></label></div>
          <p className="dm-editor-help">Packages with lower display orders appear first. The first three published packages are featured on the homepage.</p>
          {status && <p role="status" className={statusError?'error':'notice'}>{status}</p>}
          <div className="dm-editor-actions"><button className="btn btn-ghost" type="button" onClick={reset} disabled={busy}>{editing ? 'Cancel editing' : 'Clear form'}</button><button className="btn" type="submit" disabled={busy}><Plus size={16}/>{busy ? 'Saving…' : editing ? 'Save changes' : 'Create package'}</button></div>
        </form>
      </div>
      <div style={{display:'grid',gap:20}}>
        {showPreview && <section className="dm-editor-panel"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><h3>Client-facing preview</h3><span className="dm-editor-status dm-editor-status--hidden">UNSAVED</span></div><p className="dm-editor-panel__sub">See how the current package photograph and details will appear.</p><div style={{border:'1px solid #e5e8ec',borderRadius:10,overflow:'hidden'}}><div style={{aspectRatio:'1.65',background:'linear-gradient(140deg,#1d4b70,#09243d)',display:'grid',placeItems:'center',overflow:'hidden'}}>{form.imageId?<img src={`/api/assets/${form.imageId}`} alt="Package visual preview" style={{width:'100%',height:'100%',objectFit:'cover'}} />:<ImagePlus size={38} color="#d5e6f0"/>}</div><div style={{padding:17}}><small style={{letterSpacing:'.12em',color:'#9e7545'}}>EVENT PACKAGE</small><h3 style={{fontFamily:'Georgia,serif',fontWeight:500,fontSize:28,margin:'10px 0'}}>{form.name || 'Package name'}</h3><p className="hint">{form.description || 'A short, inviting description of the experience…'}</p><ul style={{paddingLeft:18,color:'#536a7e',fontSize:12,lineHeight:1.8}}>{form.inclusions.split('\n').map(x=>x.trim()).filter(Boolean).slice(0,3).map((x,i)=><li key={i}>{x}</li>)}</ul></div></div></section>}
        <section className="dm-editor-panel"><div style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:12}}><h3>Package library</h3><span className="dm-editor-status dm-editor-status--hidden">{packages.length} TOTAL</span></div><p className="dm-editor-panel__sub">Select a package to edit, or change which listings are visible.</p><div style={{display:'flex',gap:7,marginBottom:12,flexWrap:'wrap'}}>{(['all','published','hidden'] as const).map(v=><button type="button" key={v} className={`btn btn-small ${filter===v?'':'btn-ghost'}`} onClick={()=>setFilter(v)} style={{textTransform:'capitalize'}}>{v}</button>)}</div>{loading && !data ? <ListSkeleton label="Loading packages"/> : visible.length ? visible.map(p=><div className="dm-admin-package-item" key={p.id}>{p.imageId?<img src={`/api/assets/${p.imageId}`} alt={`${p.name} cover`} />:<span className="dm-admin-package-item__placeholder"><Layers size={27}/></span>}<div className="dm-admin-package-item__body"><strong>{p.name}</strong><p className="dm-admin-package-item__meta"><span className={`dm-editor-status ${p.published?'dm-editor-status--published':'dm-editor-status--hidden'}`}>{p.published?'Published':'Hidden'}</span> &nbsp; Order {p.sortOrder} · {p.inclusions.length} inclusions</p><div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}><button type="button" className="btn btn-small" disabled={busy} onClick={()=>choose(p)}><Pencil size={13}/> Edit</button>{p.published && <Link className="btn btn-small btn-ghost" target="_blank" rel="noreferrer" href={`/packages/${p.id}`}><ArrowUpRight size={13}/> View</Link>}<button type="button" className="btn btn-small btn-ghost" disabled={busy} onClick={()=>void remove(p)} aria-label={`Delete ${p.name}`}><Trash2 size={13}/></button></div></div></div>) : <p className="hint">{filter==='all'?'No packages yet. Create your first one.':'No packages match this filter.'}</p>}</section>
      </div>
    </div>
  </main>;
}
