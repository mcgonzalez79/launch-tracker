import * as XLSX from "xlsx";
import { orderIndex } from "./theme";

/* Types */
export type Shot = {
  SessionId?: string; Timestamp?: string; Club: string; Swings?: number;
  ClubSpeed_mph?: number; AttackAngle_deg?: number; ClubPath_deg?: number; ClubFace_deg?: number; FaceToPath_deg?: number;
  BallSpeed_mph?: number; SmashFactor?: number;
  LaunchAngle_deg?: number; LaunchDirection_deg?: number;
  Backspin_rpm?: number; Sidespin_rpm?: number; SpinRate_rpm?: number; SpinRateType?: string;
  SpinAxis_deg?: number; ApexHeight_yds?: number;
  CarryDistance_yds?: number; CarryDeviationAngle_deg?: number; CarryDeviationDistance_yds?: number;
  TotalDistance_yds?: number; TotalDeviationAngle_deg?: number; TotalDeviationDistance_yds?: number;
};
export type ClubRow = {
  club: string; count: number; avgCarry: number; avgTotal: number; avgSmash: number; avgSpin: number; avgCS: number; avgBS: number; avgLA: number; avgF2P: number;
};
export type Msg = { id: number; text: string; type?: "info" | "success" | "warn" | "error" };
export type ViewKey = "dashboard" | "insights" | "journal";

/* Stats + helpers */
export const mean = (arr: number[]) => arr.reduce((a,b)=>a+b,0)/(arr.length||1);
export const stddev = (arr: number[]) => { if (arr.length<2) return 0; const m=mean(arr); return Math.sqrt(mean(arr.map(x=>(x-m)**2))); };
export const quantile = (arr:number[], p:number) => { if(!arr.length) return NaN; const a=[...arr].sort((x,y)=>x-y); const i=(a.length-1)*p; const lo=Math.floor(i), hi=Math.ceil(i); if(lo===hi) return a[lo]; const h=i-lo; return a[lo]*(1-h)+a[hi]*h; };
export const n = (v:any):number|undefined => { if(v==null) return undefined; const s=String(v).trim(); if(!s||s.toUpperCase()==="#DIV/0!"||s.toUpperCase()==="NAN") return undefined; const num=Number(s.replace(/,/g,"")); return isNaN(num)?undefined:num; };
export const isoDate = (v:any):string|undefined => { if(!v) return undefined; if(typeof v==="number"){ const epoch=new Date(Date.UTC(1899,11,30)); return new Date(epoch.getTime()+v*86400000).toISOString(); } const d=new Date(v); return isNaN(d.getTime())?undefined:d.toISOString(); };
export const clamp = (x:number,lo:number,hi:number)=>Math.min(hi,Math.max(lo,x));
export const coalesceSmash = (s:Shot)=> s.SmashFactor ?? (s.ClubSpeed_mph && s.BallSpeed_mph ? s.BallSpeed_mph/s.ClubSpeed_mph : undefined);
export const coalesceFaceToPath = (s:Shot)=> s.FaceToPath_deg ?? (s.ClubFace_deg!==undefined && s.ClubPath_deg!==undefined ? s.ClubFace_deg - s.ClubPath_deg : undefined);
export const fmtNum = (v:number|undefined, fixed:number, suffix:string)=> v==null? "-" : `${v.toFixed(fixed)}${suffix}`;

