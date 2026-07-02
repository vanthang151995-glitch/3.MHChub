// @ts-nocheck
import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import "./CreateCapaModal.css";
import PdfJsViewer from "./PdfJsViewer";
import OfficeFileViewer from "./OfficeFileViewer";

/* ─── Steps ─────────────────────────────────────────────── */
const STEPS = [
  { num:1, label:"Thông tin cơ bản" },
  { num:2, label:"Phân tích & Kế hoạch" },
  { num:3, label:"Phân công" },
  { num:4, label:"Xác nhận" },
];

/* ─── Constants (mirror CreateCapaModal) ─────────────────── */
const PRIORITIES = [
  { val:"critical", label:"Khẩn cấp", dot:"#dc2626", bg:"#fef2f2", border:"#fecaca", color:"#dc2626" },
  { val:"high",     label:"Cao",       dot:"#f97316", bg:"#fff7ed", border:"#fed7aa", color:"#d97706" },
  { val:"medium",   label:"Trung bình",dot:"#eab308", bg:"#fefce8", border:"#fde68a", color:"#ca8a04" },
  { val:"low",      label:"Thấp",      dot:"#22c55e", bg:"#f0fdf4", border:"#a7f3d0", color:"#16a34a" },
];

const TOPICS = [
  "An toàn lao động","PCCC","6S / Housekeeping","Hóa chất",
  "An toàn điện","Máy móc / Thiết bị","Môi trường","Sức khỏe nghề nghiệp",
  "Giao thông nội bộ","KYT","Audit / Kiểm toán","Khác",
];

const KHOI = [
  { id:"PED", label:"Khối PED", icon:"🏭", color:"#7c3aed", depts:["PE1","MP","MT","CM","WM"] },
  { id:"QAD", label:"Khối QAD", icon:"🛡️", color:"#0369a1", depts:["QA","GA","QC","CS","EHS","OS"] },
  { id:"DD",  label:"Khối DD",  icon:"🔧", color:"#b45309", depts:["MR","RF","DB","DP1","DP2"] },
  { id:"SD",  label:"Khối SD",  icon:"⚙️", color:"#0f766e", depts:["OK1","OK2","SP1"] },
  { id:"ED",  label:"Khối ED",  icon:"🔌", color:"#be185d", depts:["EBM","ETR","MS1","SA","MS2"] },
  { id:"all", label:"Toàn công ty", icon:"🏗️", color:"#374151",
    depts:["PE1","MP","MT","CM","WM","QA","GA","QC","CS","EHS","OS","MR","RF","DB","DP1","DP2","OK1","OK2","SP1","EBM","ETR","MS1","SA","MS2"] },
];

const AREAS = ["","Khu A","Khu B","Nhà xưởng","Văn phòng","Kho","Tầng 3","Hành lang","Toàn nhà máy","Khác (nhập tự do)"];

const VERIFY_METHODS = [
  "Quan sát thực tế tại hiện trường",
  "Kiểm tra hồ sơ / báo cáo",
  "Chạy thử / vận hành thử",
  "Đo lường / kiểm định",
  "Phỏng vấn nhân viên",
  "Audit nội bộ / kiểm toán lại",
  "Khác (tự nhập)",
];

const RCA_METHODS = [
  { val:"5why",     icon:"🔍", label:"5-Why" },
  { val:"fishbone", icon:"🐟", label:"Fishbone" },
  { val:"gap",      icon:"📊", label:"Gap" },
  { val:"free",     icon:"📝", label:"Tự do" },
];

const PROBLEM_TYPE_OPTIONS = [
  { val:"MACH",   icon:"⚙️",  label:"Máy móc",     color:"#7c3aed", bg:"#f5f3ff", border:"#ddd6fe" },
  { val:"ELEC",   icon:"⚡",  label:"Điện",         color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  { val:"CHEM",   icon:"🧪",  label:"Hóa chất",     color:"#0369a1", bg:"#f0f9ff", border:"#bae6fd" },
  { val:"HEIGHT", icon:"🪜",  label:"Làm việc cao", color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  { val:"VEHICLE",icon:"🚛",  label:"Phương tiện",  color:"#b45309", bg:"#fffbeb", border:"#fed7aa" },
  { val:"PPE",    icon:"🦺",  label:"BHLĐ / PPE",   color:"#0f766e", bg:"#f0fdfa", border:"#99f6e4" },
  { val:"BEHAV",  icon:"👷",  label:"Hành vi",      color:"#be185d", bg:"#fdf2f8", border:"#f9a8d4" },
  { val:"NEAR",   icon:"⚠️",  label:"Near-miss",    color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  { val:"FIRE",   icon:"🔥",  label:"PCCC",         color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  { val:"ENV",    icon:"🌿",  label:"Môi trường",   color:"#16a34a", bg:"#f0fdf4", border:"#86efac" },
  { val:"6S",     icon:"🧹",  label:"6S",           color:"#2563eb", bg:"#eff6ff", border:"#bfdbfe" },
  { val:"ENRG",   icon:"💡",  label:"Năng lượng",   color:"#ca8a04", bg:"#fefce8", border:"#fde68a" },
  { val:"OTHER",  icon:"📌",  label:"Khác",         color:"#64748b", bg:"#f8fafc", border:"#e2e8f0" },
];

const SOURCE_TYPE_MAP: Record<string,{icon:string;label:string;color:string;bg:string;border:string}> = {
  warning:    { icon:"⚡",  label:"Cảnh báo nóng",   color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  incident:   { icon:"🚨", label:"Sự cố",             color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  inspection: { icon:"📋", label:"Kế hoạch KT",       color:"#7c3aed", bg:"#faf5ff", border:"#d8b4fe" },
  audit:      { icon:"🔍", label:"Audit",             color:"#0369a1", bg:"#f0f9ff", border:"#bae6fd" },
  pccc:       { icon:"🔥", label:"PCCC",              color:"#b91c1c", bg:"#fff1f2", border:"#fecdd3" },
  manual:     { icon:"✏️", label:"Thủ công",           color:"#475569", bg:"#f8fafc", border:"#e2e8f0" },
};

/* ─── Style constants (mirror CreateCapaModal) ───────────── */
const INP: React.CSSProperties = {
  width:"100%", padding:"8px 11px", fontSize:14, boxSizing:"border-box",
  border:"1.5px solid #b8c5d4", borderRadius:7, outline:"none",
  color:"#0f172a", background:"#fff", fontFamily:"inherit",
};
const LBL: React.CSSProperties = {
  fontSize:14, fontWeight:700, color:"#374151",
  display:"flex", alignItems:"center", gap:5, marginBottom:5,
};

/* ─── Tiny helpers ───────────────────────────────────────── */
function Req() { return <span style={{ color:"#dc2626" }}>*</span>; }
const autoGrow = (e: React.FormEvent<HTMLTextAreaElement>) => {
  const el = e.currentTarget; el.style.height = "auto"; el.style.height = el.scrollHeight + "px";
};

/* ─── Photo / File helpers (mirrors CreateCapaModal) ─────── */
type PhotoEntry = { id:string; file:File; originalUrl:string; previewUrl:string; originalSize:number; compressedSize:number; name:string; };
type FileAttachEntry = { id:string; name:string; size:number; fileType:'pdf'|'excel'|'word'; url:string; file?:File; };

function fmtBytes(b:number):string { if(b<1024) return b+"B"; if(b<1048576) return (b/1024).toFixed(1)+"KB"; return (b/1048576).toFixed(1)+"MB"; }

function fileTypeOf(f:File):'pdf'|'excel'|'word'|null {
  const n=f.name.toLowerCase();
  if(f.type==='application/pdf'||n.endsWith('.pdf')) return 'pdf';
  if(n.endsWith('.xlsx')||n.endsWith('.xls')||f.type.includes('spreadsheet')||f.type.includes('excel')) return 'excel';
  if(n.endsWith('.docx')||n.endsWith('.doc')||f.type.includes('wordprocessingml')||f.type.includes('msword')) return 'word';
  return null;
}

async function compressImage(file:File, maxPx=1400, quality=0.80): Promise<PhotoEntry> {
  return new Promise(resolve => {
    const origUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      let w=img.naturalWidth, h=img.naturalHeight;
      if(w>maxPx||h>maxPx){if(w>=h){h=Math.round(h*maxPx/w);w=maxPx;}else{w=Math.round(w*maxPx/h);h=maxPx;}}
      const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
      cv.getContext("2d")!.drawImage(img,0,0,w,h);
      cv.toBlob(blob=>{
        resolve({ id:crypto.randomUUID(), file, originalUrl:origUrl,
          previewUrl:URL.createObjectURL(blob!), originalSize:file.size, compressedSize:blob!.size, name:file.name });
      },"image/jpeg",quality);
    };
    img.src=origUrl;
  });
}

function Lightbox({ photos, startIndex, onClose }:{ photos:PhotoEntry[]; startIndex:number; onClose:()=>void }) {
  const [idx,setIdx]=useState(startIndex);
  const p=photos[idx];
  useEffect(()=>{
    const fn=(e:KeyboardEvent)=>{if(e.key==="ArrowLeft")setIdx(i=>(i-1+photos.length)%photos.length);if(e.key==="ArrowRight")setIdx(i=>(i+1)%photos.length);if(e.key==="Escape")onClose();};
    window.addEventListener("keydown",fn); return ()=>window.removeEventListener("keydown",fn);
  },[photos.length,onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:9999,background:"rgba(0,0,0,.9)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
      <div onClick={e=>e.stopPropagation()} style={{position:"absolute",top:0,left:0,right:0,display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 16px",background:"rgba(0,0,0,.45)"}}>
        <span style={{fontSize:13,color:"rgba(255,255,255,.7)"}}>{idx+1}/{photos.length} · {p.name}</span>
        <button onClick={onClose} style={{background:"rgba(255,255,255,.12)",border:"none",borderRadius:6,color:"#fff",fontSize:16,cursor:"pointer",padding:"5px 10px"}}>✕</button>
      </div>
      <img onClick={e=>e.stopPropagation()} src={p.previewUrl} style={{maxWidth:"90vw",maxHeight:"80vh",objectFit:"contain",borderRadius:8}} alt={p.name}/>
      {photos.length>1&&(<>
        <button onClick={e=>{e.stopPropagation();setIdx(i=>(i-1+photos.length)%photos.length);}} style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:40,height:40,color:"#fff",fontSize:20,cursor:"pointer"}}>‹</button>
        <button onClick={e=>{e.stopPropagation();setIdx(i=>(i+1)%photos.length);}} style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:40,height:40,color:"#fff",fontSize:20,cursor:"pointer"}}>›</button>
      </>)}
    </div>
  );
}

function CompactImageZone({ photos, onAdd, onRemove, maxFiles=8, label="Ảnh bằng chứng" }:
  { photos:PhotoEntry[]; onAdd:(e:PhotoEntry[])=>void; onRemove:(id:string)=>void; maxFiles?:number; label?:string; }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [lbIdx, setLbIdx] = useState<number|null>(null);
  const process = useCallback(async(files:File[]) => {
    const imgs = files.filter(f=>f.type.startsWith("image/")).slice(0,maxFiles-photos.length);
    if(!imgs.length) return; setProcessing(true);
    onAdd(await Promise.all(imgs.map(f=>compressImage(f)))); setProcessing(false);
  },[photos.length,maxFiles,onAdd]);
  const remaining = maxFiles - photos.length;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:5}}>
      {lbIdx!==null && <Lightbox photos={photos} startIndex={lbIdx} onClose={()=>setLbIdx(null)}/>}
      {photos.length > 0 ? (
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {photos.map((p,i)=>(
            <div key={p.id} style={{position:"relative",flexShrink:0}}>
              <button onClick={()=>setLbIdx(i)} style={{padding:0,border:"2px solid #fde68a",borderRadius:7,cursor:"pointer",background:"none",overflow:"hidden",display:"block"}} title={p.name}>
                <img src={p.previewUrl} style={{width:60,height:60,objectFit:"cover",display:"block"}} alt={p.name}/>
              </button>
              <button onClick={()=>onRemove(p.id)} style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"#ef4444",border:"2px solid #fff",color:"#fff",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button>
            </div>
          ))}
          {remaining > 0 && !processing && (
            <button onClick={()=>inputRef.current?.click()} style={{width:60,height:60,borderRadius:7,border:"2px dashed #fde68a",background:"#fffbf0",cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,color:"#d97706",flexShrink:0}}>
              <span style={{fontSize:18}}>+</span><span style={{fontSize:12,fontWeight:700}}>thêm</span>
            </button>
          )}
        </div>
      ) : (
        <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);process(Array.from(e.dataTransfer.files));}}
          onClick={()=>remaining>0&&inputRef.current?.click()}
          style={{border:`2px dashed ${dragging?"#d97706":"#fde68a"}`,borderRadius:10,background:dragging?"#fefce8":"#fffbf0",padding:"14px 10px",textAlign:"center",cursor:"pointer",transition:"all .15s"}}>
          {processing ? <div style={{fontSize:13,color:"#64748b",fontWeight:600}}>Đang xử lý…</div>
            : <><div style={{fontSize:28,marginBottom:4,lineHeight:1}}>🖼️</div>
                <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:2}}>{label}</div>
                <div style={{fontSize:12,color:"#94a3b8"}}>JPG, PNG, WEBP</div></>}
        </div>
      )}
      <input ref={inputRef} type="file" multiple accept="image/*" style={{display:"none"}} onChange={e=>{if(e.target.files)process(Array.from(e.target.files));e.target.value="";}}/>
    </div>
  );
}

