(()=>{
"use strict";
const $=id=>document.getElementById(id),cfg=window.SAVAGE_CONFIG;
let token=localStorage.getItem("savage_token")||"",me=null,data=null,employees=[];
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=x=>"$"+Math.round(Number(x||0)).toLocaleString("zh-TW");
const today=()=>new Date().toISOString().slice(0,10),ym=()=>today().slice(0,7);
function toast(t){$("toast").textContent=t;$("toast").hidden=false;clearTimeout(toast.t);toast.t=setTimeout(()=>$("toast").hidden=true,3000)}
function showStatus(type,title,message){
  const modal=$("statusModal"),spinner=$("statusSpinner"),icon=$("statusIcon");
  $("statusTitle").textContent=title;
  $("statusMessage").textContent=message||"";
  modal.hidden=false;
  if(type==="loading"){
    spinner.hidden=false;icon.hidden=true;icon.className="status-icon";
  }else{
    spinner.hidden=true;icon.hidden=false;
    icon.className="status-icon "+(type==="success"?"ok":"error");
    icon.textContent=type==="success"?"✓":"!";
  }
}
function hideStatus(delay=0){
  clearTimeout(hideStatus.t);
  hideStatus.t=setTimeout(()=>$("statusModal").hidden=true,delay);
}

async function api(mode,p={}){const r=await fetch(cfg.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({mode,token,...p})});const j=await r.json();if(!j.ok)throw Error(j.message||"操作失敗");return j}
function page(n){document.querySelectorAll(".page").forEach(x=>x.classList.toggle("active",x.id==="page-"+n));document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("active",x.dataset.page===n))}
async function boot(){["offDate","oilDate","shiftDate"].forEach(id=>$(id).value=today());$("salaryMonth").value=$("adminMonth").value=ym();const p=await api("publicConfig");$("loginName").innerHTML=p.users.map(x=>`<option>${esc(x)}</option>`).join("");if(token){try{await refresh()}catch(e){logout()}}}
async function login(){
  const name=$("loginName").value,pin=$("loginPin").value;
  $("loginMsg").textContent="";
  if(!name||!pin){
    showStatus("error","資料未填完整","請選擇姓名並輸入密碼。");
    hideStatus(1800);
    return;
  }

  async function linkOneSignalUser(user) {
  try {
    const externalId = user.employeeId
      ? `staff_${user.employeeId}`
      : `staff_${user.name}`;

    window.OneSignalDeferred = window.OneSignalDeferred || [];

    window.OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.login(externalId);

      await OneSignal.User.addTags({
        employee_name: user.name,
        employee_id: user.employeeId || "",
        role: user.role || "staff"
      });

      console.log("OneSignal 已綁定員工：", externalId);
    });
  } catch (error) {
    console.warn("OneSignal 員工綁定失敗：", error);
  }
}

async function unlinkOneSignalUser() {
  try {
    window.OneSignalDeferred = window.OneSignalDeferred || [];

    window.OneSignalDeferred.push(async function (OneSignal) {
      await OneSignal.logout();
      console.log("OneSignal 員工身分已解除");
    });
  } catch (error) {
    console.warn("OneSignal 登出失敗：", error);
  }
}
  $("loginBtn").disabled=true;
  showStatus("loading","登入中","正在確認帳號與密碼，請稍候…");
