// @ts-nocheck
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { createPortal } from "react-dom";
import "./CreateCapaModal.css";
import PdfJsViewer from "./PdfJsViewer";
import OfficeFileViewer from "./OfficeFileViewer";

/* ─── Constants ──────────────────────────────────────────── */
const STEPS = [
  { num:1, label:"Nguồn phát sinh" },
  { num:2, label:"Thông tin cơ bản" },
  { num:3, label:"Phân tích & Kế hoạch" },
  { num:4, label:"Phân công" },
  { num:5, label:"Xác nhận" },
];

const PRIORITIES = [
  { val:"critical", label:"Khẩn cấp", dot:"#dc2626", bg:"#fef2f2", border:"#fecaca", color:"#dc2626" },
  { val:"high",     label:"Cao",      dot:"#f97316", bg:"#fff7ed", border:"#fed7aa", color:"#d97706" },
  { val:"medium",   label:"Trung bình",dot:"#eab308",bg:"#fefce8", border:"#fde68a", color:"#ca8a04" },
  { val:"low",      label:"Thấp",     dot:"#22c55e", bg:"#f0fdf4", border:"#a7f3d0", color:"#16a34a" },
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

const SOURCE_TYPES = [
  { id:"warning",    icon:"⚡",  label:"Cảnh báo nóng",   color:"#d97706", bg:"#fffbeb", border:"#fde68a", hint:"Cảnh báo an toàn chưa được xử lý", api:"/api/warnings" },
  { id:"incident",   icon:"🚨", label:"Sự cố",            color:"#dc2626", bg:"#fef2f2", border:"#fecaca", hint:"Sự cố đã xảy ra — phòng ngừa tái diễn", api:"/api/incidents" },
  { id:"iplan",      icon:"📋", label:"Kế hoạch KT",      color:"#7c3aed", bg:"#faf5ff", border:"#d8b4fe", hint:"Hạng mục không đạt trong kiểm tra định kỳ", api:"/api/inspection-plans" },
  { id:"audit",      icon:"🔍", label:"Audit",            color:"#0369a1", bg:"#f0f9ff", border:"#bae6fd", hint:"Phát hiện trong kiểm toán nội bộ / bên ngoài", api:null },
  { id:"pccc",       icon:"🔥", label:"PCCC",             color:"#b91c1c", bg:"#fff1f2", border:"#fecdd3", hint:"Kiểm tra định kỳ / sự cố hệ thống PCCC", api:null },
  { id:"manual",     icon:"✏️", label:"Thủ công",         color:"#475569", bg:"#f8fafc", border:"#e2e8f0", hint:"Tạo CAPA chủ động, không liên kết nguồn", api:null },
];

/* Map API responses to internal record shape */
const WARNING_CATEGORY_TO_PROBLEM: Record<string,string> = {
  EQUIPMENT:"MACH", ELECTRICAL:"ELEC", CHEMICALS:"CHEM", HEIGHT:"HEIGHT",
  VEHICLE:"VEHICLE", PPE_ISSUE:"PPE", HUMAN_BEHAVIOR:"BEHAV", NEAR_MISS:"NEAR",
  FIRE_SAFETY:"FIRE", ENVIRONMENT:"ENV", HOUSEKEEPING:"6S", ENERGY:"ENRG", ERGONOMICS:"BEHAV",
};
const TOPIC_TO_PROBLEM_TYPE: Record<string,string> = {
  "6S / Housekeeping":"6S", "PCCC":"FIRE", "Hóa chất":"CHEM",
  "An toàn điện":"ELEC", "Máy móc / Thiết bị":"MACH", "Môi trường":"ENV",
  "Giao thông nội bộ":"VEHICLE", "An toàn lao động":"MACH",
  "Sức khỏe nghề nghiệp":"BEHAV", "Audit / Kiểm toán":"OTHER", "KYT":"NEAR",
};

function riskToVi(r:string) { const m:any={CRITICAL:"🔴 Khẩn cấp",HIGH:"🟠 Cao",MEDIUM:"🟡 Trung bình",LOW:"🟢 Thấp"}; return m[String(r).toUpperCase()]??r; }
function riskToPriority(r:string) { const m:any={CRITICAL:"critical",HIGH:"high",MEDIUM:"medium",LOW:"low"}; return m[String(r).toUpperCase()]??"medium"; }
function severityToPriority(s:string) {
  if(!s) return "medium"; const lc=s.toLowerCase();
  if(lc.includes("nghiêm trọng")||lc.includes("nặng")||lc.includes("critical")) return "critical";
  if(lc.includes("cao")||lc.includes("high")) return "high";
  if(lc.includes("thấp")||lc.includes("low")) return "low";
  return "medium";
}

function mapWarning(w:any) {
  const autoProb = w.category ? (WARNING_CATEGORY_TO_PROBLEM[w.category]||"") : "";
  return {
    id:w.id, code:w.code, title:w.title,
    meta:[w.area||w.locationDetail,w.department].filter(Boolean).join(" · ")||"—",
    risk:riskToVi(w.riskLevel||""), riskScore:null, date:w.reportedAt?new Date(w.reportedAt).toLocaleDateString("vi-VN"):"—",
    reporter:w.reporterName||"—",
    capaId:w.capaId||null, capaCode:w.capaCode||null,
    suggestTitle:`[Cảnh báo] ${w.title}`, suggestDesc:w.proposedAction||w.description||w.title||"",
    suggestTopic:"An toàn lao động", suggestPriority:riskToPriority(w.riskLevel||""),
    suggestDept:w.department||"", suggestArea:w.area||w.locationDetail||"",
    suggestPerson:"", suggestDeadline:new Date(Date.now()+7*86400000).toISOString().slice(0,10),
    suggestOccurDate:w.reportedAt?w.reportedAt.split("T")[0]:"",
    suggestCapaType:"both", suggestRcaMethod:"5why",
    suggestProblem:autoProb,
  };
}
function mapIncident(inc:any) {
  return {
    id:inc.id, code:inc.code, title:inc.title,
    meta:[inc.area,inc.department].filter(Boolean).join(" · ")||"—",
    risk:inc.severity||"—", riskScore:null, date:inc.reportedAt?new Date(inc.reportedAt).toLocaleDateString("vi-VN"):"—",
    reporter:inc.reporterName||"—",
    capaId:inc.capaId||null, capaCode:inc.capaCode||null,
    suggestTitle:`[Sự cố] ${inc.title}`, suggestDesc:inc.description||inc.title||"",
    suggestTopic:"An toàn lao động", suggestPriority:severityToPriority(inc.severity||""),
    suggestDept:inc.department||"", suggestArea:inc.area||"",
    suggestPerson:"", suggestDeadline:new Date(Date.now()+7*86400000).toISOString().slice(0,10),
    suggestOccurDate:inc.reportedAt?inc.reportedAt.split("T")[0]:"",
    suggestCapaType:"both", suggestRcaMethod:"fishbone",
    suggestProblem:"",
  };
}
function mapInspection(p:any) {
  return {
    id:p.id, code:p.code, title:p.title,
    meta:[p.area||p.location,p.topic||p.category].filter(Boolean).join(" · ")||"—",
    risk:null, riskScore:null, date:p.plannedDate?new Date(p.plannedDate).toLocaleDateString("vi-VN"):"—",
    reporter:p.createdBy||"—",
    capaId:p.capaId||null, capaCode:p.capaCode||null,
    suggestTitle:`[KT] ${p.title}`, suggestDesc:p.description||p.title||"",
    suggestTopic:p.topic||"Audit / Kiểm toán", suggestPriority:"medium",
    suggestDept:p.departmentCode||p.department||"", suggestArea:p.area||p.location||"",
    suggestPerson:"", suggestDeadline:new Date(Date.now()+14*86400000).toISOString().slice(0,10),
    suggestOccurDate:"",
    suggestCapaType:"ca", suggestRcaMethod:"gap",
    suggestProblem:"",
  };
}

/* ─── Photo helpers ──────────────────────────────────────── */
type PhotoEntry = { id:string; file:File; originalUrl:string; previewUrl:string; originalSize:number; compressedSize:number; name:string; };

function fmtBytes(b:number):string { if(b<1024) return b+"B"; if(b<1048576) return (b/1024).toFixed(1)+"KB"; return (b/1048576).toFixed(1)+"MB"; }

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
        <div style={{display:"flex",gap:8}}>
          <a href={p.originalUrl} download={p.name} onClick={e=>e.stopPropagation()} style={{padding:"5px 12px",borderRadius:6,fontSize:13,fontWeight:700,background:"#1e40af",color:"#fff",textDecoration:"none"}}>⬇ Tải gốc ({fmtBytes(p.originalSize)})</a>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.12)",border:"none",borderRadius:6,color:"#fff",fontSize:16,cursor:"pointer",padding:"5px 10px"}}>✕</button>
        </div>
      </div>
      <img onClick={e=>e.stopPropagation()} src={p.previewUrl} style={{maxWidth:"90vw",maxHeight:"80vh",objectFit:"contain",borderRadius:8}} alt={p.name}/>
      {photos.length>1&&(<>
        <button onClick={e=>{e.stopPropagation();setIdx(i=>(i-1+photos.length)%photos.length);}} style={{position:"absolute",left:16,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:40,height:40,color:"#fff",fontSize:20,cursor:"pointer"}}>‹</button>
        <button onClick={e=>{e.stopPropagation();setIdx(i=>(i+1)%photos.length);}} style={{position:"absolute",right:16,top:"50%",transform:"translateY(-50%)",background:"rgba(255,255,255,.15)",border:"none",borderRadius:"50%",width:40,height:40,color:"#fff",fontSize:20,cursor:"pointer"}}>›</button>
      </>)}
    </div>
  );
}

function ImageUploadZone({ label,subLabel,accentColor,accentBg,accentBorder,icon,photos,onAdd,onRemove,maxFiles=8,optional }:
  { label:string;subLabel:string;accentColor:string;accentBg:string;accentBorder:string;icon:string;
    photos:PhotoEntry[];onAdd:(e:PhotoEntry[])=>void;onRemove:(id:string)=>void;maxFiles?:number;optional?:boolean }) {
  const inputRef=useRef<HTMLInputElement>(null);
  const [dragging,setDragging]=useState(false);
  const [processing,setProcessing]=useState(false);
  const [lbIdx,setLbIdx]=useState<number|null>(null);
  const process=useCallback(async(files:File[])=>{
    const imgs=files.filter(f=>f.type.startsWith("image/")).slice(0,maxFiles-photos.length);
    if(!imgs.length)return; setProcessing(true);
    onAdd(await Promise.all(imgs.map(f=>compressImage(f)))); setProcessing(false);
  },[photos.length,maxFiles,onAdd]);
  const remaining=maxFiles-photos.length;
  const totalOrig=photos.reduce((s,p)=>s+p.originalSize,0);
  const totalComp=photos.reduce((s,p)=>s+p.compressedSize,0);
  const saved=totalOrig>0?Math.round((1-totalComp/totalOrig)*100):0;
  return (
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      {lbIdx!==null&&<Lightbox photos={photos} startIndex={lbIdx} onClose={()=>setLbIdx(null)}/>}
      <div style={{display:"flex",alignItems:"center",gap:7}}>
        <span style={{fontSize:16}}>{icon}</span>
        <div style={{flex:1}}>
          <div style={{fontSize:14,fontWeight:700,color:"#475569"}}>{label}{optional&&<span style={{fontSize:14,fontWeight:600,color:"#64748b",marginLeft:6}}>(không bắt buộc)</span>}</div>
          <div style={{fontSize:13,color:"#64748b",marginTop:1}}>{subLabel}</div>
        </div>
        <span style={{fontSize:13,color:"#64748b"}}>{photos.length}/{maxFiles} ảnh</span>
      </div>
      {photos.length>0&&(
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          {photos.map((p,i)=>(
            <div key={p.id} style={{position:"relative",flexShrink:0}}>
              <button onClick={()=>setLbIdx(i)} style={{padding:0,border:`2px solid ${accentBorder}`,borderRadius:8,cursor:"pointer",background:"none",overflow:"hidden",display:"block"}} title={p.name}>
                <img src={p.previewUrl} style={{width:72,height:72,objectFit:"cover",display:"block"}} alt={p.name}/>
              </button>
              <div style={{position:"absolute",bottom:4,left:2,right:2,background:"rgba(0,0,0,.55)",borderRadius:3,fontSize:12,color:"#fff",textAlign:"center",padding:"1px 2px",pointerEvents:"none"}}>{fmtBytes(p.compressedSize)}</div>
              <button onClick={()=>onRemove(p.id)} style={{position:"absolute",top:-5,right:-5,width:18,height:18,borderRadius:"50%",background:"#ef4444",border:"2px solid #fff",color:"#fff",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button>
            </div>
          ))}
          {remaining>0&&!processing&&(
            <button onClick={()=>inputRef.current?.click()} style={{width:72,height:72,borderRadius:8,border:`2px dashed ${accentBorder}`,background:accentBg,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:3,color:accentColor,flexShrink:0}}>
              <span style={{fontSize:18}}>+</span><span style={{fontSize:12,fontWeight:600}}>thêm</span>
            </button>
          )}
        </div>
      )}
      {photos.length===0&&(
        <div onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);process(Array.from(e.dataTransfer.files));}}
          onClick={()=>remaining>0&&inputRef.current?.click()}
          style={{border:`2px dashed ${dragging?accentColor:accentBorder}`,borderRadius:10,background:dragging?accentBg:"#fafbfc",padding:"18px 14px",textAlign:"center",cursor:"pointer",transition:"all .15s"}}>
          <div style={{fontSize:26,marginBottom:5}}>{icon}</div>
          <div style={{fontSize:14,fontWeight:700,color:dragging?accentColor:"#475569",marginBottom:2}}>{processing?"Đang xử lý...":"Kéo thả ảnh vào đây hoặc nhấn để chọn"}</div>
          <div style={{fontSize:13,color:"#64748b"}}>PNG, JPG, WEBP · Tối đa {maxFiles} ảnh · Tự động nén khi hiển thị</div>
        </div>
      )}
      {photos.length>0&&saved>0&&(
        <div style={{fontSize:13,color:"#64748b",display:"flex",gap:10,flexWrap:"wrap"}}>
          <span>🗜 Hiển thị: <b>{fmtBytes(totalComp)}</b></span>
          <span>📦 Gốc: <b>{fmtBytes(totalOrig)}</b></span>
          <span style={{color:"#16a34a"}}>✓ Giảm {saved}% dung lượng hiển thị</span>
        </div>
      )}
      <input ref={inputRef} type="file" multiple accept="image/*" style={{display:"none"}} onChange={e=>{if(e.target.files)process(Array.from(e.target.files));e.target.value="";}}/>
    </div>
  );
}

/* ─── File Attachment ────────────────────────────────────── */
type FileAttachEntry = { id:string; name:string; size:number; fileType:'pdf'|'excel'|'word'; url:string; file?:File; };
function fileTypeOf(f:File):'pdf'|'excel'|'word'|null {
  const n=f.name.toLowerCase();
  if(f.type==='application/pdf'||n.endsWith('.pdf')) return 'pdf';
  if(n.endsWith('.xlsx')||n.endsWith('.xls')||f.type.includes('spreadsheet')||f.type.includes('excel')) return 'excel';
  if(n.endsWith('.docx')||n.endsWith('.doc')||f.type.includes('wordprocessingml')||f.type.includes('msword')) return 'word';
  return null;
}
const F_ICON:Record<string,string>  = {pdf:'📕',excel:'📗',word:'📘'};
const F_LABEL:Record<string,string> = {pdf:'PDF',excel:'Excel (.xlsx)',word:'Word (.docx)'};
const F_CLR:Record<string,string>   = {pdf:'#dc2626',excel:'#16a34a',word:'#2563eb'};
const F_BG:Record<string,string>    = {pdf:'#fef2f2',excel:'#f0fdf4',word:'#eff6ff'};
const F_BDR:Record<string,string>   = {pdf:'#fca5a5',excel:'#86efac',word:'#93c5fd'};

function FilePreviewModal({entry,onClose}:{entry:FileAttachEntry;onClose:()=>void}) {
  if (entry.fileType === 'excel' || entry.fileType === 'word') {
    return <OfficeFileViewer url={entry.url} fileName={entry.name} onClose={onClose} fileObj={entry.file} />;
  }
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,.78)',zIndex:9998,display:'flex',flexDirection:'column'}}
         onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:'#1e293b',padding:'10px 16px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
        <span style={{fontSize:18}}>{F_ICON[entry.fileType]}</span>
        <span style={{fontSize:13,fontWeight:700,color:'#fff',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{entry.name}</span>
        <span style={{fontSize:13,color:'#94a3b8'}}>{fmtBytes(entry.size)}</span>
        <button onClick={()=>window.open(entry.url,'_blank')} style={{padding:'4px 10px',borderRadius:6,background:'#1d4ed8',border:'none',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',marginLeft:8,display:'flex',alignItems:'center',gap:5}}>
          🔗 Tab mới
        </button>
        <a href={entry.url} download={entry.name} style={{padding:'4px 10px',borderRadius:6,background:'#334155',color:'#94a3b8',fontSize:13,fontWeight:600,cursor:'pointer',textDecoration:'none',marginLeft:4}}>⬇️ Tải</a>
        <button onClick={onClose} style={{padding:'4px 12px',borderRadius:6,background:'#ef4444',border:'none',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',marginLeft:4}}>✕ Đóng</button>
      </div>
      <div style={{flex:1,overflow:'hidden'}}>
        <PdfJsViewer url={entry.url} file={entry.file} style={{width:'100%',height:'100%'}} />
      </div>
    </div>
  );
}

function FileAttachZone({files,onChange}:{files:FileAttachEntry[];onChange:(f:FileAttachEntry[])=>void}) {
  const inp=useRef<HTMLInputElement>(null);
  const [drag,setDrag]=useState(false);
  const [preview,setPreview]=useState<FileAttachEntry|null>(null);
  function process(raw:File[]) {
    const entries:FileAttachEntry[]=[];
    for(const f of raw){const t=fileTypeOf(f);if(!t)continue;entries.push({id:crypto.randomUUID(),name:f.name,size:f.size,fileType:t,url:URL.createObjectURL(f),file:f});}
    if(entries.length) onChange([...files,...entries]);
  }
  function remove(id:string){const e=files.find(f=>f.id===id);if(e)URL.revokeObjectURL(e.url);onChange(files.filter(f=>f.id!==id));}

  const TYPE_META:{[k:string]:{icon:string;label:string;color:string;bg:string;border:string;btnBg:string;btnColor:string}} = {
    pdf:   {icon:'📕',label:'PDF',          color:'#b91c1c',bg:'#fff5f5',border:'#fca5a5',btnBg:'#fef2f2',btnColor:'#dc2626'},
    excel: {icon:'📗',label:'Excel',        color:'#166534',bg:'#f0fdf4',border:'#86efac',btnBg:'#dcfce7',btnColor:'#16a34a'},
    word:  {icon:'📘',label:'Word',         color:'#1d4ed8',bg:'#eff6ff',border:'#93c5fd',btnBg:'#dbeafe',btnColor:'#2563eb'},
  };

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10}}>
      {preview&&<FilePreviewModal entry={preview} onClose={()=>setPreview(null)}/>}

      {/* File list */}
      {files.length>0&&(
        <div style={{display:'flex',flexDirection:'column',gap:6}}>
          {files.map((f,idx)=>{
            const m=TYPE_META[f.fileType]||TYPE_META.pdf;
            return (
              <div key={f.id} style={{display:'flex',alignItems:'center',gap:10,
                padding:'10px 12px',borderRadius:10,
                background:m.bg,border:`1.5px solid ${m.border}`,
                transition:'box-shadow .15s',boxShadow:'0 1px 3px rgba(0,0,0,0.05)'}}>
                {/* Icon + number */}
                <div style={{position:'relative',flexShrink:0}}>
                  <span style={{fontSize:22}}>{m.icon}</span>
                  <span style={{position:'absolute',top:-4,right:-5,
                    width:14,height:14,borderRadius:'50%',fontSize:12,fontWeight:900,
                    background:m.color,color:'#fff',
                    display:'flex',alignItems:'center',justifyContent:'center',
                    border:'1.5px solid #fff'}}>{idx+1}</span>
                </div>
                {/* Info */}
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13.5,fontWeight:700,color:m.color,
                    overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                    lineHeight:1.3}}>{f.name}</div>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginTop:2}}>
                    <span style={{fontSize:12,fontWeight:700,padding:'1px 6px',borderRadius:4,
                      background:m.color+'18',color:m.color,border:`1px solid ${m.border}`}}>
                      {m.label}
                    </span>
                    <span style={{fontSize:12,color:'#64748b',fontWeight:500}}>{fmtBytes(f.size)}</span>
                  </div>
                </div>
                {/* Buttons */}
                <div style={{display:'flex',gap:6,flexShrink:0}}>
                  <button onClick={()=>setPreview(f)}
                    style={{display:'flex',alignItems:'center',gap:4,
                      padding:'5px 12px',borderRadius:7,cursor:'pointer',
                      border:`1.5px solid ${m.border}`,background:m.btnBg,
                      color:m.btnColor,fontSize:12,fontWeight:700,
                      whiteSpace:'nowrap',transition:'all .12s'}}>
                    <span style={{fontSize:13}}>👁</span>
                    {f.fileType==='pdf'?'Xem PDF':'Xem file'}
                  </button>
                  <button onClick={()=>remove(f.id)}
                    style={{width:28,height:28,borderRadius:7,
                      background:'#fef2f2',border:'1.5px solid #fca5a5',
                      color:'#dc2626',fontSize:14,fontWeight:900,cursor:'pointer',
                      display:'flex',alignItems:'center',justifyContent:'center',
                      padding:0,flexShrink:0,transition:'all .12s'}}>✕</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Drop zone */}
      <div onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
           onDrop={e=>{e.preventDefault();setDrag(false);process(Array.from(e.dataTransfer.files));}}
           onClick={()=>inp.current?.click()}
           style={{border:`2px dashed ${drag?'#3b82f6':'#cbd5e1'}`,
             borderRadius:10,
             background:drag?'#eff6ff':'#fafbfc',
             padding:'18px 16px',textAlign:'center',cursor:'pointer',
             transition:'all .15s',
             boxShadow:drag?'0 0 0 3px #bfdbfe':'none'}}>
        <div style={{fontSize:26,marginBottom:6}}>{drag?'📂':'📎'}</div>
        <div style={{fontSize:13.5,fontWeight:700,
          color:drag?'#2563eb':'#334155',marginBottom:4}}>
          {drag?'Thả file vào đây…':'Kéo thả hoặc nhấn để chọn file'}
        </div>
        <div style={{display:'flex',justifyContent:'center',gap:6,flexWrap:'wrap'}}>
          {[{icon:'📕',l:'PDF'},{icon:'📗',l:'Excel (.xlsx)'},{icon:'📘',l:'Word (.docx)'}].map(t=>(
            <span key={t.l} style={{fontSize:12,color:'#64748b',
              background:'#f1f5f9',border:'1px solid #e2e8f0',
              borderRadius:5,padding:'2px 8px',fontWeight:600}}>{t.icon} {t.l}</span>
          ))}
        </div>
        {files.length>0&&(
          <div style={{marginTop:8,fontSize:12,color:'#2563eb',fontWeight:700}}>
            + Thêm (đã có {files.length} file)
          </div>
        )}
      </div>

      <input ref={inp} type="file" multiple
        accept=".pdf,.xlsx,.xls,.doc,.docx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{display:'none'}}
        onChange={e=>{if(e.target.files)process(Array.from(e.target.files));e.target.value="";}}/>
    </div>
  );
}

/* ─── Compact Photo Zone ─────────────────────────────────── */
function CompactImageZone({ photos, onAdd, onRemove, maxFiles=8, label="Ảnh hiện trạng", accentDash="#fde68a", accentBg="#fffbf0", accentHover="#fefce8", accentText="#d97706" }:
  { photos:PhotoEntry[]; onAdd:(e:PhotoEntry[])=>void; onRemove:(id:string)=>void; maxFiles?:number; label?:string; accentDash?:string; accentBg?:string; accentHover?:string; accentText?:string }) {
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
              <button onClick={()=>setLbIdx(i)} style={{padding:0,border:`2px solid ${accentDash}`,borderRadius:7,cursor:"pointer",background:"none",overflow:"hidden",display:"block"}} title={p.name}>
                <img src={p.previewUrl} style={{width:60,height:60,objectFit:"cover",display:"block"}} alt={p.name}/>
              </button>
              <button onClick={()=>onRemove(p.id)} style={{position:"absolute",top:-4,right:-4,width:16,height:16,borderRadius:"50%",background:"#ef4444",border:"2px solid #fff",color:"#fff",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0}}>✕</button>
            </div>
          ))}
          {remaining > 0 && !processing && (
            <button onClick={()=>inputRef.current?.click()} style={{width:60,height:60,borderRadius:7,border:`2px dashed ${accentDash}`,background:accentBg,cursor:"pointer",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,color:accentText,flexShrink:0}}>
              <span style={{fontSize:18}}>+</span>
              <span style={{fontSize:12,fontWeight:700}}>thêm</span>
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);process(Array.from(e.dataTransfer.files));}}
          onClick={()=>remaining>0&&inputRef.current?.click()}
          style={{
            border:`2px dashed ${dragging?accentText:accentDash}`,borderRadius:10,
            background:dragging?accentHover:accentBg,
            padding:"18px 12px",textAlign:"center",cursor:"pointer",transition:"all .15s",
          }}>
          {processing
            ? <div style={{fontSize:13,color:"#64748b",fontWeight:600}}>Đang xử lý…</div>
            : <>
                <div style={{fontSize:32,marginBottom:6,lineHeight:1}}>🖼️</div>
                <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:3}}>{label}</div>
                <div style={{fontSize:12,color:"#94a3b8"}}>JPG, PNG, WEBP</div>
              </>
          }
        </div>
      )}
      <input ref={inputRef} type="file" multiple accept="image/*" style={{display:"none"}} onChange={e=>{if(e.target.files)process(Array.from(e.target.files));e.target.value="";}}/>
    </div>
  );
}

