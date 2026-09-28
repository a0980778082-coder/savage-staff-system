/* Source: https://data.gov.tw/dataset/14718 (DGPA), checked 2026-09-29.
   Government compensatory holidays and long weekends are references, not employee entitlements. */
(function(root){
'use strict';
const calendar={"2026": [["01-01", "開國紀念日"], ["02-15", "小年夜"], ["02-16", "農曆除夕"], ["02-17", "春節"], ["02-18", "春節"], ["02-19", "春節"], ["02-20", "補假"], ["02-27", "補假"], ["02-28", "和平紀念日"], ["04-03", "補假"], ["04-04", "兒童節"], ["04-05", "清明節"], ["04-06", "補假"], ["05-01", "勞動節"], ["06-19", "端午節"], ["09-25", "中秋節"], ["09-28", "孔子誕辰紀念日/教師節"], ["10-09", "補假"], ["10-10", "國慶日"], ["10-25", "臺灣光復暨金門古寧頭大捷紀念日"], ["10-26", "補假"], ["12-25", "行憲紀念日"]], "2027": [["01-01", "開國紀念日"], ["02-04", "小年夜"], ["02-05", "農曆除夕"], ["02-06", "春節"], ["02-07", "春節"], ["02-08", "春節"], ["02-09", "補假"], ["02-10", "補假"], ["02-28", "和平紀念日"], ["03-01", "補假"], ["04-04", "兒童節"], ["04-05", "清明節"], ["04-06", "補假"], ["04-30", "補假"], ["05-01", "勞動節"], ["06-09", "端午節"], ["09-15", "中秋節"], ["09-28", "孔子誕辰紀念日/教師節"], ["10-10", "國慶日"], ["10-11", "補假"], ["10-25", "臺灣光復暨金門古寧頭大捷紀念日"], ["12-24", "補假"], ["12-25", "行憲紀念日"], ["12-31", "補假"]]};
function entries(month){
 const year=month.slice(0,4), known=calendar[year];
 if(!known)return {supported:false,days:[],breaks:[]};
 const named=new Map(known.map(([d,name])=>[year+'-'+d,name]));
 const all=[],breaks=[];let run=[];
 function flush(){if(run.length>=3&&run.some(d=>named.has(d)))breaks.push({start:run[0],end:run[run.length-1],length:run.length});run=[];}
 for(let d=new Date(year+'-01-01T00:00:00Z');d.getUTCFullYear()===+year;d.setUTCDate(d.getUTCDate()+1)){
  const date=d.toISOString().slice(0,10),week=d.getUTCDay(),name=named.get(date)||'';
  if(name||week===0||week===6)run.push(date);else flush();
  all.push({date,name,kind:name?(name==='補假'?'政府機關補假參考':'國定假日'):'週末'});
 }flush();
 const relevant=breaks.filter(b=>b.start.slice(0,7)<=month&&b.end.slice(0,7)>=month);
 return {supported:true,breaks:relevant,days:all.filter(d=>d.date.startsWith(month)&&(d.name||relevant.some(b=>d.date>=b.start&&d.date<=b.end)))};
}
const api={entries,checkedAt:'2026-09-29',years:Object.keys(calendar)};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.SAVAGE_HOLIDAYS=api;
})(typeof window!=='undefined'?window:this);