try {
  const r = await api("login", { name, pin });

  token = r.token;
  localStorage.setItem("savage_token", token);

  me = r.user;
  data = r;

  await linkOneSignalUser(me);

  showStatus("success", `已登入，${me.name}，歡迎回來！`);

  setTimeout(() => {
    showApp();
    renderAll();
    hideStatus();
  }, 900);

} catch (e) {
  const msg = e.message || "登入失敗，請稍後再試";

  $("loginMsg").textContent = msg;

  showStatus(
    "error",
    msg.includes("密碼") ? "密碼錯誤" : "登入失敗",
    msg
  );

  hideStatus(2200);

} finally {
  $("loginBtn").disabled = false;
}
}
function logout(){token="";me=null;data=null;localStorage.removeItem("savage_token");$("appView").hidden=true;$("loginView").hidden=false}
function showApp(){$("loginView").hidden=true;$("appView").hidden=false;$("hello").textContent=`${me.name}，你好`;$("todayText").textContent=new Date().toLocaleDateString("zh-TW",{dateStyle:"full"});$("adminTab").hidden=me.role!=="admin"}
async function refresh(month){const r=await api("refresh",{month:month||ym()});me=r.user;data=r;showApp();renderAll()}
function renderAll(){renderToday();renderMonth();renderOff();renderSubstitute();renderOil();renderSalary(data.salary)}
function renderToday(){const rows=data.schedule.filter(x=>x.date===today());$("page-today").innerHTML=`<div class="card"><h2>今天誰上班</h2>${rows.length?rows.map(x=>`<div class="shift"><div class="time">${esc(x.timeSlot)}</div><div><b>${esc(x.employeeName)}</b><div class="muted">${esc(x.status||"已排班")}</div></div></div>`).join(""):"<p>今天尚未排班或店休。</p>"}</div>`}
function renderMonth(){const rows=data.schedule.filter(x=>x.date.slice(0,7)===ym());const h={};rows.forEach(x=>{if(!String(x.timeSlot).includes("排休"))h[x.employeeName]=(h[x.employeeName]||0)+Number(x.actualHours??x.plannedHours??0)});$("page-month").innerHTML=`<div class="card"><h2>本月排班總時數</h2>${Object.entries(h).map(([n,v])=>`<span class="badge">${esc(n)}：${v.toFixed(1)} 小時</span>`).join(" ")||"尚無資料"}</div><div class="card table-wrap"><table><tr><th>日期</th><th>班別</th><th>員工</th><th>時數</th></tr>${rows.map(x=>`<tr><td>${x.date}</td><td>${esc(x.timeSlot)}</td><td>${esc(x.employeeName)}</td><td>${Number(x.actualHours??x.plannedHours??0)}</td></tr>`).join("")}</table></div>`}
function renderOff(){$("offList").innerHTML=data.offRequests.filter(x=>x.employeeName===me.name).map(x=>`<div class="card"><b>${x.requestDate}｜${esc(x.slot)}</b> <span class="badge">${esc(x.status)}</span><div class="muted">${esc(x.note||"")}</div></div>`).join("")}

function subStatusClass(s){
  if(["待員工接受","公開徵求","待老闆核准"].includes(s))return"pending";
  if(s==="已接受")return"accepted";
  if(["已拒絕","已取消"].includes(s))return"rejected";
  if(s==="已核准")return"approved";
  return"";
}
function renderSubstitute(){
  const requests=data.substituteRequests||[];
  const mine=requests.filter(x=>x.requester===me.name||x.substituteEmployee===me.name);
  const available=requests.filter(x=>x.requester!==me.name&&(x.status==="公開徵求"||(x.status==="待員工接受"&&x.substituteEmployee===me.name)));
  const future=(data.schedule||[]).filter(x=>x.employeeName===me.name&&x.date>=today()&&!String(x.timeSlot).includes("排休")&&x.status!=="取消");
  $("subShift").innerHTML=future.length?future.map(x=>`<option value="${x.row}">${x.date}｜${esc(x.timeSlot)}｜${Number(x.actualHours??x.plannedHours??0)} 小時</option>`).join(""):`<option value="">目前沒有可申請代班的班</option>`;
  const staff=(data.activeEmployees||[]).filter(x=>x!==me.name);
  $("subEmployee").innerHTML=`<option value="">公開徵求代班</option>`+staff.map(n=>`<option>${esc(n)}</option>`).join("");
  $("subAvailable").innerHTML=available.length?available.map(x=>`
  <div class="sub-card">
    <div class="sub-head"><b>${x.date}｜${esc(x.timeSlot)}</b><span class="badge ${subStatusClass(x.status)}">${esc(x.status)}</span></div>
    <div class="sub-flow"><span>${esc(x.requester)}</span><span class="sub-arrow">→</span><span>${x.substituteEmployee?esc(x.substituteEmployee):"公開徵求"}</span></div>
    <div class="muted">${esc(x.note||"")}</div>
    <div class="sub-actions"><button class="primary" data-sub-accept="${x.row}">接受代班</button>${x.substituteEmployee===me.name?`<button class="red" data-sub-reject="${x.row}">拒絕</button>`:""}</div>
  </div>`).join(""):"目前沒有可接的代班。";
  $("subList").innerHTML=mine.length?mine.map(x=>`
  <div class="sub-card">
    <div class="sub-head"><b>${x.date}｜${esc(x.timeSlot)}</b><span class="badge ${subStatusClass(x.status)}">${esc(x.status)}</span></div>
    <div class="sub-flow"><span>原班：${esc(x.requester)}</span><span class="sub-arrow">→</span><span>代班：${x.substituteEmployee?esc(x.substituteEmployee):"尚未指定"}</span></div>
    <div class="muted">${esc(x.note||"")}</div>
    ${x.requester===me.name&&!["已核准","已取消","已拒絕"].includes(x.status)?`<div class="sub-actions"><button class="red" data-sub-cancel="${x.row}">取消申請</button></div>`:""}
  </div>`).join(""):"尚無代班紀錄。";
}

