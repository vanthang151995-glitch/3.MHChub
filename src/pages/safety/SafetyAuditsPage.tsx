import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BarChart3, CheckCircle2, ChevronLeft, ChevronRight,
  ClipboardCheck, Edit3, Eye, Loader2, Plus, Save, Send, ShieldCheck, X, Zap
} from "lucide-react";
import { useLocation } from "react-router-dom";
import { currentMonth, apiFetchArray, apiFetch, patchJson, postJson } from "./safety-api";
import { ErrorPanel, LoadingPanel, ModalShell } from "./safety-shared";
import { SafetyI18nRender } from "./safety-i18n-render";

/* ─── Types ─────────────────────────────────────────────────────────────── */
type AuditQuestion = {
  id: string; pillar: string; sortOrder: number;
  question: string; expectedStandard: string;
  maxScore: number; requiredEvidence: boolean;
};
type AuditTemplate = {
  id: string; code: string; name: string; version: string;
  questions: AuditQuestion[];
};
type AuditAnswer = {
  id?: string; questionId: string; score: number;
  finding?: string; evidenceNotes?: string; actionRequired?: boolean;
};
type LinkedCapa = {
  id: string; code: string; title: string;
  status: string; priority: string;
  departmentCode: string; dueDate?: string; createdAt?: string;
};
type Audit = {
  id: string; code: string; templateId: string; title: string;
  departmentCode: string; locationId?: string; period?: string;
  scheduledDate?: string; status: string;
  totalScore: number; maxScore: number; scorePercent: number;
  reviewerName?: string; reviewedAt?: string; reviewNote?: string;
  createdByName?: string; updatedByName?: string; createdAt?: string;
};
type AuditDetail = Audit & {
  answers: AuditAnswer[]; questions: AuditQuestion[];
  capaCount: number; capas: LinkedCapa[];
};
type Department = { code: string; name: string };
type Location = { id: string; code: string; name: string; departmentCode: string };
type PillarSummary = {
  perAudit: Record<string, Record<string, number>>;
  averages: { pillar: string; pct: number }[];
};

/* ─── Constants ──────────────────────────────────────────────────────────── */
const PILLAR_COLORS = ["#6366f1","#0ea5e9","#10b981","#f59e0b","#ec4899","#ef4444"];
const PILLAR_EMOJIS = ["🗂️","📦","🧹","📊","🎯","🦺"];
const STATUS_LABEL: Record<string,string> = {
  closed:"Đã đóng", draft:"Nháp", reopened:"Mở lại",
  reviewed:"EHS đã duyệt", submitted:"Chờ EHS duyệt"
};
const STATUS_INL: Record<string,{label:string;color:string;bg:string}> = {
  draft:    {label:"Nháp",       color:"#6b7280",bg:"#f3f4f6"},
  submitted:{label:"Chờ duyệt", color:"#d97706",bg:"#fef3c7"},
  reviewed: {label:"Đã duyệt",  color:"#059669",bg:"#d1fae5"},
  closed:   {label:"Đã đóng",   color:"#4b5563",bg:"#e5e7eb"},
  reopened: {label:"Mở lại",    color:"#dc2626",bg:"#fee2e2"},
};
const PRIORITY_INL: Record<string,{label:string;color:string;bg:string}> = {
  high:  {label:"Cao",       color:"#dc2626",bg:"#fee2e2"},
  medium:{label:"Trung bình",color:"#d97706",bg:"#fef3c7"},
  low:   {label:"Thấp",      color:"#059669",bg:"#d1fae5"},
};
const CAPA_ST: Record<string,{label:string;color:string;bg:string}> = {
  open:         {label:"Mới tạo",   color:"#6366f1",bg:"#eef2ff"},
  assigned:     {label:"Phân công", color:"#0ea5e9",bg:"#e0f2fe"},
  in_progress:  {label:"Đang xử lý",color:"#d97706",bg:"#fef3c7"},
  done_by_owner:{label:"Chờ verify",color:"#f59e0b",bg:"#fff8f0"},
  verified:     {label:"Đã verify", color:"#059669",bg:"#d1fae5"},
  closed:       {label:"Đã đóng",   color:"#4b5563",bg:"#e5e7eb"},
  blocked:      {label:"Tắc nghẽn", color:"#dc2626",bg:"#fee2e2"},
  reopened:     {label:"Mở lại",    color:"#dc2626",bg:"#fee2e2"},
};
const PROGRAM_LABELS: Record<string,string> = {
  kyt:"KYT", pccc:"PCCC & Điện", medical:"Y tế / Sơ cứu",
  "self-inspection":"Tự kiểm tra ATVSLĐ"
};
const DEFAULT_FORM = {
  departmentCode:"EHS", locationId:"", period:currentMonth(),
  scheduledDate:new Date().toISOString().slice(0,10),
  templateId:"", title:""
};
const SCORE_LABELS = ["—","Không đạt","Yếu","Trung bình","Khá","Xuất sắc"];
const SCORE_COLORS = ["#94a3b8","#ef4444","#f97316","#f59e0b","#0ea5e9","#10b981"];

/* ─── Helpers ────────────────────────────────────────────────────────────── */
function errMsg(e:unknown,fb:string){return(e as Error)?.message||fb;}
function scoreColor(p:number){
  if(p>97)return"#059669";if(p>=91)return"#16a34a";
  if(p>=71)return"#65a30d";if(p>=51)return"#d97706";
  if(p>=31)return"#ea580c";return"#dc2626";
}
function scoreLabel(p:number){
  if(p>97)return"Xuất sắc";if(p>=91)return"Tốt";
  if(p>=71)return"Khá";if(p>=51)return"Trung bình";
  if(p>=31)return"Yếu";return"Kém";
}

function getPillarOrder(questions:AuditQuestion[]):string[]{
  const seen=new Set<string>();const r:string[]=[];
  for(const q of [...questions].sort((a,b)=>a.sortOrder-b.sortOrder)){
    if(!seen.has(q.pillar)){seen.add(q.pillar);r.push(q.pillar);}
  }
  return r;
}

function getPillarBreakdown(detail:AuditDetail){
  const map:Record<string,{total:number;max:number;answered:number}>={};
  for(const q of detail.questions){
    if(!map[q.pillar])map[q.pillar]={total:0,max:0,answered:0};
    const ans=detail.answers.find(a=>a.questionId===q.id);
    if(ans!==undefined){
      map[q.pillar].total+=Number(ans.score);
      map[q.pillar].max+=q.maxScore;
      map[q.pillar].answered+=1;
    }
  }
  const order=getPillarOrder(detail.questions);
  return order.filter(p=>map[p]&&map[p].answered>0).map((pillar,idx)=>({
    pillar,idx,
    total:map[pillar].total,max:map[pillar].max,
    pct:map[pillar].max>0?Math.round((map[pillar].total/map[pillar].max)*100):0
  }));
}

function getQuestionsGrouped(detail:AuditDetail){
  const groups:Record<string,{question:AuditQuestion;answer:AuditAnswer|undefined}[]>={};
  const order=getPillarOrder(detail.questions);
  for(const q of [...detail.questions].sort((a,b)=>a.sortOrder-b.sortOrder)){
    if(!groups[q.pillar])groups[q.pillar]=[];
    groups[q.pillar].push({question:q,answer:detail.answers.find(a=>a.questionId===q.id)});
  }
  return order.filter(p=>groups[p]).map(p=>[p,groups[p]] as [string,typeof groups[string]]);
}

function getDeptStats(audits:Audit[]){
  const map:Record<string,{total:number;sum:number}>={};
  for(const a of audits){
    if(!map[a.departmentCode])map[a.departmentCode]={total:0,sum:0};
    map[a.departmentCode].total+=1;
    map[a.departmentCode].sum+=Number(a.scorePercent||0);
  }
  return Object.entries(map)
    .map(([dept,{total,sum}])=>({dept,total,avg:total>0?Math.round(sum/total):0}))
    .sort((a,b)=>b.avg-a.avg).slice(0,8);
}