/* ─── Compact File Zone (Step 3) ────────────────────────── */
function CompactFileZone({ files, onChange }:{ files:FileAttachEntry[]; onChange:(f:FileAttachEntry[])=>void }) {
  const inp = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [preview, setPreview] = useState<FileAttachEntry|null>(null);
  const TYPE_META:{[k:string]:{icon:string;label:string;color:string;bg:string;border:string}} = {
    pdf:   {icon:"📕",label:"PDF",          color:"#b91c1c",bg:"#fff5f5",border:"#fca5a5"},
    excel: {icon:"📗",label:"Excel (.xlsx)",color:"#166534",bg:"#f0fdf4",border:"#86efac"},
    word:  {icon:"📘",label:"Word (.docx)", color:"#1d4ed8",bg:"#eff6ff",border:"#93c5fd"},
  };
  function process(raw:File[]) {
    const entries:FileAttachEntry[]=[];
    for(const f of raw){const t=fileTypeOf(f);if(!t)continue;entries.push({id:crypto.randomUUID(),name:f.name,size:f.size,fileType:t,url:URL.createObjectURL(f),file:f});}
    if(entries.length) onChange([...files,...entries]);
  }
  function remove(id:string){const e=files.find(f=>f.id===id);if(e)URL.revokeObjectURL(e.url);onChange(files.filter(f=>f.id!==id));}
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      {preview && <FilePreviewModal entry={preview} onClose={()=>setPreview(null)}/>}
      {files.length > 0 && (
        <div style={{display:"flex",flexDirection:"column",gap:4}}>
          {files.map((f)=>{
            const m = TYPE_META[f.fileType]||TYPE_META.pdf;
            return (
              <div key={f.id} style={{display:"flex",alignItems:"center",gap:7,padding:"6px 10px",borderRadius:8,background:m.bg,border:`1.5px solid ${m.border}`}}>
                <span style={{fontSize:16,flexShrink:0}}>{m.icon}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:m.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{f.name}</div>
                  <div style={{fontSize:12,color:"#64748b"}}>{m.label} · {fmtBytes(f.size)}</div>
                </div>
                <button onClick={()=>setPreview(f)} style={{padding:"3px 8px",borderRadius:5,border:`1px solid ${m.border}`,background:"#fff",color:m.color,fontSize:12,fontWeight:700,cursor:"pointer",flexShrink:0}}>👁</button>
                <button onClick={()=>remove(f.id)} style={{width:22,height:22,borderRadius:5,background:"#fef2f2",border:"1.5px solid #fca5a5",color:"#dc2626",fontSize:13,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,flexShrink:0}}>✕</button>
              </div>
            );
          })}
        </div>
      )}
      {/* Drop zone */}
      <div
        onDragOver={e=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);process(Array.from(e.dataTransfer.files));}}
        onClick={()=>inp.current?.click()}
        style={{
          border:`2px dashed ${drag?"#3b82f6":"#cbd5e1"}`,borderRadius:10,
          background:drag?"#eff6ff":"#fafbfc",
          padding:"18px 12px",textAlign:"center",cursor:"pointer",transition:"all .15s",
          boxShadow:drag?"0 0 0 3px #bfdbfe":"none",
        }}>
        <div style={{fontSize:32,marginBottom:6,lineHeight:1}}>{drag?"📂":"📎"}</div>
        <div style={{fontSize:13,fontWeight:700,color:"#334155",marginBottom:3}}>Tài liệu hỗ trợ</div>
        <div style={{fontSize:12,color:"#94a3b8"}}>PDF, Excel, Word</div>
        {files.length>0&&<div style={{marginTop:5,fontSize:12,color:"#2563eb",fontWeight:700}}>+ Thêm ({files.length} file)</div>}
      </div>
      <input ref={inp} type="file" multiple
        accept=".pdf,.xlsx,.xls,.doc,.docx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        style={{display:"none"}} onChange={e=>{if(e.target.files)process(Array.from(e.target.files));e.target.value="";}}/>
    </div>
  );
}

/* ─── Shared styles ──────────────────────────────────────── */
const INP: React.CSSProperties = {
  width:"100%", padding:"8px 11px", fontSize:14, boxSizing:"border-box",
  border:"1.5px solid #b8c5d4", borderRadius:7, outline:"none",
  color:"#0f172a", background:"#fff", fontFamily:"inherit",
};
const INP_AUTO: React.CSSProperties = { ...INP, background:"#fefce8", borderColor:"#f6d860" };
const LBL: React.CSSProperties = {
  fontSize:14, fontWeight:700, color:"#374151",
  display:"flex", alignItems:"center", gap:5, marginBottom:5,
};

function AutoTag() { return <span title="Tự điền từ nguồn" style={{ fontSize:15, lineHeight:1 }}>🟡</span>; }
function Req() { return <span style={{ color:"#dc2626" }}>*</span>; }
function NewBadge() {
  return <span style={{ fontSize:12, fontWeight:800, color:"#7c3aed", background:"#f5f3ff", border:"1px solid #ddd6fe", padding:"1px 6px", borderRadius:4 }}>MỚI</span>;
}