function renderOil(){$("oilList").innerHTML=data.oilRows.map(x=>`<div class="card"><b>${x.date}｜${x.km} 公里</b> <span class="badge">${money(x.amount)}</span><div class="muted">${esc(x.note||"")}</div>${x.photoUrl?`<a target="_blank" href="${esc(x.photoUrl)}">查看照片</a>`:""}</div>`).join("")}
function renderSalary(s){if(!s)return;$("salaryResult").innerHTML=`<div class="card"><h2>${s.month} 薪資明細</h2><div class="shift"><div>計薪時數</div><b>${s.hours}</b></div><div class="shift"><div>基本薪資</div><b>${money(s.basePay)}</b></div><div class="shift"><div>獎金</div><b>${money(s.bonuses)}</b></div><div class="shift"><div>里程補貼</div><b>${money(s.oilSubsidy)}</b></div><div class="shift"><div>扣款</div><b>-${money(s.deductions)}</b></div><div class="salary-total"><span>實領</span><span>${money(s.netPay)}</span></div><button id="downloadPayslip" class="primary" style="margin-top:14px">下載 PDF 薪資條</button><small class="muted">薪資條僅能下載本人資料。</small></div>`;$("downloadPayslip").onclick=downloadPayslip}
async function submitOff(){try{await api("offRequest",{date:$("offDate").value,slot:$("offSlot").value,note:$("offNote").value});toast("排假申請已送出");await refresh()}catch(e){toast(e.message)}}
function toDataUrl(f){return new Promise((res,rej)=>{if(!f)return res("");const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f)})}

async function submitSubstitute(){
  try{
    if(!$("subShift").value)throw Error("目前沒有可申請代班的班");
    await api("requestSubstitute",{scheduleRow:+$("subShift").value,substituteEmployee:$("subEmployee").value,note:$("subNote").value});
    toast("代班申請已送出");
    $("subNote").value="";
    await refresh();
  }catch(e){toast(e.message)}
}