/* ─── Score Ring ─────────────────────────────────────────────────────────── */
function ScoreRing({pct,size=52}:{pct:number;size?:number}){
  const r=(size-8)/2,circ=2*Math.PI*r,color=scoreColor(pct);
  return(
    <svg width={size} height={size} style={{transform:"rotate(-90deg)",flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={6}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={circ} strokeDashoffset={circ*(1-pct/100)} strokeLinecap="round"/>
      <text x={size/2} y={size/2+size*0.08} textAnchor="middle" fill={color}
        style={{fontSize:size*0.22,fontWeight:700,transform:`rotate(90deg)`,transformOrigin:`${size/2}px ${size/2}px`}}>
        {pct}
      </text>
    </svg>
  );
}

/* ─── Pillar Mini Bars ───────────────────────────────────────────────────── */
function PillarMini({pillars}:{pillars:number[]}){
  if(!pillars.length)return<span style={{fontSize:12,color:"#cbd5e1"}}>–</span>;
  return(
    <div style={{display:"flex",gap:3,alignItems:"flex-end",height:28}}>
      {pillars.map((v,i)=>(
        <div key={i} title={`S${i+1}: ${v}%`} style={{
          width:8,height:Math.max(3,v*0.28),
          background:PILLAR_COLORS[i%PILLAR_COLORS.length],
          borderRadius:2,opacity:0.85
        }}/>
      ))}
    </div>
  );
}

/* ─── Score Buttons ──────────────────────────────────────────────────────── */
function ScoreButtons({value,max=5,onChange}:{value:number;max?:number;onChange:(v:number)=>void}){
  return(
    <div style={{display:"flex",gap:6}} role="group" aria-label="Chọn điểm">
      {Array.from({length:max+1},(_,v)=>(
        <button key={v} type="button" onClick={()=>onChange(v)}
          aria-label={`${SCORE_LABELS[v]||v} (${v}/${max})`} aria-pressed={value===v}
          style={{
            flex:1,padding:"8px 0",borderRadius:8,border:"2px solid",
            fontSize:14,fontWeight:700,transition:"all 0.15s",cursor:"pointer",
            borderColor:value===v?SCORE_COLORS[v]:"#e2e8f0",
            background:value===v?SCORE_COLORS[v]:"#f8fafc",
            color:value===v?"#fff":SCORE_COLORS[v],
          }}>
          {v}
        </button>
      ))}
    </div>
  );
}

/* ─── Pillar Column Chart ────────────────────────────────────────────────── */
function PillarColumnChart({data}:{data:{pillar:string;pct:number;idx:number}[]}){
  if(!data.length)return<p style={{fontSize:12,color:"#94a3b8",textAlign:"center",padding:"16px 0"}}>Chưa có dữ liệu.</p>;
  return(
    <div style={{display:"flex",gap:12,alignItems:"flex-end",height:80}}>
      {data.map(({pillar,pct,idx})=>{
        const color=PILLAR_COLORS[idx%PILLAR_COLORS.length];
        return(
          <div key={pillar} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
            <span style={{fontSize:12,fontWeight:700,color}}>{pct}%</span>
            <div style={{width:"100%",height:Math.max(4,pct*0.58),background:color,
              borderRadius:"6px 6px 0 0",opacity:0.85,transition:"height 0.5s"}}/>
            <span style={{fontSize:10,fontWeight:700,color:"#64748b"}}>{pillar.slice(0,3)}</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Radar Chart ────────────────────────────────────────────────────────── */
function RadarChart({data}:{data:{label:string;pct:number;color:string}[]}){
  if(!data.length)return null;
  const cx=130,cy=120,r=90,n=data.length;
  const angle=(i:number)=>(i*2*Math.PI/n)-Math.PI/2;
  const pt=(i:number,val:number):[number,number]=>{
    const a=angle(i),rv=r*(val/100);
    return[cx+rv*Math.cos(a),cy+rv*Math.sin(a)];
  };
  const pts=(arr:number[])=>arr.map((v,i)=>pt(i,v).join(",")).join(" ");
  const avg=Math.round(data.reduce((s,d)=>s+d.pct,0)/data.length);
  return(
    <svg width={260} height={240} style={{overflow:"visible"}}>
      {[20,40,60,80,100].map(v=>(
        <polygon key={v} points={data.map((_,i)=>pt(i,v).join(",")).join(" ")}
          fill="none" stroke="#e2e8f0" strokeWidth={1}/>
      ))}
      {data.map((_,i)=>{const[x,y]=pt(i,100);return<line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e2e8f0" strokeWidth={1}/>;} )}
      <polygon points={pts(data.map(d=>d.pct))} fill="#6366f130" stroke="#6366f1" strokeWidth={2.5}/>
      {data.map((d,i)=>{const[x,y]=pt(i,d.pct);return<circle key={i} cx={x} cy={y} r={4} fill="#6366f1" stroke="#fff" strokeWidth={2}/>;} )}
      {data.map((d,i)=>{
        const[lx,ly]=pt(i,122);
        return(
          <g key={i}>
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="middle"
              style={{fontSize:10,fontWeight:700,fill:d.color}}>{d.label}</text>
            <text x={lx} y={ly+13} textAnchor="middle" dominantBaseline="middle"
              style={{fontSize:9,fill:"#94a3b8"}}>{d.pct}%</text>
          </g>
        );
      })}
      <text x={cx} y={cy-2} textAnchor="middle" dominantBaseline="middle"
        style={{fontSize:22,fontWeight:800,fill:"#1e293b"}}>{avg}%</text>
      <text x={cx} y={cy+16} textAnchor="middle" dominantBaseline="middle"
        style={{fontSize:9,fill:"#94a3b8"}}>Tổng điểm</text>
    </svg>
  );
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export function SafetyAuditsPage(){
  const location=useLocation();
  const autoOpenKey=useRef("");

  /* ── Data ── */
  const [audits,setAudits]=useState<Audit[]>([]);
  const [templates,setTemplates]=useState<AuditTemplate[]>([]);
  const [departments,setDepartments]=useState<Department[]>([]);
  const [locations,setLocations]=useState<Location[]>([]);
  const [pillarSummary,setPillarSummary]=useState<PillarSummary|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<unknown>(null);

  /* ── Filters ── */
  const [filterStatus,setFilterStatus]=useState("");
  const [filterPeriod,setFilterPeriod]=useState("");
  const [filterSearch,setFilterSearch]=useState("");

  /* ── Detail modal ── */
  const [detail,setDetail]=useState<AuditDetail|null>(null);
  const [detailLoading,setDetailLoading]=useState(false);
  const [detailTab,setDetailTab]=useState(0);
  const [editAnswers,setEditAnswers]=useState<AuditAnswer[]>([]);
  const [editSaving,setEditSaving]=useState(false);
  const [reviewNote,setReviewNote]=useState("");
  const [reviewOpen,setReviewOpen]=useState(false);
  const [expandedCapa,setExpandedCapa]=useState<string|null>(null);

  /* ── Create modal ── */
  const [createOpen,setCreateOpen]=useState(false);
  const [form,setForm]=useState({...DEFAULT_FORM});
  const [answers,setAnswers]=useState<AuditAnswer[]>([]);
  const [saving,setSaving]=useState(false);
  const [activePillarIdx,setActivePillarIdx]=useState(0);

  /* ── Feedback ── */
  const [opError,setOpError]=useState("");
  const [opSuccess,setOpSuccess]=useState("");

  /* ── Load data ── */
  const loadAbortRef=useRef<AbortController|null>(null);
  const loadData=useCallback(async()=>{
    loadAbortRef.current?.abort();
    const ac=new AbortController();
    loadAbortRef.current=ac;
    setLoading(true);setError(null);
    try{
      const[auditRows,templateRows,deptRows,locRows,summary]=await Promise.all([
        apiFetchArray<Audit>("/api/audits"),
        apiFetchArray<AuditTemplate>("/api/audit-templates"),
        apiFetchArray<Department>("/api/safety/departments"),
        apiFetchArray<Location>("/api/locations"),
        apiFetch<PillarSummary>("/api/audits/pillar-summary").catch(()=>({perAudit:{},averages:[]})),
      ]);
      if(ac.signal.aborted)return;
      setAudits(auditRows);setTemplates(templateRows);
      setDepartments(deptRows);setLocations(locRows);
      setPillarSummary(summary);
      const tid=templateRows[0]?.id||"";
      const dc=deptRows[0]?.code||"EHS";
      setForm(f=>({...f,departmentCode:f.departmentCode||dc,templateId:f.templateId||tid,
        title:f.title||`Audit 6S ${dc} ${f.period||currentMonth()}`}));
    }catch(e){if(!ac.signal.aborted)setError(e);}
    finally{if(!ac.signal.aborted)setLoading(false);}
  },[]);

  useEffect(()=>{loadData();},[loadData]);

  /* ── Auto-open from query param ── */
  useEffect(()=>{
    if(loading)return;
    const params=new URLSearchParams(location.search);
    if(params.get("create")!=="1")return;
    if(autoOpenKey.current===location.search)return;
    autoOpenKey.current=location.search;
    const prog=params.get("program")||"";
    const progLabel=PROGRAM_LABELS[prog]||"";
    setOpError("");setOpSuccess("");setCreateOpen(true);
    setForm(f=>({...f,title:progLabel?`Audit chuyên đề ${progLabel} ${f.departmentCode||"EHS"} ${f.period||currentMonth()}`:
      f.title||`Audit 6S ${f.departmentCode||"EHS"} ${f.period||currentMonth()}`}));
  },[loading,location.search]);

  /* ── Active template ── */
  const activeTemplate=useMemo(()=>templates.find(t=>t.id===form.templateId)||templates[0],[form.templateId,templates]);

  useEffect(()=>{
    if(!activeTemplate)return;
    setAnswers(activeTemplate.questions.map(q=>({
      actionRequired:false,evidenceNotes:"",finding:"",questionId:q.id,score:q.maxScore,
    })));
    setActivePillarIdx(0);
  },[activeTemplate]);

  /* ── Pillar order for create modal ── */
  const createPillarOrder=useMemo(()=>activeTemplate?getPillarOrder(activeTemplate.questions):[],[activeTemplate]);

  /* ── Per-pillar scores for create sidebar ── */
  const createPillarScores=useMemo(()=>{
    if(!activeTemplate)return[];
    return createPillarOrder.map((pillar,idx)=>{
      const qs=activeTemplate.questions.filter(q=>q.pillar===pillar);
      const total=qs.reduce((s,q)=>{const a=answers.find(x=>x.questionId===q.id);return s+(a?Number(a.score):q.maxScore);},0);
      const max=qs.reduce((s,q)=>s+q.maxScore,0);
      const warnings=qs.filter(q=>{const a=answers.find(x=>x.questionId===q.id);return a&&(Number(a.score)<=1||!!a.actionRequired);}).length;
      return{pillar,idx,pct:max>0?Math.round((total/max)*100):0,warnings,total,max};
    });
  },[activeTemplate,createPillarOrder,answers]);

  /* ── Filtered audits ── */
  const filtered=useMemo(()=>{
    const search=filterSearch.toLowerCase();
    return audits.filter(a=>{
      if(filterStatus&&a.status!==filterStatus)return false;
      if(filterPeriod&&a.period!==filterPeriod)return false;
      if(search&&!a.title.toLowerCase().includes(search)&&!a.code.toLowerCase().includes(search)&&!a.departmentCode.toLowerCase().includes(search))return false;
      return true;
    });
  },[audits,filterStatus,filterPeriod,filterSearch]);

  /* ── Stats ── */
  const stats=useMemo(()=>{
    const submitted=filtered.filter(a=>a.status==="submitted").length;
    const reviewed=filtered.filter(a=>a.status==="reviewed"||a.status==="closed").length;
    const lowScore=filtered.filter(a=>Number(a.scorePercent||0)<80).length;
    const avg=filtered.length?Math.round(filtered.reduce((s,a)=>s+Number(a.scorePercent||0),0)/filtered.length):0;
    return{submitted,reviewed,lowScore,avg};
  },[filtered]);

  const deptStats=useMemo(()=>getDeptStats(audits),[audits]);

  /* ── Pillar column chart data ── */
  const pillarChartData=useMemo(()=>{
    if(!pillarSummary?.averages.length)return[];
    // order by template pillar order if available
    const template=templates[0];
    if(template){
      const order=getPillarOrder(template.questions);
      return order.map((pillar,idx)=>{
        const found=pillarSummary.averages.find(a=>a.pillar===pillar);
        return{pillar,pct:found?.pct??0,idx};
      }).filter(d=>d.pct>0||pillarSummary.averages.some(a=>a.pillar===d.pillar));
    }
    return pillarSummary.averages.map((a,idx)=>({...a,idx}));
  },[pillarSummary,templates]);

  /* ── Period options ── */
  const periodOptions=useMemo(()=>{
    const s=new Set(audits.map(a=>a.period).filter(Boolean) as string[]);
    return[...s].sort().reverse();
  },[audits]);

  /* ── Detail ── */
  const detailAbortRef=useRef<AbortController|null>(null);
  async function openDetail(audit:Audit){
    detailAbortRef.current?.abort();
    const ac=new AbortController();
    detailAbortRef.current=ac;
    setDetail(null);setDetailTab(0);setDetailLoading(true);setExpandedCapa(null);
    setOpError("");setOpSuccess("");
    try{
      const d=await apiFetch<AuditDetail>(`/api/audits/${encodeURIComponent(audit.id)}`);
      if(ac.signal.aborted)return;
      setDetail(d);
      setEditAnswers(d.answers.map(a=>({...a})));
      setReviewNote(d.reviewNote||"");
    }catch(e){if(!ac.signal.aborted)setOpError(errMsg(e,"Không tải được chi tiết audit."));}
    finally{if(!ac.signal.aborted)setDetailLoading(false);}
  }
  function closeDetail(){
    detailAbortRef.current?.abort();
    setDetail(null);setDetailLoading(false);setReviewOpen(false);setEditSaving(false);
  }

  /* ── Edit answers (detail modal) ── */
  function updateEditAnswer(questionId:string,patch:Partial<AuditAnswer>){
    setEditAnswers(prev=>prev.map(a=>{
      if(a.questionId!==questionId)return a;
      const next={...a,...patch};
      if(patch.score!==undefined&&Number(patch.score)<=1)next.actionRequired=true;
      return next;
    }));
  }
  async function saveEditAnswers(){
    if(!detail)return;
    setEditSaving(true);setOpError("");setOpSuccess("");
    try{
      const updated=await patchJson<AuditDetail>(`/api/audits/${encodeURIComponent(detail.id)}`,{answers:editAnswers});
      setDetail({...updated,questions:detail.questions,capaCount:detail.capaCount,capas:detail.capas});
      setOpSuccess("Đã lưu thay đổi câu trả lời.");
      await loadData();
    }catch(e){setOpError(errMsg(e,"Không lưu được câu trả lời."));}
    finally{setEditSaving(false);}
  }
  async function submitAudit(audit:Audit){
    setOpError("");setOpSuccess("");
    try{
      await postJson(`/api/audits/${encodeURIComponent(audit.id)}/submit`,{});
      setOpSuccess(`Đã nộp ${audit.code} sang EHS duyệt.`);
      closeDetail();await loadData();
    }catch(e){setOpError(errMsg(e,"Không nộp được audit."));}
  }
  async function reviewAudit(approved:boolean){
    if(!detail)return;
    setEditSaving(true);setOpError("");setOpSuccess("");
    try{
      await postJson(`/api/audits/${encodeURIComponent(detail.id)}/review`,{approved,note:reviewNote});
      setOpSuccess(approved?`Đã duyệt ${detail.code}.`:`Đã trả lại ${detail.code}.`);
      setReviewOpen(false);closeDetail();await loadData();
    }catch(e){setOpError(errMsg(e,"Không review được audit."));}
    finally{setEditSaving(false);}
  }
  async function reopenAudit(audit:Audit){
    setOpError("");setOpSuccess("");
    try{
      await patchJson(`/api/audits/${encodeURIComponent(audit.id)}`,{status:"reopened"});
      setOpSuccess(`Đã mở lại ${audit.code}.`);
      closeDetail();await loadData();
    }catch(e){setOpError(errMsg(e,"Không mở lại được audit."));}
  }

  /* ── Create ── */
  async function handleCreate(e:React.FormEvent){
    e.preventDefault();setSaving(true);setOpError("");setOpSuccess("");
    try{
      const created=await postJson<Audit>("/api/audits",{...form,answers});
      setCreateOpen(false);setOpSuccess(`Đã tạo ${created.code||form.title}.`);
      await loadData();
    }catch(e){setOpError(errMsg(e,"Không tạo được audit."));}
    finally{setSaving(false);}
  }
  function updateAnswer(questionId:string,patch:Partial<AuditAnswer>){
    setAnswers(prev=>prev.map(a=>{
      if(a.questionId!==questionId)return a;
      const next={...a,...patch};
      if(patch.score!==undefined&&Number(patch.score)<=1)next.actionRequired=true;
      return next;
    }));
  }

  /* ─────────────────────────────────────────────────────────────── */
  if(loading)return<SafetyI18nRender><LoadingPanel label="Đang tải audit 6S…"/></SafetyI18nRender>;
  if(error)return<SafetyI18nRender><ErrorPanel error={error}/></SafetyI18nRender>;

  const pillarBreakdown=detail?getPillarBreakdown(detail):[];
  const questionsGrouped=detail?getQuestionsGrouped(detail):[];
  const canEdit=detail&&(detail.status==="draft"||detail.status==="reopened");
  const pct=detail?Math.round(Number(detail.scorePercent||0)):0;
  const overallTotal=answers.reduce((s,a)=>s+Number(a.score||0),0);
  const overallMax=activeTemplate?.questions.reduce((s,q)=>s+q.maxScore,0)||0;
  const overallPct=overallMax>0?Math.round((overallTotal/overallMax)*100):0;

  /* ── Active pillar questions for create modal ── */
  const activePillarName=createPillarOrder[activePillarIdx]||"";
  const activePillarQuestions=(activeTemplate?.questions||[])
    .filter(q=>q.pillar===activePillarName)
    .sort((a,b)=>a.sortOrder-b.sortOrder);

  return(
    <SafetyI18nRender>
      <div style={{minHeight:"100%",background:"#f0f4fa",padding:"24px 28px",fontFamily:"'Inter',sans-serif"}}>

        {/* ── Header ── */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:24}}>
          <div style={{display:"flex",alignItems:"center",gap:12}}>
            <div style={{width:42,height:42,borderRadius:12,
              background:"linear-gradient(135deg,#6366f1,#818cf8)",
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>📋</div>
            <div>
              <h1 style={{margin:0,fontSize:22,fontWeight:800,color:"#1e293b",letterSpacing:-0.5}}>6S Audit Management</h1>
              <p style={{margin:0,fontSize:13,color:"#64748b"}}>Quản lý kiểm tra & đánh giá 6S toàn nhà máy</p>
            </div>
          </div>
          <button
            onClick={()=>{setOpError("");setOpSuccess("");setCreateOpen(true);}}
            style={{display:"flex",alignItems:"center",gap:8,padding:"9px 18px",borderRadius:8,
              background:"linear-gradient(135deg,#6366f1,#818cf8)",color:"#fff",
              fontSize:13,fontWeight:600,border:"none",cursor:"pointer",
              boxShadow:"0 4px 12px #6366f140"}}>
            <Plus className="size-4"/>Tạo Audit mới
          </button>
        </div>

        {/* ── Feedback ── */}
        {opError&&(
          <div style={{display:"flex",alignItems:"center",gap:8,borderRadius:10,padding:"12px 16px",
            marginBottom:16,background:"#fee2e2",border:"1px solid #fca5a5",color:"#dc2626",fontSize:13}} role="alert">
            <AlertTriangle className="size-4 shrink-0"/>{opError}
          </div>
        )}
        {opSuccess&&(
          <div style={{display:"flex",alignItems:"center",gap:8,borderRadius:10,padding:"12px 16px",
            marginBottom:16,background:"#d1fae5",border:"1px solid #6ee7b7",color:"#059669",fontSize:13}} role="status">
            <CheckCircle2 className="size-4 shrink-0"/>{opSuccess}
          </div>
        )}

        {/* ── KPI Cards ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:16,marginBottom:20}}>
          {[
            {label:"Tổng Audit tháng này",value:filtered.length,icon:"📋",color:"#6366f1",bg:"#eef2ff",sub:`${audits.length} tổng cộng`},
            {label:"Chờ EHS duyệt",value:stats.submitted,icon:"⏳",color:"#d97706",bg:"#fef3c7",sub:"Cần xử lý"},
            {label:"Đã duyệt",value:stats.reviewed,icon:"✅",color:"#059669",bg:"#d1fae5",sub:"Hoàn thành"},
            {label:"Điểm TB toàn bộ",value:`${stats.avg}%`,icon:"🎯",color:"#0ea5e9",bg:"#e0f2fe",sub:`${stats.lowScore} audit dưới 80%`},
          ].map((k,i)=>(
            <div key={i} style={{background:"#fff",borderRadius:14,padding:"18px 20px",
              boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5"}}>
              <div style={{width:40,height:40,borderRadius:10,background:k.bg,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:18,marginBottom:10}}>{k.icon}</div>
              <div style={{fontSize:28,fontWeight:800,color:k.color,marginBottom:2}}>{k.value}</div>
              <div style={{fontSize:12,color:"#64748b",fontWeight:500}}>{k.label}</div>
              <div style={{fontSize:11,color:"#94a3b8",marginTop:4}}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* ── Pillar Column Chart ── */}
        {pillarChartData.length>0&&(
          <div style={{background:"#fff",borderRadius:14,padding:"18px 20px",marginBottom:20,
            boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5"}}>
            <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:14}}>Điểm trung bình theo trụ cột</div>
            <PillarColumnChart data={pillarChartData}/>
          </div>
        )}

        {/* ── Filter bar ── */}
        <div style={{display:"flex",gap:12,marginBottom:16,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{position:"relative",flex:1,minWidth:200}}>
            <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",fontSize:14,color:"#94a3b8"}}>🔍</span>
            <input value={filterSearch} onChange={e=>setFilterSearch(e.target.value)}
              placeholder="Tìm theo bộ phận, mã audit..."
              style={{width:"100%",padding:"9px 12px 9px 36px",border:"1px solid #e2e8f0",borderRadius:8,
                fontSize:13,color:"#1e293b",background:"#fff",boxSizing:"border-box",outline:"none"}}/>
          </div>
          <div style={{display:"flex",gap:4,background:"#fff",borderRadius:8,padding:"4px",border:"1px solid #e2e8f0"}}>
            {([["","Tất cả"],["draft","Nháp"],["submitted","Chờ duyệt"],["reviewed","Đã duyệt"],["reopened","Mở lại"]] as [string,string][]).map(([v,l])=>(
              <button key={v} type="button" onClick={()=>setFilterStatus(v)}
                style={{padding:"6px 12px",borderRadius:6,border:"none",fontSize:12,cursor:"pointer",fontWeight:600,
                  background:filterStatus===v?"#6366f1":"transparent",color:filterStatus===v?"#fff":"#64748b"}}>
                {l}
              </button>
            ))}
          </div>
          <select value={filterPeriod} onChange={e=>setFilterPeriod(e.target.value)}
            style={{padding:"9px 12px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:13,color:"#475569",background:"#fff",outline:"none"}}>
            <option value="">Tất cả kỳ</option>
            {periodOptions.map(p=><option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* ── Main grid ── */}
        <div style={{display:"grid",gap:16,gridTemplateColumns:"minmax(0,1fr) 280px"}}>

          {/* ── Audit Table ── */}
          <div style={{background:"#fff",borderRadius:14,boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5",overflow:"hidden"}}>
            {filtered.length===0?(
              <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12,padding:"60px 0",color:"#94a3b8"}}>
                <ClipboardCheck className="size-10" style={{opacity:0.3}}/>
                <p style={{fontSize:13,fontWeight:600}}>Không có audit nào phù hợp.</p>
              </div>
            ):(
              <div style={{overflowX:"auto"}}>
                <table style={{width:"100%",borderCollapse:"collapse"}}>
                  <thead>
                    <tr style={{background:"#f8fafc",borderBottom:"1px solid #e8edf5"}}>
                      {["Mã Audit","Bộ phận","Kỳ","Điểm","Trụ cột","Người duyệt","Ngày","Trạng thái","Thao tác"].map(h=>(
                        <th key={h} style={{padding:"11px 14px",textAlign:"left",fontSize:12,fontWeight:700,color:"#64748b",whiteSpace:"nowrap"}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((audit,idx)=>{
                      const p=Math.round(Number(audit.scorePercent||0));
                      const st=STATUS_INL[audit.status]||STATUS_INL.draft;
                      const pillarBars=pillarSummary?.perAudit[audit.id]?
                        getPillarOrder(templates.find(t=>t.id===audit.templateId)?.questions||[]).map(pi=>pillarSummary.perAudit[audit.id][pi]??0):
                        [];
                      return(
                        <tr key={audit.id} onClick={()=>openDetail(audit)}
                          style={{borderBottom:"1px solid #f1f5f9",cursor:"pointer",
                            background:idx%2===0?"#fff":"#fafbfd",transition:"background 0.15s"}}
                          onMouseEnter={e=>(e.currentTarget.style.background="#eef2ff")}
                          onMouseLeave={e=>(e.currentTarget.style.background=idx%2===0?"#fff":"#fafbfd")}>
                          <td style={{padding:"12px 14px"}}>
                            <div style={{fontSize:13,fontWeight:700,color:"#6366f1"}}>{audit.code}</div>
                            <div style={{fontSize:12,color:"#475569",maxWidth:180,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{audit.title}</div>
                          </td>
                          <td style={{padding:"12px 14px",fontSize:13,color:"#1e293b",fontWeight:500}}>{audit.departmentCode}</td>
                          <td style={{padding:"12px 14px",fontSize:12,color:"#64748b"}}>{audit.period||"–"}</td>
                          <td style={{padding:"12px 14px"}}><ScoreRing pct={p} size={46}/></td>
                          <td style={{padding:"12px 14px"}}><PillarMini pillars={pillarBars}/></td>
                          <td style={{padding:"12px 14px",fontSize:12,color:"#475569"}}>{audit.reviewerName||"–"}</td>
                          <td style={{padding:"12px 14px",fontSize:12,color:"#64748b"}}>{audit.scheduledDate||"–"}</td>
                          <td style={{padding:"12px 14px"}}>
                            <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,color:st.color,background:st.bg}}>
                              {st.label}
                            </span>
                          </td>
                          <td style={{padding:"12px 14px"}} onClick={e=>e.stopPropagation()}>
                            <div style={{display:"flex",gap:6}}>
                              <button type="button" onClick={()=>openDetail(audit)}
                                style={{padding:"5px 10px",borderRadius:6,border:"1px solid #e2e8f0",
                                  background:"#fff",fontSize:11,color:"#475569",cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                                <Eye className="size-3"/>Xem
                              </button>
                              {audit.status==="submitted"&&(
                                <button type="button" onClick={()=>openDetail(audit)}
                                  style={{padding:"5px 10px",borderRadius:6,border:"none",
                                    background:"#d1fae5",fontSize:11,color:"#059669",cursor:"pointer",fontWeight:600,display:"flex",alignItems:"center",gap:4}}>
                                  <CheckCircle2 className="size-3"/>Duyệt
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"12px 16px",borderTop:"1px solid #f1f5f9"}}>
                  <div style={{fontSize:12,color:"#94a3b8"}}>Hiển thị {filtered.length}/{audits.length} audit</div>
                </div>
              </div>
            )}
          </div>

          {/* ── Sidebar ── */}
          <aside style={{display:"flex",flexDirection:"column",gap:16}}>
            {/* Dept scores */}
            <div style={{background:"#fff",borderRadius:14,padding:"18px",boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5"}}>
              <div style={{display:"flex",alignItems:"center",gap:8,fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:14}}>
                <BarChart3 className="size-4" style={{color:"#6366f1"}}/>Điểm theo bộ phận
              </div>
              {deptStats.length===0?(
                <p style={{fontSize:12,color:"#94a3b8"}}>Chưa có dữ liệu.</p>
              ):deptStats.map(({dept,avg})=>(
                <div key={dept} style={{display:"grid",gridTemplateColumns:"52px 1fr 44px",alignItems:"center",gap:8,marginBottom:10}}>
                  <span style={{fontSize:12,fontWeight:700,color:"#475569",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{dept}</span>
                  <div style={{height:8,background:"#f1f5f9",borderRadius:4,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${avg}%`,background:scoreColor(avg),borderRadius:4,transition:"width 0.5s"}}/>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,textAlign:"right",fontFamily:"monospace",color:scoreColor(avg)}}>{avg}%</span>
                </div>
              ))}
            </div>

            {/* Templates */}
            <div style={{background:"#fff",borderRadius:14,padding:"18px",boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5"}}>
              <div style={{fontSize:11,fontWeight:700,color:"#94a3b8",marginBottom:12,letterSpacing:0.5,textTransform:"uppercase"}}>Template</div>
              {templates.map(t=>(
                <div key={t.id} style={{borderRadius:10,border:"1px solid #f1f5f9",background:"#f8fafc",padding:"12px",marginBottom:8}}>
                  <div style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:"#6366f1"}}>{t.code}</div>
                  <div style={{fontSize:13,fontWeight:600,color:"#1e293b",marginTop:2}}>{t.name}</div>
                  <div style={{fontSize:11,color:"#94a3b8",marginTop:2}}>{t.questions.length} câu · v{t.version}</div>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════
          Detail Modal (CapaResult style)
      ════════════════════════════════════════════════════════════ */}
      <ModalShell
        open={detailLoading||detail!==null}
        onClose={closeDetail}
        title={detailLoading?"Đang tải…":`${detail?.code} — ${detail?.title||""}`}
        description={detail?`${detail.departmentCode} · ${detail.period||""} · ${STATUS_INL[detail.status]?.label||detail.status}`:""}
      >
        {detailLoading&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"60px 0"}}>
            <Loader2 className="size-8 animate-spin" style={{color:"#94a3b8"}}/>
          </div>
        )}
        {detail&&!detailLoading&&(
          <div style={{display:"flex",flexDirection:"column",minHeight:480}}>

            {/* Header strip */}
            <div style={{display:"flex",alignItems:"center",gap:16,borderBottom:"1px solid #e8edf5",background:"#f8fafc",padding:"14px 24px"}}>
              <ScoreRing pct={pct} size={68}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",marginBottom:4}}>
                  <span style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:700,
                    color:STATUS_INL[detail.status]?.color||"#64748b",
                    background:STATUS_INL[detail.status]?.bg||"#f3f4f6"}}>
                    {STATUS_INL[detail.status]?.label||detail.status}
                  </span>
                  <span style={{fontSize:13,fontWeight:700,color:scoreColor(pct)}}>{scoreLabel(pct)}</span>
                  {detail.capaCount>0&&(
                    <span style={{fontSize:12,color:"#d97706",display:"flex",alignItems:"center",gap:4}}>
                      <Zap className="size-3"/>{detail.capaCount} CAPA tự sinh
                    </span>
                  )}
                </div>
                <div style={{fontSize:12,color:"#64748b"}}>
                  {detail.scheduledDate||"–"} · {detail.createdByName||"EHS"}
                  {detail.reviewerName&&` · Duyệt: ${detail.reviewerName}`}
                </div>
              </div>
            </div>

            {/* Tabs */}
            <div role="tablist" aria-label="Chi tiết audit"
              style={{display:"flex",gap:4,background:"#fff",padding:"4px 4px 0",borderBottom:"1px solid #e8edf5"}}>
              {[
                {label:`📊 Kết quả`,idx:0},
                {label:`📝 Chi tiết (${detail.questions.length})`,idx:1},
                {label:`⚡ CAPA (${detail.capaCount})`,idx:2},
                {label:"📈 Xu hướng",idx:3},
              ].map(({label,idx})=>(
                <button key={idx} type="button" role="tab"
                  aria-selected={detailTab===idx} aria-controls={`audittab-${idx}`}
                  onClick={()=>setDetailTab(idx)}
                  style={{padding:"10px 18px",border:"none",fontSize:13,cursor:"pointer",fontWeight:600,borderRadius:"6px 6px 0 0",
                    background:detailTab===idx?"#6366f1":"transparent",
                    color:detailTab===idx?"#fff":"#64748b"}}>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div id={`audittab-${detailTab}`} role="tabpanel"
              style={{flex:1,overflowY:"auto",padding:"20px 24px",background:"#f8fafc"}}>

              {/* ── Tab 0: Result (Radar + Pillar bars) ── */}
              {detailTab===0&&(
                <div style={{display:"grid",gridTemplateColumns:"300px 1fr",gap:20}}>
                  {/* Radar */}
                  <div style={{background:"#fff",borderRadius:14,padding:"20px",boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5"}}>
                    <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:12}}>Biểu đồ Radar 6S</div>
                    <RadarChart data={pillarBreakdown.map(pb=>({
                      label:`S${pb.idx+1}`,
                      pct:pb.pct,
                      color:PILLAR_COLORS[pb.idx%PILLAR_COLORS.length]
                    }))}/>
                  </div>

                  {/* Pillar breakdown + meta */}
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    <div style={{background:"#fff",borderRadius:14,padding:"20px",boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5"}}>
                      <div style={{fontSize:13,fontWeight:700,color:"#1e293b",marginBottom:14}}>Chi tiết từng trụ cột</div>
                      {pillarBreakdown.length===0?(
                        <p style={{fontSize:12,color:"#94a3b8"}}>Chưa có dữ liệu câu trả lời.</p>
                      ):pillarBreakdown.map(pb=>(
                        <div key={pb.pillar} style={{marginBottom:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}>
                            <div style={{display:"flex",alignItems:"center",gap:8}}>
                              <span style={{fontSize:11,fontWeight:700,padding:"2px 8px",borderRadius:4,
                                color:PILLAR_COLORS[pb.idx%PILLAR_COLORS.length],
                                background:`${PILLAR_COLORS[pb.idx%PILLAR_COLORS.length]}18`}}>S{pb.idx+1}</span>
                              <span style={{fontSize:12,color:"#475569"}}>{pb.pillar}</span>
                            </div>
                            <span style={{fontSize:14,fontWeight:800,color:PILLAR_COLORS[pb.idx%PILLAR_COLORS.length]}}>{pb.pct}%</span>
                          </div>
                          <div style={{height:10,background:"#f1f5f9",borderRadius:5,overflow:"hidden"}}>
                            <div style={{height:"100%",width:`${pb.pct}%`,
                              background:PILLAR_COLORS[pb.idx%PILLAR_COLORS.length],
                              borderRadius:5,transition:"width 0.5s"}}/>
                          </div>
                          <div style={{display:"flex",justifyContent:"flex-end",fontSize:10,color:"#94a3b8",marginTop:2}}>{pb.total}/{pb.max}</div>
                        </div>
                      ))}
                    </div>

                    {/* Meta + review note */}
                    <div style={{background:"#fff",borderRadius:14,padding:"16px",boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5"}}>
                      {[["Bộ phận",detail.departmentCode],["Kỳ",detail.period||"–"],["Ngày",detail.scheduledDate||"–"],["Người tạo",detail.createdByName||"–"]].map(([l,v])=>(
                        <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"6px 0",borderBottom:"1px solid #f8fafc",fontSize:12}}>
                          <span style={{color:"#64748b",fontWeight:600}}>{l}</span>
                          <span style={{color:"#1e293b",fontWeight:600}}>{v}</span>
                        </div>
                      ))}
                      {detail.reviewNote&&(
                        <div style={{marginTop:12,padding:"10px 12px",background:"#f0fdf4",borderRadius:8,border:"1px solid #bbf7d0",fontSize:12}}>
                          <div style={{fontWeight:700,color:"#059669",marginBottom:4}}>✅ Nhận xét EHS</div>
                          <div style={{color:"#166534",lineHeight:1.5}}>{detail.reviewNote}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Tab 1: Q&A ── */}
              {detailTab===1&&(
                <div style={{display:"flex",flexDirection:"column",gap:16}}>
                  {canEdit&&(
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                      borderRadius:10,padding:"10px 16px",background:"#fef3c7",border:"1px solid #fcd34d",fontSize:13}}>
                      <div style={{display:"flex",alignItems:"center",gap:8,color:"#92400e",fontWeight:600}}>
                        <Edit3 className="size-4"/>Chế độ chỉnh sửa — trạng thái {STATUS_INL[detail.status]?.label}
                      </div>
                      <button disabled={editSaving} onClick={saveEditAnswers}
                        style={{display:"flex",alignItems:"center",gap:6,padding:"6px 14px",borderRadius:7,border:"none",
                          background:"#d97706",color:"#fff",fontSize:12,fontWeight:700,cursor:"pointer",opacity:editSaving?0.6:1}}>
                        {editSaving?<Loader2 className="size-3 animate-spin"/>:<Save className="size-3"/>}Lưu thay đổi
                      </button>
                    </div>
                  )}
                  {questionsGrouped.map(([pillar,items],gi)=>{
                    const pillarColor=PILLAR_COLORS[gi%PILLAR_COLORS.length];
                    const pillarAns=items.map(it=>{
                      const a=canEdit?editAnswers.find(x=>x.questionId===it.question.id):it.answer;
                      if(!a)return null;
                      return{score:Number(a.score),max:it.question.maxScore};
                    }).filter((x):x is{score:number;max:number}=>x!==null);
                    const pillarTotal=pillarAns.reduce((s,a)=>s+a.score,0);
                    const pillarMax=pillarAns.reduce((s,a)=>s+a.max,0);
                    const pillarPct=pillarMax>0?Math.round((pillarTotal/pillarMax)*100):0;
                    return(
                      <div key={pillar}>
                        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                          <span style={{display:"inline-flex",alignItems:"center",justifyContent:"center",
                            width:32,height:28,borderRadius:6,fontSize:11,fontWeight:800,
                            color:"#fff",background:pillarColor}}>S{gi+1}</span>
                          <span style={{fontWeight:700,color:"#1e293b"}}>{pillar}</span>
                          <span style={{fontSize:12,fontWeight:700,color:pillarColor}}>{pillarTotal}/{pillarMax} · {pillarPct}%</span>
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:10}}>
                          {items.map(({question,answer})=>{
                            const editAns=canEdit?editAnswers.find(a=>a.questionId===question.id):answer;
                            const curScore=editAns?.score??0;
                            const needsCapa=editAns?.actionRequired??answer?.actionRequired??false;
                            return(
                              <div key={question.id} style={{
                                borderRadius:12,border:"1px solid",padding:"16px",
                                borderColor:needsCapa?"#fca5a5":"#e2e8f0",
                                background:needsCapa?"#fff5f5":"#fff",
                                borderLeft:`4px solid ${Number(curScore)>=4?"#10b981":Number(curScore)>=3?"#f59e0b":"#ef4444"}`}}>
                                <div style={{display:"grid",gridTemplateColumns:"1fr 150px",gap:16}}>
                                  <div>
                                    <p style={{margin:0,fontSize:13,fontWeight:700,color:"#1e293b"}}>{question.question}</p>
                                    {question.expectedStandard&&(
                                      <p style={{margin:"4px 0 0",fontSize:11,color:"#64748b",lineHeight:1.4}}>📐 {question.expectedStandard}</p>
                                    )}
                                    {canEdit?(
                                      <textarea style={{marginTop:8,width:"100%",minHeight:48,padding:"6px 10px",
                                        border:"1px solid #e2e8f0",borderRadius:8,fontSize:12,resize:"vertical",
                                        outline:"none",boxSizing:"border-box",
                                        background:editAns?.finding?"#fff8f0":"#f8fafc"}}
                                        placeholder="Ghi nhận / điểm không phù hợp..."
                                        value={editAns?.finding||""}
                                        onChange={e=>updateEditAnswer(question.id,{finding:e.target.value})}/>
                                    ):answer?.finding?(
                                      <div style={{marginTop:8,padding:"6px 10px",background:"#fff8f0",borderRadius:8,
                                        border:"1px solid #fed7aa",fontSize:12,color:"#c2410c"}}>
                                        📝 {answer.finding}
                                      </div>
                                    ):null}
                                  </div>
                                  <div>
                                    <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>Điểm / {question.maxScore}</div>
                                    {canEdit?(
                                      <ScoreButtons value={Number(curScore)} max={question.maxScore} onChange={v=>updateEditAnswer(question.id,{score:v})}/>
                                    ):(
                                      <div style={{fontSize:28,fontWeight:900,color:scoreColor(Math.round((Number(curScore)/question.maxScore)*100))}}>
                                        {curScore}/{question.maxScore}
                                      </div>
                                    )}
                                    {canEdit&&(
                                      <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700,color:"#64748b",marginTop:8,cursor:"pointer"}}>
                                        <input type="checkbox" checked={needsCapa} onChange={e=>updateEditAnswer(question.id,{actionRequired:e.target.checked})}/>
                                        Cần CAPA
                                      </label>
                                    )}
                                    {!canEdit&&needsCapa&&(
                                      <span style={{display:"inline-flex",alignItems:"center",gap:4,marginTop:8,
                                        padding:"3px 8px",borderRadius:6,border:"1px solid #fca5a5",background:"#fee2e2",fontSize:11,fontWeight:700,color:"#dc2626"}}>
                                        <Zap className="size-3"/>Cần CAPA
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* ── Tab 2: CAPA ── */}
              {detailTab===2&&(
                <div>
                  {detail.capaCount===0?(
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12,padding:"40px 0",color:"#94a3b8"}}>
                      <Zap className="size-10" style={{opacity:0.3}}/>
                      <p style={{fontSize:13,fontWeight:600}}>Chưa có CAPA nào được tạo từ audit này.</p>
                      {canEdit&&<p style={{fontSize:12}}>CAPA tự động tạo khi nộp audit (điểm &lt;4 hoặc đánh dấu "Cần CAPA").</p>}
                    </div>
                  ):(
                    <>
                      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
                        <div style={{fontSize:14,fontWeight:700,color:"#1e293b"}}>⚡ {detail.capaCount} CAPA tự động tạo</div>
                        <div style={{display:"flex",gap:8}}>
                          {([["high","🔴 Cao"],["medium","🟡 TB"]] as [string,string][]).filter(([s])=>detail.capas.some(c=>c.priority===s)).map(([s,l])=>(
                            <span key={s} style={{padding:"3px 10px",borderRadius:20,fontSize:11,fontWeight:600,
                              color:PRIORITY_INL[s]?.color,background:PRIORITY_INL[s]?.bg}}>{l}</span>
                          ))}
                        </div>
                      </div>
                      <div style={{display:"flex",flexDirection:"column",gap:10}}>
                        {detail.capas.map(capa=>{
                          const pr=PRIORITY_INL[capa.priority]||PRIORITY_INL.low;
                          const st=CAPA_ST[capa.status]||CAPA_ST.open;
                          const isOpen=expandedCapa===capa.id;
                          // Guess pillar from code/title pattern (optional decoration)
                          return(
                            <div key={capa.id} style={{background:"#fff",borderRadius:12,
                              boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5",overflow:"hidden",
                              borderLeft:"4px solid #6366f1"}}>
                              <div style={{padding:"14px 18px",cursor:"pointer",display:"flex",alignItems:"center",gap:12}}
                                onClick={()=>setExpandedCapa(isOpen?null:capa.id)}>
                                <div style={{flex:1}}>
                                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,flexWrap:"wrap"}}>
                                    <span style={{fontFamily:"monospace",fontSize:12,fontWeight:700,color:"#6366f1"}}>{capa.code}</span>
                                    <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600,
                                      color:pr.color,background:pr.bg}}>{pr.label}</span>
                                    <span style={{padding:"2px 8px",borderRadius:10,fontSize:11,fontWeight:600,
                                      color:st.color,background:st.bg}}>{st.label}</span>
                                  </div>
                                  <div style={{fontSize:13,color:"#1e293b",fontWeight:500}}>{capa.title}</div>
                                </div>
                                <div style={{textAlign:"right",flexShrink:0}}>
                                  <div style={{fontSize:11,color:"#94a3b8"}}>Hạn: {capa.dueDate||"–"}</div>
                                </div>
                                <span style={{fontSize:14,color:"#94a3b8"}}>{isOpen?"▲":"▼"}</span>
                              </div>
                              {isOpen&&(
                                <div style={{padding:"0 18px 16px",borderTop:"1px solid #f1f5f9"}}>
                                  <div style={{display:"flex",justifyContent:"flex-end",gap:8,marginTop:12}}>
                                    <a href="/safety-6s/actions"
                                      style={{padding:"6px 12px",borderRadius:7,border:"1px solid #e2e8f0",
                                        background:"#fff",fontSize:11,color:"#475569",textDecoration:"none",display:"flex",alignItems:"center",gap:4}}>
                                      <ChevronRight className="size-3"/>Xem CAPA
                                    </a>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ── Tab 3: Trend ── */}
              {detailTab===3&&(
                <div style={{background:"#fff",borderRadius:14,padding:"24px",boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5"}}>
                  <div style={{fontSize:14,fontWeight:700,color:"#1e293b",marginBottom:4}}>📈 Điểm trụ cột — {detail.code}</div>
                  <p style={{fontSize:12,color:"#94a3b8",marginBottom:20}}>Hiển thị phân bố điểm kỳ này theo từng trụ cột</p>
                  <div style={{display:"flex",flexDirection:"column",gap:16}}>
                    {pillarBreakdown.map(pb=>{
                      const color=PILLAR_COLORS[pb.idx%PILLAR_COLORS.length];
                      const W=500,H=50;
                      // simple bar sparkline: questions in this pillar
                      const pillarQs=detail.questions.filter(q=>q.pillar===pb.pillar).sort((a,b)=>a.sortOrder-b.sortOrder);
                      const barW=Math.max(4,(W-pillarQs.length*4)/pillarQs.length);
                      return(
                        <div key={pb.pillar}>
                          <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                            <span style={{fontSize:13,fontWeight:700,color}}>S{pb.idx+1} — {pb.pillar}</span>
                            <span style={{fontSize:13,fontWeight:700,color}}>{pb.pct}%</span>
                          </div>
                          <svg width="100%" height={H+24} viewBox={`0 0 ${W} ${H+24}`} style={{overflow:"visible"}}>
                            {[25,50,75,100].map(v=>(
                              <line key={v} x1={0} y1={H-(v/100)*H} x2={W} y2={H-(v/100)*H} stroke="#f1f5f9" strokeWidth={1}/>
                            ))}
                            {pillarQs.map((q,qi)=>{
                              const ans=detail.answers.find(a=>a.questionId===q.id);
                              const sc=ans?Number(ans.score):0;
                              const barH=Math.max(2,(sc/q.maxScore)*H);
                              const x=qi*(barW+4);
                              const scColor=sc>=4?"#10b981":sc>=3?"#f59e0b":"#ef4444";
                              return(
                                <g key={q.id}>
                                  <rect x={x} y={H-barH} width={barW} height={barH}
                                    fill={scColor} rx={3} opacity={0.85}/>
                                  <text x={x+barW/2} y={H+14} textAnchor="middle"
                                    style={{fontSize:8,fill:"#94a3b8"}}>{qi+1}</text>
                                </g>
                              );
                            })}
                          </svg>
                          <div style={{fontSize:11,color:"#94a3b8",textAlign:"center"}}>Câu hỏi</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* ── Action footer ── */}
            <div style={{borderTop:"1px solid #e2e8f0",background:"#fff",padding:"16px 24px"}}>
              {reviewOpen&&(
                <div style={{marginBottom:16,padding:"16px",background:"#f8fafc",borderRadius:10,border:"1px solid #e2e8f0"}}>
                  <p style={{margin:"0 0 8px",fontSize:13,fontWeight:700,color:"#1e293b"}}>Ghi chú review EHS</p>
                  <textarea style={{width:"100%",minHeight:80,padding:"8px 12px",border:"1px solid #e2e8f0",
                    borderRadius:8,fontSize:13,outline:"none",boxSizing:"border-box",resize:"vertical"}}
                    placeholder="Ghi chú review…"
                    value={reviewNote} onChange={e=>setReviewNote(e.target.value)}/>
                  <div style={{display:"flex",gap:8,marginTop:10}}>
                    <button onClick={()=>reviewAudit(false)} disabled={editSaving}
                      style={{flex:1,padding:"9px 0",borderRadius:8,border:"1px solid #fca5a5",background:"#fee2e2",
                        color:"#dc2626",fontSize:13,fontWeight:700,cursor:"pointer",opacity:editSaving?0.6:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      <AlertTriangle className="size-4"/>Trả lại
                    </button>
                    <button onClick={()=>reviewAudit(true)} disabled={editSaving}
                      style={{flex:1,padding:"9px 0",borderRadius:8,border:"none",background:"#059669",
                        color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",opacity:editSaving?0.6:1,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                      {editSaving?<Loader2 className="size-4 animate-spin"/>:<CheckCircle2 className="size-4"/>}Duyệt audit
                    </button>
                  </div>
                </div>
              )}
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button onClick={closeDetail}
                  style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,
                    border:"1px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                  <X className="size-4"/>Đóng
                </button>
                {canEdit&&(
                  <>
                    <button onClick={saveEditAnswers} disabled={editSaving}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,
                        border:"1px solid #e2e8f0",background:"#fff",color:"#475569",fontSize:13,fontWeight:700,cursor:"pointer",opacity:editSaving?0.6:1}}>
                      {editSaving?<Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}Lưu nháp
                    </button>
                    <button onClick={()=>submitAudit(detail)}
                      style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,
                        border:"none",background:"linear-gradient(135deg,#6366f1,#818cf8)",color:"#fff",
                        fontSize:13,fontWeight:700,cursor:"pointer",boxShadow:"0 2px 8px #6366f140"}}>
                      <Send className="size-4"/>Nộp Audit ➜
                    </button>
                  </>
                )}
                {detail.status==="submitted"&&!reviewOpen&&(
                  <button onClick={()=>setReviewOpen(true)}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,
                      border:"none",background:"#059669",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    <ShieldCheck className="size-4"/>Duyệt / Trả lại
                  </button>
                )}
                {(detail.status==="reviewed"||detail.status==="closed")&&(
                  <button onClick={()=>reopenAudit(detail)}
                    style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,
                      border:"1px solid #fca5a5",background:"#fee2e2",color:"#dc2626",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                    Mở lại
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </ModalShell>

      {/* ════════════════════════════════════════════════════════════
          Create Modal (ScoringView style)
      ════════════════════════════════════════════════════════════ */}
      <ModalShell
        open={createOpen}
        onClose={()=>setCreateOpen(false)}
        title="Tạo audit 6S mới"
        description={activeTemplate?`${activeTemplate.name} · ${form.departmentCode} · ${form.period}`:""}
      >
        <form onSubmit={handleCreate} style={{display:"flex",flexDirection:"column",flex:1}}>
          {/* Score bar */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
            borderBottom:"1px solid #e8edf5",padding:"12px 20px",background:"#fff"}}>
            <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
              <select required value={form.templateId} onChange={e=>setForm(f=>({...f,templateId:e.target.value}))}
                style={{padding:"6px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:12,outline:"none"}}>
                <option value="">-- Chọn template --</option>
                {templates.map(t=><option key={t.id} value={t.id}>{t.code} – {t.name}</option>)}
              </select>
              <select required value={form.departmentCode} onChange={e=>setForm(f=>({...f,departmentCode:e.target.value}))}
                style={{padding:"6px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:12,outline:"none"}}>
                {departments.map(d=><option key={d.code} value={d.code}>{d.code}</option>)}
              </select>
              <input type="month" required value={form.period} onChange={e=>setForm(f=>({...f,period:e.target.value}))}
                style={{padding:"6px 10px",border:"1px solid #e2e8f0",borderRadius:8,fontSize:12,outline:"none"}}/>
            </div>
            <div style={{textAlign:"center"}}>
              <div style={{fontSize:26,fontWeight:900,color:scoreColor(overallPct)}}>{overallPct}%</div>
              <div style={{fontSize:11,color:"#94a3b8"}}>Điểm tổng</div>
            </div>
          </div>

          {/* Title */}
          <div style={{padding:"10px 20px",borderBottom:"1px solid #e8edf5",background:"#fff"}}>
            <input required value={form.title} onChange={e=>setForm(f=>({...f,title:e.target.value}))}
              placeholder="Tiêu đề audit..."
              style={{width:"100%",padding:"7px 12px",border:"1px solid #e2e8f0",borderRadius:8,
                fontSize:13,fontWeight:600,outline:"none",boxSizing:"border-box"}}/>
          </div>

          {/* 2-column: sidebar + questions */}
          <div style={{display:"flex",flex:1,overflow:"hidden",minHeight:400}}>

            {/* Pillar sidebar */}
            <div style={{width:190,background:"#fff",borderRight:"1px solid #e8edf5",padding:"12px 8px",flexShrink:0,overflowY:"auto"}}>
              <div style={{fontSize:10,fontWeight:700,color:"#94a3b8",marginBottom:10,paddingLeft:4,letterSpacing:0.5,textTransform:"uppercase"}}>Trụ cột</div>
              {createPillarScores.map((ps,i)=>(
                <button key={ps.pillar} type="button" onClick={()=>setActivePillarIdx(i)}
                  style={{width:"100%",padding:"10px 10px",borderRadius:10,border:"2px solid",
                    cursor:"pointer",marginBottom:6,textAlign:"left",
                    borderColor:activePillarIdx===i?PILLAR_COLORS[i%PILLAR_COLORS.length]:"transparent",
                    background:activePillarIdx===i?`${PILLAR_COLORS[i%PILLAR_COLORS.length]}14`:"transparent"}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:13,fontWeight:700,
                      color:activePillarIdx===i?PILLAR_COLORS[i%PILLAR_COLORS.length]:"#475569"}}>
                      {PILLAR_EMOJIS[i%PILLAR_EMOJIS.length]} S{i+1}
                    </span>
                    <span style={{fontSize:12,fontWeight:700,
                      color:ps.pct>=80?"#10b981":ps.pct>=60?"#f59e0b":"#ef4444"}}>{ps.pct}%</span>
                  </div>
                  <div style={{height:4,background:"#e5e7eb",borderRadius:2,overflow:"hidden",marginBottom:4}}>
                    <div style={{height:"100%",width:`${ps.pct}%`,background:PILLAR_COLORS[i%PILLAR_COLORS.length],borderRadius:2}}/>
                  </div>
                  <div style={{fontSize:10,color:"#94a3b8",lineHeight:1.3}}>
                    {ps.pillar.length>14?ps.pillar.slice(0,14)+"…":ps.pillar}
                  </div>
                  {ps.warnings>0&&(
                    <div style={{fontSize:10,color:"#ef4444",marginTop:2}}>⚠ {ps.warnings} cần cải thiện</div>
                  )}
                </button>
              ))}

              {/* Progress */}
              {createPillarScores.length>0&&(
                <div style={{marginTop:12,padding:"12px",background:"#f8fafc",borderRadius:10,border:"1px solid #e8edf5"}}>
                  <div style={{fontSize:11,color:"#64748b",marginBottom:4}}>Tiến độ hoàn thành</div>
                  <div style={{fontSize:20,fontWeight:800,color:"#1e293b"}}>
                    {answers.filter(a=>a.score>0).length}/{answers.length}
                  </div>
                  <div style={{height:6,background:"#e5e7eb",borderRadius:3,marginTop:6}}>
                    <div style={{height:"100%",
                      width:`${answers.length>0?Math.round((answers.filter(a=>a.score>0).length/answers.length)*100):0}%`,
                      background:"linear-gradient(90deg,#6366f1,#10b981)",borderRadius:3}}/>
                  </div>
                </div>
              )}
            </div>

            {/* Active pillar questions */}
            <div style={{flex:1,overflowY:"auto",padding:"16px 20px",background:"#f8fafc"}}>
              {activePillarQuestions.length===0?(
                <p style={{fontSize:13,color:"#94a3b8",textAlign:"center",paddingTop:40}}>Chọn template để bắt đầu chấm điểm.</p>
              ):(
                <>
                  {/* Pillar header */}
                  {createPillarScores[activePillarIdx]&&(
                    <div style={{background:"#fff",borderRadius:12,padding:"16px 18px",marginBottom:14,
                      border:`2px solid ${PILLAR_COLORS[activePillarIdx%PILLAR_COLORS.length]}30`,boxShadow:"0 1px 4px #0001"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div style={{width:44,height:44,borderRadius:10,
                          background:`${PILLAR_COLORS[activePillarIdx%PILLAR_COLORS.length]}18`,
                          display:"flex",alignItems:"center",justifyContent:"center",fontSize:22}}>
                          {PILLAR_EMOJIS[activePillarIdx%PILLAR_EMOJIS.length]}
                        </div>
                        <div style={{flex:1}}>
                          <div style={{fontSize:15,fontWeight:800,color:PILLAR_COLORS[activePillarIdx%PILLAR_COLORS.length]}}>
                            S{activePillarIdx+1} — {activePillarName}
                          </div>
                          <div style={{fontSize:11,color:"#64748b"}}>{activePillarQuestions.length} tiêu chí</div>
                        </div>
                        <div style={{textAlign:"center"}}>
                          <div style={{fontSize:24,fontWeight:800,color:PILLAR_COLORS[activePillarIdx%PILLAR_COLORS.length]}}>
                            {createPillarScores[activePillarIdx]?.pct}%
                          </div>
                          <div style={{fontSize:10,color:"#94a3b8"}}>Điểm trụ cột</div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Questions */}
                  {activePillarQuestions.map((q,qi)=>{
                    const ans=answers.find(a=>a.questionId===q.id);
                    const sc=ans?.score??q.maxScore;
                    const scColor=SCORE_COLORS[sc]||"#94a3b8";
                    const needsCapa=ans?.actionRequired||false;
                    return(
                      <div key={q.id} style={{background:"#fff",borderRadius:12,padding:"16px 18px",marginBottom:12,
                        boxShadow:"0 1px 4px #0001",border:"1px solid #e8edf5",
                        borderLeft:`4px solid ${sc>=4?"#10b981":sc>=3?"#f59e0b":"#ef4444"}`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:10}}>
                          <div style={{flex:1,paddingRight:16}}>
                            <div style={{fontSize:11,color:"#94a3b8",marginBottom:4,fontWeight:600}}>Câu {qi+1}/{activePillarQuestions.length}</div>
                            <div style={{fontSize:13,fontWeight:700,color:"#1e293b",lineHeight:1.4}}>{q.question}</div>
                            {q.expectedStandard&&(
                              <div style={{fontSize:11,color:"#64748b",marginTop:4,lineHeight:1.4}}>📐 {q.expectedStandard}</div>
                            )}
                          </div>
                          <div style={{textAlign:"center",flexShrink:0}}>
                            <div style={{fontSize:26,fontWeight:900,color:scColor}}>{sc}/{q.maxScore}</div>
                            <div style={{fontSize:10,fontWeight:600,color:scColor}}>{SCORE_LABELS[sc]||""}</div>
                          </div>
                        </div>

                        {/* Score buttons */}
                        <div style={{marginBottom:8}}>
                          <ScoreButtons value={sc} max={q.maxScore} onChange={v=>updateAnswer(q.id,{score:v})}/>
                        </div>
                        {/* Label strip */}
                        <div style={{display:"flex",gap:6,marginBottom:10}}>
                          {Array.from({length:q.maxScore},(_,v)=>(
                            <div key={v+1} style={{flex:1,textAlign:"center",fontSize:9,color:"#94a3b8",fontWeight:600}}>
                              {SCORE_LABELS[v+1]||""}
                            </div>
                          ))}
                        </div>

                        {/* Finding + photo */}
                        <div style={{display:"flex",gap:10}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>📝 Ghi nhận:</div>
                            <textarea value={ans?.finding||""} onChange={e=>updateAnswer(q.id,{finding:e.target.value})}
                              placeholder="Mô tả điểm không phù hợp (nếu có)..."
                              rows={2}
                              style={{width:"100%",padding:"7px 10px",border:"1px solid #e2e8f0",borderRadius:8,
                                fontSize:12,resize:"none",outline:"none",boxSizing:"border-box",
                                background:ans?.finding?"#fff8f0":"#f8fafc"}}/>
                          </div>
                          <div>
                            <div style={{fontSize:11,fontWeight:700,color:"#64748b",marginBottom:4}}>📸</div>
                            <div style={{width:68,height:60,borderRadius:8,border:"2px dashed #e2e8f0",
                              background:"#f8fafc",display:"flex",flexDirection:"column",
                              alignItems:"center",justifyContent:"center",gap:2}}>
                              <span style={{fontSize:18}}>📷</span>
                              <span style={{fontSize:9,color:"#94a3b8"}}>Thêm ảnh</span>
                            </div>
                          </div>
                        </div>

                        <label style={{display:"flex",alignItems:"center",gap:6,fontSize:12,fontWeight:700,color:"#64748b",marginTop:8,cursor:"pointer"}}>
                          <input type="checkbox" checked={needsCapa} onChange={e=>updateAnswer(q.id,{actionRequired:e.target.checked})}/>
                          Cần CAPA
                        </label>

                        {sc<4&&ans?.finding&&(
                          <div style={{marginTop:8,padding:"6px 10px",background:"#fff8f0",borderRadius:6,
                            border:"1px solid #fed7aa",fontSize:11,color:"#c2410c",display:"flex",alignItems:"center",gap:6}}>
                            ⚡ Sẽ tự động tạo CAPA khi nộp audit
                          </div>
                        )}
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Footer: Prev/Next + Submit */}
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            padding:"14px 20px",borderTop:"1px solid #e8edf5",background:"#fff"}}>
            <button type="button" onClick={()=>setActivePillarIdx(Math.max(0,activePillarIdx-1))}
              disabled={activePillarIdx===0||createPillarOrder.length===0}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 18px",borderRadius:8,
                border:"1px solid #e2e8f0",background:"#fff",fontSize:13,color:"#475569",
                cursor:activePillarIdx===0?"not-allowed":"pointer",opacity:activePillarIdx===0?0.4:1}}>
              <ChevronLeft className="size-4"/>
              {activePillarIdx>0?`S${activePillarIdx}`:""} Trước
            </button>

            <div style={{display:"flex",gap:8}}>
              <button type="button" onClick={()=>setCreateOpen(false)}
                style={{display:"flex",alignItems:"center",gap:6,padding:"8px 16px",borderRadius:8,
                  border:"1px solid #e2e8f0",background:"#fff",color:"#64748b",fontSize:13,fontWeight:700,cursor:"pointer"}}>
                <X className="size-4"/>Hủy
              </button>
              <button type="submit" disabled={saving}
                style={{display:"flex",alignItems:"center",gap:6,padding:"8px 20px",borderRadius:8,
                  border:"none",background:"linear-gradient(135deg,#6366f1,#818cf8)",color:"#fff",
                  fontSize:13,fontWeight:700,cursor:"pointer",opacity:saving?0.6:1,
                  boxShadow:"0 2px 8px #6366f140"}}>
                {saving?<Loader2 className="size-4 animate-spin"/>:<Save className="size-4"/>}
                Lưu Audit
              </button>
            </div>

            <button type="button" onClick={()=>setActivePillarIdx(Math.min(createPillarOrder.length-1,activePillarIdx+1))}
              disabled={activePillarIdx>=createPillarOrder.length-1||createPillarOrder.length===0}
              style={{display:"flex",alignItems:"center",gap:6,padding:"8px 18px",borderRadius:8,
                border:"none",
                background:activePillarIdx<createPillarOrder.length-1?"linear-gradient(135deg,#6366f1,#818cf8)":"#e5e7eb",
                color:activePillarIdx<createPillarOrder.length-1?"#fff":"#94a3b8",
                fontSize:13,cursor:activePillarIdx>=createPillarOrder.length-1?"not-allowed":"pointer",
                opacity:activePillarIdx>=createPillarOrder.length-1?0.4:1}}>
              Tiếp {activePillarIdx<createPillarOrder.length-1?`S${activePillarIdx+2}`:""}
              <ChevronRight className="size-4"/>
            </button>
          </div>
        </form>
      </ModalShell>

    </SafetyI18nRender>
  );
}

export default SafetyAuditsPage;