/* ─── DocFileChip (Edit modal) — tooltip via portal ─────────── */
function EditDocFileChip({entry,idx,meta,onView,onRemove}) {
  const wrapRef=useRef(null);
  const [tipPos,setTipPos]=useState(null);
  function handleEnter(){
    if(wrapRef.current){const r=wrapRef.current.getBoundingClientRect();setTipPos({x:r.left+r.width/2,y:r.top-8});}
  }
  return (
    <div ref={wrapRef} style={{position:'relative',flexShrink:0}}
      onMouseEnter={handleEnter} onMouseLeave={()=>setTipPos(null)}>
      {tipPos&&createPortal(
        <div style={{position:'fixed',top:tipPos.y,left:tipPos.x,
          transform:'translate(-50%,-100%)',zIndex:99999,
          background:'#1e293b',color:'#fff',borderRadius:9,
          padding:'8px 12px',fontSize:11.5,pointerEvents:'none',
          boxShadow:'0 6px 20px rgba(0,0,0,.32)',
          minWidth:160,maxWidth:240,whiteSpace:'normal',wordBreak:'break-all',lineHeight:1.4}}>
          <div style={{fontWeight:800,marginBottom:3,fontSize:12}}>{entry.name}</div>
          <div style={{color:'#94a3b8',fontSize:10.5}}>{meta.label} · {fmtBytes(entry.size)}</div>
          <div style={{marginTop:4,fontSize:10,color:'#60a5fa',fontWeight:700}}>👁 Nhấn để xem</div>
          <div style={{position:'absolute',top:'100%',left:'50%',transform:'translateX(-50%)',
            width:0,height:0,borderLeft:'5px solid transparent',
            borderRight:'5px solid transparent',borderTop:'5px solid #1e293b'}}/>
        </div>,document.body
      )}
      <button onClick={onView} title={entry.name}
        style={{width:60,height:70,borderRadius:11,
          border:`2px solid ${tipPos?meta.color:meta.border}`,
          background:meta.bg,cursor:'pointer',
          display:'flex',flexDirection:'column',
          alignItems:'center',justifyContent:'center',
          gap:3,padding:'4px 3px',transition:'all .13s',
          boxShadow:tipPos?`0 4px 14px ${meta.color}30`:'0 1px 4px rgba(0,0,0,.07)',
          position:'relative'}}>
        <span style={{position:'absolute',top:-5,right:-5,
          width:17,height:17,borderRadius:'50%',
          background:meta.color,color:'#fff',fontSize:9,fontWeight:900,
          display:'flex',alignItems:'center',justifyContent:'center',
          border:'2px solid #fff',lineHeight:1}}>{idx+1}</span>
        <span style={{fontSize:28,lineHeight:1}}>{meta.icon}</span>
        <span style={{fontSize:8.5,fontWeight:800,color:meta.color,
          textTransform:'uppercase',letterSpacing:'0.05em',lineHeight:1}}>{meta.label}</span>
      </button>
      <button onClick={e=>{e.stopPropagation();onRemove(entry.id);}} title="Xóa file"
        style={{position:'absolute',top:-5,left:-5,
          width:17,height:17,borderRadius:'50%',
          background:'#ef4444',border:'2px solid #fff',
          color:'#fff',fontSize:9,fontWeight:900,cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',
          padding:0,lineHeight:1}}>✕</button>
    </div>
  );
}

/* ─── EditDocPreviewModal ─────────────────────────────────────── */
function EditDocPreviewModal({entry,onClose}) {
  if(entry.fileType==='excel'||entry.fileType==='word')
    return <OfficeFileViewer url={entry.url} fileName={entry.name} onClose={onClose} fileObj={entry.file}/>;
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',zIndex:9998,display:'flex',flexDirection:'column'}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'#1e293b',padding:'10px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <span style={{fontSize:13,fontWeight:700,color:'#fff',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.name}</span>
        <span style={{fontSize:12,color:'#94a3b8'}}>{fmtBytes(entry.size)}</span>
        <a href={entry.url} download={entry.name} style={{padding:'4px 10px',borderRadius:6,background:'#334155',color:'#94a3b8',fontSize:12,fontWeight:600,textDecoration:'none'}}>⬇️ Tải</a>
        <button onClick={onClose} style={{padding:'4px 12px',borderRadius:6,background:'#ef4444',border:'none',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer'}}>✕ Đóng</button>
      </div>
      <div style={{flex:1,overflow:'hidden'}}>
        <PdfJsViewer url={entry.url} file={entry.file} style={{width:'100%',height:'100%'}}/>
      </div>
    </div>
  );
}

function EvidenceDocZone({ files, onChange }:{ files:FileAttachEntry[]; onChange:(f:FileAttachEntry[])=>void }) {
  const inp = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<FileAttachEntry|null>(null);
  const TYPE_META:{[k:string]:{icon:string;label:string;color:string;bg:string;border:string}} = {
    pdf:   {icon:"📕",label:"PDF",  color:"#b91c1c",bg:"#fff5f5",border:"#fca5a5"},
    excel: {icon:"📗",label:"Excel",color:"#166534",bg:"#f0fdf4",border:"#86efac"},
    word:  {icon:"📘",label:"Word", color:"#1d4ed8",bg:"#eff6ff",border:"#93c5fd"},
  };
  function process(raw:File[]) {
    const entries:FileAttachEntry[]=[];
    for(const f of raw){const t=fileTypeOf(f);if(!t)continue;entries.push({id:crypto.randomUUID(),name:f.name,size:f.size,fileType:t,url:URL.createObjectURL(f),file:f});}
    if(entries.length) onChange([...files,...entries]);
  }
  function remove(id:string){const e=files.find(f=>f.id===id);if(e)URL.revokeObjectURL(e.url);onChange(files.filter(f=>f.id!==id));}
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {preview && createPortal(<EditDocPreviewModal entry={preview} onClose={()=>setPreview(null)}/>,document.body)}
      {files.length > 0 && (
        <div style={{display:"flex",flexWrap:"wrap",gap:10,padding:"6px 4px",
          background:"#fafbfc",borderRadius:10,border:"1px solid #f1f5f9"}}>
          {files.map((f,idx)=>{
            const m=TYPE_META[f.fileType]||TYPE_META.pdf;
            return (
              <EditDocFileChip key={f.id} entry={f} idx={idx} meta={m}
                onView={()=>setPreview(f)} onRemove={remove}/>
            );
          })}
        </div>
      )}
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);process(Array.from(e.dataTransfer.files));}}
        onClick={()=>inp.current?.click()}
        style={{border:`2px dashed ${drag?"#3b82f6":"#cbd5e1"}`,borderRadius:10,background:drag?"#eff6ff":"#fafbfc",padding:"14px 10px",textAlign:"center",cursor:"pointer",transition:"all .15s",boxShadow:drag?"0 0 0 3px #bfdbfe":"none"}}>
        <div style={{fontSize:28,marginBottom:4,lineHeight:1}}>{drag?"📂":"📎"}</div>
        <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:2}}>Tài liệu hỗ trợ</div>
        <div style={{fontSize:12,color:"#94a3b8"}}>PDF · Excel · Word</div>
        {files.length>0&&<div style={{marginTop:4,fontSize:12,color:"#2563eb",fontWeight:700}}>+ Thêm ({files.length} file)</div>}
      </div>
      <input ref={inp} type="file" multiple
        accept=".pdf,.xlsx,.xls,.doc,.docx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{display:"none"}} onChange={e=>{if(e.target.files)process(Array.from(e.target.files));e.target.value="";}}/>
    </div>
  );
}

/* ─── Action item type ───────────────────────────────────── */
type ActionItem = { id:string; action:string; type:'CA'|'PA'|'Both'|''; persons:string[]; deadline:string; progress:string; note:string; };
function newActionItem(deadline?:string): ActionItem {
  return { id:crypto.randomUUID(), action:"", type:"CA", persons:[], deadline:deadline||"", progress:"", note:"" };
}
const AP_TYPE_CFG: Record<string,{label:string;color:string;bg:string;border:string}> = {
  CA:   { label:"CA",    color:"#dc2626", bg:"#fef2f2", border:"#fca5a5" },
  PA:   { label:"PA",    color:"#16a34a", bg:"#f0fdf4", border:"#86efac" },
  Both: { label:"CA+PA", color:"#7c3aed", bg:"#faf5ff", border:"#c4b5fd" },
};