async function submitOil(){try{await api("oil",{date:$("oilDate").value,start:$("oilStart").value,end:$("oilEnd").value,note:$("oilNote").value,photo:await toDataUrl($("oilPhoto").files[0])});toast("里程已送出");await refresh()}catch(e){toast(e.message)}}
async function loadSalary(){try{const r=await api("salary",{month:$("salaryMonth").value});renderSalary(r.salary)}catch(e){toast(e.message)}}
async function downloadPayslip(){try{toast("正在產生薪資條");const r=await api("downloadPayslip",{month:$("salaryMonth").value});const raw=atob(r.base64),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"})),a=document.createElement("a");a.href=url;a.download=r.filename||"薪資條.pdf";document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);toast("薪資條已下載")}catch(e){toast(e.message)}}
async function loadAdmin(){try{const r=await api("adminDashboard",{month:$("adminMonth").value});employees=r.employees;renderEmployees();renderAdminSchedule(r.schedule);$("settingOilPrice").value=r.settings.oilPrice;$("settingEfficiency").value=r.settings.efficiency;$("shiftEmployee").innerHTML=employees.filter(x=>x.status==="在職").map(x=>`<option>${esc(x.name)}</option>`).join("");$("adminSubstitute").innerHTML=(r.pendingSubstitutes||[]).length?(r.pendingSubstitutes||[]).map(x=>`
<div class="sub-card">
<div class="sub-head"><b>${x.date}｜${esc(x.timeSlot)}</b><span class="badge ${subStatusClass(x.status)}">${esc(x.status)}</span></div>
<div class="sub-flow"><span>原班：${esc(x.requester)}</span><span class="sub-arrow">→</span><span>代班：${esc(x.substituteEmployee||"尚未指定")}</span></div>
<div class="muted">${esc(x.note||"")}</div>
<div class="sub-actions"><button class="primary" data-admin-sub="${x.row}" data-admin-status="已核准">核准代班</button><button class="red" data-admin-sub="${x.row}" data-admin-status="已拒絕">拒絕</button></div>
</div>`).join(""):"目前沒有待審核的代班。";
$("adminResult").innerHTML=`<h3>待審核排假</h3>${r.pendingOff.map(x=>`<div class="shift"><div>${x.requestDate}</div><div><b>${esc(x.employeeName)}｜${esc(x.slot)}</b></div><div><button class="mini" data-off="${x.row}" data-status="已核准">核准</button><button class="mini red" data-off="${x.row}" data-status="已拒絕">拒絕</button></div></div>`).join("")||"目前沒有待審核"}<h3>薪資預覽</h3><div class="table-wrap"><table><tr><th>員工</th><th>時數</th><th>基本</th><th>獎金</th><th>里程</th><th>扣款</th><th>實領</th></tr>${r.payroll.map(x=>`<tr><td>${esc(x.name)}</td><td>${x.hours}</td><td>${money(x.basePay)}</td><td>${money(x.bonuses)}</td><td>${money(x.oilSubsidy)}</td><td>${money(x.deductions)}</td><td><b>${money(x.netPay)}</b></td></tr>`).join("")}</table></div>`}catch(e){toast(e.message)}}
function renderEmployees(){$("employeeList").innerHTML=employees.map(x=>`<div class="shift"><div>${esc(x.id)}</div><div><b>${esc(x.name)}</b><div class="muted">${esc(x.salaryType)}｜${esc(x.status)}</div></div><div><button class="mini" data-edit-emp="${x.row}">編輯</button><button class="mini red" data-disable-emp="${x.row}">${x.status==="在職"?"停用":"恢復"}</button></div></div>`).join("")}
function renderAdminSchedule(rows){$("adminSchedule").innerHTML=`<div class="table-wrap"><table><tr><th>日期</th><th>員工</th><th>班別</th><th>時數</th><th></th></tr>${rows.map(x=>`<tr><td>${x.date}</td><td>${esc(x.employeeName)}</td><td>${esc(x.timeSlot)}</td><td>${x.plannedHours??""}</td><td><button class="mini red" data-delete-shift="${x.row}">刪除</button></td></tr>`).join("")}</table></div>`}
async function checkConflict(){if(!$("shiftDate").value||!$("shiftEmployee").value)return;try{const r=await api("checkScheduleConflict",{date:$("shiftDate").value,employee:$("shiftEmployee").value});$("conflictBox").innerHTML=r.conflict?`<div class="warning">⚠️ ${esc(r.message)}</div>`:`<div class="safe">此日期目前沒有排假衝突</div>`;return r.conflict}catch(e){toast(e.message)}}
async function saveShift(){try{if(await checkConflict())throw Error("此員工當天有排假，已阻止誤排班");const type=$("shiftType").value==="自訂"?$("shiftCustom").value:$("shiftType").value;await api("saveShift",{date:$("shiftDate").value,employee:$("shiftEmployee").value,timeSlot:type,hours:$("shiftHours").value});toast("排班已新增");await loadAdmin();await refresh()}catch(e){toast(e.message)}}
async function saveEmployee(){try{await api("saveEmployee",{row:$("empEditRow").value,name:$("empName").value,pin:$("empPin").value,role:$("empRole").value,salaryType:$("empSalaryType").value,employeeId:$("empId").value,monthly:$("empMonthly").value,hourly:$("empHourly").value});toast("員工資料已儲存");["empEditRow","empName","empPin","empId","empMonthly","empHourly"].forEach(id=>$(id).value="");await loadAdmin()}catch(e){toast(e.message)}}
async function saveSettings(){try{await api("saveSettings",{oilPrice:$("settingOilPrice").value,efficiency:$("settingEfficiency").value});toast("設定已儲存")}catch(e){toast(e.message)}}
async function exportPayroll(){try{const r=await api("exportPayroll",{month:$("adminMonth").value});const a=document.createElement("a");a.href="data:text/csv;charset=utf-8,\uFEFF"+encodeURIComponent(r.csv);a.download=`小野人薪資表_${$("adminMonth").value}.csv`;a.click()}catch(e){toast(e.message)}}
document.addEventListener("click",async e=>{let sb=e.target.closest("[data-sub-accept]");
if(sb){try{await api("respondSubstitute",{row:+sb.dataset.subAccept,action:"accept"});toast("已接受代班，等待老闆核准");await refresh()}catch(err){toast(err.message)}return}
sb=e.target.closest("[data-sub-reject]");
if(sb){try{await api("respondSubstitute",{row:+sb.dataset.subReject,action:"reject"});toast("已拒絕代班");await refresh()}catch(err){toast(err.message)}return}
sb=e.target.closest("[data-sub-cancel]");
if(sb){try{await api("cancelSubstitute",{row:+sb.dataset.subCancel});toast("已取消代班申請");await refresh()}catch(err){toast(err.message)}return}
sb=e.target.closest("[data-admin-sub]");
if(sb){try{await api("reviewSubstitute",{row:+sb.dataset.adminSub,status:sb.dataset.adminStatus});toast(sb.dataset.adminStatus==="已核准"?"代班已核准並更新班表":"已拒絕代班");await loadAdmin();await refresh()}catch(err){toast(err.message)}return}
let b=e.target.closest("[data-off]");if(b){await api("reviewOff",{row:+b.dataset.off,status:b.dataset.status});await loadAdmin();await refresh();return}b=e.target.closest("[data-edit-emp]");if(b){const x=employees.find(v=>v.row==b.dataset.editEmp);if(!x)return;$("empEditRow").value=x.row;$("empName").value=x.name;$("empPin").value=x.pin;$("empRole").value=x.role;$("empSalaryType").value=x.salaryType;$("empId").value=x.id;$("empMonthly").value=x.monthly;$("empHourly").value=x.hourly;return}b=e.target.closest("[data-disable-emp]");if(b){await api("toggleEmployee",{row:+b.dataset.disableEmp});await loadAdmin();return}b=e.target.closest("[data-delete-shift]");if(b){await api("deleteShift",{row:+b.dataset.deleteShift});await loadAdmin();await refresh()}})
$("tabs").onclick=e=>{const b=e.target.closest("[data-page]");if(b)page(b.dataset.page)};
$("loginBtn").onclick=login;$("logoutBtn").onclick=logout;$("offSubmit").onclick=submitOff;$("subSubmit").onclick=submitSubstitute;$("oilSubmit").onclick=submitOil;$("salaryLoad").onclick=loadSalary;
$("adminLoad").onclick=loadAdmin;$("saveShift").onclick=saveShift;$("saveEmployee").onclick=saveEmployee;$("saveSettings").onclick=saveSettings;$("exportPayroll").onclick=exportPayroll;
$("shiftDate").onchange=checkConflict;$("shiftEmployee").onchange=checkConflict;$("oilPhoto").onchange=e=>{$("oilPreview").innerHTML=e.target.files[0]?`<img class="photo" src="${URL.createObjectURL(e.target.files[0])}">`:""};
boot().catch(e=>toast(e.message));
})();