/* ─── AreaCombo — searchable combo cho địa điểm ─── */
function AreaCombo({ area, onChange, locationsList }:{ area:string; onChange:(v:string)=>void; locationsList?:string[] }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(area||"");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(()=>{ setQ(area||""); }, [area]);
  useEffect(()=>{
    const fn=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown",fn);
    return ()=>document.removeEventListener("mousedown",fn);
  },[]);
  const baseList = AREAS.filter(a=>a&&a!=="Khác (nhập tự do)");
  const allOpts = [...new Set([...(locationsList||[]),...baseList])];
  const filtered = q ? allOpts.filter(a=>a.toLowerCase().includes(q.toLowerCase())) : allOpts;
  const showCustom = q.trim().length>0 && !allOpts.some(a=>a.toLowerCase()===q.trim().toLowerCase());
  function pick(v:string){ onChange(v); setQ(v); setOpen(false); }
  function clear(){ onChange(""); setQ(""); }
  return (
    <div ref={ref} style={{ position:"relative" }}>
      <div style={{ position:"relative" }}>
        <input style={{ ...INP, paddingRight:q?30:12 }}
          value={q}
          onChange={e=>{ setQ(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={()=>setOpen(true)}
          placeholder="🔍  Chọn hoặc nhập tên khu vực..."
          autoComplete="off"/>
        {q && (
          <button onMouseDown={e=>{e.preventDefault();clear();}}
            style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:14, lineHeight:1, padding:0 }}>✕</button>
        )}
      </div>
      {open && (filtered.length>0||showCustom) && (
        <div style={{ position:"absolute", top:"calc(100% + 3px)", left:0, right:0, background:"#fff",
          border:"1.5px solid #bae6fd", borderRadius:10, boxShadow:"0 8px 24px rgba(0,0,0,.12)",
          maxHeight:200, overflowY:"auto", zIndex:300 }}>
          {filtered.slice(0,12).map(a=>(
            <button key={a} onMouseDown={e=>{e.preventDefault();pick(a);}}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"7px 12px",
                border:"none", background:a===area?"#f0f9ff":"transparent", cursor:"pointer", textAlign:"left" }}
              onMouseEnter={e=>(e.currentTarget.style.background="#f0f9ff")}
              onMouseLeave={e=>(e.currentTarget.style.background=a===area?"#f0f9ff":"transparent")}>
              <span style={{ fontSize:14, flexShrink:0 }}>📍</span>
              <span style={{ flex:1, fontSize:13, fontWeight:500, color:"#1e293b" }}>{a}</span>
              {a===area && <span style={{ fontSize:12, color:"#3b82f6", fontWeight:800 }}>✓</span>}
            </button>
          ))}
          {showCustom && (
            <button onMouseDown={e=>{e.preventDefault();pick(q.trim());}}
              style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"7px 12px",
                border:"none", borderTop:"1px solid #f1f5f9", background:"#f8fafc", cursor:"pointer", textAlign:"left" }}
              onMouseEnter={e=>(e.currentTarget.style.background="#eff6ff")}
              onMouseLeave={e=>(e.currentTarget.style.background="#f8fafc")}>
              <span style={{ fontSize:14, flexShrink:0 }}>➕</span>
              <span style={{ flex:1, fontSize:13, color:"#2563eb", fontWeight:700 }}>Dùng &ldquo;{q.trim()}&rdquo;</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── PersonPicker ───────────────────────────────────────── */
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

function PersonPicker({ label, selected, onAdd, onRemove, input, onInputChange, chipBg, chipBorder, placeholder, isAuto, deptFilter, personnelList }:any) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e:MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  const people = personnelList || PERSONNEL;
  const q = input.trim().toLowerCase();
  const suggs = people.filter((p:any)=>!selected.includes(p.name))
    .filter((p:any)=>q===""||p.name.toLowerCase().includes(q)||(p.dept||"").toLowerCase().includes(q))
    .sort((a:any,b:any)=>(deptFilter?.includes(b.dept)?1:0)-(deptFilter?.includes(a.dept)?1:0));
  const canCustom = q.length>0 && !people.some((p:any)=>p.name.toLowerCase()===q) && !selected.includes(input.trim());
  function pick(name:string) { onAdd(name); onInputChange(""); setOpen(false); }
  return (
    <div ref={ref}>
      {label !== null && <label style={LBL}>{label}</label>}
      {selected.length>0 && (
        <div style={{ display:"flex", gap:5, flexWrap:"wrap", marginBottom:6 }}>
          {selected.map((p:string,i:number) => {
            const pd = people.find((x:any)=>x.name===p);
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
      <input
        style={{ ...INP, borderRadius:8, ...(isAuto&&selected.length<=1?{background:"#fefce8",border:"1.5px solid #fef9c3"}:{}) }}
        value={input} onChange={e=>{onInputChange(e.target.value);setOpen(true);}} onFocus={()=>setOpen(true)}
        onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); if(suggs.length===1) pick(suggs[0].name); else if(canCustom){onAdd(input.trim());onInputChange("");} }}}
        placeholder={placeholder??"Tìm hoặc nhập tên..."} autoComplete="off"/>
      {open && (suggs.length>0 || canCustom) && (
        <div style={{ background:"#fff", border:"1.5px solid #cbd5e1", borderTop:"none", borderRadius:"0 0 8px 8px", boxShadow:"0 6px 20px rgba(0,0,0,.1)", maxHeight:200, overflowY:"auto" }}>
          {suggs.slice(0,8).map(p=>{
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
                <div style={{ fontSize:12, color:"#94a3b8" }}>Nhập tên tự do — không có trong danh sách</div>
              </div>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── 5-Why Component ────────────────────────────────────── */
function FiveWhyWizard({ whys, onChange }:{ whys:string[]; onChange:(i:number,v:string)=>void }) {
  const prompts = [
    "Tại sao sự kiện này xảy ra?","Tại sao điều đó xảy ra?","Tại sao lại như vậy?",
    "Tại sao điều kiện đó tồn tại?","Nguyên nhân gốc rễ cuối cùng là gì?",
  ];
  const filled = whys.filter(w=>w.trim()).length;
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
        <div style={{ fontSize:14, fontWeight:700, color:"#475569" }}>Tiến độ phân tích:</div>
        <div style={{ flex:1, height:6, background:"#f1f5f9", borderRadius:3, overflow:"hidden" }}>
          <div style={{ height:"100%", width:`${(filled/5)*100}%`, background:filled>=3?"#16a34a":filled>=1?"#f97316":"#e2e8f0", borderRadius:3, transition:"width .3s" }}/>
        </div>
        <div style={{ fontSize:14, fontWeight:700, color:filled>=3?"#15803d":filled>=1?"#ea580c":"#94a3b8" }}>{filled}/5 cấp</div>
        {filled>=3&&<span style={{ fontSize:13, fontWeight:700, color:"#15803d", background:"#dcfce7", padding:"1px 7px", borderRadius:4 }}>✓ Đủ sâu</span>}
      </div>
      {whys.map((w,i)=>(
        <div key={i} className="v3-why-row">
          <div className="v3-why-num" style={{ background:w.trim()?"#1e40af":"#cbd5e1" }}>{i+1}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:14, color:"#475569", marginBottom:3, fontWeight:600 }}>Why {i+1}: {prompts[i]}</div>
            <input style={{ ...INP, borderColor:w.trim()?"#93c5fd":"#e2e8f0", background:w.trim()?"#f0f9ff":"#fff" }}
              value={w} onChange={e=>onChange(i,e.target.value)}
              placeholder={i===0?"Nhập câu trả lời...":i===4?"→ Đây là nguyên nhân gốc rễ cần giải quyết":"Tiếp tục phân tích sâu hơn..."}/>
            {i<4&&w.trim()&&!whys[i+1]?.trim()&&(
              <div style={{ fontSize:13, color:"#3b82f6", marginTop:3 }}>↓ Tiếp tục: Tại sao điều đó xảy ra?</div>
            )}
          </div>
        </div>
      ))}
      {filled>=3&&(
        <div style={{ padding:"8px 12px", borderRadius:7, background:"#f0fdf4", border:"1px solid #86efac", fontSize:13, color:"#15803d" }}>
          ✅ Đã phân tích đủ 3+ cấp. Why {filled} là nguyên nhân gốc rễ để điền vào ô "Nguyên nhân gốc rễ" bên dưới.
        </div>
      )}
    </div>
  );
}

/* ─── Risk Matrix ─────────────────────────────────────────── */
const PROB_OPTS = [
  {v:5, short:"5", label:"Gần như chắc chắn", sub:"Xảy ra hầu như mỗi ngày"},
  {v:4, short:"4", label:"Dễ xảy ra",         sub:"Có thể xảy ra trong tuần"},
  {v:3, short:"3", label:"Có thể xảy ra",     sub:"Có thể xảy ra trong tháng"},
  {v:2, short:"2", label:"Khó xảy ra",         sub:"Có thể xảy ra trong năm"},
  {v:1, short:"1", label:"Rất khó xảy ra",    sub:"Hiếm khi hoặc chưa từng"},
];
const CONS_OPTS = [
  {v:1, short:"1", label:"Không đáng kể",      sub:"Không ảnh hưởng đáng kể"},
  {v:2, short:"2", label:"Chấn thương nhẹ",    sub:"Sơ cứu, không nghỉ việc"},
  {v:3, short:"3", label:"Vừa phải",           sub:"Nghỉ việc, cần điều trị"},
  {v:4, short:"4", label:"Chấn thương nặng",   sub:"Thương tật vĩnh viễn"},
  {v:5, short:"5", label:"Nghiêm trọng",       sub:"Tử vong hoặc thảm họa"},
];

/* Graduated 4-band color system */
function cellBg(s:number):string {
  if(s>=20) return "#991b1b"; // 20,25
  if(s>=15) return "#dc2626"; // 15,16
  if(s>=10) return "#ef4444"; // 10,12
  if(s>=8)  return "#f97316"; // 8,9
  if(s>=6)  return "#fb923c"; // 6
  if(s>=4)  return "#fbbf24"; // 4,5
  if(s>=3)  return "#a3e635"; // 3
  return "#22c55e";            // 1,2
}
function cellTextColor(s:number):string { return s>=6?"#fff":"#14532d"; }
function riskBand(s:number):string { return s>=15?"Rất cao":s>=8?"Cao":s>=4?"Trung bình":"Thấp"; }
function riskBandColor(s:number):string { return s>=15?"#dc2626":s>=8?"#ea580c":s>=4?"#d97706":"#16a34a"; }
function riskBandBg(s:number):string { return s>=15?"#fef2f2":s>=8?"#fff7ed":s>=4?"#fefce8":"#f0fdf4"; }
function riskBandBorder(s:number):string { return s>=15?"#fca5a5":s>=8?"#fdba74":s>=4?"#fde68a":"#bbf7d0"; }

/* Legacy aliases kept for other code */
function cellColor(s:number):string { return cellBg(s); }
function riskLabel(s:number):string { return riskBand(s); }
function riskColor(s:number):string { return riskBandColor(s); }

function RiskMatrixPicker({ selL, selC, onChange, scoreLabel="Điểm rủi ro sau KP" }:{ selL:number; selC:number; onChange:(l:number,c:number)=>void; scoreLabel?:string }) {
  const [hvL,setHvL]=useState(0);
  const [hvC,setHvC]=useState(0);
  const score=selL*selC;
  const pvL=hvL||selL, pvC=hvC||selC, pvScore=pvL*pvC;
  const hovLabel = hvL>0&&hvC>0
    ? `${PROB_OPTS.find(p=>p.v===hvL)?.label} × ${CONS_OPTS.find(c=>c.v===hvC)?.label}`
    : null;

  /* Cell height fixed at 34px — never square, always compact */
  const CELL_H = 34;
  const LABEL_W = 88;

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {/* ── Score result bar ── */}
      <div style={{
        display:"flex", alignItems:"center", gap:10, padding:"10px 14px", borderRadius:10,
        background: score ? riskBandBg(score) : "#f8fafc",
        border: `1.5px solid ${score ? riskBandBorder(score) : "#e2e8f0"}`,
        minHeight:52, transition:"background .2s, border-color .2s",
      }}>
        {/* Score box */}
        <div style={{
          width:44, height:44, borderRadius:9, flexShrink:0,
          background: score ? cellBg(score) : "#e8ecf1",
          display:"flex", alignItems:"center", justifyContent:"center",
          boxShadow: score ? `0 3px 10px ${cellBg(score)}55` : "none",
          transition:"background .2s",
        }}>
          <span style={{ fontSize: score>=10?18:20, fontWeight:900, color: score ? cellTextColor(score) : "#94a3b8", lineHeight:1 }}>
            {pvScore||"—"}
          </span>
        </div>
        {/* Text */}
        <div style={{ flex:1 }}>
          <div style={{ fontSize:10.5, fontWeight:800, color:"#64748b", letterSpacing:"0.05em", textTransform:"uppercase" }}>{scoreLabel}</div>
          {score>0
            ? <div style={{ fontSize:15, fontWeight:900, color:riskBandColor(score), lineHeight:1.3 }}>
                {riskBand(score)} <span style={{ fontSize:12, fontWeight:600, color:"#64748b" }}>· {selL} × {selC} = {score}/25</span>
              </div>
            : <div style={{ fontSize:13, color:"#94a3b8" }}>Nhấn ô trong bảng bên dưới để chọn</div>
          }
        </div>
        {/* Reset */}
        {score>0 && (
          <button type="button" onClick={()=>onChange(0,0)} title="Xóa"
            style={{ width:26, height:26, borderRadius:6, border:"1px solid #e2e8f0", background:"#f8fafc", cursor:"pointer", color:"#94a3b8", fontSize:13, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            ✕
          </button>
        )}
      </div>

      {/* ── Matrix ── */}
      <div style={{ background:"#fff", borderRadius:12, border:"1.5px solid #e2e8f0", padding:"10px 10px 8px 10px", boxShadow:"0 1px 8px rgba(0,0,0,.06)" }}>
        {/* Consequence axis title */}
        <div style={{ paddingLeft:LABEL_W+6, marginBottom:5 }}>
          <div style={{ fontSize:10.5, fontWeight:800, color:"#0369a1", letterSpacing:"0.07em", textAlign:"center" }}>HẬU QUẢ (Consequence) →</div>
        </div>

        {/* Header row: corner + 5 col headers */}
        <div style={{ display:"grid", gridTemplateColumns:`${LABEL_W}px repeat(5,1fr)`, gap:3, marginBottom:3 }}>
          <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"flex-end", paddingRight:5, paddingBottom:2 }}>
            <span style={{ fontSize:9, color:"#94a3b8", fontWeight:700, lineHeight:1.2, textAlign:"right" }}>XS↑<br/>HQ→</span>
          </div>
          {CONS_OPTS.map(c=>(
            <div key={c.v} style={{ textAlign:"center" }}>
              <div style={{
                fontSize:12, fontWeight:900, lineHeight:1,
                color:(hvC===c.v||selC===c.v)?"#0369a1":"#475569",
                background:(hvC===c.v||selC===c.v)?"#dbeafe":"transparent",
                borderRadius:5, padding:"3px 2px", transition:"all .1s",
              }}>{c.short}</div>
              <div style={{ fontSize:8.5, color:"#94a3b8", lineHeight:1.2, marginTop:1 }}>
                {c.label.split(" ")[0]}
              </div>
            </div>
          ))}
        </div>

        {/* Data rows */}
        {PROB_OPTS.map(r=>(
          <div key={r.v} style={{ display:"grid", gridTemplateColumns:`${LABEL_W}px repeat(5,1fr)`, gap:3, marginBottom:3 }}>
            {/* Row label */}
            <div onMouseEnter={()=>setHvL(r.v)} onMouseLeave={()=>setHvL(0)}
              style={{ display:"flex", alignItems:"center", gap:4, paddingRight:5, cursor:"default", height:CELL_H }}>
              <div style={{
                width:18, height:18, borderRadius:4, flexShrink:0,
                background:(hvL===r.v||selL===r.v)?"#0369a1":"#f1f5f9",
                color:(hvL===r.v||selL===r.v)?"#fff":"#475569",
                fontSize:11, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center",
                transition:"all .1s",
              }}>{r.short}</div>
              <div style={{ fontSize:9, color:"#64748b", lineHeight:1.25, flex:1, overflow:"hidden" }}>
                {r.label}
              </div>
            </div>
            {/* Cells */}
            {CONS_OPTS.map(c=>{
              const s=r.v*c.v;
              const isActive=selL===r.v&&selC===c.v;
              const isHov=hvL===r.v&&hvC===c.v;
              const isDim=(hvL>0||hvC>0)&&!isHov&&!isActive;
              return (
                <button key={c.v} type="button"
                  onMouseEnter={()=>{setHvL(r.v);setHvC(c.v);}}
                  onMouseLeave={()=>{setHvL(0);setHvC(0);}}
                  onClick={()=>{onChange(r.v,c.v);setHvL(0);setHvC(0);setCollapsed(true);}}
                  style={{
                    height:CELL_H, width:"100%", borderRadius:6,
                    cursor:"pointer", outline:"none",
                    background:cellBg(s),
                    border: isActive?"3px solid #1d4ed8": isHov?"2px solid rgba(255,255,255,.85)":"1.5px solid rgba(0,0,0,.08)",
                    color:cellTextColor(s), fontSize:12, fontWeight:900,
                    transform: isActive?"scale(1.1)": isHov?"scale(1.06)":"scale(1)",
                    opacity: isDim ? 0.6 : 1,
                    boxShadow: isActive?"0 0 0 3px rgba(29,78,216,.3),0 3px 8px rgba(0,0,0,.18)": isHov?"0 3px 8px rgba(0,0,0,.15)":"none",
                    transition:"transform .1s,opacity .1s,box-shadow .1s",
                    position:"relative",
                  }}>
                  {s}
                  {isActive&&<span style={{ position:"absolute", top:1, right:2, fontSize:7, lineHeight:1 }}>✓</span>}
                </button>
              );
            })}
          </div>
        ))}

        {/* Likelihood axis label — vertical hint */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4, paddingLeft:2 }}>
          <span style={{ fontSize:9.5, fontWeight:800, color:"#64748b", letterSpacing:"0.05em", writingMode:"horizontal-tb" }}>↑ XÁC SUẤT (Likelihood)</span>
        </div>

        {/* Hover tooltip */}
        {hovLabel && (
          <div style={{ marginTop:6, padding:"5px 10px", borderRadius:7, background:"#f0f9ff", border:"1px solid #bae6fd", fontSize:11.5, color:"#0369a1", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <span>{hovLabel}</span>
            <span style={{ fontWeight:900, color:riskBandColor(pvScore) }}>{pvScore}/25 — {riskBand(pvScore)}</span>
          </div>
        )}

        {/* Legend */}
        <div style={{ marginTop:8, display:"flex", gap:5, flexWrap:"wrap", alignItems:"center" }}>
          {[
            {label:"Thấp 1–3", bg:"#22c55e"},
            {label:"TB 4–7",   bg:"#fbbf24"},
            {label:"Cao 8–14", bg:"#f97316"},
            {label:"Rất cao ≥15", bg:"#dc2626"},
          ].map(b=>(
            <span key={b.label} style={{ fontSize:10.5, fontWeight:700, color:"#fff", background:b.bg, padding:"2px 8px", borderRadius:4 }}>{b.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function RiskBadge({ score, label, empty=false, emptyText="Chưa chọn", onClick, active=false }:{
  score:number; label:string; empty?:boolean; emptyText?:string; onClick?:()=>void; active?:boolean;
}) {
  const clr  = empty ? "#94a3b8" : riskBandColor(score);
  const bg   = empty ? "#f8fafc"  : riskBandBg(score);
  const bdr  = empty ? (active?"#94a3b8":"#e2e8f0") : (active?riskBandColor(score):riskBandBorder(score));
  const lvl  = empty ? emptyText  : riskBand(score);
  const icon = empty ? "⬜" : score>=15?"🔴":score>=8?"🟠":score>=4?"🟡":"🟢";
  return (
    <div onClick={onClick}
      style={{
        display:"flex", alignItems:"center", gap:10, padding:"10px 12px", borderRadius:10,
        background:bg, border:`2px solid ${bdr}`,
        cursor:onClick?"pointer":"default",
        boxShadow: active?"0 0 0 3px rgba(59,130,246,.2)":"none",
        transition:"all .15s",
      }}>
      <div style={{
        width:40, height:40, borderRadius:8, background:empty?"#e8ecf1":cellBg(score),
        display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0,
        boxShadow:empty?"none":`0 2px 6px ${cellBg(score)}55`,
      }}>
        <span style={{ fontSize:empty?16:18, fontWeight:900, color:empty?"#94a3b8":cellTextColor(score), lineHeight:1 }}>
          {empty?"?":score}
        </span>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:10, fontWeight:800, color:"#475569", letterSpacing:"0.05em", textTransform:"uppercase" }}>{label}</div>
        <div style={{ fontSize:13, fontWeight:900, color:clr, lineHeight:1.2 }}>{icon} {lvl}</div>
        {!empty && <div style={{ fontSize:10.5, color:"#64748b" }}>Điểm {score} / 25</div>}
      </div>
    </div>
  );
}

/* ─── Compact Risk Matrix (2-column side-by-side) ───────── */
function RiskMatrixPickerCompact({
  selL, selC, onChange, mode
}:{ selL:number; selC:number; onChange:(l:number,c:number)=>void; mode:"before"|"after" }) {
  const [hvL,setHvL]=useState(0);
  const [hvC,setHvC]=useState(0);
  const [collapsed,setCollapsed]=useState(false);
  const score=selL*selC;
  const pvScore=hvL*hvC;
  const isHovering=hvL>0&&hvC>0;
  const CELL_H=30;
  const isBefore=mode==="before";

  const theme = isBefore
    ? { stripe:"#dc2626", accentClr:"#b91c1c", accentBg:"#fff1f1", accentBdr:"#fca5a5",
        headerBg:"linear-gradient(135deg,#fef2f2,#fff5f5)",
        label:"TRƯỚC KHẮC PHỤC", sub:"Chưa chọn mức rủi ro" }
    : { stripe:"#16a34a", accentClr:"#15803d", accentBg:"#f0fff4", accentBdr:"#86efac",
        headerBg:"linear-gradient(135deg,#f0fdf4,#f6fff8)",
        label:"SAU KHẮC PHỤC", sub:"Chưa chọn mức rủi ro" };

  return (
    <div style={{
      display:"flex", flexDirection:"column", borderRadius:12, overflow:"hidden",
      border:`1.5px solid ${score ? theme.accentBdr : "#e2e8f0"}`,
      boxShadow:"0 2px 10px rgba(0,0,0,.06)", background:"#fff",
      transition:"border-color .25s",
    }}>
      {/* header — compact chip when done+collapsed, full picker otherwise */}
      {(collapsed && score>0) ? (
        /* ── Done chip: left accent bar + score badge + label + actions ── */
        <div style={{
          display:"flex", alignItems:"center", minHeight:46, overflow:"hidden",
          cursor:"pointer", background:theme.accentBg,
        }} onClick={()=>setCollapsed(false)} title="Nhấn để mở lại ma trận">
          {/* left accent bar */}
          <div style={{ width:5, alignSelf:"stretch", background:theme.stripe, flexShrink:0 }}/>
          {/* score badge */}
          <div style={{
            margin:"0 11px", width:34, height:34, borderRadius:9, flexShrink:0,
            background:cellBg(score),
            display:"flex", alignItems:"center", justifyContent:"center",
            boxShadow:`0 2px 8px ${cellBg(score)}66`,
          }}>
            <span style={{ fontSize:15, fontWeight:900, color:cellTextColor(score), lineHeight:1 }}>{score}</span>
          </div>
          {/* text */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:8.5, fontWeight:800, letterSpacing:"0.07em", textTransform:"uppercase", color:theme.accentClr, lineHeight:1, marginBottom:3 }}>
              {theme.label}
            </div>
            <div style={{ fontSize:12, fontWeight:700, color:riskBandColor(score) }}>
              {score>=15?"🔴":score>=8?"🟠":score>=4?"🟡":"🟢"} {riskBand(score)}
            </div>
          </div>
          {/* actions */}
          <div style={{ display:"flex", alignItems:"center", gap:6, padding:"0 11px", flexShrink:0 }}>
            <span style={{ fontSize:10, fontWeight:600, color:theme.accentClr, opacity:.8 }}>✏️ Sửa</span>
            <button type="button" title="Xóa & chọn lại"
              onClick={(e)=>{ e.stopPropagation(); onChange(0,0); setCollapsed(false); }}
              style={{
                width:20, height:20, borderRadius:5, flexShrink:0, padding:0,
                border:`1px solid ${theme.accentBdr}`, background:"rgba(255,255,255,.75)",
                cursor:"pointer", color:theme.accentClr, fontSize:11,
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>✕</button>
          </div>
        </div>
      ) : (
        /* ── Full picker header ── */
        <>
          {/* top stripe */}
          <div style={{ height:4, background:score?theme.stripe:"#e2e8f0", transition:"background .25s" }}/>
          <div style={{
            display:"flex", alignItems:"center", gap:10, padding:"9px 11px",
            background:score?theme.headerBg:"linear-gradient(135deg,#f8fafc,#f1f5f9)",
            borderBottom:`1px solid ${score?theme.accentBdr:"#e2e8f0"}`,
            transition:"background .2s",
          }}>
            <div style={{
              width:44, height:44, borderRadius:10, flexShrink:0,
              background:score?cellBg(score):"#e8ecf1",
              display:"flex", alignItems:"center", justifyContent:"center",
              boxShadow:score?`0 3px 10px ${cellBg(score)}55`:"inset 0 1px 3px rgba(0,0,0,.08)",
              transition:"all .2s",
            }}>
              <span style={{ fontSize:score>=10?17:19, fontWeight:900, lineHeight:1, color:score?cellTextColor(score):"#94a3b8" }}>
                {score||"?"}
              </span>
            </div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:9, fontWeight:800, letterSpacing:"0.07em", textTransform:"uppercase", marginBottom:2, color:score?theme.accentClr:"#94a3b8" }}>
                {theme.label}
              </div>
              {score>0 ? (
                <div style={{ fontSize:13, fontWeight:900, color:riskBandColor(score), lineHeight:1.2 }}>
                  {score>=15?"🔴":score>=8?"🟠":score>=4?"🟡":"🟢"} {riskBand(score)}
                </div>
              ) : (
                <div style={{ fontSize:11, color:"#94a3b8", fontStyle:"italic" }}>{theme.sub}</div>
              )}
            </div>
            <div style={{ display:"flex", alignItems:"center", gap:5, flexShrink:0 }}>
              {score>0&&(
                <button type="button" onClick={()=>{onChange(0,0);setCollapsed(false);}} title="Xóa & chọn lại"
                  style={{ width:22,height:22,borderRadius:6,border:`1px solid ${theme.accentBdr}`,background:theme.accentBg,
                    cursor:"pointer",color:theme.accentClr,fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0 }}>✕</button>
              )}
              {score>0&&(
                <button type="button" onClick={()=>setCollapsed(true)} title="Thu gọn"
                  style={{ width:22,height:22,borderRadius:6,border:"1px solid #e2e8f0",background:"#f8fafc",
                    cursor:"pointer",color:"#64748b",fontSize:11,display:"flex",alignItems:"center",justifyContent:"center",padding:0 }}>▲</button>
              )}
            </div>
          </div>
        </>
      )}

      {/* matrix */}
      {!collapsed && <div style={{ padding:"7px 8px 5px", background:"#fff" }}>
        {/* Axis label */}
        <div style={{ paddingLeft:46, marginBottom:2, display:"flex", alignItems:"center", gap:4 }}>
          <div style={{ flex:1,height:1,background:"#f0f0f0" }}/>
          <span style={{ fontSize:8, fontWeight:700, color:"#94a3b8", letterSpacing:"0.06em", whiteSpace:"nowrap" }}>HẬU QUẢ →</span>
          <div style={{ flex:1,height:1,background:"#f0f0f0" }}/>
        </div>

        {/* Col headers */}
        <div style={{ display:"grid", gridTemplateColumns:"46px repeat(5,1fr)", gap:2, marginBottom:2 }}>
          <div style={{ display:"flex",alignItems:"flex-end",justifyContent:"flex-end",paddingRight:3,paddingBottom:1 }}>
            <span style={{ fontSize:7,color:"#cbd5e1",fontWeight:700,lineHeight:1.2,textAlign:"right" }}>XS<br/>↕</span>
          </div>
          {CONS_OPTS.map(c=>(
            <div key={c.v} style={{ textAlign:"center" }}>
              <div style={{
                fontSize:11.5, fontWeight:900,
                color:(hvC===c.v||selC===c.v)?theme.accentClr:"#64748b",
                background:(hvC===c.v||selC===c.v)?theme.accentBg:"transparent",
                borderRadius:4, padding:"1px 0", transition:"all .1s",
              }}>{c.short}</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        {PROB_OPTS.map(r=>(
          <div key={r.v} style={{ display:"grid", gridTemplateColumns:"46px repeat(5,1fr)", gap:2, marginBottom:2 }}>
            <div onMouseEnter={()=>setHvL(r.v)} onMouseLeave={()=>setHvL(0)}
              style={{ display:"flex",alignItems:"center",gap:3,paddingRight:2,cursor:"default",height:CELL_H }}>
              <div style={{
                width:18,height:18,borderRadius:4,flexShrink:0,
                background:(hvL===r.v||selL===r.v)?theme.accentClr:"#f1f5f9",
                color:(hvL===r.v||selL===r.v)?"#fff":"#475569",
                fontSize:10.5,fontWeight:900,
                display:"flex",alignItems:"center",justifyContent:"center",
                transition:"all .12s",
              }}>{r.short}</div>
              <div style={{ fontSize:7,color:"#94a3b8",lineHeight:1.2,flex:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis",fontWeight:600 }}>
                {r.label.split(" ").slice(0,2).join(" ")}
              </div>
            </div>
            {CONS_OPTS.map(c=>{
              const s=r.v*c.v;
              const isAct=selL===r.v&&selC===c.v;
              const isHov=hvL===r.v&&hvC===c.v;
              const isDim=isHovering&&!isHov&&!isAct;
              return (
                <button key={c.v} type="button"
                  onMouseEnter={()=>{setHvL(r.v);setHvC(c.v);}}
                  onMouseLeave={()=>{setHvL(0);setHvC(0);}}
                  onClick={()=>{onChange(r.v,c.v);setHvL(0);setHvC(0);setCollapsed(true);}}
                  style={{
                    height:CELL_H,width:"100%",borderRadius:5,cursor:"pointer",outline:"none",
                    background:cellBg(s),
                    border:isAct?`2.5px solid ${theme.accentClr}`:isHov?"2px solid rgba(255,255,255,.9)":"1.5px solid rgba(0,0,0,.07)",
                    color:cellTextColor(s),fontSize:11,fontWeight:900,
                    transform:isAct?"scale(1.12)":isHov?"scale(1.07)":"scale(1)",
                    opacity:isDim?0.45:1,
                    boxShadow:isAct?`0 0 0 3px ${theme.accentClr}33,0 3px 8px rgba(0,0,0,.2)`:isHov?"0 3px 8px rgba(0,0,0,.15)":"none",
                    transition:"transform .12s,opacity .12s,box-shadow .12s",
                    position:"relative",
                  }}>
                  {s}
                  {isAct&&(
                    <span style={{
                      position:"absolute",top:2,right:2,width:8,height:8,borderRadius:"50%",
                      background:"rgba(255,255,255,.85)",display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:6,lineHeight:1,color:theme.accentClr,fontWeight:900,
                    }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        ))}

        {/* Rich tooltip */}
        {isHovering ? (()=>{
          const probOpt = PROB_OPTS.find(p=>p.v===hvL)!;
          const consOpt = CONS_OPTS.find(c=>c.v===hvC)!;
          const bandMeaning: Record<string,string> = {
            "Thấp":     "Có thể chấp nhận, theo dõi định kỳ",
            "Trung bình":"Cần kiểm soát, lập kế hoạch giảm thiểu",
            "Cao":      "Ưu tiên xử lý ngay, cần biện pháp khắc phục",
            "Rất cao":  "Dừng hoạt động ngay, xử lý khẩn cấp",
          };
          const band = riskBand(pvScore);
          return (
            <div style={{
              marginTop:6, borderRadius:8, overflow:"hidden",
              border:`1px solid ${riskBandColor(pvScore)}33`,
              boxShadow:`0 4px 14px ${riskBandColor(pvScore)}18`,
            }}>
              {/* header: score + band */}
              <div style={{
                display:"flex", alignItems:"center", gap:8, padding:"6px 10px",
                background:riskBandBg(pvScore), borderBottom:`1px solid ${riskBandColor(pvScore)}22`,
              }}>
                <div style={{
                  width:30,height:30,borderRadius:7,background:cellBg(pvScore),flexShrink:0,
                  display:"flex",alignItems:"center",justifyContent:"center",
                  boxShadow:`0 2px 6px ${cellBg(pvScore)}55`,
                }}>
                  <span style={{ fontSize:13,fontWeight:900,color:cellTextColor(pvScore) }}>{pvScore}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:11,fontWeight:800,color:riskBandColor(pvScore) }}>
                    {pvScore>=15?"🔴":pvScore>=8?"🟠":pvScore>=4?"🟡":"🟢"} Mức {band}
                  </div>
                  <div style={{ fontSize:9.5,color:"#64748b",marginTop:1 }}>{bandMeaning[band]}</div>
                </div>
              </div>
              {/* body: prob + cons */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", background:"#fff" }}>
                <div style={{ padding:"6px 10px", borderRight:"1px solid #f1f5f9" }}>
                  <div style={{ fontSize:8.5,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2 }}>Xác suất · {probOpt.short}/5</div>
                  <div style={{ fontSize:10.5,fontWeight:700,color:"#334155" }}>{probOpt.label}</div>
                  <div style={{ fontSize:9,color:"#94a3b8",marginTop:1 }}>{probOpt.sub}</div>
                </div>
                <div style={{ padding:"6px 10px" }}>
                  <div style={{ fontSize:8.5,fontWeight:800,color:"#94a3b8",textTransform:"uppercase",letterSpacing:"0.05em",marginBottom:2 }}>Hậu quả · {consOpt.short}/5</div>
                  <div style={{ fontSize:10.5,fontWeight:700,color:"#334155" }}>{consOpt.label}</div>
                  <div style={{ fontSize:9,color:"#94a3b8",marginTop:1 }}>{consOpt.sub}</div>
                </div>
              </div>
            </div>
          );
        })() : score===0&&(
          <div style={{ marginTop:5,fontSize:9.5,color:"#94a3b8",textAlign:"center",fontStyle:"italic" }}>
            Di chuột vào ô để xem chi tiết · Nhấn để chọn
          </div>
        )}

        {/* Legend */}
        <div style={{ marginTop:6,display:"flex",gap:5,justifyContent:"center" }}>
          {[{l:"Thấp",c:"#22c55e"},{l:"TB",c:"#fbbf24"},{l:"Cao",c:"#f97316"},{l:"Rất cao",c:"#dc2626"}].map(b=>(
            <div key={b.l} style={{ display:"flex",alignItems:"center",gap:3 }}>
              <div style={{ width:7,height:7,borderRadius:"50%",background:b.c,flexShrink:0 }}/>
              <span style={{ fontSize:8,color:"#64748b",fontWeight:600 }}>{b.l}</span>
            </div>
          ))}
        </div>
      </div>}
    </div>
  );
}

/* ─── Action Plan Table (Excel-like) ────────────────────── */
type ActionItem = { id:string; action:string; type:'CA'|'PA'|'Both'|''; persons:string[]; deadline:string; progress:string; note:string; };

const AP_COLS = [
  { key:"action",   label:"Hành động / Biện pháp",  w:"minmax(220px,1fr)", ph:"Mô tả hành động cụ thể..." },
  { key:"type",     label:"Loại",                    w:"90px",              ph:"" },
  { key:"person",   label:"Người thực hiện",         w:"140px",             ph:"Tên..." },
  { key:"deadline", label:"Hạn hoàn thành",          w:"130px",             ph:"" },
  { key:"progress", label:"% TĐ",                    w:"72px",              ph:"0" },
  { key:"note",     label:"Ghi chú",                 w:"150px",             ph:"Tùy chọn..." },
];

const AP_TYPE_CFG:{[k:string]:{label:string;color:string;bg:string;border:string}} = {
  CA:   { label:"CA",   color:"#dc2626", bg:"#fef2f2", border:"#fca5a5" },
  PA:   { label:"PA",   color:"#16a34a", bg:"#f0fdf4", border:"#86efac" },
  Both: { label:"CA+PA",color:"#7c3aed", bg:"#faf5ff", border:"#c4b5fd" },
};

function newActionItem(deadline?:string, defaultType?:ActionItem["type"]): ActionItem {
  return { id:crypto.randomUUID(), action:"", type:defaultType||"", persons:[], deadline:deadline||"", progress:"", note:"" };
}

/* ─── Card-style Action Rows (Step 3 mockup style) ───────── */
const autoGrow = (e: React.FormEvent<HTMLTextAreaElement>) => {
  const el = e.currentTarget; el.style.height = "auto"; el.style.height = el.scrollHeight + "px";
};
const CARD_INP: React.CSSProperties = {
  padding:"6px 9px", fontSize:12, boxSizing:"border-box",
  border:"1.5px solid #e2e8f0", borderRadius:7, outline:"none",
  color:"#0f172a", background:"#fff", fontFamily:"inherit", width:"100%",
};

/* ─── TypeDropdown — chọn loại CA / PA / CA+PA ─── */
function TypeDropdown({ value, onChange }: { value:string; onChange:(v:ActionItem["type"])=>void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e:MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);
  const cfg = value ? AP_TYPE_CFG[value] : null;
  const OPTIONS: ActionItem["type"][] = ["CA","PA","Both"];
  return (
    <div ref={ref} style={{ position:"relative", flexShrink:0 }}>
      <button onClick={()=>setOpen(o=>!o)} style={{
        display:"flex", alignItems:"center", gap:5, padding:"4px 8px 4px 10px", borderRadius:7, cursor:"pointer",
        border: cfg ? `2px solid ${cfg.color}` : "1.5px solid #9ca3af",
        background: cfg ? cfg.bg : "#fff",
        color: cfg ? cfg.color : "#6b7280",
        fontSize:12, fontWeight:700, whiteSpace:"nowrap",
        boxShadow: cfg ? `0 0 0 2px ${cfg.color}22` : "0 1px 2px rgba(0,0,0,.07)",
        transition:"all .12s", minWidth:82,
      }}>
        <span style={{ flex:1 }}>{cfg ? cfg.label : "Chọn loại..."}</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:9, boxShadow:"0 8px 24px rgba(0,0,0,.13)", zIndex:120, overflow:"hidden", minWidth:120 }}>
          {OPTIONS.map(t => {
            const c = AP_TYPE_CFG[t]; const sel = value===t;
            return (
              <button key={t} onMouseDown={e=>{e.preventDefault(); onChange(t); setOpen(false);}}
                style={{ display:"flex", alignItems:"center", gap:8, width:"100%", padding:"7px 12px", border:"none", cursor:"pointer", textAlign:"left",
                  background: sel ? c.bg : "transparent", transition:"background .1s" }}
                onMouseEnter={e=>(e.currentTarget.style.background=c.bg)}
                onMouseLeave={e=>(e.currentTarget.style.background=sel?c.bg:"transparent")}>
                <span style={{ width:10, height:10, borderRadius:"50%", background:c.color, flexShrink:0 }}/>
                <span style={{ fontSize:13, fontWeight: sel?800:600, color: c.color }}>{c.label}</span>
                {sel && <span style={{ marginLeft:"auto", fontSize:13, color:c.color }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── MiniPersonPicker — multi-select, dùng trong ActionCardRows ─── */
function MiniPersonPicker({ values, onChange, personnelList }: { values:string[]; onChange:(v:string[])=>void; personnelList?:typeof PERSONNEL }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const fn = (e:MouseEvent) => { if(ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQ(""); } };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const people = personnelList || PERSONNEL;

  function getInfo(name:string) {
    const pd = people.find((p:any)=>p.name===name);
    const dc = pd ? (KHOI.find(k=>k.id!=="all"&&k.depts.includes(pd.dept))?.color??"#64748b") : "#64748b";
    const ini = name.trim().split(" ").slice(-2).map((w:string)=>w[0]).join("").toUpperCase();
    return { pd, dc, ini };
  }

  const filtered = people
    .filter((p:any)=>!values.includes(p.name))
    .filter((p:any)=>q===""||p.name.toLowerCase().includes(q.toLowerCase())||(p.dept||"").toLowerCase().includes(q.toLowerCase())||(p.role||"").toLowerCase().includes(q.toLowerCase()))
    .slice(0,8);
  const canCustom = q.trim().length>0 && !people.some((p:any)=>p.name.toLowerCase()===q.trim().toLowerCase()) && !values.includes(q.trim());

  function add(name:string) { onChange([...values, name]); setQ(""); }
  function remove(name:string) { onChange(values.filter(v=>v!==name)); }

  const DropList = () => (
    <div style={{ position:"absolute", top:"calc(100% + 4px)", left:0, right:0, background:"#fff", border:"1.5px solid #6ee7b7", borderRadius:9, boxShadow:"0 8px 24px rgba(0,0,0,.13)", zIndex:120, overflow:"hidden" }}>
      <div style={{ padding:"6px 8px", borderBottom:"1px solid #f0fdf4" }}>
        <input autoFocus value={q} onChange={e=>setQ(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"){ if(filtered.length===1) add(filtered[0].name); else if(canCustom) add(q.trim()); e.preventDefault(); } if(e.key==="Escape") { setOpen(false); setQ(""); } }}
          style={{ ...CARD_INP, border:"1.5px solid #d1fae5", fontSize:12 }} placeholder="Tìm tên hoặc bộ phận..."/>
      </div>
      <div style={{ maxHeight:180, overflowY:"auto" }}>
        {filtered.length===0 && !canCustom && (
          <div style={{ padding:"10px 12px", fontSize:13, color:"#94a3b8", textAlign:"center" }}>Không tìm thấy</div>
        )}
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
  );

  return (
    <div ref={ref} style={{ position:"relative" }}>
      {values.length>0 ? (
        <div style={{ display:"flex", flexWrap:"wrap", gap:4, alignItems:"center", background:"#f0fdf4", border:"1.5px solid #6ee7b7", borderRadius:8, padding:"3px 6px 3px 5px", cursor:"pointer", minHeight:32 }}
          onClick={()=>{ setOpen(o=>!o); }}>
          {values.map(name=>{
            const {pd,dc,ini}=getInfo(name);
            return (
              <span key={name} style={{ display:"inline-flex", alignItems:"center", gap:4, background:"#fff", border:`1.5px solid ${dc}40`, borderRadius:6, padding:"2px 6px 2px 3px" }}>
                <span style={{ width:18, height:18, borderRadius:"50%", background:dc, color:"#fff", fontSize:10, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>{ini}</span>
                <span style={{ fontSize:11, fontWeight:700, color:"#166534", maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name.split(" ").slice(-1)[0]}</span>
                {pd && <span style={{ fontSize:10, fontWeight:700, color:dc, background:dc+"18", padding:"0 3px", borderRadius:3 }}>{pd.dept}</span>}
                <button onMouseDown={e=>{e.stopPropagation();e.preventDefault();remove(name);}} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:11, padding:0, lineHeight:1, display:"flex" }}>✕</button>
              </span>
            );
          })}
          <button onMouseDown={e=>{e.stopPropagation();e.preventDefault();setOpen(o=>!o);setQ("");}}
            style={{ background:"none", border:"1px dashed #6ee7b7", borderRadius:5, color:"#16a34a", fontSize:12, cursor:"pointer", padding:"1px 6px", fontWeight:700 }}>＋</button>
        </div>
      ) : (
        <button onClick={()=>setOpen(o=>!o)} style={{
          display:"flex", alignItems:"center", gap:6, width:"100%",
          padding:"5px 9px", borderRadius:8, border:"1.5px solid #d1d5db",
          background:"#fff", cursor:"pointer", textAlign:"left",
          boxShadow:"0 1px 2px rgba(0,0,0,.04)", transition:"border-color .12s",
        }}
          onMouseEnter={e=>{ e.currentTarget.style.borderColor="#6ee7b7"; }}
          onMouseLeave={e=>{ if(!open) e.currentTarget.style.borderColor="#d1d5db"; }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}>
            <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          </svg>
          <span style={{ fontSize:12, color:"#94a3b8", fontWeight:500 }}>Chọn người thực hiện...</span>
        </button>
      )}
      {open && <DropList/>}
    </div>
  );
}

function ActionCardRows({ items, onChange, defaultDeadline, defaultType, personnelList }:
  { items:ActionItem[]; onChange:(v:ActionItem[])=>void; defaultDeadline?:string; defaultType?:ActionItem["type"]; personnelList?:typeof PERSONNEL }) {
  function upd<K extends keyof ActionItem>(id:string, field:K, val:ActionItem[K]) {
    onChange(items.map(it=>it.id===id?{...it,[field]:val}:it));
  }
  function del(id:string) {
    if(items.length===1){ onChange([newActionItem(defaultDeadline, defaultType)]); return; }
    onChange(items.filter(it=>it.id!==id));
  }
  function add() { onChange([...items, newActionItem(defaultDeadline, defaultType)]); }
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
      {items.map((row, i)=>(
        <div key={row.id} style={{ background:"#fff", border:"2px solid #6ee7b7", borderRadius:10, padding:"10px 12px", display:"flex", flexDirection:"column", gap:8, boxShadow:"0 2px 8px rgba(16,185,129,.10)" }}>
          {/* Row 1: number circle + action textarea + delete */}
          <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
            <span style={{ width:24, height:24, borderRadius:"50%", background:"#16a34a", color:"#fff", fontSize:12, fontWeight:900, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, marginTop:5, boxShadow:"0 1px 4px rgba(22,163,74,.3)" }}>{i+1}</span>
            <div style={{ flex:1, minWidth:0 }}>
              <textarea rows={1} style={{ ...CARD_INP, fontWeight:600, background:"#f8fffe", border:"1.5px solid #a7f3d0", resize:"vertical", lineHeight:1.55, minHeight:34 }}
                value={row.action} onChange={e=>upd(row.id,"action",e.target.value)}
                onInput={autoGrow}
                placeholder="Mô tả hành động cụ thể..."/>
            </div>
            <button onClick={()=>del(row.id)} style={{ width:24, height:24, borderRadius:"50%", background:"#fee2e2", border:"1px solid #fca5a5", color:"#dc2626", fontSize:13, fontWeight:900, cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", marginTop:5 }}>✕</button>
          </div>
          {/* Row 2: Type dropdown + person picker + date */}
          <div style={{ display:"grid", gridTemplateColumns:"auto 1fr 130px", gap:7, alignItems:"start" }}>
            <TypeDropdown value={row.type} onChange={v=>upd(row.id,"type",v)}/>
            <MiniPersonPicker values={row.persons} onChange={v=>upd(row.id,"persons",v)} personnelList={personnelList}/>
            <input type="date" style={{ ...CARD_INP, background:"#f8fffe", border:"1.5px solid #a7f3d0" }} value={row.deadline}
              onChange={e=>upd(row.id,"deadline",e.target.value)}/>
          </div>
        </div>
      ))}
      <button onClick={add} style={{
        display:"flex", alignItems:"center", justifyContent:"center", gap:6,
        padding:"10px", borderRadius:9, border:"2px dashed #34d399",
        background:"#fff", color:"#059669", fontSize:13, fontWeight:700, cursor:"pointer",
        boxShadow:"0 1px 3px rgba(22,163,74,.1)", transition:"background .12s",
      }}>＋ Thêm hành động</button>
    </div>
  );
}

function ActionPlanTable({ items, onChange, defaultDeadline, persons }:
  { items:ActionItem[]; onChange:(v:ActionItem[])=>void; defaultDeadline?:string; persons?:string[] }) {

  const cellRefs = useRef<Record<string,HTMLElement|null>>({});
  const [focusId, setFocusId] = useState<string|null>(null);
  const [typeOpenId, setTypeOpenId] = useState<string|null>(null);
  const [personOpenId, setPersonOpenId] = useState<string|null>(null);

  function update(id:string, field:keyof ActionItem, val:string) {
    onChange(items.map(it=>it.id===id?{...it,[field]:val}:it));
  }
  function updatePersonStr(id:string, val:string) {
    onChange(items.map(it=>it.id===id?{...it,persons:val?[val]:[]}:it));
  }
  function addRow() {
    const newItem = newActionItem(defaultDeadline);
    onChange([...items, newItem]);
    setTimeout(()=>{ cellRefs.current[`${newItem.id}_action`]?.focus(); },60);
  }
  function delRow(id:string) {
    if(items.length===1){ onChange([newActionItem(defaultDeadline)]); return; }
    onChange(items.filter(it=>it.id!==id));
  }
  function dupRow(id:string) {
    const src=items.find(it=>it.id===id); if(!src) return;
    const clone={...src,id:crypto.randomUUID()};
    const idx=items.findIndex(it=>it.id===id);
    const next=[...items.slice(0,idx+1),clone,...items.slice(idx+1)];
    onChange(next);
    setTimeout(()=>{ cellRefs.current[`${clone.id}_action`]?.focus(); },60);
  }
  function handleKeyDown(e:React.KeyboardEvent, id:string, field:keyof ActionItem) {
    const colKeys = AP_COLS.map(c=>c.key as keyof ActionItem);
    const colIdx  = colKeys.indexOf(field);
    const rowIdx  = items.findIndex(it=>it.id===id);
    if (e.key==="Tab") {
      e.preventDefault();
      if (e.shiftKey) {
        if (colIdx>0) { cellRefs.current[`${id}_${colKeys[colIdx-1]}`]?.focus(); }
        else if (rowIdx>0) { cellRefs.current[`${items[rowIdx-1].id}_${colKeys[colKeys.length-1]}`]?.focus(); }
      } else {
        if (colIdx<colKeys.length-1) { cellRefs.current[`${id}_${colKeys[colIdx+1]}`]?.focus(); }
        else if (rowIdx<items.length-1) { cellRefs.current[`${items[rowIdx+1].id}_${colKeys[0]}`]?.focus(); }
        else { addRow(); }
      }
    } else if (e.key==="Enter" && !e.shiftKey && field!=="action") {
      e.preventDefault();
      if (rowIdx<items.length-1) { cellRefs.current[`${items[rowIdx+1].id}_${field}`]?.focus(); }
      else { addRow(); }
    } else if (e.key==="ArrowDown" && field!=="action") {
      e.preventDefault();
      if (rowIdx<items.length-1) cellRefs.current[`${items[rowIdx+1].id}_${field}`]?.focus();
    } else if (e.key==="ArrowUp" && field!=="action") {
      e.preventDefault();
      if (rowIdx>0) cellRefs.current[`${items[rowIdx-1].id}_${field}`]?.focus();
    }
  }

  const totalCA  = items.filter(i=>i.type==="CA"||i.type==="Both").length;
  const totalPA  = items.filter(i=>i.type==="PA"||i.type==="Both").length;
  const hasFill  = items.filter(i=>i.action.trim()&&i.type).length;

  const gridCols = ["32px",...AP_COLS.map(c=>c.w),"34px"].join(" ");

  return (
    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>

      {/* ── Toolbar ── */}
      <div style={{ display:"flex", alignItems:"center", gap:6, padding:"6px 8px", background:"#f1f5f9", borderRadius:"8px 8px 0 0", border:"1px solid #cbd5e1", borderBottom:"none" }}>
        <button onClick={addRow} style={{ display:"flex",alignItems:"center",gap:5,padding:"4px 10px",borderRadius:5,fontSize:13,fontWeight:700,cursor:"pointer",border:"1.5px solid #22c55e",background:"#f0fdf4",color:"#15803d" }}>
          ＋ Thêm hàng
        </button>
        <div style={{ flex:1 }}/>
        <div style={{ fontSize:13, color:"#64748b", display:"flex",gap:8 }}>
          <span style={{ fontWeight:700, color:"#1e293b" }}>{hasFill}/{items.length}</span> hành động
          {totalCA>0&&<span style={{ color:"#dc2626",fontWeight:700,background:"#fef2f2",border:"1px solid #fca5a5",padding:"1px 7px",borderRadius:12 }}>CA×{totalCA}</span>}
          {totalPA>0&&<span style={{ color:"#16a34a",fontWeight:700,background:"#f0fdf4",border:"1px solid #86efac",padding:"1px 7px",borderRadius:12 }}>PA×{totalPA}</span>}
        </div>
        <div style={{ fontSize:12, color:"#94a3b8", marginLeft:4 }}>Tab: chuyển ô · Enter: xuống · ↑↓: di chuyển</div>
      </div>

      {/* ── Header row ── */}
      <div style={{
        display:"grid", gridTemplateColumns:gridCols,
        background:"#e2e8f0", borderLeft:"1px solid #cbd5e1", borderRight:"1px solid #cbd5e1",
        position:"sticky", top:0, zIndex:2,
      }}>
        <div style={{ padding:"6px 4px", textAlign:"center", fontSize:12, fontWeight:800, color:"#64748b", borderRight:"1px solid #cbd5e1" }}>#</div>
        {AP_COLS.map((c,ci)=>(
          <div key={c.key} style={{ padding:"6px 8px", fontSize:12, fontWeight:800, color:"#374151", letterSpacing:"0.03em", borderRight:ci<AP_COLS.length-1?"1px solid #cbd5e1":"none", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
            {c.label}
          </div>
        ))}
        <div style={{ padding:"6px 4px", textAlign:"center", fontSize:12, color:"#94a3b8" }}/>
      </div>

      {/* ── Data rows ── */}
      <div style={{ border:"1px solid #cbd5e1", borderRadius:"0 0 8px 8px", overflow:"hidden", maxHeight:340, overflowY:"auto" }}>
        {items.map((row, ri) => {
          const isFocused = focusId===row.id;
          const rowBg = isFocused?"#fffbf0":ri%2===0?"#fff":"#f8fafc";
          const typeCfg = row.type ? AP_TYPE_CFG[row.type] : null;
          return (
            <div key={row.id}
              style={{ display:"grid", gridTemplateColumns:gridCols, background:rowBg, borderBottom:ri<items.length-1?"1px solid #e2e8f0":"none", transition:"background .1s" }}
              onFocus={()=>setFocusId(row.id)} onBlur={e=>{ if(!e.currentTarget.contains(e.relatedTarget as Node))setFocusId(null); }}>

              {/* Row # */}
              <div style={{ display:"flex",alignItems:"center",justifyContent:"center",borderRight:"1px solid #e2e8f0",position:"relative" }}
                title="Nhân bản hàng này"
                onContextMenu={e=>{e.preventDefault();dupRow(row.id);}}>
                <span style={{ fontSize:12, fontWeight:700, color:"#94a3b8" }}>{ri+1}</span>
              </div>

              {/* Hành động */}
              <div style={{ borderRight:"1px solid #e2e8f0", padding:"1px 0" }}>
                <textarea
                  ref={el=>{ cellRefs.current[`${row.id}_action`]=el; }}
                  value={row.action}
                  onChange={e=>update(row.id,"action",e.target.value)}
                  onKeyDown={e=>handleKeyDown(e,row.id,"action")}
                  placeholder={AP_COLS[0].ph}
                  rows={1}
                  style={{ width:"100%", padding:"6px 8px", fontSize:13, border:"none", outline:"none", resize:"none", background:"transparent", fontFamily:"inherit", lineHeight:1.5, boxSizing:"border-box", minHeight:34, overflowY:"hidden", color:"#0f172a" }}
                  onInput={e=>{ const el=e.currentTarget; el.style.height="auto"; el.style.height=el.scrollHeight+"px"; }}
                />
              </div>

              {/* Loại CA/PA */}
              <div style={{ borderRight:"1px solid #e2e8f0", position:"relative" }}>
                <button
                  ref={el=>{ cellRefs.current[`${row.id}_type`]=el; }}
                  onClick={()=>setTypeOpenId(typeOpenId===row.id?null:row.id)}
                  onKeyDown={e=>handleKeyDown(e,row.id,"type")}
                  style={{ width:"100%", height:"100%", minHeight:34, padding:"0 8px", border:"none", background:"transparent", cursor:"pointer", display:"flex",alignItems:"center",gap:5, fontFamily:"inherit" }}>
                  {typeCfg ? (
                    <span style={{ fontSize:12,fontWeight:800,color:typeCfg.color,background:typeCfg.bg,border:`1px solid ${typeCfg.border}`,padding:"2px 7px",borderRadius:10,whiteSpace:"nowrap" }}>{typeCfg.label}</span>
                  ) : <span style={{ fontSize:13,color:"#94a3b8" }}>— chọn —</span>}
                </button>
                {typeOpenId===row.id && (
                  <div style={{ position:"absolute",top:"100%",left:0,zIndex:30,background:"#fff",border:"1.5px solid #cbd5e1",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.14)",minWidth:110 }}>
                    {(["CA","PA","Both"] as const).map(t=>{
                      const cfg=AP_TYPE_CFG[t];
                      return (
                        <button key={t} onMouseDown={e=>{e.preventDefault();update(row.id,"type",t);setTypeOpenId(null);setTimeout(()=>cellRefs.current[`${row.id}_person`]?.focus(),30);}}
                          style={{ display:"block",width:"100%",padding:"7px 12px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",fontFamily:"inherit" }}
                          onMouseEnter={e=>(e.currentTarget.style.background="#f0f9ff")}
                          onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                          <span style={{ fontSize:13,fontWeight:800,color:cfg.color,background:cfg.bg,border:`1px solid ${cfg.border}`,padding:"2px 9px",borderRadius:10 }}>{cfg.label}</span>
                        </button>
                      );
                    })}
                    <button onMouseDown={e=>{e.preventDefault();update(row.id,"type","");setTypeOpenId(null);}}
                      style={{ display:"block",width:"100%",padding:"6px 12px",border:"none",background:"transparent",cursor:"pointer",fontSize:13,color:"#94a3b8",textAlign:"left",fontFamily:"inherit" }}>
                      Bỏ chọn
                    </button>
                  </div>
                )}
              </div>

              {/* Người thực hiện */}
              <div style={{ borderRight:"1px solid #e2e8f0", position:"relative" }}>
                <input
                  ref={el=>{ cellRefs.current[`${row.id}_person`]=el; }}
                  value={row.persons[0]||""}
                  onChange={e=>{ updatePersonStr(row.id, e.target.value); setPersonOpenId(row.id); }}
                  onFocus={()=>setPersonOpenId(row.id)}
                  onBlur={()=>setTimeout(()=>setPersonOpenId(null),150)}
                  onKeyDown={e=>handleKeyDown(e,row.id,"action")}
                  placeholder={AP_COLS[2].ph}
                  style={{ width:"100%", height:"100%", minHeight:34, padding:"0 8px", border:"none", outline:"none", background:"transparent", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", color:"#0f172a" }}
                />
                {personOpenId===row.id && persons && persons.length>0 && (row.persons[0]||"").trim()==="" && (
                  <div style={{ position:"absolute",top:"100%",left:0,zIndex:30,background:"#fff",border:"1.5px solid #cbd5e1",borderRadius:8,boxShadow:"0 8px 24px rgba(0,0,0,.14)",minWidth:180,maxHeight:160,overflowY:"auto" }}>
                    {persons.filter(p=>!(row.persons[0])||p.toLowerCase().includes((row.persons[0]||"").toLowerCase())).map(p=>(
                      <button key={p} onMouseDown={e=>{e.preventDefault();updatePersonStr(row.id,p);setPersonOpenId(null);setTimeout(()=>cellRefs.current[`${row.id}_deadline`]?.focus(),30);}}
                        style={{ display:"block",width:"100%",padding:"6px 10px",border:"none",background:"transparent",cursor:"pointer",textAlign:"left",fontSize:13,fontFamily:"inherit",color:"#0f172a" }}
                        onMouseEnter={e=>(e.currentTarget.style.background="#f0f9ff")}
                        onMouseLeave={e=>(e.currentTarget.style.background="transparent")}>
                        👤 {p}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Hạn */}
              <div style={{ borderRight:"1px solid #e2e8f0" }}>
                <input type="date"
                  ref={el=>{ cellRefs.current[`${row.id}_deadline`]=el; }}
                  value={row.deadline}
                  onChange={e=>update(row.id,"deadline",e.target.value)}
                  onKeyDown={e=>handleKeyDown(e,row.id,"deadline")}
                  style={{ width:"100%", height:"100%", minHeight:34, padding:"0 6px", border:"none", outline:"none", background:"transparent", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", color:row.deadline&&new Date(row.deadline)<new Date(new Date().toISOString().split("T")[0])?"#dc2626":"#0f172a" }}
                />
              </div>

              {/* % Tiến độ */}
              <div style={{ borderRight:"1px solid #e2e8f0", padding:"4px 6px", display:"flex",flexDirection:"column",gap:3,justifyContent:"center" }}>
                <input type="number" min={0} max={100}
                  ref={el=>{ cellRefs.current[`${row.id}_progress`]=el; }}
                  value={row.progress}
                  onChange={e=>{ const v=e.target.value; if(v===""||( +v>=0&&+v<=100)) update(row.id,"progress",v); }}
                  onKeyDown={e=>handleKeyDown(e,row.id,"progress")}
                  placeholder="0"
                  style={{ width:"100%", padding:"2px 4px", border:"1px solid #e2e8f0", borderRadius:4, outline:"none", fontSize:13, fontFamily:"inherit", textAlign:"center", background:"transparent", color:"#0f172a", boxSizing:"border-box" }}
                />
                {row.progress&&+row.progress>0&&(
                  <div style={{ height:3,borderRadius:2,background:"#e2e8f0",overflow:"hidden" }}>
                    <div style={{ height:"100%",width:`${Math.min(100,+row.progress)}%`,borderRadius:2,background:+row.progress>=100?"#16a34a":+row.progress>=50?"#3b82f6":"#f97316",transition:"width .2s" }}/>
                  </div>
                )}
              </div>

              {/* Ghi chú */}
              <div style={{ padding:"1px 0" }}>
                <input
                  ref={el=>{ cellRefs.current[`${row.id}_note`]=el; }}
                  value={row.note}
                  onChange={e=>update(row.id,"note",e.target.value)}
                  onKeyDown={e=>handleKeyDown(e,row.id,"note")}
                  placeholder={AP_COLS[5].ph}
                  style={{ width:"100%", height:"100%", minHeight:34, padding:"0 8px", border:"none", outline:"none", background:"transparent", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", color:"#475569" }}
                />
              </div>

              {/* Delete */}
              <div style={{ display:"flex",alignItems:"center",justifyContent:"center",borderLeft:"1px solid #e2e8f0" }}>
                <button onClick={()=>delRow(row.id)}
                  title="Xóa hàng này"
                  style={{ width:22,height:22,borderRadius:"50%",background:"#fee2e2",border:"none",color:"#dc2626",fontSize:12,fontWeight:900,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",padding:0,transition:"background .1s" }}
                  onMouseEnter={e=>(e.currentTarget.style.background="#fca5a5")}
                  onMouseLeave={e=>(e.currentTarget.style.background="#fee2e2")}>
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {/* Add row shortcut row */}
        <div onClick={addRow} style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px",cursor:"pointer",color:"#94a3b8",fontSize:13,fontWeight:600,background:"#f8fafc",borderTop:"1px dashed #e2e8f0",transition:"background .1s" }}
          onMouseEnter={e=>(e.currentTarget.style.background="#eff6ff")}
          onMouseLeave={e=>(e.currentTarget.style.background="#f8fafc")}>
          <span style={{ fontSize:15,color:"#22c55e" }}>＋</span> Nhấn để thêm hàng mới hoặc bấm Tab ở ô cuối
        </div>
      </div>
    </div>
  );
}

/* ─── Conditional fields helper ─────────────────────────── */
function getConditionalFields(srcTypeId:string) {
  return {
    showInjury:       srcTypeId==="incident",
    showContainment:  ["incident","warning","pccc"].includes(srcTypeId),
    showAuthReport:   ["incident","pccc"].includes(srcTypeId),
    showFireInfo:     srcTypeId==="pccc",
    showNcInfo:       ["audit","inspection"].includes(srcTypeId),
    showRiskScore:    ["incident","warning","pccc"].includes(srcTypeId),
    rcaMethodDefault: srcTypeId==="audit"||srcTypeId==="inspection"?"gap":
                      srcTypeId==="incident"?"fishbone":"5why",
  };
}

const PROBLEM_TYPE_OPTIONS = [
  { val:"MACH",    icon:"⚙️",  label:"Máy móc / Thiết bị",    color:"#7c3aed", bg:"#faf5ff", border:"#d8b4fe" },
  { val:"ELEC",    icon:"⚡",  label:"Điện",                   color:"#d97706", bg:"#fffbeb", border:"#fde68a" },
  { val:"CHEM",    icon:"🧪",  label:"Hóa chất",               color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0" },
  { val:"FIRE",    icon:"🔥",  label:"PCCC",                   color:"#dc2626", bg:"#fef2f2", border:"#fecaca" },
  { val:"HEIGHT",  icon:"🪜",  label:"Làm việc trên cao",      color:"#0369a1", bg:"#f0f9ff", border:"#bae6fd" },
  { val:"VEHICLE", icon:"🚛",  label:"Phương tiện",            color:"#b45309", bg:"#fffbeb", border:"#fde68a" },
  { val:"PPE",     icon:"🦺",  label:"PPE / Bảo hộ",          color:"#0891b2", bg:"#f0f9ff", border:"#bae6fd" },
  { val:"BEHAV",   icon:"🧠",  label:"Hành vi con người",      color:"#6d28d9", bg:"#faf5ff", border:"#ddd6fe" },
  { val:"NEAR",    icon:"⚠️",  label:"Cận nguy",               color:"#ca8a04", bg:"#fefce8", border:"#fde68a" },
  { val:"ENV",     icon:"🌿",  label:"Môi trường",             color:"#16a34a", bg:"#f0fdf4", border:"#bbf7d0" },
  { val:"6S",      icon:"🧹",  label:"6S / Housekeeping",      color:"#0f766e", bg:"#f0fdfa", border:"#99f6e4" },
  { val:"ENRG",    icon:"🔋",  label:"Năng lượng",             color:"#7c3aed", bg:"#faf5ff", border:"#ddd6fe" },
  { val:"OTHER",   icon:"📋",  label:"Khác",                   color:"#64748b", bg:"#f8fafc", border:"#e2e8f0" },
];

/* ─── Module-level constants (NOT inside component) ─────── */
const INJURY_TYPES = [
  { val:"near_miss", label:"Cận nguy",       color:"#16a34a", desc:"Không có thương tích" },
  { val:"first_aid", label:"Sơ cứu tại chỗ", color:"#ca8a04", desc:"Không cần bác sĩ" },
  { val:"mtc",       label:"MTC",            color:"#d97706", desc:"Cần điều trị y tế" },
  { val:"lti",       label:"LTI",            color:"#dc2626", desc:"Mất ngày làm việc" },
  { val:"fat",       label:"FAT",            color:"#7c2d12", desc:"Tử vong" },
];
const RCA_METHODS = [
  { val:"5why",     label:"5-Why",               icon:"🔍", desc:"Phân tích chuỗi 5 cấp",           best:"Phù hợp: cảnh báo, PCCC" },
  { val:"fishbone", label:"Fishbone",             icon:"🐟", desc:"Phân tích đa yếu tố",              best:"Phù hợp: tai nạn, sự cố" },
  { val:"gap",      label:"Gap Analysis",         icon:"📊", desc:"So sánh thực tế vs tiêu chuẩn",   best:"Phù hợp: Audit, kiểm tra" },
  { val:"free",     label:"Tự do",                icon:"📝", desc:"Mô tả tự do",                     best:"Phù hợp: cải tiến chủ động" },
  { val:"risk",     label:"Rủi ro",               icon:"🎯", desc:"Đánh giá mức rủi ro 5×5",         best:"Trước & sau khắc phục" },
];
const NC_SEVERITY = [
  { val:"critical", label:"Critical NC", color:"#dc2626", desc:"Vi phạm nghiêm trọng" },
  { val:"major",    label:"Major NC",    color:"#d97706", desc:"Lỗi hệ thống" },
  { val:"minor",    label:"Minor NC",    color:"#16a34a", desc:"Lỗi nhỏ" },
  { val:"obs",      label:"Observation", color:"#0369a1", desc:"Cơ hội cải tiến" },
];
const VERIFY_METHODS = [
  "Quan sát tại hiện trường","Đo lường / kiểm tra thiết bị",
  "Audit / Kiểm tra lại","Phỏng vấn nhân sự liên quan",
  "Review tài liệu / biên bản","KPI dashboard / Báo cáo định kỳ","Khác (tự nhập)",
];
function fmtDate(d:string):string { return d?d.split("-").reverse().join("/"):"—"; }

/* ─── Props ──────────────────────────────────────────────── */
interface Props {
  departments?: any[];
  onClose: () => void;
  onCreated?: (action:any) => void;
  prefill?: { title?:string; description?:string; sourceType?:string; sourceId?:string; sourceCode?:string; departmentCode?:string; topic?:string; priority?:string; problemType?:string; };
}

/* ─── Step-5 card helpers (module-level — must NOT be inside render) ─── */
function S5Card({ accent, children, onEdit }: { accent:string; children:React.ReactNode; onEdit?:()=>void }) {
  return (
    <div style={{ background:"#fff", borderRadius:13, overflow:"hidden", boxShadow:"0 2px 8px rgba(0,0,0,.07)", border:`1px solid ${accent}30` }}>
      <div style={{ display:"flex", height:"100%" }}>
        <div style={{ width:5, flexShrink:0, background:accent, borderRadius:"13px 0 0 13px" }}/>
        <div style={{ flex:1, padding:"13px 15px", position:"relative" }}>
          {onEdit && (
            <button onClick={onEdit} style={{ position:"absolute", top:10, right:10, padding:"3px 9px", borderRadius:6, border:"1px solid #e2e8f0", background:"#f1f5f9", cursor:"pointer", color:"#475569", fontSize:12, fontWeight:700, display:"flex", alignItems:"center", gap:3 }}>✏️ Sửa</button>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}
function S5Label({ children }: { children:React.ReactNode }) {
  return (
    <div style={{ fontSize:11.5, fontWeight:900, color:"#475569", letterSpacing:"0.07em", textTransform:"uppercase" as const, marginBottom:7, display:"flex", alignItems:"center", gap:5 }}>{children}</div>
  );
}

/* ══════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════ */
export function CreateCapaModal({ departments=[], onClose, onCreated, prefill={} }: Props) {
  const [step, setStep] = useState(1);
  const [srcTypeId, setSrcTypeId] = useState(prefill.sourceType||"");
  const [srcRecord, setSrcRecord] = useState<any>(null);
  const [records, setRecords] = useState<any[]>([]);
  const [loadingRec, setLoadingRec] = useState(false);
  /* snapshot of values that were auto-filled when a source record was picked */
  const [autoSnap, setAutoSnap] = useState<Record<string,any>>({});
  /* amber only when current value still equals what was auto-filled */
  function isAuto(field: string, val: any) {
    if (!srcRecord || !(field in autoSnap)) return false;
    return val === autoSnap[field];
  }

  /* Step 2 — Core */
  const [capaType, setCapaType] = useState("");
  const [title, setTitle]       = useState(prefill.title||"");
  const [occurDate, setOccurDate] = useState("");
  const [priority, setPriority] = useState(prefill.priority||"medium");
  const [topic, setTopic]       = useState(prefill.topic||"");
  const [topicCustom, setTopicCustom] = useState("");
  const [problemContent, setProblemContent] = useState(prefill.description||"");
  const [initialCause, setInitialCause]     = useState("");
  /* Step 3 — Action plan table */
  const [actionItems, setActionItems] = useState<ActionItem[]>([newActionItem()]);
  const [problemType, setProblemType] = useState(prefill.problemType||"");
  const [rcaMethod, setRcaMethod] = useState("5why");
  const [whys, setWhys]         = useState(["","","","",""]);
  const [rootCause, setRootCause] = useState("");
  const [freeAnalysis, setFreeAnalysis] = useState("");
  const [fishbone, setFishbone] = useState<Record<string,string>>({ man:"", machine:"", environment:"", method:"", material:"", measurement:"" });
  const [gapActual, setGapActual]       = useState("");
  const [gapStandard, setGapStandard]   = useState("");

  /* Conditional */
  const [containment, setContainment] = useState("");
  const [injuryType, setInjuryType]   = useState("");
  const [affectedCount, setAffectedCount] = useState("");
  const [reportedAuth, setReportedAuth]   = useState("");
  const [reportedDate, setReportedDate]   = useState("");
  const [reportedOrg, setReportedOrg]     = useState("");
  const [fireType, setFireType]     = useState("");
  const [fireArea, setFireArea]     = useState("");
  const [ncCount, setNcCount]       = useState("");
  const [ncSeverity, setNcSeverity] = useState("");
  const [ncRef, setNcRef]           = useState("");

  /* Location & reporter */
  const [occurLocation, setOccurLocation] = useState("");
  const [occurLocationCustom, setOccurLocationCustom] = useState("");
  const [reporterName, setReporterName]   = useState("");

  /* Step 3 */
  const [depts, setDepts]       = useState<string[]>(prefill.departmentCode?[prefill.departmentCode]:[]);
  const [deptPickerOpen, setDeptPickerOpen] = useState(false);
  const [area, setArea]         = useState("");
  const [areaCustom, setAreaCustom] = useState("");
  const [allPersonnel, setAllPersonnel] = useState<typeof PERSONNEL>(PERSONNEL);
  const [allLocations, setAllLocations] = useState<string[]>([]);

  useEffect(() => {
    /* Tải danh sách nhân sự từ API */
    fetch("/api/admin/users", { credentials:"include" })
      .then(r=>r.ok?r.json():null)
      .then((res:any) => {
        const data = Array.isArray(res) ? res : (Array.isArray(res?.data) ? res.data : null);
        if (data && data.length > 0) {
          const mapped = data.map((u:any) => ({
            name: u.displayName || u.username || "",
            dept: u.departmentId || u.department || u.departmentCode || "",
            role: u.role === "admin" ? "Quản trị viên" : u.role || "Nhân viên",
          })).filter((u:any) => u.name);
          if (mapped.length > 0) {
            /* Merge: API trước, fallback PERSONNEL sau (loại trùng tên) */
            const names = new Set(mapped.map((u:any) => u.name));
            const merged = [...mapped, ...PERSONNEL.filter(p => !names.has(p.name))];
            setAllPersonnel(merged);
          }
        }
      }).catch(() => {});
    /* Tải danh sách địa điểm từ API */
    fetch("/api/locations", { credentials:"include" })
      .then(r=>r.ok?r.json():null)
      .then((data:any) => {
        if (Array.isArray(data) && data.length > 0) {
          const names = data.map((l:any) => l.name || l.area || l.label || "").filter(Boolean);
          if (names.length > 0) setAllLocations(names);
        }
      }).catch(() => {});
  }, []);
  const [deadline, setDeadline] = useState(new Date(Date.now()+7*86400000).toISOString().slice(0,10));
  const [verifyDate, setVerifyDate] = useState("");
  const [verifyMethod, setVerifyMethod] = useState("");
  const [verifyMethodCustom, setVerifyMethodCustom] = useState("");
  const [persons, setPersons]   = useState<string[]>([]);
  const [personInput, setPersonInput] = useState("");
  const [reviewers, setReviewers] = useState<string[]>([]);
  const [reviewerInput, setReviewerInput] = useState("");
  const [riskBeforeL, setRiskBeforeL] = useState(0);
  const [riskBeforeC, setRiskBeforeC] = useState(0);
  const [riskAfterL, setRiskAfterL] = useState(0);
  const [riskAfterC, setRiskAfterC] = useState(0);
  const [showRiskHint, setShowRiskHint] = useState(false);

  /* Photo / file attachments */
  const [beforePhotos, setBeforePhotos] = useState<PhotoEntry[]>([]);
  const [afterPhotos,  setAfterPhotos]  = useState<PhotoEntry[]>([]);
  const [attachedFiles,setAttachedFiles]= useState<FileAttachEntry[]>([]);
  const addBeforePhotos = useCallback((entries:PhotoEntry[]) => setBeforePhotos(p=>[...p,...entries]), []);
  const addAfterPhotos  = useCallback((entries:PhotoEntry[]) => setAfterPhotos(p=>[...p,...entries]),  []);

  /* Submit */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");

  const cond = getConditionalFields(srcTypeId);
  const srcType  = SOURCE_TYPES.find(s=>s.id===srcTypeId);
  const prio     = PRIORITIES.find(p=>p.val===priority)??null;
  const isManual = srcTypeId==="manual";
  const topicFinal = topic==="Khác" ? topicCustom.trim() : topic;
  const areaFinal  = area==="Khác (nhập tự do)" ? areaCustom.trim() : area;

  /* Lock body scroll while modal is open */
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  /* Auto-suggest verify date from deadline */
  useEffect(() => {
    if (deadline && !verifyDate) {
      const d = new Date(deadline); d.setDate(d.getDate()+30);
      setVerifyDate(d.toISOString().split("T")[0]);
    }
  }, [deadline]);

  /* Khi vào Step 4: kế thừa persons đã phân công trong Step 3's actionItems */
  useEffect(() => {
    if (step !== 4) return;
    const fromActions = actionItems.flatMap(it => it.persons ?? []).filter(Boolean);
    if (fromActions.length === 0) return;
    setPersons(prev => {
      const merged = [...prev];
      fromActions.forEach(p => { if (!merged.includes(p)) merged.push(p); });
      return merged;
    });
  }, [step]);

  /* Fetch real records when source type changes */
  useEffect(() => {
    const api = SOURCE_TYPES.find(s=>s.id===srcTypeId)?.api;
    if (!api) { setRecords([]); return; }
    setLoadingRec(true); setRecords([]);
    fetch(api, { credentials:"include" })
      .then(r=>r.ok?r.json():[])
      .then((data:any) => {
        // normalize: some endpoints return { items, total }, others return raw arrays
        const rows:any[] = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
        let mapped:any[] = [];
        if (srcTypeId==="warning")         mapped = rows.map(mapWarning);
        else if (srcTypeId==="incident")   mapped = rows.map(mapIncident);
        else if (srcTypeId==="inspection") mapped = rows.map(mapInspection);
        /* Sort: chưa có CAPA lên đầu, đã có CAPA xuống cuối */
        mapped.sort((a,b)=>(a.capaId?1:0)-(b.capaId?1:0));
        setRecords(mapped);
      })
      .catch(()=>setRecords([]))
      .finally(()=>setLoadingRec(false));
  }, [srcTypeId]);

  function pickType(id:string) {
    setSrcTypeId(id); setSrcRecord(null);
    const cf = getConditionalFields(id);
    setRcaMethod(cf.rcaMethodDefault);
    if (id==="manual") {
      setTitle(prefill.title||""); setProblemContent(prefill.description||"");
      setInitialCause(""); setTopic(prefill.topic||"");
      setPriority(prefill.priority||"medium"); setCapaType(""); setContainment("");
      setRootCause(""); setWhys(["","","","",""]); setProblemType(prefill.problemType||"");
      setAutoSnap({}); setActionItems([newActionItem()]);
    }
  }

  function pickRecord(rec:any) {
    setSrcRecord(rec);
    const snap_deadline = rec.suggestDeadline||new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const snap_problemType = rec.suggestProblem || TOPIC_TO_PROBLEM_TYPE[rec.suggestTopic] || "OTHER";
    const snap_persons = rec.suggestPerson ? rec.suggestPerson : "";
    setAutoSnap({
      title: rec.suggestTitle,
      desc: rec.suggestDesc,
      topic: rec.suggestTopic,
      priority: rec.suggestPriority,
      occurDate: rec.suggestOccurDate||"",
      reporter: rec.reporter||"",
      problemType: snap_problemType,
      deadline: snap_deadline,
      persons: snap_persons,
    });
    setTitle(rec.suggestTitle);
    setTopic(rec.suggestTopic); setPriority(rec.suggestPriority);
    setDepts(rec.suggestDept?[rec.suggestDept]:[]);
    setArea(rec.suggestArea||"");
    setPersons(rec.suggestPerson?[rec.suggestPerson]:[]);
    setDeadline(snap_deadline);
    setOccurDate(rec.suggestOccurDate||"");
    setCapaType(rec.suggestCapaType||"");
    setRcaMethod(rec.suggestRcaMethod||"5why");
    setProblemType(snap_problemType);
    if (rec.reporter) setReporterName(rec.reporter);
    /* Pre-fill first action item from suggest */
    const suggestType = rec.suggestCapaType==="pa"?"PA":rec.suggestCapaType==="both"?"Both":"CA";
    setActionItems([{
      id: crypto.randomUUID(),
      action: rec.suggestDesc||"",
      type: suggestType as ActionItem["type"],
      persons: rec.suggestPerson?[rec.suggestPerson]:[],
      deadline: snap_deadline,
      progress: "",
      note: "",
    }, newActionItem(snap_deadline, suggestType as ActionItem["type"])]);
    /* Inherit attachments from source record */
    if (rec.attachments && rec.attachments.length > 0) {
      const inherited: FileAttachEntry[] = rec.attachments
        .map((a:any, i:number) => {
          const n = (a.name||"").toLowerCase();
          let ft: 'pdf'|'excel'|'word'|null = null;
          if (n.endsWith(".pdf")) ft = "pdf";
          else if (n.endsWith(".xlsx")||n.endsWith(".xls")) ft = "excel";
          else if (n.endsWith(".docx")||n.endsWith(".doc")) ft = "word";
          if (!ft) return null;
          return { id:`src-${i}-${Date.now()}`, name:a.name, size:parseFloat(a.size||0)*1024*1024, fileType:ft, url:"" };
        })
        .filter(Boolean) as FileAttachEntry[];
      setAttachedFiles(inherited);
    } else {
      setAttachedFiles([]);
    }
    setBeforePhotos([]); setAfterPhotos([]);
  }

  function toggleDept(d:string) { setDepts(p=>p.includes(d)?p.filter(x=>x!==d):[...p,d]); }
  function applyKhoi(k:typeof KHOI[0]) {
    const all = k.depts.every(d=>depts.includes(d));
    if (all) setDepts(p=>p.filter(d=>!k.depts.includes(d)));
    else setDepts(p=>Array.from(new Set([...p,...k.depts])));
  }

  const canNext1 = srcTypeId!==""&&(isManual||srcRecord!==null||(!!srcType&&!srcType.api));
  const needCA = capaType==="ca"||capaType==="both";
  const needPA = capaType==="pa"||capaType==="both";
  /* Step 2: basic info — title, topic, priority, CAPA type, problem description, conditional */
  const canNext2 = title.trim()!==""&&problemContent.trim()!==""&&capaType!==""&&topic!==""&&
    (topic!=="Khác"||topicCustom.trim()!=="")&&priority!==""&&
    (!cond.showInjury||injuryType!=="")&&(!cond.showContainment||containment.trim()!=="");
  /* Step 3: at least one action item with action text + type filled */
  const hasValidAction = actionItems.some(i=>i.action.trim()&&i.type);
  const canNext3 = hasValidAction;
  const caCount = actionItems.filter(i=>i.type==="CA"||i.type==="Both").length;
  const paCount = actionItems.filter(i=>i.type==="PA"||i.type==="Both").length;
  /* Step 4: assignment */
  const canNext4 = depts.length>0&&persons.length>0&&deadline!==""&&verifyDate!=="";
  const canSubmit = canNext1&&canNext2&&canNext3&&canNext4;

  const missing2 = [
    !title.trim()&&"Tiêu đề",!problemContent.trim()&&"Mô tả vấn đề",
    !topic&&"Chuyên đề",topic==="Khác"&&!topicCustom.trim()&&"Tên chuyên đề",
    !priority&&"Mức ưu tiên",!capaType&&"Loại CAPA",
    cond.showInjury&&!injuryType&&"Loại thương tật",
    cond.showContainment&&!containment.trim()&&"Biện pháp ngăn chặn tức thời",
  ].filter(Boolean) as string[];
  const missing3 = [
    !hasValidAction&&"Ít nhất 1 hành động (có Loại CA/PA)",
  ].filter(Boolean) as string[];
  const missing4 = [depts.length===0&&"Bộ phận phụ trách",!deadline&&"Hạn xử lý",persons.length===0&&"Người thực hiện",!verifyDate&&"Ngày kiểm tra hiệu lực"].filter(Boolean) as string[];

  /* Build rich description for API */
  function buildDescription():string|null {
    const parts:string[] = [];
    if (problemContent.trim()) parts.push(`[Vấn đề] ${problemContent.trim()}`);
    if (initialCause.trim()) parts.push(`[Nguyên nhân ban đầu] ${initialCause.trim()}`);
    if (containment.trim()) parts.push(`[Ngăn chặn tức thời] ${containment.trim()}`);
    const filledItems = actionItems.filter(i=>i.action.trim()&&i.type);
    if (filledItems.length>0) {
      const lines = filledItems.map((it,idx)=>{
        let line = `  ${idx+1}. [${it.type}] ${it.action.trim()}`;
        if (it.persons?.length) line += ` | Người TH: ${it.persons.join(", ")}`;
        if (it.deadline) line += ` | Hạn: ${fmtDate(it.deadline)}`;
        if (it.progress) line += ` | TĐ: ${it.progress}%`;
        if (it.note) line += ` | Ghi chú: ${it.note}`;
        return line;
      });
      parts.push(`[Kế hoạch hành động]\n${lines.join("\n")}`);
    }
    if (rootCause.trim()) {
      const methodNames:any={"5why":"5-Why",fishbone:"Fishbone",gap:"Gap Analysis",free:"Tự phân tích"};
      let rcaTxt = `[RCA - ${methodNames[rcaMethod]||rcaMethod}] ${rootCause.trim()}`;
      if (rcaMethod==="5why") {
        const fw = whys.filter(w=>w.trim());
        if (fw.length) rcaTxt += "\n" + fw.map((w,i)=>`  Why${i+1}: ${w}`).join("\n");
      } else if (rcaMethod==="fishbone") {
        const fLines = Object.entries(fishbone).filter(([,v])=>v.trim()).map(([k,v])=>`  ${k}: ${v}`);
        if (fLines.length) rcaTxt += "\n" + fLines.join("\n");
      } else if (rcaMethod==="gap") {
        if (gapActual.trim()) rcaTxt += `\n  Thực tế: ${gapActual.trim()}`;
        if (gapStandard.trim()) rcaTxt += `\n  Tiêu chuẩn: ${gapStandard.trim()}`;
      } else if (freeAnalysis.trim()) {
        rcaTxt += `\n${freeAnalysis.trim()}`;
      }
      parts.push(rcaTxt);
    }
    if (injuryType) parts.push(`[Thương tật] ${injuryType}${affectedCount?` · ${affectedCount} người`:""}`);
    if (ncSeverity) parts.push(`[NC] ${ncSeverity}${ncCount?` · ${ncCount} hạng mục`:""}${ncRef?` · Tham chiếu: ${ncRef}`:""}`);
    if (verifyMethod) parts.push(`[Kiểm tra hiệu lực] ${verifyDate?fmtDate(verifyDate):""} · ${verifyMethod==="Khác (tự nhập)"?(verifyMethodCustom||"Khác"):verifyMethod}`);
    const riskBefore = riskBeforeL*riskBeforeC;
    const riskAfter  = riskAfterL*riskAfterC;
    if (riskBefore>0) parts.push(`[Điểm rủi ro ban đầu] ${riskBefore}/25 · ${riskLabel(riskBefore)}`);
    if (riskAfter>0)  parts.push(`[Điểm rủi ro sau KP] ${riskAfter}/25 · ${riskLabel(riskAfter)}`);
    const photoLines:string[] = [];
    if (beforePhotos.length>0) photoLines.push(`Ảnh hiện trạng: ${beforePhotos.map(f=>f.name).join(", ")}`);
    if (afterPhotos.length>0)  photoLines.push(`Ảnh sau khắc phục: ${afterPhotos.map(f=>f.name).join(", ")}`);
    if (attachedFiles.length>0)photoLines.push(`Tài liệu đính kèm: ${attachedFiles.map(f=>f.name).join(", ")}`);
    if (photoLines.length>0) parts.push(`[Ảnh / Tài liệu] ${photoLines.join(" | ")}`);
    return parts.length>0 ? parts.join("\n\n") : null;
  }

  const submit = async () => {
    setSubmitting(true); setError("");
    try {
      const filledActions = actionItems.filter(i=>i.action.trim()&&i.type);
      const body:any = {
        title: title.trim(),
        description: buildDescription(),
        sourceType: srcTypeId||"manual",
        departmentCode: depts[0]||undefined,
        departments: depts.length>0?depts:undefined,
        ownerName: persons[0]||undefined,
        assignees: persons.length>0?persons:undefined,
        reviewers: reviewers.length>0?reviewers:undefined,
        dueDate: deadline,
        verifyDate: verifyDate||null,
        priority: priority||"medium",
        topic: topicFinal||null,
        problemType: problemType||null,
        area: areaFinal||null,
        capaType: capaType||null,
        occurDate: occurDate||null,
        rcaMethod: rcaMethod||null,
        actionPlan: filledActions.length>0 ? filledActions.map(it=>({
          action: it.action.trim(),
          type: it.type,
          persons: it.persons||[],
          person: (it.persons||[]).join(", ")||null,
          deadline: it.deadline||null,
          progress: it.progress?+it.progress:0,
          note: it.note||null,
        })) : undefined,
        persons: persons.length>0 ? persons : undefined,
      };
      if (srcRecord?.id)   body.sourceId   = srcRecord.id;
      if (srcRecord?.code) body.sourceCode = srcRecord.code;

      const res = await fetch("/api/actions", {
        method:"POST",
        headers:{ "Content-Type":"application/json" },
        credentials:"include",
        body:JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      onCreated?.(await res.json());
      onClose();
    } catch(e:any) {
      setError(e.message||"Lỗi khi tạo CAPA");
    } finally { setSubmitting(false); }
  };

  /* ─── RENDER ─────────────────────────────────────────── */
  return createPortal(
    <div role="presentation" onMouseDown={e=>{ if(e.target===e.currentTarget)onClose(); }} style={{
      position:"fixed", inset:0, background:"rgba(15,23,42,0.65)",
      display:"flex", alignItems:"center", justifyContent:"center", zIndex:1700,
      fontFamily:"'Inter','Segoe UI',system-ui,sans-serif", fontSize:14,
    }}>
      <div role="dialog" aria-modal="true" aria-label="Tạo CAPA mới"
        className="capa-v3-modal"
        onMouseDown={e=>e.stopPropagation()}
        onClick={e=>e.stopPropagation()}
        style={{
          width:1060, maxWidth:"calc(100vw - 20px)", height:"calc(100vh - 32px)", maxHeight:900,
          background:"#f0f4fa", borderRadius:20, boxShadow:"0 28px 90px rgba(0,0,0,.25)",
          overflow:"hidden", display:"flex", flexDirection:"column",
        }}>

        {/* Header */}
        <div style={{ background:"#fff", padding:"13px 24px 0", flexShrink:0, borderBottom:"1px solid transparent" }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:11 }}>
            <div style={{ width:38, height:38, borderRadius:11, background:"linear-gradient(135deg,#1e40af,#7c3aed)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", flexShrink:0, boxShadow:"0 4px 12px rgba(30,64,175,.30)" }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
                <line x1="12" y1="18" x2="12" y2="12"/>
                <line x1="9" y1="15" x2="15" y2="15"/>
              </svg>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:16, fontWeight:800, color:"#0f172a", letterSpacing:"-0.01em" }}>Tạo CAPA mới</div>
              <div style={{ fontSize:12, color:"#64748b", marginTop:1 }}>Bước {step} / 5 — <span style={{ color:"#1e40af", fontWeight:600 }}>{STEPS.find(s=>s.num===step)?.label}</span></div>
            </div>
            {(capaType||priority) && (
              <div style={{ display:"flex", alignItems:"center", gap:6, fontSize:13, background:"#f8fafc", border:"1.5px solid #e2e8f0", borderRadius:10, padding:"4px 12px", flexShrink:0 }}>
                {capaType ? <span style={{ fontWeight:800, color:"#1e40af" }}>{capaType==="both"?"CA+PA":capaType.toUpperCase()}</span> : null}
                {capaType && priority ? <span style={{ color:"#cbd5e1", margin:"0 2px" }}>·</span> : null}
                {priority ? <span style={{ color: prio?.color||"#64748b", fontWeight:700 }}>{prio?.label}</span> : null}
              </div>
            )}
            <button onClick={onClose} style={{ background:"#f1f5f9", border:"1.5px solid #e2e8f0", borderRadius:8, width:32, height:32, cursor:"pointer", color:"#64748b", fontSize:14, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, transition:"all .12s" }}
              onMouseEnter={e=>(e.currentTarget.style.background="#fee2e2",e.currentTarget.style.color="#dc2626")}
              onMouseLeave={e=>(e.currentTarget.style.background="#f1f5f9",e.currentTarget.style.color="#64748b")}>✕</button>
          </div>
        </div>

        {/* Step bar */}
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
                    <span className="capa-v3-step-lbl" style={{
                      color:active?"#1e3a8a":done?"#15803d":"#374151",
                      fontWeight:active||done?700:600,
                    }}>{s.label}</span>
                  </div>
                  {i<STEPS.length-1 && <div className="capa-v3-step-div" style={{
                    background:done?"linear-gradient(90deg,#86efac,#4ade80)":"#e2e8f0",
                  }}/>}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className={`v3-body${step===3?" v3-body--step3":""}`}>

          {/* ══ STEP 1 ══ */}
          {step===1 && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

              {/* ── Chưa chọn: grid 3×2 đầy đủ ── */}
              {!srcTypeId && (<>
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  <div style={{ width:4, height:20, borderRadius:3, background:"linear-gradient(180deg,#3b82f6,#6366f1)", flexShrink:0 }} />
                  <span style={{ fontSize:12.5, fontWeight:800, color:"#1e293b", letterSpacing:"0.06em", textTransform:"uppercase" }}>Chọn loại nguồn phát sinh</span>
                </div>
                <div className="v3-src-grid">
                  {SOURCE_TYPES.map(s => (
                    <button key={s.id} onClick={()=>pickType(s.id)} style={{
                      padding:0, borderRadius:12, cursor:"pointer", textAlign:"left",
                      border:"1.5px solid #c8d4e2", background:"#fff",
                      boxShadow:"0 2px 8px rgba(0,0,0,.09)", transition:"all .16s", overflow:"hidden" }}>
                      <div style={{ padding:"10px 13px 9px", background:s.bg, borderBottom:`1.5px solid ${s.border}`, display:"flex", alignItems:"center", gap:8 }}>
                        <span style={{ fontSize:22, lineHeight:1 }}>{s.icon}</span>
                        <span style={{ fontSize:14, fontWeight:800, color:s.color, flex:1 }}>{s.label}</span>
                      </div>
                      <div style={{ padding:"8px 13px 9px", fontSize:12, lineHeight:1.5, fontWeight:500, color:"#475569" }}>{s.hint}</div>
                    </button>
                  ))}
                </div>
              </>)}

              {/* ── Đã chọn: thu gọn thành pills ngang ── */}
              {srcTypeId && (
                <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <span style={{ fontSize:12, fontWeight:700, color:"#64748b", flexShrink:0 }}>Nguồn:</span>
                  {SOURCE_TYPES.map(s => {
                    const active=srcTypeId===s.id;
                    return (
                      <button key={s.id} onClick={()=>pickType(s.id)} style={{
                        padding:"5px 11px", borderRadius:20, cursor:"pointer",
                        border:active?`2px solid ${s.color}`:"1.5px solid #d1d9e6",
                        background:active?s.color:"#fff",
                        color:active?"#fff":"#475569",
                        fontSize:12.5, fontWeight:active?800:600,
                        display:"flex", alignItems:"center", gap:5,
                        boxShadow:active?`0 2px 8px ${s.color}40`:"none",
                        transition:"all .13s" }}>
                        <span style={{ fontSize:14 }}>{s.icon}</span>
                        <span>{s.label}</span>
                        {active && <span style={{ fontSize:11, opacity:.85 }}>✓</span>}
                      </button>
                    );
                  })}
                </div>
              )}

              {isManual && (
                <div style={{ padding:"13px", borderRadius:10, border:"1.5px dashed #e2e8f0", background:"#f8fafc", display:"flex", gap:12 }}>
                  <div style={{ fontSize:28 }}>✏️</div>
                  <div>
                    <div style={{ fontSize:15, fontWeight:800, color:"#1e293b", marginBottom:3 }}>Tạo CAPA thủ công</div>
                    <div style={{ fontSize:13, color:"#475569", lineHeight:1.6 }}>Điền toàn bộ thông tin ở các bước tiếp theo. Phù hợp cho hành động cải tiến chủ động.</div>
                  </div>
                </div>
              )}

              {srcType && !isManual && (
                <div>
                  <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:7 }}>
                    <span style={{ fontSize:12, fontWeight:800, color:"#374151" }}>Chọn {srcType.label} cần tạo CAPA</span>
                    <span style={{ fontSize:11.5, color:"#94a3b8", fontWeight:500 }}>— bấm để tự điền thông tin</span>
                  </div>

                  {!srcType.api ? (
                    <div style={{ padding:"18px", borderRadius:10, border:"1.5px dashed #e2e8f0", background:"#f8fafc", textAlign:"center" }}>
                      <div style={{ fontSize:22, marginBottom:6 }}>{srcType.icon}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:"#475569", marginBottom:3 }}>Nhập thủ công</div>
                      <div style={{ fontSize:13, color:"#94a3b8" }}>Điền thông tin {srcType.label.toLowerCase()} ở bước tiếp theo</div>
                    </div>
                  ) : loadingRec ? (
                    <div style={{ padding:"28px", textAlign:"center", borderRadius:10, border:"1.5px dashed #e2e8f0", background:"#f8fafc" }}>
                      <div style={{ fontSize:13, color:"#94a3b8" }}>⏳ Đang tải danh sách...</div>
                    </div>
                  ) : records.length===0 ? (
                    <div style={{ padding:"28px", borderRadius:10, border:"1.5px dashed #e2e8f0", background:"#f8fafc", textAlign:"center" }}>
                      <div style={{ fontSize:26, marginBottom:7 }}>🎉</div>
                      <div style={{ fontSize:14, fontWeight:700, color:"#475569" }}>Không có mục nào cần xử lý</div>
                      <div style={{ fontSize:13, color:"#94a3b8", marginTop:4 }}>Tất cả đã được xử lý hoặc đã có CAPA</div>
                    </div>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {/* Banner tóm tắt trạng thái */}
                      {(() => {
                        const withCapa = records.filter(r=>r.capaId).length;
                        const withoutCapa = records.length - withCapa;
                        if (withCapa === 0) return null;
                        return (
                          <div style={{ padding:"7px 12px", borderRadius:8, background:"#fffbeb", border:"1.5px solid #fbbf24", display:"flex", alignItems:"center", gap:8, fontSize:12.5, flexWrap:"wrap" }}>
                            <span>🔗</span>
                            <span style={{ color:"#92400e", fontWeight:700 }}>{withCapa} mục đã có CAPA</span>
                            <span style={{ color:"#78350f", opacity:.5 }}>·</span>
                            <span style={{ color:"#065f46", fontWeight:700 }}>{withoutCapa} mục chưa có — ưu tiên trước</span>
                            <span style={{ color:"#78350f", opacity:.6, fontSize:12 }}>· Có thể vẫn chọn để tạo thêm</span>
                          </div>
                        );
                      })()}
                      {/* Danh sách compact — scroll khi nhiều mục */}
                      <div style={{ maxHeight:320, overflowY:"auto", display:"flex", flexDirection:"column", gap:4, paddingRight:1 }}>
                      {records.map((rec:any) => {
                        const sel = srcRecord?.id === rec.id;
                        const hasCapa = !!rec.capaId;
                        /* Risk badge color */
                        const riskLc = (rec.risk||"").toLowerCase();
                        const riskMeta = riskLc.includes("khẩn") || riskLc.includes("critical") || riskLc.includes("nghiêm")
                          ? { bg:"#fee2e2", color:"#b91c1c", dot:"#ef4444" }
                          : riskLc.includes("cao") || riskLc.includes("high")
                          ? { bg:"#ffedd5", color:"#c2410c", dot:"#f97316" }
                          : riskLc.includes("trung") || riskLc.includes("medium")
                          ? { bg:"#fef9c3", color:"#854d0e", dot:"#eab308" }
                          : riskLc.includes("thấp") || riskLc.includes("low")
                          ? { bg:"#dcfce7", color:"#15803d", dot:"#22c55e" }
                          : { bg:"#f1f5f9", color:"#475569", dot:"#94a3b8" };
                        /* Stripe color */
                        const stripeColor = sel ? srcType.color : hasCapa ? "#f59e0b" : "#d1d9e6";
                        return (
                          <button key={rec.id} onClick={()=>pickRecord(rec)}
                            className="v3-rec-card"
                            style={{
                              width:"100%", textAlign:"left", padding:0, borderRadius:9, cursor:"pointer",
                              border: sel ? `2px solid ${srcType.color}` : hasCapa ? "1.5px dashed #fbbf24" : "1.5px solid #dde4ef",
                              background: sel ? srcType.bg : "#fff",
                              boxShadow: sel ? `0 3px 12px ${srcType.color}28` : "0 1px 3px rgba(0,0,0,.07)",
                              opacity: hasCapa && !sel ? 0.65 : 1,
                              transition:"all .14s", flexShrink:0, overflow:"hidden",
                              display:"flex" }}>

                            {/* Left accent stripe */}
                            <div style={{ width:4, flexShrink:0, background:stripeColor, transition:"background .14s" }} />

                            {/* Content */}
                            <div style={{ flex:1, padding:"7px 10px 7px 9px", minWidth:0 }}>
                              {/* Dòng 1: radio + code + risk + capa-badge + title + reporter */}
                              <div style={{ display:"flex", alignItems:"center", gap:6, minWidth:0 }}>
                                {/* Radio dot */}
                                <div style={{ width:14, height:14, borderRadius:"50%", flexShrink:0,
                                  border:`2px solid ${sel ? srcType.color : "#b0bec9"}`,
                                  background: sel ? srcType.color : "#fff",
                                  display:"flex", alignItems:"center", justifyContent:"center" }}>
                                  {sel && <div style={{ width:4, height:4, borderRadius:"50%", background:"#fff" }}/>}
                                </div>
                                {/* Code */}
                                <span style={{ fontSize:11, fontFamily:"monospace", fontWeight:700,
                                  color: sel ? srcType.color : "#64748b",
                                  background: sel ? `${srcType.color}15` : "#f1f5f9",
                                  padding:"1px 5px", borderRadius:3, flexShrink:0 }}>{rec.code}</span>
                                {/* Risk badge */}
                                {rec.risk && (
                                  <span style={{ fontSize:10.5, fontWeight:700,
                                    color: riskMeta.color, background: riskMeta.bg,
                                    padding:"1px 6px", borderRadius:10, flexShrink:0,
                                    display:"flex", alignItems:"center", gap:3 }}>
                                    <span style={{ width:5, height:5, borderRadius:"50%", background:riskMeta.dot, display:"inline-block" }}/>
                                    {rec.risk.replace(/[🟢🟡🟠🔴]/u,"").trim()}
                                  </span>
                                )}
                                {/* CAPA badge */}
                                {hasCapa && (
                                  <span style={{ fontSize:10.5, fontWeight:800, color:"#92400e",
                                    background:"#fef3c7", border:"1px solid #fbbf24",
                                    padding:"1px 6px", borderRadius:10, flexShrink:0 }}>
                                    🔗{rec.capaCode ? ` ${rec.capaCode}` : " Đã có CAPA"}
                                  </span>
                                )}
                                {/* Title */}
                                <span style={{ fontSize:13, fontWeight:700,
                                  color: sel ? srcType.color : hasCapa ? "#78350f" : "#0f172a",
                                  flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                                  {rec.title}
                                </span>
                                {/* Reporter */}
                                <span style={{ fontSize:11, color:"#94a3b8", flexShrink:0, marginLeft:2 }}>{rec.reporter}</span>
                              </div>

                              {/* Dòng 2: meta + date */}
                              <div style={{ display:"flex", alignItems:"center", marginTop:3, paddingLeft:20, minWidth:0 }}>
                                <span style={{ fontSize:11.5, color:"#64748b", flex:1,
                                  overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{rec.meta}</span>
                                <span style={{ fontSize:11, color:"#b0bec9", flexShrink:0 }}>{rec.date}</span>
                              </div>

                              {/* Dòng 3 (chỉ khi chọn): suggest tags */}
                              {sel && (
                                <div style={{ marginTop:6, paddingTop:5, paddingLeft:20,
                                  borderTop:`1px dashed ${srcType.color}40`,
                                  display:"flex", gap:4, flexWrap:"wrap" }}>
                                  {[
                                    {k:"Loại", v:rec.suggestCapaType==="ca"?"CA":rec.suggestCapaType==="pa"?"PA":"CA+PA"},
                                    {k:"Ưu tiên", v:PRIORITIES.find(p=>p.val===rec.suggestPriority)?.label||rec.suggestPriority},
                                    {k:"Bộ phận", v:rec.suggestDept||"—"},
                                    {k:"Hạn", v:fmtDate(rec.suggestDeadline)},
                                  ].map(t=>(
                                    <span key={t.k} style={{ fontSize:11.5, padding:"2px 8px", borderRadius:5,
                                      background:"rgba(255,255,255,.92)",
                                      border:`1.5px solid ${srcType.color}40`,
                                      color:srcType.color, fontWeight:700 }}>
                                      <span style={{ opacity:.65 }}>{t.k}:</span> {t.v}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {srcRecord && srcRecord.capaId && (
                <div style={{ padding:"11px 14px", borderRadius:9, background:"#fffbeb", border:"2px solid #f59e0b", display:"flex", alignItems:"flex-start", gap:10 }}>
                  <span style={{ fontSize:20, flexShrink:0 }}>⚠️</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:"#92400e" }}>Nguồn này đã có CAPA liên kết</div>
                    <div style={{ fontSize:13, color:"#78350f", marginTop:3, lineHeight:1.55 }}>
                      {srcType?.icon} <strong>{srcRecord.code}</strong> đã được liên kết với{" "}
                      <strong>{srcRecord.capaCode || "một CAPA"}</strong>.
                      Vẫn có thể tiếp tục nếu muốn tạo CAPA thứ hai cho nguồn này.
                    </div>
                  </div>
                </div>
              )}
              {srcRecord && !srcRecord.capaId && (
                <div style={{ padding:"10px 13px", borderRadius:9, background:"#f0fdf4", border:"1.5px solid #86efac", display:"flex", alignItems:"center", gap:9 }}>
                  <span style={{ fontSize:18 }}>✅</span>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, color:"#15803d" }}>Đã chọn — thông tin sẽ tự điền ở bước tiếp</div>
                    <div style={{ fontSize:13, color:"#16a34a", marginTop:2 }}>{srcType?.icon} {srcRecord.code} · {srcRecord.title}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 2 ══ */}
          {step===2 && (
            <div style={{ display:"flex", flexDirection:"column", gap:14 }}>

              {srcRecord && srcType && (
                <div style={{ padding:"7px 13px", borderRadius:9, background:srcType.bg, border:`1.5px solid ${srcType.border}`, display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:15 }}>{srcType.icon}</span>
                  <span style={{ fontSize:13, fontWeight:800, color:srcType.color }}>{srcType.label}</span>
                  <span style={{ fontSize:13, fontWeight:600, color:"#1e293b", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{srcRecord.code} — {srcRecord.title}</span>
                  <span style={{ fontSize:13, color:"#b45309", flexShrink:0 }}>🟡 tự điền</span>
                </div>
              )}

              {/* ── §A Định danh ── */}
              <div style={{ background:"#fff", border:"1.5px solid #e2e8f0", borderRadius:12, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,.03)" }}>
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"9px 15px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0" }}>
                  <span style={{ fontSize:13, fontWeight:800, color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>📋 Định danh</span>
                  <span style={{ fontSize:13, color:"#64748b", fontWeight:500 }}>— tiêu đề, chuyên đề, vị trí</span>
                </div>
                <div style={{ padding:"13px 15px", display:"flex", flexDirection:"column", gap:9 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Tiêu đề CAPA <span style={{ color:"#ef4444" }}>*</span> {isAuto('title',title)&&<AutoTag/>}</div>
                    <input style={{ ...(isAuto('title',title)?INP_AUTO:INP), fontSize:14, fontWeight:600 }} value={title} onChange={e=>setTitle(e.target.value)} placeholder="Tóm tắt ngắn gọn vấn đề / hành động cần thực hiện..."/>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:8 }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>📅 Ngày xảy ra {isAuto('occurDate',occurDate)&&occurDate&&<AutoTag/>}</div>
                      <input type="date" style={isAuto('occurDate',occurDate)&&occurDate?INP_AUTO:INP} value={occurDate} onChange={e=>setOccurDate(e.target.value)} max={new Date().toISOString().split("T")[0]}/>
                    </div>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>Chuyên đề <span style={{ color:"#ef4444" }}>*</span> {isAuto('topic',topic)&&<AutoTag/>}</div>
                      <select style={isAuto('topic',topic)?INP_AUTO:INP} value={topic} onChange={e=>{setTopic(e.target.value);setTopicCustom("");}}>
                        <option value="">— Chọn —</option>
                        {TOPICS.map(t=><option key={t}>{t}</option>)}
                      </select>
                      {topic==="Khác" && <input style={{ ...INP, marginTop:5 }} value={topicCustom} onChange={e=>setTopicCustom(e.target.value)} placeholder="Nhập chuyên đề..." autoFocus/>}
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
                      <div style={{ fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:5 }}>👤 Báo cáo bởi {isAuto('reporter',reporterName)&&<AutoTag/>}</div>
                      <input style={isAuto('reporter',reporterName)?INP_AUTO:INP} value={reporterName} onChange={e=>setReporterName(e.target.value)} placeholder="Tên người phát hiện..."/>
                      {srcRecord?.reporter && !reporterName && (
                        <button onClick={()=>setReporterName(srcRecord.reporter)} style={{ marginTop:4, fontSize:12, color:"#b45309", background:"#fefce8", border:"1px solid #fef9c3", padding:"2px 7px", borderRadius:4, cursor:"pointer", fontWeight:600 }}>
                          + {srcRecord.reporter}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* ── §B Phân loại — 3 card độc lập ── */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>

                {/* Card 1: Mức ưu tiên */}
                <div style={{ background:"#fff", borderRadius:12, overflow:"hidden",
                  border:`1.5px solid ${priority&&prio?prio.border:"#e2e8f0"}`,
                  boxShadow:priority&&prio?`0 2px 10px ${prio.color}12`:"0 1px 4px rgba(0,0,0,.03)" }}>
                  <div style={{ padding:"8px 13px", background:priority&&prio?prio.bg:"#f8fafc", borderBottom:`1px solid ${priority&&prio?prio.border:"#e2e8f0"}` }}>
                    <span style={{ fontSize:12, fontWeight:800, color:priority&&prio?prio.color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                      Mức ưu tiên <span style={{ color:"#ef4444" }}>*</span> {isAuto('priority',priority)&&<AutoTag/>}
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
                  {priority==="critical" && (
                    <div style={{ marginTop:8, padding:"6px 9px", borderRadius:7, background:"#fef2f2", border:"1px solid #fca5a5", fontSize:12, color:"#dc2626", fontWeight:600, lineHeight:1.4 }}>
                      🚨 Khẩn cấp — xử lý trong 24–48h
                    </div>
                  )}
                  </div>
                </div>

                {/* Card 2: Loại CAPA */}
                <div style={{ background:"#fff", borderRadius:12, overflow:"hidden", border:"1.5px solid #bae6fd", boxShadow:"0 1px 6px rgba(3,105,161,.07)" }}>
                  <div style={{ padding:"8px 13px", background:"#f0f9ff", borderBottom:"1px solid #bae6fd" }}>
                    <span style={{ fontSize:12, fontWeight:800, color:"#0369a1", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                      Loại CAPA <span style={{ color:"#ef4444" }}>*</span>
                    </span>
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
                    <span style={{ fontSize:12, fontWeight:800, color:"#475569", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                      Loại vấn đề {isAuto('problemType',problemType)&&<AutoTag/>}
                    </span>
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
                  {!problemType && <div style={{ fontSize:12, color:"#94a3b8", fontStyle:"italic", marginTop:6 }}>Bấm chọn loại phù hợp ↑</div>}
                  </div>
                </div>
              </div>

              {/* ── §C Mô tả vấn đề — 2 cột song song ── */}
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
                      value={problemContent} onChange={e=>setProblemContent(e.target.value)}
                      onInput={autoGrow}
                      placeholder="Mô tả rõ sự kiện / vấn đề đã xảy ra: khi nào, ở đâu, ai liên quan, ảnh hưởng..."/>
                  </div>
                  <div>
                    <label style={{ ...LBL, marginBottom:6 }}>
                      <span style={{ display:"inline-block", width:20, height:20, borderRadius:"50%", background:"#d97706", color:"#fff", fontSize:12, fontWeight:800, textAlign:"center", lineHeight:"20px", marginRight:6 }}>2</span>
                      Nguyên nhân ban đầu
                      <span style={{ fontSize:12, color:"#64748b", fontWeight:500, marginLeft:5 }}>(phân tích sâu ở bước 3)</span>
                    </label>
                    <textarea rows={3} style={{ ...INP, fontSize:14, resize:"vertical", lineHeight:1.65, minHeight:90 }}
                      value={initialCause} onChange={e=>setInitialCause(e.target.value)}
                      onInput={autoGrow}
                      placeholder="Nhận định ban đầu về nguyên nhân gây ra vấn đề..."/>
                  </div>
                </div>
                </div>
              </div>

              {/* Conditional fields */}
              {(cond.showContainment||cond.showInjury||cond.showFireInfo||cond.showNcInfo) && (
                <div style={{ background:"#fafbfc", border:"1.5px solid #e2e8f0", borderRadius:12, overflow:"hidden" }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, padding:"9px 15px", background:"#fff7ed", borderBottom:"1px solid #fed7aa" }}>
                    <span style={{ fontSize:14 }}>{srcType?.icon}</span>
                    <span style={{ fontSize:13, fontWeight:800, color:"#c2410c", textTransform:"uppercase", letterSpacing:"0.06em" }}>
                      Trường bổ sung — {srcType?.label}
                    </span>
                    <NewBadge/>
                  </div>
                  <div style={{ padding:"12px 15px", display:"flex", flexDirection:"column", gap:11 }}>
                  {cond.showInjury && (
                    <div>
                      <label style={LBL}>Loại thương tật / Phân loại sự cố <Req/></label>
                      <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                        {INJURY_TYPES.map(it=>(
                          <button key={it.val} onClick={()=>setInjuryType(it.val)} style={{
                            padding:"6px 12px", borderRadius:7, cursor:"pointer", fontSize:13, fontWeight:700,
                            border:injuryType===it.val?`2px solid ${it.color}`:"1.5px solid #b4bfcf",
                            background:injuryType===it.val?it.color+"12":"#f5f7fb",
                            color:injuryType===it.val?it.color:"#1e293b", transition:"all .15s" }}>
                            {it.label}
                            <div style={{ fontSize:13, fontWeight:600, color:"#64748b", marginTop:2 }}>{it.desc}</div>
                          </button>
                        ))}
                      </div>
                      <div style={{ marginTop:8 }}>
                        <label style={LBL}>Số người bị ảnh hưởng</label>
                        <input style={{ ...INP, width:160 }} type="number" min={0} value={affectedCount} onChange={e=>setAffectedCount(e.target.value)} placeholder="0"/>
                      </div>
                    </div>
                  )}
                  {cond.showFireInfo && (
                    <div className="v3-grid2">
                      <div>
                        <label style={LBL}>Loại cháy</label>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                          {["A — Vật liệu rắn","B — Chất lỏng / Khí","C — Điện","D — Kim loại","K — Dầu mỡ"].map(f=>{
                            const v=f.split("—")[0].trim();
                            return <button key={v} onClick={()=>setFireType(v)} style={{ padding:"4px 10px", borderRadius:6, fontSize:13, fontWeight:600, cursor:"pointer", border:fireType===v?"2px solid #b91c1c":"1.5px solid #b4bfcf", background:fireType===v?"#fff1f2":"#f5f7fb", color:fireType===v?"#b91c1c":"#1e293b", transition:"all .15s" }}>{f}</button>;
                          })}
                        </div>
                      </div>
                      <div>
                        <label style={LBL}>Diện tích ảnh hưởng (m²)</label>
                        <input style={INP} type="number" min={0} value={fireArea} onChange={e=>setFireArea(e.target.value)} placeholder="0"/>
                      </div>
                    </div>
                  )}
                  {cond.showNcInfo && (
                    <div className="v3-grid2">
                      <div>
                        <label style={LBL}>Mức NC (Non-conformance)</label>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                          {NC_SEVERITY.map(nc=>(
                            <button key={nc.val} onClick={()=>setNcSeverity(nc.val)} style={{ padding:"5px 11px", borderRadius:7, fontSize:13, fontWeight:700, cursor:"pointer", border:ncSeverity===nc.val?`2px solid ${nc.color}`:"1.5px solid #b4bfcf", background:ncSeverity===nc.val?nc.color+"12":"#f5f7fb", color:ncSeverity===nc.val?nc.color:"#1e293b", transition:"all .15s" }}>
                              {nc.label}
                              <div style={{ fontSize:12, fontWeight:600, color:"#64748b" }}>{nc.desc}</div>
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label style={LBL}>Số hạng mục không đạt</label>
                        <input style={INP} type="number" min={0} value={ncCount} onChange={e=>setNcCount(e.target.value)} placeholder="0"/>
                        <label style={{ ...LBL, marginTop:8 }}>Điều khoản / Tiêu chuẩn</label>
                        <input style={INP} value={ncRef} onChange={e=>setNcRef(e.target.value)} placeholder="ISO 45001, TCVN 3890..."/>
                      </div>
                    </div>
                  )}
                  {cond.showContainment && (
                    <div>
                      <label style={LBL}>
                        Biện pháp ngăn chặn tức thời <Req/> <NewBadge/>
                        <span style={{ fontSize:13, fontWeight:600, color:"#64748b" }}>— đã làm gì ngay lúc phát hiện?</span>
                      </label>
                      <textarea rows={1} style={{ ...INP, resize:"vertical", lineHeight:1.6, minHeight:34, overflowY:"hidden" }}
                        value={containment} onChange={e=>setContainment(e.target.value)}
                        onInput={e=>{const el=e.currentTarget;el.style.height="auto";el.style.height=el.scrollHeight+"px";}}
                        placeholder="Ví dụ: Đã cô lập khu vực, dừng máy, gọi y tế, gắn biển cảnh báo..."/>
                    </div>
                  )}
                  {cond.showAuthReport && (
                    <div>
                      <label style={LBL}>Đã báo cơ quan chức năng? <NewBadge/></label>
                      <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                        {["yes","no"].map(v=>(
                          <button key={v} onClick={()=>setReportedAuth(v)} style={{ padding:"5px 16px", borderRadius:7, fontSize:13, fontWeight:700, cursor:"pointer", border:reportedAuth===v?`2px solid ${v==="yes"?"#16a34a":"#dc2626"}`:"1.5px solid #b4bfcf", background:reportedAuth===v?v==="yes"?"#f0fdf4":"#fef2f2":"#f5f7fb", color:reportedAuth===v?v==="yes"?"#15803d":"#dc2626":"#1e293b", transition:"all .15s" }}>
                            {v==="yes"?"✅ Đã báo":"❌ Chưa / Không cần"}
                          </button>
                        ))}
                        {reportedAuth==="yes" && (
                          <div style={{ display:"flex", gap:8, flexWrap:"wrap", alignItems:"center" }}>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontSize:13, color:"#475569" }}>Ngày báo:</span>
                              <input type="date" style={{ ...INP, width:140 }} value={reportedDate} onChange={e=>setReportedDate(e.target.value)}/>
                            </div>
                            <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                              <span style={{ fontSize:13, color:"#475569", flexShrink:0 }}>Cơ quan:</span>
                              <input style={{ ...INP, width:200 }} placeholder="Phòng LĐ-TB&XH, Cảnh sát PCCC..." value={reportedOrg} onChange={e=>setReportedOrg(e.target.value)}/>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  </div>
                </div>
              )}

            </div>
          )}

          {/* ══ STEP 3 — Phân tích & Kế hoạch ══ */}
          {step===3 && (
            <div className="v3-step3-wrap">

              {srcRecord && srcType && (
                <div className="v3-step3-src-banner" style={{ background:srcType.bg, borderBottom:`1.5px solid ${srcType.border}`, color:srcType.color }}>
                  <span className="src-icon">{srcType.icon}</span>
                  <span className="src-label">{srcType.label}</span>
                  <span className="src-code" style={{ color:"#1e293b" }}>{srcRecord.code} — {srcRecord.title}</span>
                </div>
              )}

              {/* ── SPLIT SCREEN: Trái = RCA · Phải = Kế hoạch + Ảnh ── */}
              <div className="v3-step3-split">

                {/* ── PANEL TRÁI: RCA ── */}
                <div className="v3-step3-panel">

                  <div className="v3-step3-panel-hdr">
                    <span className="hdr-accent" style={{ background:"linear-gradient(#7c3aed,#0369a1)" }}/>
                    <span className="hdr-title">Phân tích nguyên nhân (RCA)</span>
                  </div>

                  <div className="v3-step3-panel-body">
                    {/* Method buttons — bordered cards */}
                    <div style={{ background:"#f0f4fa", border:"1.5px solid #dde3ee", borderRadius:10, padding:"8px 8px 6px", display:"flex", gap:5 }}>
                      {RCA_METHODS.map(m=>{
                        const sel=rcaMethod===m.val;
                        const COL:Record<string,string>={ "5why":"#1e40af", "fishbone":"#7c3aed", "gap":"#0369a1", "free":"#475569", "risk":"#b45309" };
                        const col=COL[m.val]||"#1e40af";
                        return (
                          <button key={m.val} onClick={()=>setRcaMethod(m.val)} style={{
                            flex:1, padding:"7px 4px", borderRadius:8, cursor:"pointer", textAlign:"center",
                            border:sel?`2px solid ${col}`:"1.5px solid #c8d0dc",
                            background:sel?col+"14":"#fff", transition:"all .13s",
                            boxShadow: sel?`0 0 0 2px ${col}22`:"0 1px 3px rgba(0,0,0,.06)",
                          }}>
                            <div style={{ fontSize:16, marginBottom:2 }}>{m.icon}</div>
                            <div style={{ fontSize:12, fontWeight:sel?800:600, color:sel?col:"#475569" }}>{m.label}</div>
                          </button>
                        );
                      })}
                    </div>

                    {/* 5-Why — textarea rows with numbered circles */}
                    {rcaMethod==="5why" && (
                      <div style={{ background:"#eff6ff", border:"1.5px solid #bfdbfe", borderRadius:10, padding:"12px 12px 10px", display:"flex", flexDirection:"column", gap:8 }}>
                        {whys.map((w,i)=>(
                          <div key={i} style={{ display:"flex", alignItems:"flex-start", gap:9 }}>
                            <div style={{ width:22, height:22, borderRadius:"50%", background:w.trim()?"#1e40af":"#93c5fd", color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:900, flexShrink:0, marginTop:5, transition:"all .15s", boxShadow:"0 1px 3px rgba(30,64,175,.2)" }}>
                              {i+1}
                            </div>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:12, fontWeight:700, color:"#1e3a8a", marginBottom:3 }}>Tại sao {i+1}?</div>
                              <textarea rows={1} style={{ ...INP, fontSize:13, resize:"vertical", lineHeight:1.5, minHeight:34, overflowY:"hidden", background:"#fff", border:"1.5px solid #bfdbfe" }}
                                value={w}
                                onChange={e=>setWhys(p=>{const n=[...p];n[i]=e.target.value;return n;})}
                                onInput={e=>{const el=e.currentTarget;el.style.height="auto";el.style.height=el.scrollHeight+"px";}}
                                placeholder={i===0?"Tại sao vấn đề xảy ra?":i===1?"Tại sao nguyên nhân #1 xảy ra?":i===2?"Đào sâu thêm...":i===3?"Tiếp tục...":"Kết luận nguyên nhân gốc rễ..."}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Fishbone — 2×3 grid */}
                    {rcaMethod==="fishbone" && (
                      <div style={{ background:"#faf5ff", border:"1.5px solid #ddd6fe", borderRadius:10, padding:"10px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:7 }}>
                        {([
                          { key:"man",        icon:"👷", label:"Con người",   ph:"Hành vi, kỹ năng..." },
                          { key:"machine",    icon:"⚙️", label:"Máy móc",     ph:"Hỏng hóc, bảo trì..." },
                          { key:"method",     icon:"📋", label:"Phương pháp", ph:"SOP thiếu, quy trình sai..." },
                          { key:"material",   icon:"📦", label:"Vật liệu",    ph:"Chất lượng vật tư..." },
                          { key:"environment",icon:"🌿", label:"Môi trường",  ph:"Điều kiện làm việc..." },
                          { key:"measurement",icon:"📐", label:"Đo lường",    ph:"Thiếu kiểm tra..." },
                        ]).map(cat=>(
                          <div key={cat.key} style={{ background:"#fff", border:"1.5px solid #e9d5ff", borderRadius:9, padding:"9px 11px" }}>
                            <div style={{ fontSize:12, fontWeight:800, color:"#6d28d9", marginBottom:5, display:"flex", alignItems:"center", gap:5 }}>
                              <span>{cat.icon}</span><span>{cat.label}</span>
                            </div>
                            <textarea rows={1} style={{ ...INP, fontSize:12, resize:"vertical", lineHeight:1.4, minHeight:32, overflowY:"hidden", background:"#faf5ff", border:"1.5px solid #e9d5ff" }}
                              value={fishbone[cat.key]} onChange={e=>setFishbone(prev=>({...prev,[cat.key]:e.target.value}))}
                              onInput={e=>{const el=e.currentTarget;el.style.height="auto";el.style.height=el.scrollHeight+"px";}}
                              placeholder={cat.ph}/>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Gap Analysis */}
                    {rcaMethod==="gap" && (
                      <div style={{ background:"#f0f9ff", border:"1.5px solid #bae6fd", borderRadius:10, padding:"12px" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:10, alignItems:"start" }}>
                        <div>
                          <div style={{ fontSize:12, fontWeight:800, color:"#dc2626", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>📉 Thực trạng hiện tại</div>
                          <textarea rows={2} style={{ ...INP, resize:"vertical", border:"1.5px solid #fca5a5", lineHeight:1.5, background:"#fff", minHeight:70 }}
                            placeholder="Tình trạng thực tế hiện nay..." value={gapActual} onChange={e=>setGapActual(e.target.value)}
                            onInput={autoGrow}/>
                        </div>
                        <div style={{ fontSize:20, color:"#94a3b8", paddingTop:34, flexShrink:0 }}>→</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:800, color:"#16a34a", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:5 }}>📈 Tiêu chuẩn cần đạt</div>
                          <textarea rows={2} style={{ ...INP, resize:"vertical", border:"1.5px solid #86efac", lineHeight:1.5, background:"#fff", minHeight:70 }}
                            placeholder="Yêu cầu / tiêu chuẩn cần đạt..." value={gapStandard} onChange={e=>setGapStandard(e.target.value)}
                            onInput={autoGrow}/>
                        </div>
                      </div>
                      </div>
                    )}

                    {/* Free text */}
                    {rcaMethod==="free" && (
                      <div style={{ background:"#f8fafc", border:"1.5px solid #cbd5e1", borderRadius:10, padding:"12px" }}>
                        <div style={{ fontSize:12, fontWeight:700, color:"#475569", marginBottom:6 }}>✏️ Phân tích tự do</div>
                        <textarea rows={3} style={{ ...INP, resize:"vertical", lineHeight:1.6, fontSize:13, minHeight:70, overflowY:"hidden", background:"#fff" }}
                          placeholder="Mô tả nguyên nhân theo cách bạn hiểu..."
                          value={freeAnalysis} onChange={e=>setFreeAnalysis(e.target.value)}
                          onInput={e=>{const el=e.currentTarget;el.style.height="auto";el.style.height=el.scrollHeight+"px";}}/>
                      </div>
                    )}

                    {/* Risk assessment tab */}
                    {rcaMethod==="risk" && (()=>{
                      const riskBeforeScore = riskBeforeL*riskBeforeC;
                      const riskAfterScore  = riskAfterL*riskAfterC;
                      const bothSet = riskBeforeScore>0 && riskAfterScore>0;
                      const improved = bothSet && riskAfterScore < riskBeforeScore;
                      const pctChange = bothSet ? Math.round((1-riskAfterScore/riskBeforeScore)*100) : 0;
                      return (
                        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                            <span style={{ fontSize:12, fontWeight:700, color:"#92400e" }}>Đánh giá rủi ro 5×5</span>
                            <span
                              title="Nhấn ô trong ma trận 🔴 Trước KP để chọn mức rủi ro hiện tại, sau đó chọn 🟢 Sau KP dự kiến khi khắc phục xong."
                              style={{ width:18, height:18, borderRadius:"50%", background:"#fef3c7", border:"1.5px solid #fde68a", display:"inline-flex", alignItems:"center", justifyContent:"center", fontSize:11, color:"#92400e", fontWeight:900, cursor:"default", flexShrink:0 }}>ⓘ</span>
                          </div>
                          {bothSet && (
                            <div style={{ borderRadius:10, overflow:"hidden", border:`1.5px solid ${improved?"#86efac":"#fca5a5"}` }}>
                              <div style={{ height:4, background:improved?"linear-gradient(90deg,#4ade80,#16a34a)":"linear-gradient(90deg,#fbbf24,#dc2626)" }}/>
                              <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"7px 12px", background:improved?"#f0fff4":"#fff5f5" }}>
                                <div style={{ display:"flex", alignItems:"center", gap:5 }}>
                                  <span style={{ fontSize:13 }}>{improved?"✅":"⚠️"}</span>
                                  <span style={{ fontSize:12, fontWeight:700, color:improved?"#15803d":"#dc2626" }}>
                                    {improved?`Giảm ${pctChange}% rủi ro`:"Rủi ro chưa được cải thiện"}
                                  </span>
                                </div>
                                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                                  <span style={{ fontSize:13, fontWeight:900, color:riskBandColor(riskBeforeScore) }}>{riskBeforeScore}</span>
                                  <span style={{ color:"#94a3b8", fontSize:12 }}>→</span>
                                  <span style={{ fontSize:13, fontWeight:900, color:riskBandColor(riskAfterScore) }}>{riskAfterScore}</span>
                                </div>
                              </div>
                            </div>
                          )}
                          <RiskMatrixPickerCompact
                            selL={riskBeforeL} selC={riskBeforeC}
                            onChange={(l,c)=>{setRiskBeforeL(l);setRiskBeforeC(c);}}
                            mode="before"
                          />
                          <RiskMatrixPickerCompact
                            selL={riskAfterL} selC={riskAfterC}
                            onChange={(l,c)=>{setRiskAfterL(l);setRiskAfterC(c);}}
                            mode="after"
                          />
                        </div>
                      );
                    })()}

                    {/* Root cause conclusion box */}
                    {rcaMethod!=="risk" && <div style={{ background:"#faf5ff", border:`1.5px solid ${rootCause.trim()?"#c4b5fd":"#ddd6fe"}`, borderRadius:10, padding:"10px 12px" }}>
                      <div style={{ fontSize:12, fontWeight:800, color:"#7c3aed", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:6 }}>
                        🎯 Kết luận nguyên nhân gốc rễ
                      </div>
                      <textarea rows={1} style={{ ...INP, fontSize:13, resize:"vertical", lineHeight:1.5, border:"1.5px solid #ddd6fe", minHeight:34, overflowY:"hidden" }}
                        value={rootCause} onChange={e=>setRootCause(e.target.value)}
                        onInput={e=>{const el=e.currentTarget;el.style.height="auto";el.style.height=el.scrollHeight+"px";}}
                        placeholder={rcaMethod==="5why"?"Tóm tắt nguyên nhân cốt lõi từ 5-Why...":rcaMethod==="fishbone"?"Yếu tố chính gây ra sự kiện...":rcaMethod==="gap"?"Khoảng cách quan trọng nhất cần đóng...":"Tóm tắt nguyên nhân cốt lõi..."}/>
                    </div>}
                  </div>
                </div>

                {/* ── PANEL PHẢI: Kế hoạch + Ảnh ── */}
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
                    {/* Card-style action rows */}
                    <div style={{ background:"#f0fdf4", border:"1.5px solid #bbf7d0", borderRadius:10, padding:"10px 10px 8px" }}>
                    <ActionCardRows items={actionItems} onChange={setActionItems} defaultDeadline={deadline} defaultType={capaType==="ca"?"CA":capaType==="pa"?"PA":capaType==="both"?"Both":undefined} personnelList={allPersonnel}/>
                    </div>

                    {/* Inherited files from source */}
                    {attachedFiles.length>0 && (
                      <div style={{ padding:"9px 12px", borderRadius:8, background:"#fefce8", border:"1.5px solid #fef9c3" }}>
                        <div style={{ fontSize:13, fontWeight:700, color:"#b45309", marginBottom:6 }}>📎 Tài liệu kế thừa từ nguồn phát sinh</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
                          {attachedFiles.map(f=>(
                            <div key={f.id} style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <span style={{ fontSize:16 }}>{F_ICON[f.fileType]}</span>
                              <span style={{ fontSize:13, color:F_CLR[f.fileType], fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                              <span style={{ fontSize:12, color:"#94a3b8", flexShrink:0 }}>{F_LABEL[f.fileType]} · {fmtBytes(f.size)}</span>
                              <button onClick={()=>setAttachedFiles(p=>p.filter(x=>x.id!==f.id))} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:14, padding:0, flexShrink:0 }}>✕</button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Photo + doc upload section — compact 2-col */}
                    <div className="v3-step3-attach">
                      <div className="v3-step3-photo-box">
                        <div className="photo-hdr">
                          <span>📸</span> Ảnh &amp; Tài liệu đính kèm
                          <span className="photo-opt">(không bắt buộc)</span>
                        </div>
                        <div className="v3-attach-grid">
                          <CompactImageZone
                            photos={beforePhotos} onAdd={addBeforePhotos}
                            onRemove={id=>setBeforePhotos(p=>p.filter(x=>x.id!==id))} maxFiles={8}
                            label="Ảnh hiện trạng"/>
                          <CompactFileZone files={attachedFiles} onChange={setAttachedFiles}/>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {missing3.length>0 && (
                <div className="v3-step3-missing">
                  <span className="miss-label">⚠️ Cần điền:</span>
                  <div className="miss-tags">
                    {missing3.map(m=><span key={m} className="miss-tag">{m}</span>)}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ══ STEP 4 — Phân công ══ */}
          {step===4 && (
            <div style={{ display:"flex", flexDirection:"column", gap:13 }}>

              {/* ── Hàng 1: 2 cột — Bộ phận | Thời hạn & Kiểm tra ── */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:13, alignItems:"start" }}>

                {/* Card ① Bộ phận & Khu vực */}
                <div className="v3-card" style={{ height:"100%" }}>
                  <div className="v3-sec-hdr">
                    <div className="v3-sec-num">①</div>
                    <span className="v3-sec-title">Bộ phận phụ trách</span>
                    <Req/>
                  </div>

                  {/* Chips đã chọn + nút mở picker */}
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap", alignItems:"center", minHeight:32 }}>
                    {depts.length===0&&!deptPickerOpen&&(
                      <span style={{ fontSize:13, color:"#d97706", fontWeight:600 }}>⚠️ Chưa chọn bộ phận</span>
                    )}
                    {depts.map(d=>{
                      const kc=KHOI.find(k=>k.id!=="all"&&k.depts.includes(d))?.color??"#1e40af";
                      return (
                        <span key={d} style={{ fontSize:13, fontWeight:700, color:kc, background:kc+"15", border:`1.5px solid ${kc}55`, padding:"4px 10px", borderRadius:8, display:"flex", alignItems:"center", gap:5, lineHeight:1 }}>
                          {d}
                          <button onClick={()=>toggleDept(d)} style={{ background:"none", border:"none", cursor:"pointer", color:"#94a3b8", fontSize:12, padding:0, lineHeight:1 }}>✕</button>
                        </span>
                      );
                    })}
                    <button onClick={()=>setDeptPickerOpen(o=>!o)} style={{ padding:"4px 12px", borderRadius:8, fontSize:13, fontWeight:700, cursor:"pointer", border:`1.5px solid ${deptPickerOpen?"#6366f1":"#cbd5e1"}`, background:deptPickerOpen?"#eef2ff":"#f8fafc", color:deptPickerOpen?"#4f46e5":"#374151", transition:"all .15s" }}>
                      {deptPickerOpen?"✕ Thu gọn":depts.length>0?"✏️ Chỉnh sửa":"＋ Chọn bộ phận"}
                    </button>
                  </div>

                  {/* Picker dropdown */}
                  {deptPickerOpen && (
                    <div style={{ padding:"13px 14px", borderRadius:11, border:"1.5px solid #e0e7ff", background:"#f8f9ff" }}>
                      {/* Khối shortcut */}
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
                      {/* Danh sách bộ phận theo khối */}
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

                  {/* Khu vực */}
                  <div>
                    <label style={LBL}>Khu vực / Địa điểm</label>
                    <AreaCombo area={area} onChange={setArea} locationsList={allLocations}/>
                  </div>
                </div>

                {/* Card phải: Thời hạn + Kiểm tra hiệu lực */}
                <div style={{ display:"flex", flexDirection:"column", gap:13 }}>

                  {/* Card ② Thời hạn xử lý */}
                  <div className="v3-card" style={{ background:"linear-gradient(135deg,#fff7ed,#fff)", borderColor:"#fed7aa" }}>
                    <div className="v3-sec-hdr">
                      <div className="v3-sec-num" style={{ background:"#ea580c" }}>②</div>
                      <span className="v3-sec-title">Hạn xử lý</span>
                      <Req/>
                    </div>
                    <div>
                      <input type="date" style={isAuto('deadline',deadline)?INP_AUTO:INP} value={deadline} onChange={e=>setDeadline(e.target.value)}/>
                      {deadline && !isNaN(new Date(deadline).getTime()) && (() => {
                        const today = new Date(new Date().toISOString().split("T")[0]);
                        const d = new Date(deadline);
                        const diff = Math.round((d.getTime()-today.getTime())/86400000);
                        const overdue = diff < 0;
                        return (
                          <div style={{ marginTop:6, padding:"5px 10px", borderRadius:7, background:overdue?"#fef2f2":"#fff7ed", border:`1px solid ${overdue?"#fca5a5":"#fed7aa"}`, fontSize:13, color:overdue?"#dc2626":"#c2410c", fontWeight:700, display:"flex", alignItems:"center", gap:5 }}>
                            {overdue ? `⚠️ Đã quá ${Math.abs(diff)} ngày` : diff===0 ? "🔴 Hôm nay là hạn chót" : diff<=3 ? `🟡 Còn ${diff} ngày` : `📅 Còn ${diff} ngày`}
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
                      <NewBadge/>
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
                      {verifyMethod==="Khác (tự nhập)"&&(
                        <input style={{ ...INP, marginTop:6 }} placeholder="Mô tả phương thức..." value={verifyMethodCustom} onChange={e=>setVerifyMethodCustom(e.target.value)}/>
                      )}
                    </div>
                  </div>

                </div>
              </div>

              {/* ── Hàng 2: Phân công nhân sự (full width, 2 cột trong) ── */}
              <div className="v3-card">
                <div className="v3-sec-hdr" style={{ marginBottom:8 }}>
                  <div className="v3-sec-num" style={{ background:"#0369a1" }}>④</div>
                  <span className="v3-sec-title">Phân công nhân sự</span>
                  <span className="v3-sec-sub">— người thực hiện &amp; kiểm tra</span>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
                  {/* Cột trái: Người thực hiện */}
                  <div style={{ padding:"13px 14px", borderRadius:11, background:"#f0fdf4", border:"1.5px solid #86efac" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:"#16a34a", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:900 }}>▶</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#14532d" }}>Người thực hiện <Req/></div>
                        <div style={{ fontSize:11, color:"#4ade80", fontWeight:600 }}>Chịu trách nhiệm xử lý CAPA</div>
                      </div>
                    </div>
                    <PersonPicker
                      label={null}
                      selected={persons} onAdd={(n:string)=>{if(!persons.includes(n))setPersons(p=>[...p,n]);}}
                      onRemove={(n:string)=>setPersons(p=>p.filter(x=>x!==n))}
                      input={personInput} onInputChange={setPersonInput}
                      chipBg="#dcfce7" chipBorder="#4ade80"
                      placeholder="Tìm hoặc nhập tên..." isAuto={isAuto('persons', persons[0]||"")} deptFilter={depts}
                      personnelList={allPersonnel}/>
                  </div>
                  {/* Cột phải: Người kiểm tra */}
                  <div style={{ padding:"13px 14px", borderRadius:11, background:"#faf5ff", border:"1.5px solid #d8b4fe" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:10 }}>
                      <div style={{ width:28, height:28, borderRadius:8, background:"#7c3aed", display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, color:"#fff", fontWeight:900 }}>✓</div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:800, color:"#4c1d95" }}>Người kiểm tra</div>
                        <div style={{ fontSize:11, color:"#a78bfa", fontWeight:600 }}>Xác nhận kết quả (không bắt buộc)</div>
                      </div>
                    </div>
                    <PersonPicker
                      label={null}
                      selected={reviewers} onAdd={(n:string)=>{if(!reviewers.includes(n))setReviewers(p=>[...p,n]);}}
                      onRemove={(n:string)=>setReviewers(p=>p.filter(x=>x!==n))}
                      input={reviewerInput} onInputChange={setReviewerInput}
                      chipBg="#ede9fe" chipBorder="#a78bfa"
                      placeholder="Tìm kiểm tra viên..." deptFilter={depts}
                      personnelList={allPersonnel}/>
                  </div>
                </div>
              </div>

              {/* ── Mức rủi ro (kế thừa từ Bước 3) ── */}
              {(cond.showRiskScore || isManual) && (()=>{
                const riskBeforeScore = riskBeforeL*riskBeforeC;
                const riskAfterScore  = riskAfterL*riskAfterC;
                const bothSet = riskBeforeScore>0 && riskAfterScore>0;
                const improved = bothSet && riskAfterScore < riskBeforeScore;
                const pctChange = bothSet ? Math.round((1-riskAfterScore/riskBeforeScore)*100) : 0;
                return (
                <div className="v3-card-amber">
                  <div className="v3-sec-hdr">
                    <div className="v3-sec-num" style={{ background:"#b45309" }}>⑤</div>
                    <span className="v3-sec-title">Mức rủi ro</span>
                    <span className="v3-sec-sub">— từ Bước 3 · Phân tích & Kế hoạch</span>
                  </div>
                  {bothSet ? (
                    <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:0, borderRadius:12, overflow:"hidden", border:`1.5px solid ${improved?"#86efac":"#fca5a5"}` }}>
                      <div style={{ padding:"12px 14px", background:riskBandBg(riskBeforeScore), display:"flex", flexDirection:"column", alignItems:"center", gap:4 }}>
                        <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:"0.07em", textTransform:"uppercase", color:"#64748b" }}>Trước KP</div>
                        <div style={{ width:46,height:46,borderRadius:12,background:cellBg(riskBeforeScore),display:"flex",alignItems:"center",justifyContent:"center" }}>
                          <span style={{ fontSize:20,fontWeight:900,color:cellTextColor(riskBeforeScore) }}>{riskBeforeScore}</span>
                        </div>
                        <div style={{ fontSize:12,fontWeight:800,color:riskBandColor(riskBeforeScore) }}>
                          {riskBeforeScore>=15?"🔴":riskBeforeScore>=8?"🟠":riskBeforeScore>=4?"🟡":"🟢"} {riskBand(riskBeforeScore)}
                        </div>
                      </div>
                      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"8px 12px",background:"#fff",gap:4 }}>
                        <span style={{ fontSize:16 }}>→</span>
                        <div style={{ padding:"2px 7px",borderRadius:6,fontWeight:800,fontSize:11,
                          background:improved?"#dcfce7":riskBeforeScore===riskAfterScore?"#f1f5f9":"#fef2f2",
                          color:improved?"#15803d":riskBeforeScore===riskAfterScore?"#64748b":"#dc2626",
                          border:`1px solid ${improved?"#86efac":riskBeforeScore===riskAfterScore?"#e2e8f0":"#fca5a5"}` }}>
                          {improved?`−${pctChange}%`:riskBeforeScore===riskAfterScore?"=":"+"+Math.round((riskAfterScore/riskBeforeScore-1)*100)+"%"}
                        </div>
                      </div>
                      <div style={{ padding:"12px 14px", background:riskBandBg(riskAfterScore), display:"flex", flexDirection:"column", alignItems:"center", gap:4, borderLeft:"1px solid rgba(0,0,0,.06)" }}>
                        <div style={{ fontSize:9.5, fontWeight:800, letterSpacing:"0.07em", textTransform:"uppercase", color:"#64748b" }}>Sau KP</div>
                        <div style={{ width:46,height:46,borderRadius:12,background:cellBg(riskAfterScore),display:"flex",alignItems:"center",justifyContent:"center" }}>
                          <span style={{ fontSize:20,fontWeight:900,color:cellTextColor(riskAfterScore) }}>{riskAfterScore}</span>
                        </div>
                        <div style={{ fontSize:12,fontWeight:800,color:riskBandColor(riskAfterScore) }}>
                          {riskAfterScore>=15?"🔴":riskAfterScore>=8?"🟠":riskAfterScore>=4?"🟡":"🟢"} {riskBand(riskAfterScore)}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div style={{ padding:"10px 14px", borderRadius:10, background:"#fffbeb", border:"1.5px dashed #fde68a", display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:15 }}>⬅️</span>
                      <span style={{ fontSize:13, color:"#92400e", fontWeight:600 }}>
                        Quay lại <b>Bước 3 → tab 🎯 Rủi ro</b> để chọn mức rủi ro trước & sau khắc phục.
                      </span>
                    </div>
                  )}
                </div>
                );
              })()}

              {/* ── Ảnh sau khắc phục ── */}
              <div className="v3-card" style={{ borderColor:"#86efac", background:"#f9fffe" }}>
                <div className="v3-sec-hdr">
                  <div className="v3-sec-num" style={{ background:"#16a34a" }}>⑥</div>
                  <span className="v3-sec-title">Ảnh sau khắc phục</span>
                  <span className="v3-sec-sub">— minh chứng kết quả (không bắt buộc)</span>
                </div>
                <CompactImageZone
                  photos={afterPhotos} onAdd={addAfterPhotos}
                  onRemove={id=>setAfterPhotos(p=>p.filter(x=>x.id!==id))} maxFiles={8}
                  label="Ảnh sau khắc phục"
                  accentDash="#86efac" accentBg="#f0fdf4" accentHover="#dcfce7" accentText="#16a34a"/>
                {beforePhotos.length>0 && afterPhotos.length>0 && (
                  <div style={{ padding:"7px 11px", borderRadius:8, background:"#dcfce7", border:"1px solid #86efac", fontSize:13, color:"#15803d", fontWeight:700, display:"flex", alignItems:"center", gap:6 }}>
                    ✅ {beforePhotos.length} ảnh trước + {afterPhotos.length} ảnh sau — bộ minh chứng đầy đủ
                  </div>
                )}
              </div>

            </div>
          )}

          {/* ══ STEP 5 — Xác nhận ══ */}
          {step===5 && (()=>{
            /* helpers scoped to step 5 */
            const today = new Date(new Date().toISOString().split("T")[0]);
            const deadlineDate = deadline ? new Date(deadline) : null;
            const verifyDateObj = verifyDate ? new Date(verifyDate) : null;
            const deadlineDiff = deadlineDate ? Math.round((deadlineDate.getTime()-today.getTime())/86400000) : null;
            const riskBeforeScore5 = riskBeforeL*riskBeforeC;
            const riskFinal = riskAfterL*riskAfterC;
            const riskImproved = (cond.showRiskScore||isManual) && riskBeforeScore5>0 && riskFinal>0 && riskFinal<riskBeforeScore5;
            const validActions = actionItems.filter(i=>i.action.trim()&&i.type);
            const caCount2 = validActions.filter(i=>i.type==="CA"||i.type==="Both").length;
            const paCount2 = validActions.filter(i=>i.type==="PA"||i.type==="Both").length;

            /* Readiness checklist */
            type CheckItem = { ok: boolean; label: string; step: number; required: boolean };
            const checks: CheckItem[] = [
              { ok:!!srcRecord,                  label:"Nguồn phát sinh",          step:1, required:true },
              { ok:!!title.trim(),               label:"Tiêu đề CAPA",             step:2, required:true },
              { ok:!!capaType,                   label:"Loại CAPA (CA/PA)",        step:2, required:true },
              { ok:!!priority,                   label:"Mức ưu tiên",              step:2, required:true },
              { ok:!!problemContent.trim(),      label:"Mô tả vấn đề",            step:2, required:true },
              { ok:validActions.length>0,        label:"Kế hoạch hành động",      step:3, required:true },
              { ok:depts.length>0,               label:"Bộ phận phụ trách",       step:4, required:true },
              { ok:!!deadline,                   label:"Hạn xử lý",               step:4, required:true },
              { ok:persons.length>0,             label:"Người thực hiện",         step:4, required:true },
              { ok:!!verifyDate,                 label:"Ngày kiểm tra hiệu lực",  step:4, required:true },
              { ok:!!rootCause.trim(),           label:"Nguyên nhân gốc rễ",      step:3, required:false },
              { ok:beforePhotos.length>0,        label:"Ảnh hiện trạng",          step:3, required:false },
              { ok:reviewers.length>0,           label:"Người kiểm tra",          step:4, required:false },
            ];
            const reqOk = checks.filter(c=>c.required&&c.ok).length;
            const reqTotal = checks.filter(c=>c.required).length;
            const pct = Math.round(reqOk/reqTotal*100);

            return (
              <div style={{ display:"flex", flexDirection:"column", gap:12 }}>

                {/* ── Header banner ── */}
                <div style={{ borderRadius:14, background:"linear-gradient(135deg,#0f172a 0%,#1e3a8a 60%,#312e81 100%)", padding:"16px 20px", boxShadow:"0 4px 20px rgba(15,23,42,.25)", display:"flex", alignItems:"center", gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:12, background:"rgba(255,255,255,.12)", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22, flexShrink:0 }}>📋</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:15, fontWeight:900, color:"#fff", letterSpacing:"0.03em" }}>XÁC NHẬN THÔNG TIN CAPA</div>
                    <div style={{ fontSize:12, color:"rgba(255,255,255,.6)", marginTop:2 }}>Kiểm tra lại trước khi lưu — nhấn ✏️ để quay lại chỉnh sửa từng mục</div>
                  </div>
                  {/* Completion ring */}
                  <div style={{ flexShrink:0, textAlign:"center" }}>
                    <div style={{ fontSize:22, fontWeight:900, color:pct===100?"#4ade80":"#fbbf24", lineHeight:1 }}>{pct}%</div>
                    <div style={{ fontSize:11, color:"rgba(255,255,255,.55)", marginTop:2 }}>{reqOk}/{reqTotal} bắt buộc</div>
                    <div style={{ width:64, height:4, borderRadius:3, background:"rgba(255,255,255,.15)", marginTop:5, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:pct===100?"#4ade80":"#fbbf24", borderRadius:3, transition:"width .4s" }}/>
                    </div>
                  </div>
                </div>

                {/* ── Hàng 1: Định danh (2 col) ── */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                  {/* Nguồn phát sinh */}
                  <S5Card accent={srcType?.color??"#6366f1"} onEdit={()=>setStep(1)}>
                    <S5Label>⚡ Nguồn phát sinh</S5Label>
                    <div style={{ fontSize:14, fontWeight:700, color:"#0f172a" }}>{srcType?.icon} {srcType?.label}</div>
                    {srcRecord && <div style={{ fontSize:13, color:"#475569", marginTop:2, fontFamily:"monospace", fontWeight:600 }}>{srcRecord.code} · {srcRecord.title?.length>35?srcRecord.title.slice(0,35)+"…":srcRecord.title}</div>}
                  </S5Card>
                  {/* Loại CAPA + Mức ưu tiên */}
                  <S5Card accent={capaType==="ca"?"#dc2626":capaType==="pa"?"#16a34a":"#7c3aed"} onEdit={()=>setStep(2)}>
                    <S5Label>🏷️ Loại CAPA &amp; Ưu tiên</S5Label>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <span style={{ fontSize:14, fontWeight:800, color:capaType==="ca"?"#dc2626":capaType==="pa"?"#16a34a":"#7c3aed" }}>
                        {capaType==="ca"?"🔧 CA":capaType==="pa"?"🛡️ PA":"⚡ CA+PA"}
                      </span>
                      {prio && <span style={{ fontSize:12, fontWeight:700, color:prio.color, background:prio.bg, border:`1px solid ${prio.border}`, padding:"2px 9px", borderRadius:20 }}>● {prio.label}</span>}
                      {topicFinal && <span style={{ fontSize:12, color:"#64748b", background:"#f1f5f9", padding:"2px 8px", borderRadius:5 }}>#{topicFinal}</span>}
                    </div>
                    {problemType && (()=>{ const pt=PROBLEM_TYPE_OPTIONS.find(p=>p.val===problemType); return pt?<div style={{ marginTop:5 }}><span style={{ fontSize:12, fontWeight:700, color:pt.color, background:pt.bg, border:`1px solid ${pt.border}`, padding:"2px 8px", borderRadius:5 }}>{pt.icon} {pt.label}</span></div>:null; })()}
                  </S5Card>
                </div>

                {/* ── Tiêu đề + Vấn đề ── */}
                <S5Card accent="#1e40af" onEdit={()=>setStep(2)}>
                  <S5Label>📄 Tiêu đề &amp; Phân tích vấn đề</S5Label>
                  <div style={{ fontSize:14, fontWeight:700, color:"#0f172a", lineHeight:1.45, marginBottom:8 }}>{title||"—"}</div>
                  {problemContent.trim() && (
                    <div style={{ padding:"8px 11px", borderRadius:8, background:"#eff6ff", border:"1px solid #bfdbfe", fontSize:13, color:"#1e3a8a", lineHeight:1.6 }}>
                      {problemContent.length>200?problemContent.slice(0,200)+"…":problemContent}
                    </div>
                  )}
                  {initialCause.trim() && (
                    <div style={{ marginTop:6, padding:"7px 11px", borderRadius:8, background:"#fffbeb", border:"1px solid #fde68a", fontSize:13, color:"#78350f", lineHeight:1.55 }}>
                      <span style={{ fontWeight:700 }}>Nguyên nhân ban đầu: </span>{initialCause.length>120?initialCause.slice(0,120)+"…":initialCause}
                    </div>
                  )}
                  {(reporterName||occurLocation) && (
                    <div style={{ display:"flex", gap:14, marginTop:7, flexWrap:"wrap" }}>
                      {reporterName && <span style={{ fontSize:13, color:"#475569" }}>👤 {reporterName}</span>}
                      {occurLocation && <span style={{ fontSize:13, color:"#475569" }}>📍 {occurLocation==="Khác"?(occurLocationCustom||"Khác"):occurLocation}</span>}
                    </div>
                  )}
                </S5Card>

                {/* ── Kế hoạch hành động ── */}
                {validActions.length>0 && (
                  <S5Card accent="#0369a1" onEdit={()=>setStep(3)}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <S5Label>🎯 Kế hoạch hành động</S5Label>
                      <div style={{ display:"flex", gap:5, marginTop:-4 }}>
                        {caCount2>0&&<span style={{ fontSize:11,fontWeight:800,color:"#dc2626",background:"#fef2f2",border:"1px solid #fca5a5",padding:"2px 8px",borderRadius:10 }}>CA ×{caCount2}</span>}
                        {paCount2>0&&<span style={{ fontSize:11,fontWeight:800,color:"#16a34a",background:"#f0fdf4",border:"1px solid #86efac",padding:"2px 8px",borderRadius:10 }}>PA ×{paCount2}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {validActions.map((it,idx)=>{
                        const cfg=AP_TYPE_CFG[it.type];
                        const overdue = it.deadline && new Date(it.deadline)<today;
                        return (
                          <div key={it.id} style={{ display:"flex", alignItems:"flex-start", gap:10, padding:"8px 11px", borderRadius:9, background:"#f8fafc", border:"1px solid #e8eef6" }}>
                            <span style={{ flexShrink:0, width:22, height:22, borderRadius:6, background:cfg.bg, border:`1.5px solid ${cfg.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:900, color:cfg.color, marginTop:1 }}>{idx+1}</span>
                            <div style={{ flex:1, minWidth:0 }}>
                              <div style={{ fontSize:13, fontWeight:600, color:"#0f172a", lineHeight:1.45 }}>{it.action.length>80?it.action.slice(0,80)+"…":it.action}</div>
                              <div style={{ display:"flex", gap:8, marginTop:4, flexWrap:"wrap", alignItems:"center" }}>
                                <span style={{ fontSize:11,fontWeight:800,color:cfg.color,background:cfg.bg,border:`1px solid ${cfg.border}`,padding:"1px 7px",borderRadius:8 }}>{cfg.label}</span>
                                {(it.persons||[]).length>0 && <span style={{ fontSize:12, color:"#475569" }}>👤 {it.persons.join(", ")}</span>}
                                {it.deadline && <span style={{ fontSize:12, color:overdue?"#dc2626":"#475569", fontWeight:overdue?700:400 }}>{overdue?"⚠️ ":""}{fmtDate(it.deadline)}</span>}
                                {it.progress && <span style={{ fontSize:12, color:"#7c3aed", fontWeight:700 }}>{it.progress}%</span>}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </S5Card>
                )}

                {/* ── RCA (nếu có) ── */}
                {rootCause.trim() && (
                  <S5Card accent="#7c3aed" onEdit={()=>setStep(3)}>
                    <S5Label>🔍 Nguyên nhân gốc rễ · {RCA_METHODS.find(m=>m.val===rcaMethod)?.label}</S5Label>
                    <div style={{ fontSize:13, color:"#374151", lineHeight:1.65, padding:"7px 10px", borderRadius:8, background:"#faf5ff", border:"1px solid #e9d5ff" }}>{rootCause.length>200?rootCause.slice(0,200)+"…":rootCause}</div>
                    {whys.filter(w=>w.trim()).length>0 && rcaMethod==="5why" && (
                      <div style={{ marginTop:7, display:"flex", gap:5, flexWrap:"wrap" }}>
                        {whys.filter(w=>w.trim()).map((w,i)=>(
                          <span key={i} style={{ fontSize:12, background:"#ede9fe", border:"1px solid #c4b5fd", padding:"2px 8px", borderRadius:5, color:"#6d28d9", fontWeight:600 }}>W{i+1}: {w.length>28?w.slice(0,28)+"…":w}</span>
                        ))}
                      </div>
                    )}
                  </S5Card>
                )}

                {/* ── Hàng: Phân công + Timeline (2 col) ── */}
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>

                  {/* Phân công nhân sự */}
                  <S5Card accent="#16a34a" onEdit={()=>setStep(4)}>
                    <S5Label>👥 Phân công nhân sự</S5Label>
                    {/* Bộ phận */}
                    {depts.length>0 && (
                      <div style={{ display:"flex", gap:4, flexWrap:"wrap", marginBottom:10 }}>
                        {depts.map(d=>{ const kc=KHOI.find(k=>k.id!=="all"&&k.depts.includes(d))?.color??"#1e40af"; return <span key={d} style={{ fontSize:12, fontWeight:700, color:kc, background:kc+"18", border:`1.5px solid ${kc}50`, padding:"3px 9px", borderRadius:6 }}>🏢 {d}</span>; })}
                      </div>
                    )}
                    {/* Người thực hiện */}
                    {persons.length>0 && (
                      <div style={{ marginBottom:8 }}>
                        <div style={{ fontSize:11.5, fontWeight:800, color:"#15803d", letterSpacing:"0.04em", marginBottom:5, display:"flex", alignItems:"center", gap:4 }}>
                          <span style={{ width:3, height:13, background:"#16a34a", borderRadius:2, display:"inline-block" }}/>
                          NGƯỜI THỰC HIỆN ({persons.length})
                        </div>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                          {persons.map((p,i)=>{
                            const pd=PERSONNEL.find(x=>x.name===p);
                            const dc=pd?(KHOI.find(k=>k.id!=="all"&&k.depts.includes(pd.dept))?.color??"#16a34a"):"#16a34a";
                            return <span key={i} style={{ fontSize:13, fontWeight:700, color:"#14532d", background:"#f0fdf4", border:"1.5px solid #86efac", padding:"4px 11px", borderRadius:7, display:"flex", alignItems:"center", gap:5 }}>
                              👤 {p}{pd&&<span style={{ fontSize:11,fontWeight:800,color:dc,background:dc+"20",padding:"1px 5px",borderRadius:4,border:`1px solid ${dc}35` }}>{pd.dept}</span>}
                            </span>;
                          })}
                        </div>
                      </div>
                    )}
                    {/* Người kiểm tra */}
                    {reviewers.length>0 && (
                      <div>
                        <div style={{ fontSize:11.5, fontWeight:800, color:"#6d28d9", letterSpacing:"0.04em", marginBottom:5, display:"flex", alignItems:"center", gap:4 }}>
                          <span style={{ width:3, height:13, background:"#7c3aed", borderRadius:2, display:"inline-block" }}/>
                          NGƯỜI KIỂM TRA ({reviewers.length})
                        </div>
                        <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
                          {reviewers.map((p,i)=>(
                            <span key={i} style={{ fontSize:13, fontWeight:700, color:"#3b0764", background:"#faf5ff", border:"1.5px solid #c4b5fd", padding:"4px 11px", borderRadius:7, display:"flex", alignItems:"center", gap:5 }}>
                              🔍 {p}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {persons.length===0 && reviewers.length===0 && (
                      <div style={{ fontSize:13, color:"#94a3b8", fontStyle:"italic" }}>Chưa phân công</div>
                    )}
                  </S5Card>

                  {/* Timeline deadline → verify */}
                  <S5Card accent="#ea580c" onEdit={()=>setStep(4)}>
                    <S5Label>📅 Lịch thời gian</S5Label>
                    <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                      {/* Hôm nay */}
                      <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:16 }}>
                          <div style={{ width:12, height:12, borderRadius:"50%", background:"#94a3b8", border:"2px solid #e2e8f0", flexShrink:0 }}/>
                          <div style={{ width:2, height:18, background:"#e2e8f0" }}/>
                        </div>
                        <div style={{ fontSize:12, color:"#94a3b8", paddingBottom:12 }}>Hôm nay · {today.toLocaleDateString("vi-VN")}</div>
                      </div>
                      {/* Hạn xử lý */}
                      {deadlineDate && (
                        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                          <div style={{ display:"flex", flexDirection:"column", alignItems:"center", width:16 }}>
                            <div style={{ width:14, height:14, borderRadius:"50%", background:deadlineDiff!==null&&deadlineDiff<0?"#dc2626":deadlineDiff===0?"#f97316":"#ea580c", flexShrink:0, boxShadow:`0 0 0 3px ${deadlineDiff!==null&&deadlineDiff<0?"#fecaca":deadlineDiff===0?"#fed7aa":"#fdba74"}` }}/>
                            {verifyDateObj && <div style={{ width:2, height:18, background:"#e2e8f0" }}/>}
                          </div>
                          <div style={{ paddingBottom:verifyDateObj?12:0 }}>
                            <div style={{ fontSize:13, fontWeight:800, color:deadlineDiff!==null&&deadlineDiff<0?"#dc2626":"#ea580c" }}>Hạn xử lý · {fmtDate(deadline)}</div>
                            <div style={{ fontSize:12, color:deadlineDiff!==null&&deadlineDiff<0?"#dc2626":"#78350f" }}>
                              {deadlineDiff===null?"":deadlineDiff<0?`⚠️ Đã quá ${Math.abs(deadlineDiff)} ngày`:deadlineDiff===0?"🔴 Hôm nay!":deadlineDiff<=7?`🟡 Còn ${deadlineDiff} ngày`:`📅 Còn ${deadlineDiff} ngày`}
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Ngày kiểm tra */}
                      {verifyDateObj && (
                        <div style={{ display:"flex", gap:10, alignItems:"center" }}>
                          <div style={{ width:16, display:"flex", justifyContent:"center" }}>
                            <div style={{ width:14, height:14, borderRadius:"50%", background:"#4f46e5", flexShrink:0, boxShadow:"0 0 0 3px #c7d2fe" }}/>
                          </div>
                          <div>
                            <div style={{ fontSize:13, fontWeight:800, color:"#4f46e5" }}>Kiểm tra hiệu lực · {fmtDate(verifyDate)}</div>
                            {verifyMethod && <div style={{ fontSize:12, color:"#6366f1" }}>{verifyMethod==="Khác (tự nhập)"?(verifyMethodCustom||"Khác"):verifyMethod}</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  </S5Card>
                </div>

                {/* ── Thông tin bổ sung (containment / injury / NC) ── */}
                {(containment.trim()||injuryType||ncSeverity) && (
                  <S5Card accent="#dc2626" onEdit={()=>setStep(2)}>
                    <S5Label>⚠️ Thông tin bổ sung</S5Label>
                    <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                      {containment.trim() && (
                        <div style={{ padding:"7px 10px", borderRadius:8, background:"#fef2f2", border:"1px solid #fecaca", fontSize:13, color:"#7f1d1d", lineHeight:1.55 }}>
                          <span style={{ fontWeight:700 }}>🛑 Ngăn chặn: </span>{containment}
                        </div>
                      )}
                      <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                        {injuryType && (()=>{ const it=INJURY_TYPES.find(x=>x.val===injuryType); return it?<span style={{ fontSize:13, fontWeight:700, color:it.color, background:it.color+"12", border:`1px solid ${it.color}30`, padding:"3px 10px", borderRadius:6 }}>🤕 {it.label}{affectedCount?` · ${affectedCount} người`:""}</span>:null; })()}
                        {ncSeverity && (()=>{ const nc=NC_SEVERITY.find(x=>x.val===ncSeverity); return nc?<span style={{ fontSize:13, fontWeight:700, color:nc.color, background:nc.color+"12", border:`1px solid ${nc.color}30`, padding:"3px 10px", borderRadius:6 }}>📋 NC: {nc.label}</span>:null; })()}
                      </div>
                    </div>
                  </S5Card>
                )}

                {/* ── Ảnh minh chứng (thumbnails) ── */}
                {(beforePhotos.length>0||afterPhotos.length>0) && (
                  <S5Card accent="#0891b2" onEdit={()=>setStep(3)}>
                    <S5Label>📷 Ảnh minh chứng</S5Label>
                    <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                      {beforePhotos.length>0 && (
                        <div>
                          <div style={{ fontSize:11, fontWeight:700, color:"#0891b2", marginBottom:6 }}>Ảnh hiện trạng ({beforePhotos.length})</div>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {beforePhotos.slice(0,6).map(p=>(
                              <div key={p.id} style={{ width:52, height:52, borderRadius:7, overflow:"hidden", border:"2px solid #bae6fd", flexShrink:0 }}>
                                <img src={p.url} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                              </div>
                            ))}
                            {beforePhotos.length>6 && <div style={{ width:52, height:52, borderRadius:7, background:"#f0f9ff", border:"2px solid #bae6fd", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#0369a1" }}>+{beforePhotos.length-6}</div>}
                          </div>
                        </div>
                      )}
                      {afterPhotos.length>0 && (
                        <div>
                          <div style={{ fontSize:11, fontWeight:700, color:"#16a34a", marginBottom:6 }}>Ảnh sau khắc phục ({afterPhotos.length})</div>
                          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                            {afterPhotos.slice(0,6).map(p=>(
                              <div key={p.id} style={{ width:52, height:52, borderRadius:7, overflow:"hidden", border:"2px solid #86efac", flexShrink:0 }}>
                                <img src={p.url} alt={p.name} style={{ width:"100%", height:"100%", objectFit:"cover" }}/>
                              </div>
                            ))}
                            {afterPhotos.length>6 && <div style={{ width:52, height:52, borderRadius:7, background:"#f0fdf4", border:"2px solid #86efac", display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#15803d" }}>+{afterPhotos.length-6}</div>}
                          </div>
                        </div>
                      )}
                    </div>
                  </S5Card>
                )}

                {/* ── Tài liệu đính kèm ── */}
                {attachedFiles.length>0 && (
                  <S5Card accent="#0f766e" onEdit={()=>setStep(3)}>
                    <S5Label>📎 Tài liệu đính kèm ({attachedFiles.length})</S5Label>
                    <div style={{ display:"flex", flexDirection:"column", gap:5 }}>
                      {attachedFiles.map(f=>(
                        <div key={f.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"5px 8px", borderRadius:7, background:"#f0fdfa", border:"1px solid #99f6e4" }}>
                          <span style={{ fontSize:16 }}>{F_ICON[f.fileType]}</span>
                          <span style={{ fontSize:13, fontWeight:600, color:F_CLR[f.fileType], flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{f.name}</span>
                          <span style={{ fontSize:12, color:"#94a3b8", flexShrink:0 }}>{fmtBytes(f.size)}</span>
                        </div>
                      ))}
                    </div>
                  </S5Card>
                )}

                {/* ── Rủi ro trước → sau ── */}
                {(cond.showRiskScore||isManual) && (riskBeforeScore5>0 || riskFinal>0) && (
                  <S5Card accent={riskImproved?"#16a34a":riskFinal>0&&riskBeforeScore5>0?"#dc2626":"#94a3b8"} onEdit={()=>setStep(4)}>
                    <S5Label>📊 Đánh giá rủi ro</S5Label>
                    <div style={{ display:"grid", gridTemplateColumns:"1fr 40px 1fr", alignItems:"center", gap:8 }}>
                      {/* Before */}
                      {riskBeforeScore5>0
                        ? <RiskBadge score={riskBeforeScore5} label="Trước khắc phục"/>
                        : <div style={{ padding:"10px 12px", borderRadius:10, background:"#f8fafc", border:"2px dashed #e2e8f0", textAlign:"center", color:"#94a3b8", fontSize:12 }}>Chưa nhập</div>
                      }
                      {/* Arrow + badge */}
                      <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                        <div style={{ fontSize:18, color:"#94a3b8" }}>→</div>
                        {riskBeforeScore5>0 && riskFinal>0 && (
                          <div style={{ fontSize:9.5, fontWeight:800, padding:"2px 5px", borderRadius:8,
                            background:riskImproved?"#dcfce7":"#fef2f2",
                            color:riskImproved?"#15803d":"#dc2626",
                            border:`1px solid ${riskImproved?"#86efac":"#fca5a5"}`,
                          }}>
                            {riskImproved?`↓${Math.round((1-riskFinal/riskBeforeScore5)*100)}%`:"⚠️"}
                          </div>
                        )}
                      </div>
                      {/* After */}
                      {riskFinal>0
                        ? <RiskBadge score={riskFinal} label="Sau khắc phục"/>
                        : <div style={{ padding:"10px 12px", borderRadius:10, background:"#f8fafc", border:"2px dashed #e2e8f0", textAlign:"center", color:"#94a3b8", fontSize:12 }}>Chưa nhập</div>
                      }
                    </div>
                    {/* Progress bar */}
                    {riskBeforeScore5>0 && riskFinal>0 && (
                      <div style={{ marginTop:8 }}>
                        <div style={{ height:7, borderRadius:4, background:"#f1f5f9", overflow:"hidden" }}>
                          <div style={{ height:"100%", borderRadius:4, transition:"width .4s",
                            background:riskImproved?"linear-gradient(90deg,#86efac,#4ade80)":"linear-gradient(90deg,#fca5a5,#f87171)",
                            width:`${riskFinal/25*100}%` }}/>
                        </div>
                        <div style={{ marginTop:4, fontSize:11, fontWeight:700, color:riskImproved?"#15803d":"#dc2626" }}>
                          {riskImproved
                            ? `✅ Rủi ro giảm ${riskBeforeScore5} → ${riskFinal} (–${Math.round((1-riskFinal/riskBeforeScore5)*100)}%)`
                            : `⚠️ Rủi ro chưa cải thiện (${riskBeforeScore5} → ${riskFinal})`}
                        </div>
                      </div>
                    )}
                  </S5Card>
                )}

                {/* ── Readiness checklist ── */}
                <div style={{ background:"#fff", borderRadius:13, border:"1px solid #e8eef6", overflow:"hidden", boxShadow:"0 1px 6px rgba(0,0,0,.06)" }}>
                  <div style={{ padding:"10px 14px", borderBottom:"1px solid #f1f5f9", display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:4, height:20, borderRadius:2, background:pct===100?"#16a34a":"#f59e0b", flexShrink:0 }}/>
                    <div style={{ fontSize:12, fontWeight:800, color:"#374151", letterSpacing:"0.05em", textTransform:"uppercase" }}>Danh sách kiểm tra trước khi lưu</div>
                    <div style={{ marginLeft:"auto", fontSize:12, fontWeight:700, color:pct===100?"#16a34a":"#d97706" }}>{pct===100?"✅ Sẵn sàng lưu":"⚠️ Còn thiếu"}</div>
                  </div>
                  <div style={{ padding:"10px 14px", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"5px 16px" }}>
                    {checks.map((c,i)=>(
                      <div key={i} style={{ display:"flex", alignItems:"center", gap:7, padding:"3px 0" }}>
                        <span style={{ fontSize:14, flexShrink:0 }}>{c.ok?"✅":c.required?"❌":"⬜"}</span>
                        <span style={{ fontSize:13, color:c.ok?"#374151":c.required?"#dc2626":"#94a3b8", fontWeight:c.required&&!c.ok?700:500 }}>
                          {c.label}
                          {!c.required&&<span style={{ fontSize:11, color:"#cbd5e1", marginLeft:4 }}>(tuỳ chọn)</span>}
                        </span>
                        {!c.ok && (
                          <button onClick={()=>setStep(c.step)} style={{ marginLeft:"auto", fontSize:11, padding:"1px 6px", borderRadius:4, border:`1px solid ${c.required?"#fca5a5":"#e2e8f0"}`, background:c.required?"#fef2f2":"#f8fafc", cursor:"pointer", color:c.required?"#dc2626":"#64748b", fontWeight:700, whiteSpace:"nowrap" }}>
                            Bước {c.step}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <div style={{ padding:"10px 14px", borderRadius:10, background:"#fef2f2", border:"1.5px solid #fca5a5", fontSize:13, color:"#dc2626", fontWeight:600, display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:18 }}>⚠️</span> {error}
                  </div>
                )}

              </div>
            );
          })()}
        </div>

        {/* Footer */}
        <div className="v3-footer">
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:13, fontWeight:600, color:"#94a3b8", background:"#f8fafc", border:"1px solid #e2e8f0", borderRadius:20, padding:"3px 10px" }}>
              {step}/{STEPS.length}
            </span>
            {step===1&&!canNext1&&<span style={{ fontSize:13, color:"#94a3b8" }}>Chọn nguồn để tiếp tục</span>}
            {step===2&&missing2.length>0&&<span style={{ fontSize:13, color:"#d97706", fontWeight:600 }}>⚠ Điền {missing2[0]}</span>}
            {step===3&&missing3.length>0&&<span style={{ fontSize:13, color:"#d97706", fontWeight:600 }}>⚠ Điền {missing3[0]}</span>}
            {step===4&&missing4.length>0&&<span style={{ fontSize:13, color:"#d97706", fontWeight:600 }}>⚠ Điền {missing4[0]}</span>}
            {step===5&&!canSubmit&&<span style={{ fontSize:13, color:"#dc2626", fontWeight:600 }}>❌ Còn trường bắt buộc chưa điền — nhấn "Bước X" để quay lại</span>}
            {step===5&&canSubmit&&<span style={{ fontSize:13, color:"#15803d", fontWeight:700 }}>✅ Đã đủ thông tin — sẵn sàng lưu!</span>}
          </div>
          <div style={{ display:"flex", gap:8 }}>
            {step>1&&(
              <button onClick={()=>setStep(s=>s-1)} style={{
                padding:"9px 20px", borderRadius:9, cursor:"pointer",
                border:"1.5px solid #e2e8f0", background:"#f8fafc",
                fontSize:13, fontWeight:700, color:"#475569",
                transition:"all .12s",
              }}
                onMouseEnter={e=>{e.currentTarget.style.background="#f1f5f9";e.currentTarget.style.borderColor="#cbd5e1";}}
                onMouseLeave={e=>{e.currentTarget.style.background="#f8fafc";e.currentTarget.style.borderColor="#e2e8f0";}}>
                ← Quay lại
              </button>
            )}
            {step<5 ? (
              (() => {
                const canGo = step===1?canNext1:step===2?canNext2:step===3?canNext3:canNext4;
                return (
                  <button disabled={!canGo} onClick={()=>setStep(s=>s+1)} style={{
                    padding:"9px 24px", borderRadius:9, border:"none",
                    cursor:canGo?"pointer":"not-allowed",
                    background:canGo?"linear-gradient(135deg,#1e40af,#2563eb)":"#e2e8f0",
                    color:canGo?"#fff":"#94a3b8",
                    fontSize:14, fontWeight:800, letterSpacing:"0.02em",
                    boxShadow:canGo?"0 4px 16px rgba(30,64,175,.30)":"none",
                    transition:"all .15s",
                  }}>Tiếp tục →</button>
                );
              })()
            ) : (
              <button disabled={submitting||!canSubmit} onClick={submit} style={{
                padding:"9px 24px", borderRadius:9, border:"none",
                cursor:(submitting||!canSubmit)?"not-allowed":"pointer",
                background:submitting?"#94a3b8":!canSubmit?"#e2e8f0":"linear-gradient(135deg,#15803d,#22c55e)",
                color:(submitting||!canSubmit)?"#94a3b8":"#fff", fontSize:14, fontWeight:800,
                boxShadow:(submitting||!canSubmit)?"none":"0 4px 16px rgba(21,128,61,.32)",
                transition:"all .15s",
              }}>{submitting?"Đang lưu...":!canSubmit?"⚠️ Chưa đủ thông tin":"💾 Lưu CAPA"}</button>
            )}
          </div>
        </div>

      </div>
    </div>
  , document.body);
}