/* Header normalization + map */
export const normalizeHeader = (raw:string) => {
  let s=String(raw||"").trim(); s=s.replace(/([a-z])([A-Z])/g,"$1 $2").toLowerCase();
  s=s.replace(/\[[^\]]*\]/g,"").replace(/\([^\)]*\)/g,"").replace(/[_\-]+/g," ").replace(/\s+/g," ").trim().replace(/:$/,"");
  s=s.replace(/\bsmash\s*factor\b/,"smash factor");
  return s;
};
export const headerMap: Record<string, keyof Shot> = {
  "club":"Club","club type":"Club","clubname":"Club","club name":"Club","swings":"Swings",
  "club speed":"ClubSpeed_mph","attack angle":"AttackAngle_deg","club path":"ClubPath_deg","club face":"ClubFace_deg","face to path":"FaceToPath_deg",
  "ball speed":"BallSpeed_mph","smash factor":"SmashFactor",
  "launch angle":"LaunchAngle_deg","launch direction":"LaunchDirection_deg",
  "backspin":"Backspin_rpm","sidespin":"Sidespin_rpm","spin rate":"SpinRate_rpm","spin rate type":"SpinRateType",
  "spin axis":"SpinAxis_deg","apex height":"ApexHeight_yds",
  "carry distance":"CarryDistance_yds","carry":"CarryDistance_yds",
  "carry deviation angle":"CarryDeviationAngle_deg","carry deviation distance":"CarryDeviationDistance_yds",
  "total distance":"TotalDistance_yds","total":"TotalDistance_yds",
  "total deviation angle":"TotalDeviationAngle_deg","total deviation distance":"TotalDeviationDistance_yds",
  "sessionid":"SessionId","session id":"SessionId","timestamp":"Timestamp","date":"Timestamp","datetime":"Timestamp",
};
export function findBestHeader(rowsRaw:any[][]){
  const MAX=Math.min(20,rowsRaw.length);
  let best={idx:0,map:[] as (keyof Shot|undefined)[],score:0,usedTwoRows:false};
  const score=(hdr:any[])=>{ const mapped=hdr.map(h=>headerMap[normalizeHeader(String(h??""))]); const sc=mapped.filter(Boolean).length+(mapped.includes("Club" as keyof Shot)?2:0); return {mapped,sc}; };
  for(let i=0;i<MAX;i++){
    const r=rowsRaw[i]||[]; const s1=score(r); if(s1.sc>best.score) best={idx:i,map:s1.mapped,score:s1.sc,usedTwoRows:false};
    if(i+1<rowsRaw.length){ const r2=rowsRaw[i+1]||[]; const combined=r.map((v:any,c:number)=>[v,r2[c]].filter(Boolean).join(" ")); const s2=score(combined); if(s2.sc>best.score) best={idx:i,map:s2.mapped,score:s2.sc,usedTwoRows:true}; }
  }
  return best;
}