/* ─── TypeDropdown ───────────────────────────────────────── */
function TypeDropdown({ value, onChange }: { value:string; onChange:(v:ActionItem["type"])=>void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e:MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn);
  }, []);
  const cfg = value ? AP_TYPE_CFG[value] : null;
  const OPTIONS: ActionItem["type"][] = ["CA","PA","Both"];
  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        display:"flex", alignItems:"center", gap:5, padding:"5px 8px", borderRadius:7, cursor:"pointer",
        border: cfg ? `2px solid ${cfg.color}` : "1.5px solid #9ca3af",
        background: cfg ? cfg.bg : "#fff", color: cfg ? cfg.color : "#6b7280",
        fontSize:12, fontWeight:700, whiteSpace:"nowrap", width:"100%", boxSizing:"border-box",
        transition:"all .12s",
      }}>
        <span style={{ flex:1 }}>{cfg ? cfg.label : "Chọn…"}</span>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9"/></svg>
      </button>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 3px)", left:0, zIndex:200, background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:9, boxShadow:"0 8px 24px rgba(0,0,0,.13)", overflow:"hidden", minWidth:110 }}>
          {OPTIONS.map(t => {
            const c = AP_TYPE_CFG[t]; const sel = value===t;
            return (
              <button key={t} onMouseDown={e=>{e.preventDefault(); onChange(t); setOpen(false);}}
                style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"7px 12px", border:"none", cursor:"pointer", textAlign:"left", background:sel?c.bg:"transparent" }}
                onMouseEnter={e=>(e.currentTarget.style.background=c.bg)}
                onMouseLeave={e=>(e.currentTarget.style.background=sel?c.bg:"transparent")}>
                <span style={{ width:10, height:10, borderRadius:"50%", background:c.color, flexShrink:0 }}/>
                <span style={{ fontSize:13, fontWeight:sel?800:600, color:c.color }}>{c.label}</span>
                {sel && <span style={{ marginLeft:"auto", fontSize:13, color:c.color }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CARD_INP: React.CSSProperties = {
  padding:"6px 9px", fontSize:12, boxSizing:"border-box",
  border:"1.5px solid #e2e8f0", borderRadius:7, outline:"none",
  color:"#0f172a", background:"#fff", fontFamily:"inherit", width:"100%",
};

/* ─── MiniPersonPicker ─── */
function MiniPersonPicker({ values, onChange }: { values:string[]; onChange:(v:string[])=>void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e:MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  function getInfo(name:string) {
    const pd = PERSONNEL.find(p=>p.name===name);
    const dc = pd ? (KHOI.find(k=>k.id!=="all"&&k.depts.includes(pd.dept))?.color??"#64748b") : "#64748b";
    const ini = name.trim().split(" ").slice(-2).map(w=>w[0]).join("").toUpperCase();
    return { pd, dc, ini };
  }

  const filtered = PERSONNEL
    .filter(p=>!values.includes(p.name))
    .filter(p=>q===""||p.name.toLowerCase().includes(q.toLowerCase())||p.dept.toLowerCase().includes(q.toLowerCase()))
    .slice(0,8);
  const canCustom = q.trim().length>0 && !PERSONNEL.some(p=>p.name.toLowerCase()===q.trim().toLowerCase()) && !values.includes(q.trim());

  function add(name:string) { onChange([...values, name]); setQ(""); }
  function remove(name:string) { onChange(values.filter(v=>v!==name)); }

  return (
    <div ref={ref} style={{ position:"relative" }}>
      {values.length>0 ? (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, alignItems:"center", background:"#f0fdf4", border:"1.5px solid #6ee7b7", borderRadius:8, padding:"3px 6px 3px 5px", cursor:"pointer", minHeight:32 }}
          onClick={()=>setOpen(o=>!o)}>
          {values.map(name=>{
            const {pd,dc,ini}=getInfo(name);
            return (
              <span key={name} style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#fff", border:`1.5px solid ${dc}40`, borderRadius:6, padding:"2px 6px 2px 3px" }}>
                <span style={{ width:18, height:18, borderRadius:"50%", background:dc, color:"#fff", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{ini}</span>
                <span style={{ fontSize:11, fontWeight:700, color:"#166534", maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name.split(" ").slice(-1)[0]}</span>
                {pd && <span style={{ fontSize:10, fontWeight:700, color:dc, background:dc+"18", padding:"0 3px", borderRadius:3 }}>{pd.dept}</span>}
                <button onMouseDown={e=>{e.stopPropagation();e.preventDefault();remove(name);}} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:11, padding:0, lineHeight:1 }}>✕</button>
              </span>
            );
          })}
          <button onMouseDown={e=>{e.stopPropagation();e.preventDefault();setOpen(o=>!o);setQ("");}}
            style={{ background:"none", border:"1px dashed #6ee7b7", borderRadius:5, color:"#16a34a", fontSize:12, cursor:"pointer", padding:"1px 6px", fontWeight:700 }}>＋</button>
        </div>
      ) : (
        <button onClick={()=>setOpen(o=>!o)} style={{ display:"flex", alignItems:"center", gap:6, width:"100%", padding:"5px 9px", borderRadius:8, border:"1.5px solid #d1d5db", background:"#fff", cursor:"pointer", textAlign:"left", boxShadow:"0 1px 2px rgba(0,0,0,.04)", transition:"border-color .12s" }}
          onMouseEnter={e=>{e.currentTarget.style.borderColor="#6ee7b7";}}
          onMouseLeave={e=>{if(!open)e.currentTarget.style.borderColor="#d1d5db";}}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          <span style={{ fontSize:12, color:"#94a3b8", fontWeight:500 }}>Chọn người thực hiện...</span>
        </button>
      )}
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff", border:"1.5px solid #6ee7b7", borderRadius:9, boxShadow:"0 8px 24px rgba(0,0,0,.13)", zIndex:120, overflow:"hidden" }}>
          <div style={{ padding:"6px 8px", borderBottom:"1px solid #f0fdf4" }}>
            <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"){ if(filtered.length===1) add(filtered[0].name); else if(canCustom) add(q.trim()); e.preventDefault(); } if(e.key==="Escape") { setOpen(false); setQ(""); } }}
              style={{ ...CARD_INP, border:"1.5px solid #d1fae5", fontSize:12 }} placeholder="Tìm tên hoặc bộ phận..."/>
          </div>
          <div style={{ maxHeight:180, overflowY:"auto" }}>
            {filtered.length===0 && !canCustom && <div style={{ padding:"10px 12px", fontSize:13, color:"#94a3b8", textAlign:"center" }}>Không tìm thấy</div>}
            {filtered.map(p=>{
              const {dc,ini}=getInfo(p.name);
              return (
                <button key={p.name} onMouseDown={e=>{e.preventDefault();add(p.name);}}
                  style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"6px 10px", border:"none", background:"transparent", cursor:"pointer", textAlign:"left" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="#f0fdf4")}
                  onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                  <span style={{ width:26, height:26, borderRadius:"50%", background:dc, color:"#fff", fontSize:11, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{ini}</span>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:600, color:"#1e293b" }}>{p.name}</div>
                    <div style={{ fontSize:11, color:"#64748b" }}>{p.role}</div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:dc, background:dc+"18", border:`1px solid ${dc}40`, padding:"1px 5px", borderRadius:4, flexShrink:0 }}>{p.dept}</span>
                </button>
              );
            })}
            {canCustom && (
              <button onMouseDown={e=>{e.preventDefault();add(q.trim());}}
                style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"6px 10px", border:"none", background:"transparent", cursor:"pointer", textAlign:"left", borderTop:"1px solid #f0fdf4" }}
                onMouseEnter={e=>(e.currentTarget.style.background="#fafffe")}
                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                <span style={{ width:26, height:26, borderRadius:"50%", background:"#64748b", color:"#fff", fontSize:15, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>＋</span>
                <div style={{ fontSize:13, color:"#475569" }}>Thêm <strong style={{ color:"#1e293b" }}>"{q.trim()}"</strong></div>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── ActionCardRows — card-style giống CreateCapaModal ─── */
function ActionCardRows({ items, onChange, defaultDeadline }: { items:ActionItem[]; onChange:(v:ActionItem[])=>void; defaultDeadline?:string }) {
  function upd<K extends keyof ActionItem>(id:string, field:K, val:ActionItem[K]) {
    onChange(items.map(it=>it.id===id?{...it,[field]:val}:it));
  }
  function del(id:string) {
    if(items.length===1){ onChange([newActionItem(defaultDeadline)]); return; }
    onChange(items.filter(it=>it.id!==id));
  }
  function add() { onChange([...items, newActionItem(defaultDeadline)]); }
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {items.map((row, i)=>(
        <div key={row.id} style={{ background:"#fff", border:"2px solid #6ee7b7", borderRadius:10, padding:"10px 12px", display:"flex", flexDirection:"column", gap:8, boxShadow:"0 2px 8px rgba(16,185,129,.10)" }}>
          {/* Hàng 1: số thứ tự + mô tả + xóa */}
          <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
            <span style={{ width:24, height:24, borderRadius:"50%", background:"#16a34a", color:"#fff", fontSize:12, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:5, boxShadow:"0 1px 4px rgba(22,163,74,.3)" }}>{i+1}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <textarea rows={1} style={{ ...CARD_INP, fontWeight:600, background:"#f8fffe", border:"1.5px solid #a7f3d0", resize:"vertical", lineHeight:1.55, minHeight:34 }}
                value={row.action} onChange={e=>upd(row.id,"action",e.target.value)} onInput={autoGrow}
                placeholder="Mô tả hành động cụ thể..."/>
            </div>
            <button onClick={()=>del(row.id)} style={{ width:24, height:24, borderRadius:"50%", background:"#fee2e2", border:"1px solid #fca5a5", color:"#dc2626", fontSize:13, fontWeight:900, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", marginTop:5 }}>✕</button>
          </div>
          {/* Hàng 2: Loại CA/PA + người thực hiện + hạn */}
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr 130px", gap:7, alignItems:"start" }}>
            <TypeDropdown value={row.type} onChange={v=>upd(row.id,"type",v)}/>
            <MiniPersonPicker values={row.persons} onChange={v=>upd(row.id,"persons",v)}/>
            <input type="date" style={{ ...CARD_INP, background:"#f8fffe", border:"1.5px solid #a7f3d0" }}
              value={row.deadline||""} onChange={e=>upd(row.id,"deadline",e.target.value)}/>
          </div>
        </div>
      ))}
      <button onClick={add} style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:6, padding:"10px", borderRadius:9, border:"2px dashed #34d399", background:"#fff", color:"#059669", fontSize:13, fontWeight:700, cursor:"pointer", boxShadow:"0 1px 3px rgba(22,163,74,.1)" }}>
        ＋ Thêm hành động
      </button>
    </div>
  );
}

/* ─── PersonPicker (same as CreateCapaModal) ─────────────── */
const PERSONNEL = [
  { name:"Nguyễn Văn Thắng", dept:"PE1", role:"An toàn viên" },
  { name:"Trần Thị Lan",     dept:"PE1", role:"Trưởng nhóm" },
  { name:"Lê Văn Hùng",     dept:"MP",  role:"An toàn viên" },
  { name:"Phạm Thị Hoa",    dept:"MP",  role:"An toàn viên" },
  { name:"Nguyễn Minh Tuấn",dept:"MT",  role:"An toàn viên" },
  { name:"Trần Văn Đức",    dept:"EHS", role:"Cán bộ ATVSLĐ" },
  { name:"Nguyễn Thị Nga",  dept:"EHS", role:"Cán bộ ATVSLĐ" },
  { name:"Lê Thị Mai",      dept:"QA",  role:"An toàn viên" },
  { name:"Lê Văn Dũng",     dept:"MR",  role:"An toàn viên" },
  { name:"Vũ Thị Phương",   dept:"OK1", role:"An toàn viên" },
  { name:"Đặng Văn Kiên",   dept:"DP1", role:"Trưởng nhóm" },
  { name:"Hoàng Thị Linh",  dept:"GA",  role:"An toàn viên" },
];

function PersonPicker({ label, selected, onAdd, onRemove, input, onInputChange, chipBg, chipBorder, placeholder, deptFilter }: any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e:MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn);
  }, []);
  const q = input.trim().toLowerCase();
  const suggs = PERSONNEL.filter(p=>!selected.includes(p.name))
    .filter(p=>q===""||p.name.toLowerCase().includes(q)||p.dept.toLowerCase().includes(q))
    .sort((a,b)=>(deptFilter?.includes(b.dept)?1:0)-(deptFilter?.includes(a.dept)?1:0));
  const canCustom = q.length>0 && !PERSONNEL.some(p=>p.name.toLowerCase()===q) && !selected.includes(input.trim());
  function pick(name:string) { onAdd(name); onInputChange(""); setOpen(false); }
  return (
    <div ref={ref}>
      {label !== null && <label style={LBL}>{label}</label>}
      {selected.length>0 && (
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
          {selected.map((p:string,i:number) => {
            const pd = PERSONNEL.find(x=>x.name===p);
            const dc = pd ? (KHOI.find(k=>k.id!=="all"&&k.depts.includes(pd.dept))?.color??"#64748b") : "#64748b";
            return (
              <span key={i} style={{ fontSize:14, fontWeight:600, color:"#1e293b", background:chipBg, border:`1px solid ${chipBorder}`, padding:"4px 10px", borderRadius:6, display:"flex", alignItems:"center", gap:6 }}>
                👤 {p}
                {pd && <span style={{ fontSize:13, fontWeight:700, color:dc, background:dc+"18", border:`1px solid ${dc}40`, padding:"1px 5px", borderRadius:4 }}>{pd.dept}</span>}
                <button onClick={()=>onRemove(p)} style={{ background:"none", border:"none", cursor:"pointer", color:"#64748b", fontSize:14, padding:0 }}>✕</button>
              </span>
            );
          })}
        </div>
      )}
      <input style={{ ...INP, borderRadius:8 }} value={input} onChange={e=>{onInputChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)}
        onKeyDown={e=>{ if(e.key==="Enter"){e.preventDefault();if(suggs.length===1)pick(suggs[0].name);else if(canCustom){onAdd(input.trim());onInputChange("");}}}}
        placeholder={placeholder??"Tìm hoặc nhập tên..."} autoComplete="off"/>
      {open && (suggs.length>0 || canCustom) && (
        <div style={{ background:"#fff", border:"1.5px solid #cbd5e1", borderTop:"none", borderRadius:"0 0 8px 8px", boxShadow:"0 6px 20px rgba(0,0,0,.1)", maxHeight:200, overflowY:"auto", zIndex:100, position:"relative" }}>
          {suggs.slice(0,8).map(p => {
            const dc = KHOI.find(k=>k.id!=="all"&&k.depts.includes(p.dept))?.color??"#64748b";
            return (
              <button key={p.name} onMouseDown={e=>{e.preventDefault();pick(p.name);}}
                style={{ display:"flex", alignItems:"center", gap:9, width:"100%", padding:"7px 12px", border:"none", background:"transparent", cursor:"pointer", textAlign:"left" }}
                onMouseEnter={e=>(e.currentTarget.style.background="#f0f9ff")}
                onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                <span style={{ fontSize:14 }}>👤</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:"#1e293b" }}>{p.name}</div>
                  <div style={{ fontSize:13, color:"#475569" }}>{p.role} · {p.dept}</div>
                </div>
                <span style={{ fontSize:13, fontWeight:700, color:dc, background:dc+"18", padding:"1px 6px", borderRadius:4 }}>{p.dept}</span>
              </button>
            );
          })}
          {canCustom && (
            <button onMouseDown={e=>{e.preventDefault();onAdd(input.trim());onInputChange("");setOpen(false);}}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"7px 12px", border:"none", borderTop:suggs.length>0?"1px solid #f1f5f9":"none", background:"#f8fafc", cursor:"pointer", textAlign:"left" }}
              onMouseEnter={e=>(e.currentTarget.style.background="#eff6ff")}
              onMouseLeave={e=>(e.currentTarget.style.background="#f8fafc")}>
              <span style={{ fontSize:14 }}>➕</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:"#2563eb" }}>Thêm &ldquo;{input.trim()}&rdquo;</div>
                <div style={{ fontSize:12, color:"#94a3b8" }}>Nhập tên tự do</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── S5Card (step 4 summary) ────────────────────────────── */
function S5Card({ accent="#1e40af", children, onEdit }: any) {
  return (
    <div style={{ background:"#fff", border:`1.5px solid #e2e8f0`, borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.04)", position:"relative" }}>
      <div style={{ height:3, background:accent }}/>
      <div style={{ padding:"11px 14px" }}>{children}</div>
      {onEdit && (
        <button onClick={onEdit} style={{ position:"absolute", top:9, right:9, background:"#f1f5f9", border:"1px solid #e2e8f0", borderRadius:6, padding:"3px 8px", fontSize:12, fontWeight:700, color:"#475569", cursor:"pointer" }}>✏️ Sửa</button>
      )}
    </div>
  );
}
function S5Label({ children }: any) {
  return <div style={{ fontSize:11, fontWeight:800, color:"#94a3b8", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:5 }}>{children}</div>;
}

/* ─── Props ──────────────────────────────────────────────── */
interface Props {
  action: any;
  onClose: () => void;
  onSaved: (updated: any) => void;
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export function EditCapaModal({ action, onClose, onSaved }: Props) {
  /* ── Body scroll lock ── */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* ── Navigation ── */
  const [step, setStep] = useState(1);

  /* ── Source (read-only) ── */
  const srcType = SOURCE_TYPE_MAP[action.sourceType] || SOURCE_TYPE_MAP.manual;

  /* ── Step 1 state ── */
  const [title, setTitle]           = useState(action.title || "");
  const [priority, setPriority]     = useState(action.priority || "medium");
  const prio = PRIORITIES.find(p=>p.val===priority);
  const [capaType, setCapaType]     = useState(action.capaType || action.capa_type || "both");
  const [problemType, setProblemType] = useState(action.problemType || "");
  const [topic, setTopic]           = useState(action.topic || "");
  const [topicCustom, setTopicCustom] = useState("");
  const topicFinal = topic==="Khác"&&topicCustom.trim() ? topicCustom.trim() : topic;
  const [occurDate, setOccurDate]   = useState(action.occurDate || "");
  const [occurLocation, setOccurLocation] = useState(action.area || "");
  const [occurLocationCustom, setOccurLocationCustom] = useState("");
  const [reporterName, setReporterName] = useState(action.reporterName || action.ownerName || "");
  const [problemContent, setProblemContent] = useState(
    action.description?.startsWith("[") ? action.description.split("\n\n")[0] || action.description : action.description || ""
  );
  const [initialCause, setInitialCause] = useState(action.initialCause || "");

  /* ── Step 2 state ── */
  const [rcaMethod, setRcaMethod]   = useState(action.rcaMethod || "5why");
  const [whys, setWhys]             = useState<string[]>(
    Array.isArray(action.whys) && action.whys.length
      ? [...action.whys, ...Array(Math.max(0,5-action.whys.length)).fill("")]
      : ["","","","",""]
  );
  const [fishbone, setFishbone]     = useState<Record<string,string>>(
    action.fishbone || { man:"", machine:"", environment:"", method:"", material:"", measurement:"" }
  );
  const [gapActual, setGapActual]   = useState(action.gapActual || "");
  const [gapStandard, setGapStandard] = useState(action.gapStandard || "");
  const [freeAnalysis, setFreeAnalysis] = useState(action.freeAnalysis || "");
  const [rootCause, setRootCause]   = useState(action.rootCause || "");

  const initItems = (): ActionItem[] => {
    const rows = Array.isArray(action.actionPlan) && action.actionPlan.length ? action.actionPlan : [];
    if (!rows.length) return [newActionItem(action.dueDate || "")];
    return rows.map((it:any) => ({
      id: crypto.randomUUID(),
      action: it.action || "",
      type: it.type || "CA",
      persons: Array.isArray(it.persons) ? it.persons : (it.person ? [it.person] : []),
      deadline: it.deadline || "",
      progress: String(it.progress || ""),
      note: it.note || "",
    }));
  };
  const [actionItems, setActionItems] = useState<ActionItem[]>(initItems);
  const caCount = actionItems.filter(i=>i.type==="CA"||i.type==="Both").length;
  const paCount = actionItems.filter(i=>i.type==="PA"||i.type==="Both").length;

  /* ── Evidence upload state ── */
  const [evidencePhotos, setEvidencePhotos] = useState<PhotoEntry[]>([]);
  const addEvidencePhotos = useCallback((entries: PhotoEntry[]) => setEvidencePhotos(p=>[...p,...entries]), []);
  const [evidenceDocs, setEvidenceDocs] = useState<FileAttachEntry[]>([]);

  /* ── Step 3 state ── */
  const [depts, setDepts] = useState<string[]>(
    Array.isArray(action.departments) && action.departments.length
      ? action.departments
      : action.departmentCode ? [action.departmentCode] : []
  );
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [area, setArea]             = useState(action.area || "");
  const [areaCustom, setAreaCustom] = useState("");
  const areaFinal = area==="Khác (nhập tự do)"&&areaCustom.trim() ? areaCustom.trim() : area;
  const [deadline, setDeadline]     = useState(action.dueDate || action.due || new Date(Date.now()+7*86400000).toISOString().slice(0,10));
  const [verifyDate, setVerifyDate] = useState(action.verifyDate || "");
  const [verifyMethod, setVerifyMethod] = useState(action.verifyMethod || "");
  const [verifyMethodCustom, setVerifyMethodCustom] = useState("");
  const [persons, setPersons]       = useState<string[]>(
    Array.isArray(action.persons) ? action.persons : (action.persons||"").split(",").map((s:string)=>s.trim()).filter(Boolean)
  );
  const [personInput, setPersonInput] = useState("");
  const [reviewers, setReviewers]   = useState<string[]>(
    Array.isArray(action.reviewers) ? action.reviewers : (action.reviewers||"").split(",").map((s:string)=>s.trim()).filter(Boolean)
  );
  const [reviewerInput, setReviewerInput] = useState("");

  /* Dept picker helpers */
  function toggleDept(d:string) { setDepts(prev=>prev.includes(d)?prev.filter(x=>x!==d):[...prev,d]); }
  function applyKhoi(k:typeof KHOI[0]) {
    if (k.id==="all") { setDepts(k.depts); return; }
    const allSel = k.depts.every(d=>depts.includes(d));
    setDepts(prev=>allSel?prev.filter(d=>!k.depts.includes(d)):[...new Set([...prev,...k.depts])]);
  }

  /* ── Submit ── */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [saved, setSaved]           = useState(false);

  /* Validation */
  const canNext1 = title.trim().length>0 && !!capaType && !!priority && !!problemContent.trim();
  const canNext2 = actionItems.filter(i=>i.action.trim()&&i.type).length>0;
  const canNext3 = depts.length>0 && !!deadline && persons.length>0;
  const canSubmit = canNext1 && canNext2 && canNext3;

  const save = async () => {
    if (!title.trim()) { setError("Tiêu đề không được trống"); return; }
    setSubmitting(true); setError("");
    try {
      const filledActions = actionItems.filter(i=>i.action.trim()&&i.type);
      const payload: any = {
        title:          title.trim(),
        description:    problemContent.trim(),
        priority,
        capaType,
        topic:          topicFinal || null,
        problemType:    problemType || null,
        occurDate:      occurDate || null,
        area:           areaFinal || occurLocation || null,
        reporterName:   reporterName.trim() || null,
        initialCause:   initialCause.trim() || null,
        rcaMethod:      rcaMethod || null,
        rootCause:      rootCause.trim() || null,
        whys:           whys.map((w:string)=>w.trim()),
        fishbone:       rcaMethod==="fishbone" ? fishbone : null,
        gapActual:      rcaMethod==="gap" ? gapActual.trim() : null,
        gapStandard:    rcaMethod==="gap" ? gapStandard.trim() : null,
        freeAnalysis:   rcaMethod==="free" ? freeAnalysis.trim() : null,
        actionPlan:     filledActions.map(it=>({
          action:   it.action.trim(),
          type:     it.type,
          persons:  Array.isArray(it.persons) ? it.persons : (it.persons?[it.persons]:[]),
          deadline: it.deadline || null,
          progress: Number(it.progress)||0,
          note:     it.note||null,
        })),
        departmentCode: depts[0] || undefined,
        departments:    depts.length>0 ? depts : undefined,
        ownerName:      persons[0] || undefined,
        persons,
        reviewers,
        dueDate:        deadline || null,
        verifyDate:     verifyDate || null,
        verifyMethod:   verifyMethod==="Khác (tự nhập)"?(verifyMethodCustom||"Khác"):verifyMethod || null,
        _editMode:      true,
      };
      const r = await fetch(`/api/actions/${action.id}`, {
        method:"PATCH", credentials:"include",
        headers:{ "Content-Type":"application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) throw new Error(await r.text());
      let updated = await r.json();

      /* ── Upload new evidence photos + docs ── */
      const newFiles: File[] = [
        ...evidencePhotos.map(p => p.file),
        ...evidenceDocs.filter(d=>d.file).map(d=>d.file as File),
      ].slice(0, 5); // server limit: 5 files
      if (newFiles.length > 0) {
        const fd = new FormData();
        newFiles.forEach(f => fd.append("files", f));
        const ur = await fetch(`/api/actions/${action.id}/upload-evidence`, {
          method:"POST", credentials:"include", body: fd,
        });
        if (ur.ok) {
          updated = await ur.json();
        } else {
          let msg = "Lưu thành công nhưng không thể tải lên bằng chứng.";
          try { const body = await ur.json(); if(body?.message) msg += " " + body.message; } catch {}
          setError(msg);
          setSubmitting(false);
          setSaved(true);
          setTimeout(() => { onSaved(updated); }, 1200);
          return;
        }
      }

      setSaved(true);
      setTimeout(() => { onSaved(updated); }, 700);
    } catch(e:any) {
      setError(e.message || "Lỗi khi lưu");
    } finally { setSubmitting(false); }
  };

  /* ── RENDER ─────────────────────────────────────────────── */
  return createPortal(
    <div role="presentation" onMouseDown={e=>{ if(e.target===e.currentTarget) onClose(); }} style={{
      position:"fixed", inset:0, background:"rgba(15,23,42,0.65)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1800,
      fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", fontSize:14,
    }}>
      <div role="dialog" aria-modal="true" aria-label="Chỉnh sửa CAPA"
        className="capa-v3-modal"
        onMouseDown={e=>e.stopPropagation()}
        onClick={e=>e.stopPropagation()}
        style={{
          width:1060, maxWidth:"calc(100vw - 20px)", height:"calc(100vh - 32px)", maxHeight:900,
          background:"#f0f4fa", borderRadius:20, boxShadow:"0 28px 90px rgba(0,0,0,.25)",
          overflow:"hidden", display:"flex", flexDirection:"column",
        }}>

        {/* ── HEADER ── */}
        <div style={{ background:"#fff", padding:"13px 24px 0", flexShrink:0, borderBottom:"1px solid transparent" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:11 }}>
            {/* Avatar */}
            <div style={{ width:38, height:38, borderRadius:11, background:"linear-gradient(135deg,#1e40af,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", flexShrink:0, boxShadow:"0 4px 12px rgba(30,64,175,.30)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", letterSpacing:"-0.01em" }}>Chỉnh sửa CAPA</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:1 }}>
                Bước {step} / 4 — <span style={{ color:"#1e40af", fontWeight:600 }}>{STEPS.find(s=>s.num===step)?.label}</span>
                {action.code && <> · <code style={{ fontSize:11.5, fontWeight:700, color:"#7c3aed", background:"#faf5ff", border:"1px solid #e9d5ff", padding:"0 6px", borderRadius:4 }}>{action.code}</code></>}
              </div>
            </div>
            {/* CA/PA badge */}
            {capaType && (
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"4px 12px", flexShrink:0 }}>
                {capaType==="ca"&&<span style={{ fontWeight:800, color:"#dc2626" }}>CA</span>}
                {capaType==="pa"&&<span style={{ fontWeight:800, color:"#16a34a" }}>PA</span>}
                {capaType==="both"&&<span style={{ fontWeight:800, color:"#7c3aed" }}>CA+PA</span>}
                {priority && <><span style={{ color:"#cbd5e1", margin:"0 2px" }}>·</span><span style={{ color:prio?.color||"#64748b", fontWeight:700 }}>{prio?.label}</span></>}
              </div>
            )}
            <button onClick={onClose} style={{ background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:8, width:32, height:32, cursor:"pointer", color:"#64748b", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .12s" }}
              onMouseEnter={e=>(e.currentTarget.style.background="#fee2e2",e.currentTarget.style.color="#dc2626")}
              onMouseLeave={e=>(e.currentTarget.style.background="#f1f5f9",e.currentTarget.style.color="#64748b")}>✕</button>
          </div>
        </div>

        {/* ── STEP BAR ── */}
        <div className="capa-v3-steps-bar">
          <div className="capa-v3-steps">
            {STEPS.map((s,i) => {
              const done=step>s.num, active=step===s.num;
              return (
                <div key={s.num} className="capa-v3-step-wrap" style={{ flex:i<STEPS.length-1?"1 1 0":"none" }}>
                  <div className="capa-v3-step-btn" onClick={done?()=>setStep(s.num):undefined} style={{
                    borderBottom:active?"3px solid #2563eb":done?"3px solid #16a34a":"3px solid transparent",
                    marginBottom:"-2px", cursor:done?"pointer":"default" }}>
                    <div style={{
                      width:24, height:24, borderRadius:"50%", flexShrink:0,
                      display:"flex", alignItems:"center", justifyContent:"center",
                      fontSize:12, fontWeight:900, transition:"all .2s",
                      background:done?"linear-gradient(135deg,#16a34a,#22c55e)":active?"linear-gradient(135deg,#1e40af,#3b82f6)":"#fff",
                      color:done||active?"#fff":"#94a3b8",
                      border:done||active?"none":"2px solid #e2e8f0",
                      boxShadow:active?"0 2px 8px rgba(30,64,175,.30)":done?"0 2px 8px rgba(22,163,74,.25)":"none",
                    }}>
                      {done?"✓":s.num}
                    </div>
                    <span className="capa-v3-step-lbl" style={{ color:active?"#1e3a8a":done?"#15803d":"#374151", fontWeight:active||done?700:600 }}>{s.label}</span>
                  </div>
                  {i<STEPS.length-1 && <div className="capa-v3-step-div" style={{ background:done?"linear-gradient(90deg,#86efac,#4ade80)":"#e2e8f0" }}/>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── BODY ── */}
        <div className={`v3-body${step===2?" v3-body--step3":""}`}>

          {/* ════ STEP 1: THÔNG TIN CƠ BẢN ════ */}
          {step===1 && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

              {/* Source banner (read-only) */}
              <div style={{ padding:"7px 13px", borderRadius:9, background:srcType.bg, border:`1.5px solid ${srcType.border}`, display:"flex", alignItems:"center", gap:8 }}>
                <span style={{ fontSize:15 }}>{srcType.icon}</span>
                <span style={{ fontSize:13, fontWeight:800, color:srcType.color }}>{srcType.label}</span>
                <span style={{ fontSize:13, fontWeight:600, color:"#1e293b", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                  {action.sourceCode || action.sourceId || action.code || "—"}
                  {action.sourceTitle ? ` — ${action.sourceTitle}` : ""}
                </span>
                <span style={{ fontSize:12, color:"#64748b", flexShrink:0, fontStyle:"italic" }}>🔒 Nguồn cố định</span>
              </div>

              {/* §A Định danh */}
              <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.03)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 15px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>📋 Định danh</span>
                  <span style={{ fontSize:13, color:"#64748b", fontWeight:500 }}>— tiêu đề, chuyên đề, vị trí</span>
                </div>
                <div style={{ padding:"13px 15px", display:"flex", flexDirection:"column", gap:9 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Tiêu đề CAPA <Req/></div>
                    <input style={{ ...INP, fontSize:14, fontWeight:600 }} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Tóm tắt ngắn gọn vấn đề / hành động cần thực hiện..."/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>📅 Ngày xảy ra</div>
                      <input type="date" style={INP} value={occurDate} onChange={e=>setOccurDate(e.target.value)} max={new Date().toISOString().split("T")[0]}/>
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Chuyên đề <Req/></div>
                      <select style={INP} value={topic} onChange={e=>{setTopic(e.target.value);setTopicCustom("");}}>
                        <option value="">— Chọn —</option>
                        {TOPICS.map(t=><option key={t}>{t}</option>)}
                      </select>
                      {topic==="Khác"&&<input style={{ ...INP, marginTop:5 }} value={topicCustom} onChange={e=>setTopicCustom(e.target.value)} placeholder="Nhập chuyên đề..." autoFocus/>}
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>📍 Vị trí</div>
                      <select style={INP} value={occurLocation} onChange={e=>setOccurLocation(e.target.value)}>
                        <option value="">— Chọn —</option>
                        {["Khu A","Khu B","Nhà xưởng","Văn phòng","Kho","Tầng 3","Hành lang","Toàn nhà máy","Khác"].map(a=><option key={a}>{a}</option>)}
                      </select>
                      {occurLocation==="Khác"&&<input style={{ ...INP, marginTop:4 }} placeholder="Nhập vị trí..." value={occurLocationCustom} onChange={e=>setOccurLocationCustom(e.target.value)}/>}
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>👤 Báo cáo bởi</div>
                      <input style={INP} value={reporterName} onChange={e=>setReporterName(e.target.value)} placeholder="Tên người phát hiện..."/>
                    </div>
                  </div>
                </div>
              </div>

              {/* §B Phân loại — 3 cột */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>

                {/* Card 1: Mức ưu tiên */}
                <div style={{ background:"#fff", borderRadius:12, overflow:"hidden",
                  border:`1.5px solid ${priority&&prio?prio.border:"#e2e8f0"}`,
                  boxShadow:priority&&prio?`0 2px 10px ${prio.color}12`:"0 1px 4px rgba(0,0,0,.03)" }}>
                  <div style={{ padding:"8px 13px", background:priority&&prio?prio.bg:"#f8fafc", borderBottom:`1px solid ${priority&&prio?prio.border:"#e2e8f0"}` }}>
                    <span style={{ fontSize:12, fontWeight:800, color:priority&&prio?prio.color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                      Mức ưu tiên <Req/>
                    </span>
                  </div>
                  <div style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {PRIORITIES.map(p=>{
                        const sel=priority===p.val;
                        const ICONS:Record<string,string>={critical:"🔴",high:"🟠",medium:"🟡",low:"🟢"};
                        return (
                          <button key={p.val} onClick={()=>setPriority(p.val)} style={{
                            display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:8, cursor:"pointer",
                            border:sel?`2px solid ${p.dot}`:"1.5px solid #c4cdd9",
                            background:sel?p.bg:"#f8fafc", transition:"all .12s",
                          }}>
                            <span style={{ fontSize:13 }}>{ICONS[p.val]}</span>
                            <span style={{ fontSize:12, fontWeight:sel?800:600, color:sel?p.color:"#64748b", flex:1, textAlign:"left" }}>{p.label}</span>
                            {sel&&<span style={{ fontSize:12, padding:"1px 5px", borderRadius:10, background:p.dot, color:"#fff", fontWeight:900 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                    {priority==="critical"&&(
                      <div style={{ marginTop:8, padding:"6px 9px", borderRadius:7, background:"#fef2f2", border:"1px solid #fca5a5", fontSize:12, color:"#dc2626", fontWeight:600, lineHeight:1.4 }}>
                        🚨 Khẩn cấp — xử lý trong 24–48h
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 2: Loại CAPA */}
                <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1.5px solid #bae6fd", boxShadow:"0 1px 6px rgba(3,105,161,.07)" }}>
                  <div style={{ padding:"8px 13px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd" }}>
                    <span style={{ fontSize:12, fontWeight:800, color:"#0369a1", textTransform:"uppercase", letterSpacing:"0.06em" }}>Loại CAPA <Req/></span>
                  </div>
                  <div style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", flexDirection:"column", gap:7 }}>
                      {([
                        { val:"ca",   label:"CA — Khắc phục",  icon:"🔧", color:"#dc2626", bg:"#fef2f2", border:"#fca5a5" },
                        { val:"pa",   label:"PA — Phòng ngừa", icon:"🛡️", color:"#16a34a", bg:"#f0fdf4", border:"#86efac" },
                        { val:"both", label:"CA+PA — Cả hai",  icon:"⚡", color:"#7c3aed", bg:"#faf5ff", border:"#c4b5fd" },
                      ] as any[]).map(opt=>{
                        const sel=capaType===opt.val;
                        return (
                          <button key={opt.val} onClick={()=>setCapaType(opt.val)} style={{
                            display:"flex", alignItems:"center", gap:8, padding:"9px 11px", borderRadius:9, cursor:"pointer",
                            border:sel?`2px solid ${opt.color}`:"1.5px solid #b0c4d8",
                            background:sel?opt.bg:"#f6f9fc", transition:"all .12s",
                            boxShadow:sel?`0 2px 8px ${opt.color}22`:"none",
                          }}>
                            <span style={{ fontSize:15 }}>{opt.icon}</span>
                            <span style={{ fontSize:12, fontWeight:sel?800:600, color:sel?opt.color:"#374151", flex:1, textAlign:"left" }}>{opt.label}</span>
                            {sel&&<span style={{ fontSize:12, padding:"1px 5px", borderRadius:10, background:opt.color, color:"#fff", fontWeight:900 }}>✓</span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Card 3: Loại vấn đề */}
                <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1.5px solid #e2e8f0", boxShadow:"0 1px 4px rgba(0,0,0,.03)" }}>
                  <div style={{ padding:"8px 13px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                    <span style={{ fontSize:12, fontWeight:800, color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>Loại vấn đề</span>
                  </div>
                  <div style={{ padding:"10px 12px" }}>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:4 }}>
                      {PROBLEM_TYPE_OPTIONS.map(pt=>{
                        const sel=problemType===pt.val;
                        return (
                          <button key={pt.val} onClick={()=>setProblemType(pt.val===problemType?"":pt.val)} style={{
                            display:"flex", alignItems:"center", gap:3, padding:"5px 9px", borderRadius:7,
                            fontSize:12, fontWeight:sel?800:600, cursor:"pointer",
                            border:sel?`2px solid ${pt.color}`:`1.5px solid ${pt.border}`,
                            background:sel?pt.bg:"#f5f7fb", color:sel?pt.color:"#374151", transition:"all .12s",
                          }}>
                            <span>{pt.icon}</span><span>{pt.label}</span>
                          </button>
                        );
                      })}
                    </div>
                    {!problemType&&<div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic", marginTop:6 }}>Bấm chọn loại phù hợp ↑</div>}
                  </div>
                </div>
              </div>

              {/* §C Mô tả vấn đề — 2 cột */}
              <div style={{ background:"#fff", border:`1.5px solid ${problemContent.trim()?"#93c5fd":"#e2e8f0"}`, borderRadius:12, overflow:"hidden", boxShadow:"0 1px 6px rgba(37,99,235,.05)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 15px", background:problemContent.trim()?"#eff6ff":"#f8fafc", borderBottom:`1px solid ${problemContent.trim()?"#bfdbfe":"#e2e8f0"}` }}>
                  <span style={{ fontSize:13, fontWeight:800, color:problemContent.trim()?"#1e40af":"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>📝 Mô tả vấn đề</span>
                  <span style={{ fontSize:13, color:"#64748b", fontWeight:500 }}>— chi tiết sự kiện và nguyên nhân ban đầu</span>
                  <Req/>
                </div>
                <div style={{ padding:"13px 15px" }}>
                  <div className="v3-grid2">
                    <div>
                      <label style={{ ...LBL, marginBottom:6 }}>
                        <span style={{ display:"inline-block", width:20, height:20, borderRadius:"50%", background:"#1e40af", color:"#fff", fontSize:12, fontWeight:800, textAlign:"center", lineHeight:"20px", marginRight:6 }}>1</span>
                        Nội dung vấn đề <Req/>
                      </label>
                      <textarea rows={3} style={{ ...INP, fontSize:14, resize:"vertical", lineHeight:1.65, minHeight:90 }}
                        value={problemContent} onChange={e=>setProblemContent(e.target.value)} onInput={autoGrow}
                        placeholder="Mô tả rõ sự kiện / vấn đề đã xảy ra: khi nào, ở đâu, ai liên quan, ảnh hưởng..."/>
                    </div>
                    <div>
                      <label style={{ ...LBL, marginBottom:6 }}>
                        <span style={{ display:"inline-block", width:20, height:20, borderRadius:"50%", background:"#d97706", color:"#fff", fontSize:12, fontWeight:800, textAlign:"center", lineHeight:"20px", marginRight:6 }}>2</span>
                        Nguyên nhân ban đầu
                        <span style={{ fontSize:12, color:"#64748b", fontWeight:500, marginLeft:5 }}>(phân tích sâu ở bước 2)</span>
                      </label>
                      <textarea rows={3} style={{ ...INP, fontSize:14, resize:"vertical", lineHeight:1.65, minHeight:90 }}
                        value={initialCause} onChange={e=>setInitialCause(e.target.value)} onInput={autoGrow}
                        placeholder="Nhận định ban đầu về nguyên nhân gây ra vấn đề..."/>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════ STEP 2: PHÂN TÍCH & KẾ HOẠCH ════ */}
          {step===2 && (
            <div className="v3-step3-wrap">

              {/* Source mini-banner */}
              <div className="v3-step3-src-banner" style={{ background:srcType.bg, borderBottom:`1.5px solid ${srcType.border}`, color:srcType.color }}>
                <span className="src-icon">{srcType.icon}</span>
                <span className="src-label">{srcType.label}</span>
                <span className="src-code" style={{ color:"#1e293b" }}>{action.sourceCode || action.sourceId || action.code || "Thủ công"}</span>
                <span style={{ fontSize:12, color:"#64748b", flexShrink:0 }}>🔒 cố định</span>
              </div>

              <div className="v3-step3-split">

                {/* ── PANEL TRÁI: RCA ── */}
                <div className="v3-step3-panel">
                  <div className="v3-step3-panel-hdr">
                    <span className="hdr-accent" style={{ background:"linear-gradient(#7c3aed,#0369a1)" }}/>
                    <span className="hdr-title">Phân tích nguyên nhân (RCA)</span>
                  </div>
                  <div className="v3-step3-panel-body">

                    {/* Method selector */}
                    <div style={{ background:"#f0f4fa", border:"1.5px solid #dde3ee", borderRadius:10, padding:"8px 8px 6px", display:"flex", gap:5 }}>
                      {RCA_METHODS.map(m=>{
                        const sel=rcaMethod===m.val;
                        const COL:Record<string,string>={ "5why":"#1e40af", "fishbone":"#7c3aed", "gap":"#0369a1", "free":"#475569" };
                        const col=COL[m.val]||"#1e40af";
                        return (
                          <button key={m.val} onClick={()=>setRcaMethod(m.val)} style={{
                            flex:1, padding:"7px 4px", borderRadius:8, cursor:"pointer", textAlign:"center",
                            border:sel?`2px solid ${col}`:"1.5px solid #c8d0dc",
                            background:sel?col+"14":"#fff", transition:"all .13s",
                            boxShadow:sel?`0 0 0 2px ${col}22`:"0 1px 3px rgba(0,0,0,.06)",
                          }}>
                            <div style={{ fontSize:16, marginBottom:2 }}>{m.icon}</div>
                            <div style={{ fontSize:12, fontWeight:sel?800:600, color:sel?col:"#475569" }}>{m.label}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* 5-Why */}
                    {rcaMethod==="5why" && (
                      <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:10, padding:"12px 12px 10px", display:"flex", flexDirection:"column", gap:8 }}>
                        {whys.map((w,i)=>(
                          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:9 }}>
                            <div style={{ width:22, height:22, borderRadius:"50%", background:w.trim()?"#1e40af":"#93c5fd", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, flexShrink:0, marginTop:5, transition:"all .15s" }}>{i+1}</div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:"#1e3a8a", marginBottom:3 }}>Tại sao {i+1}?</div>
                              <textarea rows={1} style={{ ...INP, fontSize:13, resize:"vertical", lineHeight:1.5, minHeight:34, overflowY:"hidden", background:"#fff", border:"1.5px solid #bfdbfe" }}
                                value={w} onChange={e=>setWhys(p=>{const n=[...p];n[i]=e.target.value;return n;})} onInput={autoGrow}
                                placeholder={i===0?"Tại sao vấn đề xảy ra?":i===1?"Tại sao nguyên nhân #1 xảy ra?":"Tiếp tục đào sâu..."}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fishbone */}
                    {rcaMethod==="fishbone" && (
                      <div style={{ background:"#faf5ff", border:"1.5px solid #ddd6fe", borderRadius:10, padding:"10px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                        {([
                          { key:"man",icon:"👷",label:"Con người",ph:"Hành vi, kỹ năng..." },
                          { key:"machine",icon:"⚙️",label:"Máy móc",ph:"Hỏng hóc, bảo trì..." },
                          { key:"method",icon:"📋",label:"Phương pháp",ph:"SOP thiếu..." },
                          { key:"material",icon:"📦",label:"Vật liệu",ph:"Chất lượng vật tư..." },
                          { key:"environment",icon:"🌿",label:"Môi trường",ph:"Điều kiện làm việc..." },
                          { key:"measurement",icon:"📐",label:"Đo lường",ph:"Thiếu kiểm tra..." },
                        ]).map(cat=>(
                          <div key={cat.key} style={{ background:"#fff", border:"1.5px solid #e9d5ff", borderRadius:9, padding:"9px 11px" }}>
                            <div style={{ fontSize:12, fontWeight:800, color:"#6d28d9", marginBottom:5, display:"flex", alignItems:"center", gap:5 }}><span>{cat.icon}</span><span>{cat.label}</span></div>
                            <textarea rows={1} style={{ ...INP, fontSize:12, resize:"vertical", lineHeight:1.4, minHeight:32, overflowY:"hidden", background:"#faf5ff", border:"1.5px solid #e9d5ff" }}
                              value={fishbone[cat.key]} onChange={e=>setFishbone(prev=>({...prev,[cat.key]:e.target.value}))} onInput={autoGrow} placeholder={cat.ph}/>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Gap Analysis */}
                    {rcaMethod==="gap" && (
                      <div style={{ background:"#f0f9ff", border:"1.5px solid #bae6fd", borderRadius:10, padding:"12px" }}>
                        <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:10, alignItems:"start" }}>
                          <div>
                            <div style={{ fontSize:12, fontWeight:800, color:"#dc2626", textTransform:"uppercase", marginBottom:5 }}>📉 Thực trạng</div>
                            <textarea rows={2} style={{ ...INP, resize:"vertical", border:"1.5px solid #fca5a5", lineHeight:1.5, background:"#fff", minHeight:70 }}
                              value={gapActual} onChange={e=>setGapActual(e.target.value)} onInput={autoGrow} placeholder="Tình trạng thực tế hiện nay..."/>
                          </div>
                          <div style={{ fontSize:20, color:"#94a3b8", paddingTop:34, flexShrink:0 }}>→</div>
                          <div>
                            <div style={{ fontSize:12, fontWeight:800, color:"#16a34a", textTransform:"uppercase", marginBottom:5 }}>📈 Tiêu chuẩn</div>
                            <textarea rows={2} style={{ ...INP, resize:"vertical", border:"1.5px solid #86efac", lineHeight:1.5, background:"#fff", minHeight:70 }}
                              value={gapStandard} onChange={e=>setGapStandard(e.target.value)} onInput={autoGrow} placeholder="Yêu cầu / tiêu chuẩn cần đạt..."/>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Free */}
                    {rcaMethod==="free" && (
                      <div style={{ background:"#f8fafc", border:"1.5px solid #cbd5e1", borderRadius:10, padding:"12px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>✏️ Phân tích tự do</div>
                        <textarea rows={3} style={{ ...INP, resize:"vertical", lineHeight:1.6, fontSize:13, minHeight:70, overflowY:"hidden", background:"#fff" }}
                          value={freeAnalysis} onChange={e=>setFreeAnalysis(e.target.value)} onInput={autoGrow} placeholder="Mô tả nguyên nhân theo cách bạn hiểu..."/>
                      </div>
                    )}

                    {/* Root cause conclusion */}
                    <div style={{ background:"#faf5ff", border:`1.5px solid ${rootCause.trim()?"#c4b5fd":"#ddd6fe"}`, borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ fontSize:12, fontWeight:800, color:"#7c3aed", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>🎯 Kết luận nguyên nhân gốc rễ</div>
                      <textarea rows={1} style={{ ...INP, fontSize:13, resize:"vertical", lineHeight:1.5, border:"1.5px solid #ddd6fe", minHeight:34, overflowY:"hidden" }}
                        value={rootCause} onChange={e=>setRootCause(e.target.value)} onInput={autoGrow}
                        placeholder="Tóm tắt nguyên nhân cốt lõi..."/>
                    </div>
                  </div>
                </div>

                {/* ── PANEL PHẢI: Kế hoạch ── */}
                <div className="v3-step3-panel">
                  <div className="v3-step3-panel-hdr">
                    <span className="hdr-accent" style={{ background:"linear-gradient(#16a34a,#0369a1)" }}/>
                    <span className="hdr-title">Kế hoạch hành động</span>
                    <div className="hdr-badges">
                      {caCount>0&&<span className="badge-ca">CA×{caCount}</span>}
                      {paCount>0&&<span className="badge-pa">PA×{paCount}</span>}
                    </div>
                  </div>
                  <div className="v3-step3-panel-body">
                    <div style={{ background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 10px 8px" }}>
                      <ActionCardRows items={actionItems} onChange={setActionItems} defaultDeadline={deadline}/>
                    </div>

                    {/* ── Evidence upload section ── */}
                    <div className="v3-step3-attach">
                      <div className="v3-step3-photo-box">
                        <div className="photo-hdr">
                          <span>📸</span> Nộp bằng chứng
                          <span className="photo-opt">(không bắt buộc)</span>
                        </div>
                        <div className="v3-attach-grid">
                          <CompactImageZone
                            photos={evidencePhotos}
                            onAdd={addEvidencePhotos}
                            onRemove={id=>setEvidencePhotos(p=>p.filter(x=>x.id!==id))}
                            maxFiles={4}
                            label="Ảnh bằng chứng"/>
                          <EvidenceDocZone files={evidenceDocs} onChange={setEvidenceDocs}/>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Missing bar */}
              {canNext2===false && (
                <div className="v3-step3-missing">
                  <span className="miss-label">⚠️ Cần điền:</span>
                  <div className="miss-tags"><span className="miss-tag">Ít nhất 1 hành động có loại CA/PA</span></div>
                </div>
              )}
            </div>
          )}

          {/* ════ STEP 3: PHÂN CÔNG ════ */}
          {step===3 && (
            <div style={{ display:"flex", flexDirection:"column", gap:13 }}>

              {/* Row 1: Bộ phận | Thời hạn */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13, alignItems:"start" }}>

                {/* Card ① Bộ phận */}
                <div className="v3-card" style={{ height:"100%" }}>
                  <div className="v3-sec-hdr">
                    <div className="v3-sec-num">①</div>
                    <span className="v3-sec-title">Bộ phận phụ trách</span>
                    <Req/>
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", minHeight:32 }}>
                    {depts.length===0&&!deptPickerOpen&&<span style={{ fontSize:13, color:"#d97706", fontWeight:600 }}>⚠️ Chưa chọn bộ phận</span>}
                    {depts.map(d=>{
                      const kc=KHOI.find(k=>k.id!=="all"&&k.depts.includes(d))?.color??"#1e40af";
                      return (
                        <span key={d} style={{ fontSize:13, fontWeight:700, color:kc, background:kc+"15", border:`1.5px solid ${kc}55`, padding:"4px 10px", borderRadius:8, display:"flex", alignItems:"center", gap:5, lineHeight:1 }}>
                          {d}<button onClick={()=>toggleDept(d)} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:12, padding:0, lineHeight:1 }}>✕</button>
                        </span>
                      );
                    })}
                    <button onClick={()=>setDeptPickerOpen(o=>!o)} style={{ padding:"4px 12px", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", border:`1.5px solid ${deptPickerOpen?"#6366f1":"#cbd5e1"}`, background:deptPickerOpen?"#eef2ff":"#f8fafc", color:deptPickerOpen?"#4f46e5":"#374151", transition:"all .15s" }}>
                      {deptPickerOpen?"✕ Thu gọn":depts.length>0?"✏️ Chỉnh sửa":"＋ Chọn bộ phận"}
                    </button>
                  </div>
                  {deptPickerOpen && (
                    <div style={{ padding:"13px 14px", borderRadius:11, border:"1.5px solid #e0e7ff", background:"#f8f9ff" }}>
                      <div style={{ fontSize:11, fontWeight:700, color:"#94a3b8", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:7 }}>Chọn nhanh theo khối</div>
                      <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:11 }}>
                        {KHOI.map(k=>{
                          const allSel=k.depts.every(d=>depts.includes(d)), someSel=k.depts.some(d=>depts.includes(d));
                          return (
                            <button key={k.id} onClick={()=>applyKhoi(k)} style={{ padding:"4px 12px", borderRadius:20, fontSize:12, fontWeight:700, cursor:"pointer", border:`1.5px solid ${allSel?k.color:someSel?k.color+"88":"#c9d4e0"}`, background:allSel?k.color:someSel?k.color+"18":"#eef1f6", color:allSel?"#fff":someSel?k.color:"#374151", transition:"all .12s" }}>
                              {k.icon} {k.label}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                        {KHOI.filter(k=>k.id!=="all").map(k=>(
                          <div key={k.id} style={{ display:"flex", gap:5, alignItems:"center", flexWrap:"wrap" }}>
                            <span style={{ fontSize:12, fontWeight:800, color:k.color, minWidth:52, flexShrink:0 }}>{k.icon} {k.id}</span>
                            {k.depts.map(d=>{
                              const sel=depts.includes(d);
                              return (
                                <button key={d} onClick={()=>toggleDept(d)} style={{ padding:"3px 9px", borderRadius:6, fontSize:12, fontWeight:sel?700:500, cursor:"pointer", border:sel?`2px solid ${k.color}`:"1.5px solid #c9d4e0", background:sel?k.color+"18":"#fff", color:sel?k.color:"#475569", transition:"all .1s" }}>
                                  {sel&&"✓ "}{d}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                      </div>
                      <div style={{ display:"flex", justifyContent:"flex-end", marginTop:10 }}>
                        <button onClick={()=>setDeptPickerOpen(false)} style={{ padding:"6px 18px", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", border:"none", background:"#1e40af", color:"#fff", boxShadow:"0 2px 8px rgba(30,64,175,.25)" }}>✓ Xong</button>
                      </div>
                    </div>
                  )}
                  <div>
                    <label style={LBL}>Khu vực / Địa điểm</label>
                    <select style={INP} value={area} onChange={e=>{setArea(e.target.value);setAreaCustom("");}}>
                      <option value="">— Không chọn —</option>
                      {AREAS.filter(a=>a!=="").map(a=><option key={a} value={a}>{a}</option>)}
                    </select>
                    {area==="Khác (nhập tự do)"&&<input style={{ ...INP, marginTop:5 }} value={areaCustom} onChange={e=>setAreaCustom(e.target.value)} placeholder="Nhập tên khu vực..."/>}
                  </div>
                </div>

                {/* Right column: Deadline + Verify */}
                <div style={{ display:"flex", flexDirection:"column", gap:13 }}>
                  {/* Card ② Thời hạn */}
                  <div className="v3-card" style={{ background:"linear-gradient(135deg,#fff7ed,#fff)", borderColor:"#fed7aa" }}>
                    <div className="v3-sec-hdr">
                      <div className="v3-sec-num" style={{ background:"#ea580c" }}>②</div>
                      <span className="v3-sec-title">Hạn xử lý</span>
                      <Req/>
                    </div>
                    <div>
                      <input type="date" style={INP} value={deadline} onChange={e=>setDeadline(e.target.value)}/>
                      {deadline && !isNaN(new Date(deadline).getTime()) && (() => {
                        const today=new Date(new Date().toISOString().split("T")[0]);
                        const d=new Date(deadline);
                        const diff=Math.round((d.getTime()-today.getTime())/86400000);
                        const overdue=diff<0;
                        return (
                          <div style={{ marginTop:6, padding:"5px 10px", borderRadius:7, background:overdue?"#fef2f2":"#fff7ed", border:`1px solid ${overdue?"#fca5a5":"#fed7aa"}`, fontSize:13, color:overdue?"#dc2626":"#c2410c", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                            {overdue?`⚠️ Đã quá ${Math.abs(diff)} ngày`:diff===0?"🔴 Hôm nay là hạn chót":diff<=3?`🟡 Còn ${diff} ngày`:`📅 Còn ${diff} ngày`}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Card ③ Kiểm tra hiệu lực */}
                  <div className="v3-card-blue">
                    <div className="v3-sec-hdr">
                      <div className="v3-sec-num" style={{ background:"#4f46e5" }}>③</div>
                      <span className="v3-sec-title">Kiểm tra hiệu lực</span>
                    </div>
                    <div>
                      <label style={LBL}>Ngày kiểm tra <Req/></label>
                      <input type="date" style={INP} value={verifyDate} onChange={e=>setVerifyDate(e.target.value)}/>
                      {deadline && verifyDate && !isNaN(new Date(verifyDate).getTime()) && (
                        <div style={{ marginTop:5, fontSize:12, color:"#3730a3", fontWeight:600 }}>
                          📅 {Math.round((new Date(verifyDate).getTime()-new Date(deadline).getTime())/86400000)} ngày sau hạn xử lý
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={LBL}>Phương thức</label>
                      <select style={INP} value={verifyMethod} onChange={e=>{setVerifyMethod(e.target.value);if(e.target.value!=="Khác (tự nhập)")setVerifyMethodCustom("");}}>
                        <option value="">— Chọn phương thức —</option>
                        {VERIFY_METHODS.map(m=><option key={m}>{m}</option>)}
                      </select>
                      {verifyMethod==="Khác (tự nhập)"&&<input style={{ ...INP, marginTop:6 }} placeholder="Mô tả phương thức..." value={verifyMethodCustom} onChange={e=>setVerifyMethodCustom(e.target.value)}/>}
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 2: Phân công nhân sự */}
              <div className="v3-card">
                <div className="v3-sec-hdr" style={{ marginBottom:8 }}>
                  <div className="v3-sec-num" style={{ background:"#0369a1" }}>④</div>
                  <span className="v3-sec-title">Phân công nhân sự</span>
                  <span className="v3-sec-sub">— người thực hiện &amp; kiểm tra</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                  <div style={{ padding:"13px 14px", borderRadius:11, background:"#f0fdf4", border:"1.5px solid #86efac" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:"#16a34a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:900 }}>▶</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#14532d" }}>Người thực hiện <Req/></div>
                        <div style={{ fontSize:11, color:"#4ade80", fontWeight:600 }}>Chịu trách nhiệm xử lý CAPA</div>
                      </div>
                    </div>
                    <PersonPicker label={null} selected={persons} onAdd={(n:string)=>{if(!persons.includes(n))setPersons(p=>[...p,n]);}}
                      onRemove={(n:string)=>setPersons(p=>p.filter(x=>x!==n))}
                      input={personInput} onInputChange={setPersonInput}
                      chipBg="#dcfce7" chipBorder="#4ade80" placeholder="Tìm hoặc nhập tên..." deptFilter={depts}/>
                  </div>
                  <div style={{ padding:"13px 14px", borderRadius:11, background:"#faf5ff", border:"1.5px solid #d8b4fe" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:900 }}>✓</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#4c1d95" }}>Người kiểm tra</div>
                        <div style={{ fontSize:11, color:"#a78bfa", fontWeight:600 }}>Xác nhận kết quả (không bắt buộc)</div>
                      </div>
                    </div>
                    <PersonPicker label={null} selected={reviewers} onAdd={(n:string)=>{if(!reviewers.includes(n))setReviewers(p=>[...p,n]);}}
                      onRemove={(n:string)=>setReviewers(p=>p.filter(x=>x!==n))}
                      input={reviewerInput} onInputChange={setReviewerInput}
                      chipBg="#ede9fe" chipBorder="#a78bfa" placeholder="Tìm kiểm tra viên..." deptFilter={depts}/>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ════ STEP 4: XÁC NHẬN ════ */}
          {step===4 && (()=>{
            const today=new Date(new Date().toISOString().split("T")[0]);
            const deadlineDate=deadline?new Date(deadline):null;
            const deadlineDiff=deadlineDate?Math.round((deadlineDate.getTime()-today.getTime())/86400000):null;
            const validActions=actionItems.filter(i=>i.action.trim()&&i.type);
            const caCount2=validActions.filter(i=>i.type==="CA"||i.type==="Both").length;
            const paCount2=validActions.filter(i=>i.type==="PA"||i.type==="Both").length;

            const checks = [
              { ok:!!title.trim(),               label:"Tiêu đề CAPA",       step:1, required:true },
              { ok:!!capaType,                   label:"Loại CAPA (CA/PA)",   step:1, required:true },
              { ok:!!priority,                   label:"Mức ưu tiên",         step:1, required:true },
              { ok:!!problemContent.trim(),      label:"Mô tả vấn đề",        step:1, required:true },
              { ok:validActions.length>0,        label:"Kế hoạch hành động",  step:2, required:true },
              { ok:depts.length>0,               label:"Bộ phận phụ trách",   step:3, required:true },
              { ok:!!deadline,                   label:"Hạn xử lý",           step:3, required:true },
              { ok:persons.length>0,             label:"Người thực hiện",     step:3, required:true },
              { ok:!!verifyDate,                 label:"Ngày kiểm tra",       step:3, required:false },
              { ok:!!rootCause.trim(),           label:"Nguyên nhân gốc rễ",  step:2, required:false },
            ];
            const reqOk=checks.filter(c=>c.required&&c.ok).length;
            const reqTotal=checks.filter(c=>c.required).length;
            const pct=Math.round(reqOk/reqTotal*100);

            return (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                {/* Header banner */}
                <div style={{ borderRadius:14, background:"linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#312e81 100%)", padding:"16px 20px", boxShadow:"0 4px 20px rgba(15,23,42,.25)", display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:"rgba(255,255,255,.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>✏️</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:900, color:"#fff", letterSpacing:"0.03em" }}>XÁC NHẬN CHỈNH SỬA CAPA</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,.6)", marginTop:2 }}>Kiểm tra lại trước khi lưu — nhấn ✏️ để quay lại chỉnh sửa từng mục</div>
                  </div>
                  <div style={{ flexShrink:0, textAlign:"center" }}>
                    <div style={{ fontSize:22, fontWeight:900, color:pct===100?"#4ade80":"#fbbf24", lineHeight:1 }}>{pct}%</div>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,.55)", marginTop:2 }}>{reqOk}/{reqTotal} bắt buộc</div>
                    <div style={{ width:64, height:4, borderRadius:3, background:"rgba(255,255,255,.15)", marginTop:5, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:pct===100?"#4ade80":"#fbbf24", borderRadius:3, transition:"width .4s" }}/>
                    </div>
                  </div>
                </div>

                {/* Checklist */}
                <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e2e8f0", padding:"12px 16px", display:"flex", flexDirection:"column", gap:6 }}>
                  <div style={{ fontSize:11, fontWeight:800, color:"#64748b", letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:4 }}>📋 Danh sách kiểm tra</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:6 }}>
                    {checks.map((c,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", borderRadius:8, background:c.ok?"#f0fdf4":c.required?"#fef2f2":"#fafbfc", border:`1px solid ${c.ok?"#86efac":c.required?"#fca5a5":"#e2e8f0"}` }}>
                        <span style={{ fontSize:14, flexShrink:0 }}>{c.ok?"✅":c.required?"❌":"⬜"}</span>
                        <span style={{ fontSize:13, fontWeight:600, color:c.ok?"#15803d":c.required?"#dc2626":"#64748b", flex:1 }}>{c.label}</span>
                        {!c.ok && <button onClick={()=>setStep(c.step)} style={{ fontSize:11, fontWeight:700, color:"#1e40af", background:"none", border:"1px solid #bfdbfe", borderRadius:5, padding:"2px 7px", cursor:"pointer" }}>Bước {c.step}</button>}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Summary grid */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  <S5Card accent={srcType.color} onEdit={()=>setStep(1)}>
                    <S5Label>⚡ Nguồn phát sinh</S5Label>
                    <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>{srcType.icon} {srcType.label}</div>
                    <div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>{action.sourceCode || action.sourceId || action.code || "—"}</div>
                  </S5Card>
                  <S5Card accent="#1e40af" onEdit={()=>setStep(1)}>
                    <S5Label>📋 Tiêu đề</S5Label>
                    <div style={{ fontSize:14, fontWeight:700, color:"#0f172a", lineHeight:1.4 }}>{title||<span style={{ color:"#dc2626" }}>⚠️ Chưa nhập</span>}</div>
                  </S5Card>
                  <S5Card accent={prio?.color||"#64748b"} onEdit={()=>setStep(1)}>
                    <S5Label>🎯 Phân loại</S5Label>
                    <div style={{ display:"flex", gap:8, flexWrap:"wrap", marginTop:2 }}>
                      {capaType&&<span style={{ fontSize:13, fontWeight:800, color:capaType==="ca"?"#dc2626":capaType==="pa"?"#16a34a":"#7c3aed", background:capaType==="ca"?"#fef2f2":capaType==="pa"?"#f0fdf4":"#faf5ff", border:`1.5px solid ${capaType==="ca"?"#fca5a5":capaType==="pa"?"#86efac":"#c4b5fd"}`, padding:"2px 10px", borderRadius:8 }}>{capaType.toUpperCase()}</span>}
                      {prio&&<span style={{ fontSize:13, fontWeight:700, color:prio.color, background:prio.bg, border:`1.5px solid ${prio.border}`, padding:"2px 10px", borderRadius:8 }}>{prio.label}</span>}
                      {topicFinal&&<span style={{ fontSize:12, color:"#374151", background:"#f1f5f9", border:"1px solid #e2e8f0", padding:"2px 8px", borderRadius:6 }}>{topicFinal}</span>}
                    </div>
                  </S5Card>
                  <S5Card accent="#16a34a" onEdit={()=>setStep(2)}>
                    <S5Label>📌 Kế hoạch ({validActions.length} hành động)</S5Label>
                    {caCount2>0&&<div style={{ fontSize:13, color:"#dc2626", fontWeight:700 }}>🔧 CA ×{caCount2}</div>}
                    {paCount2>0&&<div style={{ fontSize:13, color:"#16a34a", fontWeight:700 }}>🛡️ PA ×{paCount2}</div>}
                    {validActions.length===0&&<div style={{ fontSize:13, color:"#dc2626" }}>⚠️ Chưa có hành động</div>}
                  </S5Card>
                  <S5Card accent="#ea580c" onEdit={()=>setStep(3)}>
                    <S5Label>📅 Thời hạn</S5Label>
                    <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>{deadline||<span style={{ color:"#dc2626" }}>⚠️ Chưa nhập</span>}</div>
                    {deadlineDiff!==null&&<div style={{ fontSize:12, color:deadlineDiff<0?"#dc2626":deadlineDiff<=3?"#d97706":"#16a34a", fontWeight:600, marginTop:2 }}>
                      {deadlineDiff<0?`Đã quá ${Math.abs(deadlineDiff)} ngày`:deadlineDiff===0?"Hôm nay":` Còn ${deadlineDiff} ngày`}
                    </div>}
                  </S5Card>
                  <S5Card accent="#0369a1" onEdit={()=>setStep(3)}>
                    <S5Label>👤 Nhân sự & Bộ phận</S5Label>
                    <div style={{ fontSize:13, color:"#0f172a", fontWeight:600 }}>{persons.length>0?persons.join(", "):<span style={{ color:"#dc2626" }}>⚠️ Chưa chọn người</span>}</div>
                    {depts.length>0&&<div style={{ fontSize:12, color:"#64748b", marginTop:3 }}>🏢 {depts.join(", ")}</div>}
                    {reviewers.length>0&&<div style={{ fontSize:12, color:"#64748b", marginTop:2 }}>🔍 KT: {reviewers.join(", ")}</div>}
                  </S5Card>
                </div>

                {error && (
                  <div style={{ padding:"10px 14px", borderRadius:9, background:"#fef2f2", border:"1.5px solid #fca5a5", fontSize:13, color:"#dc2626", fontWeight:700 }}>⚠️ {error}</div>
                )}
                {saved && (
                  <div style={{ padding:"10px 14px", borderRadius:9, background:"#f0fdf4", border:"1.5px solid #86efac", fontSize:13, color:"#15803d", fontWeight:700 }}>✅ Đã lưu thành công!</div>
                )}
              </div>
            );
          })()}

        </div>

        {/* ── FOOTER ── */}
        <div className="v3-footer">
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            {step===1&&!canNext1&&<span style={{ fontSize:13, color:"#d97706", fontWeight:600 }}>⚠️ Điền đủ tiêu đề, loại CAPA, ưu tiên và mô tả</span>}
            {step===2&&!canNext2&&<span style={{ fontSize:13, color:"#d97706", fontWeight:600 }}>⚠️ Thêm ít nhất 1 hành động</span>}
            {step===3&&!canNext3&&<span style={{ fontSize:13, color:"#d97706", fontWeight:600 }}>⚠️ Chọn bộ phận, hạn xử lý và người thực hiện</span>}
            {step===4&&canSubmit&&<span style={{ fontSize:13, color:"#15803d", fontWeight:700 }}>✅ Đã đủ thông tin — sẵn sàng lưu!</span>}
          </div>
          <div style={{ display:"flex", gap:8, alignItems:"center" }}>
            {step>1 && (
              <button onClick={()=>setStep(s=>s-1)} className="v3-btn-back">← Quay lại</button>
            )}
            {step<4 && (
              <button onClick={()=>{
                const can=step===1?canNext1:step===2?canNext2:canNext3;
                if(can)setStep(s=>s+1);
              }} className={`v3-btn-next ${(step===1?canNext1:step===2?canNext2:canNext3)?"v3-btn-next--on":"v3-btn-next--off"}`}>
                Tiếp tục →
              </button>
            )}
            {step===4 && (
              <button onClick={save} disabled={submitting||saved||!canSubmit} className="v3-btn-submit" style={{ opacity:(!canSubmit&&!submitting&&!saved)?0.5:1, cursor:(!canSubmit&&!submitting&&!saved)?"not-allowed":"pointer" }}>
                {saved?"✅ Đã lưu":submitting?"⏳ Đang lưu...":"💾 Lưu thay đổi"}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  , document.body);
}