/* Weird CSV fallback parser */
export function parseWeirdLaunchCSV(text:string){
  const lines=text.split(/\r?\n/).filter(l=>l.trim().length>0);
  if(!lines.length) return null;
  const split=(line:string)=>line.replace(/\t/g,"").replace(/"/g,"").trim().split(",");
  const header=split(lines[0]).map(h=>h.trim());
  const maybeUnits=lines[1]?split(lines[1]):[];
  const hasUnits=maybeUnits.some(s=>/\[[^\]]*\]/.test(s));
  const dataRows=lines.slice(hasUnits?2:1).map(split);
  const hasClub=header.some(h=>/club/i.test(h));
  if(!hasClub) return null;
  return { header, dataRows };
}
export function weirdRowsToShots(header:string[], rows:string[][], fallbackSessionId:string){
  const norm=(s:string)=>normalizeHeader(s);
  const find=(aliases:string[])=>{ const wants=aliases.map(norm); for(let i=0;i<header.length;i++) if(wants.includes(norm(header[i]||""))) return i; return -1; };
  const id = {
    Date:find(["date","timestamp","datetime"]),
    ClubName:find(["club name","clubname"]),
    ClubType:find(["club type","club"]),
    ClubSpeed:find(["club speed"]),
    AttackAngle:find(["attack angle"]),
    ClubPath:find(["club path"]),
    ClubFace:find(["club face"]),
    FaceToPath:find(["face to path"]),
    BallSpeed:find(["ball speed"]),
    Smash:find(["smash factor","smash"]),
    LaunchAngle:find(["launch angle"]),
    LaunchDir:find(["launch direction"]),
    Backspin:find(["backspin"]),
    Sidespin:find(["sidespin"]),
    SpinRate:find(["spin rate"]),
    SpinRateType:find(["spin rate type"]),
    SpinAxis:find(["spin axis"]),
    Apex:find(["apex height"]),
    Carry:find(["carry distance","carry"]),
    CarryDevAng:find(["carry deviation angle"]),
    CarryDevDist:find(["carry deviation distance"]),
    Total:find(["total distance","total"]),
    TotalDevAng:find(["total deviation angle"]),
    TotalDevDist:find(["total deviation distance"]),
  };
  const num=(v:any)=>{ if(v==null) return undefined; const s=String(v).trim(); if(!s||s.toUpperCase()==="#DIV/0!"||s.toUpperCase()==="NAN") return undefined; const x=Number(s.replace(/,/g,"")); return isNaN(x)?undefined:x; };
  const ts=(v:string|undefined)=>{ if(!v) return undefined; const d=new Date(v); return isNaN(d.getTime())?undefined:d.toISOString(); };
  const shots:Shot[]=[];
  for(const row of rows){
    const rawType=id.ClubType>=0?row[id.ClubType]:"";
    const rawName=id.ClubName>=0?row[id.ClubName]:"";
    let club=(rawType||"").trim(); const nm=(rawName||"").trim();
    if(!club && nm) club=nm; else if(club && nm && !club.toLowerCase().includes(nm.toLowerCase())) club=`${nm} ${club}`.trim();
    if(!club) continue;
    const s:Shot={
      SessionId:fallbackSessionId,
      Club:club,
      Timestamp:id.Date>=0?ts(row[id.Date]):undefined,
      ClubSpeed_mph:id.ClubSpeed>=0?num(row[id.ClubSpeed]):undefined,
      AttackAngle_deg:id.AttackAngle>=0?num(row[id.AttackAngle]):undefined,
      ClubPath_deg:id.ClubPath>=0?num(row[id.ClubPath]):undefined,
      ClubFace_deg:id.ClubFace>=0?num(row[id.ClubFace]):undefined,
      FaceToPath_deg:id.FaceToPath>=0?num(row[id.FaceToPath]):undefined,
      BallSpeed_mph:id.BallSpeed>=0?num(row[id.BallSpeed]):undefined,
      SmashFactor:id.Smash>=0?num(row[id.Smash]):undefined,
      LaunchAngle_deg:id.LaunchAngle>=0?num(row[id.LaunchAngle]):undefined,
      LaunchDirection_deg:id.LaunchDir>=0?num(row[id.LaunchDir]):undefined,
      Backspin_rpm:id.Backspin>=0?num(row[id.Backspin]):undefined,
      Sidespin_rpm:id.Sidespin>=0?num(row[id.Sidespin]):undefined,
      SpinRate_rpm:id.SpinRate>=0?num(row[id.SpinRate]):undefined,
      SpinRateType:id.SpinRateType>=0?String(row[id.SpinRateType]??"").trim():undefined,
      SpinAxis_deg:id.SpinAxis>=0?num(row[id.SpinAxis]):undefined,
      ApexHeight_yds:id.Apex>=0?num(row[id.Apex]):undefined,
      CarryDistance_yds:id.Carry>=0?num(row[id.Carry]):undefined,
      CarryDeviationAngle_deg:id.CarryDevAng>=0?num(row[id.CarryDevAng]):undefined,
      CarryDeviationDistance_yds:id.CarryDevDist>=0?num(row[id.CarryDevDist]):undefined,
      TotalDistance_yds:id.Total>=0?num(row[id.Total]):undefined,
      TotalDeviationAngle_deg:id.TotalDevAng>=0?num(row[id.TotalDevAng]):undefined,
      TotalDeviationDistance_yds:id.TotalDevDist>=0?num(row[id.TotalDevDist]):undefined,
    };
    shots.push(s);
  }
  return shots;
}

/* Dedup fingerprint */
export const fpOf = (s:Shot) => {
  const r=(x?:number,d=2)=> (x==null?"":Number(x).toFixed(d));
  const t=s.Timestamp?new Date(s.Timestamp).getTime():"";
  return [s.Club?.toLowerCase().trim(), r(s.CarryDistance_yds,1), r(s.TotalDistance_yds,1), r(s.BallSpeed_mph,1), r(s.ClubSpeed_mph,1), r(s.LaunchAngle_deg,1), r(s.SpinRate_rpm,0), r(s.LaunchDirection_deg,1), r(s.ApexHeight_yds,1), t].join("|");
};

/* CSV export */
export const toCSV = (rows: Record<string, any>[]) => {
  if(!rows.length) return "";
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const esc = (v:any) => { if(v==null) return ""; const s=String(v).replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s; };
  return [headers.join(","), ...rows.map(r=>headers.map(h=>esc(r[h])).join(","))].join("\n");
};
export const exportCSV = (rows: Record<string, any>[]) => {
  const blob = new Blob([toCSV(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob); const a = document.createElement("a");
  a.href = url; a.download = "swingtrackr_filtered.csv"; a.click(); URL.revokeObjectURL(url);
};

/* XLSX helpers exposed where needed */
export { XLSX, orderIndex };
