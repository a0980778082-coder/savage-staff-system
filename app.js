(()=>{
"use strict";
const safeStore={getItem(k){try{return window.localStorage.getItem(k)}catch(e){return null}},setItem(k,v){try{window.localStorage.setItem(k,v)}catch(e){}},removeItem(k){try{window.localStorage.removeItem(k)}catch(e){}}};
const $=id=>document.getElementById(id),cfg=window.SAVAGE_CONFIG;
let token=safeStore.getItem("savage_token")||"",me=null,data=null,employees=[],noticeShownKey="";
const esc=x=>String(x??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const money=x=>"$"+Math.round(Number(x||0)).toLocaleString("zh-TW");
const taipeiDate=d=>new Intl.DateTimeFormat("sv-SE",{timeZone:"Asia/Taipei",year:"numeric",month:"2-digit",day:"2-digit"}).format(d);
const today=()=>taipeiDate(new Date()),ym=()=>today().slice(0,7);
const daysInMonth=month=>{const [y,m]=String(month).split("-").map(Number);return y&&m?new Date(y,m,0).getDate():0};
const progressKey=month=>`savage_schedule_progress_${month}`;
function nextDate(date){const [y,m,d]=String(date).split("-").map(Number);const n=new Date(Date.UTC(y,m-1,d+1));return n.toISOString().slice(0,10)}
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

async function api(mode,p={}) {
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),20000);
  try {
    if(!cfg||!cfg.API_URL)throw Error("未載入後端網址，請重新整理網頁。");
    const r=await fetch(cfg.API_URL,{method:"POST",headers:{"Content-Type":"text/plain;charset=utf-8"},body:JSON.stringify({mode,token,...p}),signal:controller.signal});
    if(!r.ok)throw Error("後端連線失敗（HTTP "+r.status+"），請確認 Apps Script 部署權限。");
    const raw=await r.text();let j;try{j=JSON.parse(raw)}catch(e){throw Error("後端未回傳系統資料，請確認 config.js 的網址及 Apps Script 網頁應用程式存取權限。");}
    if(!j.ok)throw Error(j.message||"操作失敗");return j;
  }catch(e){if(e.name==="AbortError")throw Error("連線超過20秒，請檢查網路後重試。");if(e instanceof TypeError)throw Error("無法連接員工系統，請檢查網路或後端部署網址。");throw e;}finally{clearTimeout(timer)}
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

function page(n) {
  document.querySelectorAll(".page").forEach(x=>
    x.classList.toggle("active",x.id==="page-"+n)
  );
  document.querySelectorAll(".tabs button").forEach(x=>
    x.classList.toggle("active",x.dataset.page===n)
  );
}

async function boot() {
  ["offDate","oilDate","shiftDate"].forEach(id=>{
    if($(id))$(id).value=today();
  });

  if($("salaryMonth"))$("salaryMonth").value=ym();
  if($("adminMonth"))$("adminMonth").value=ym();

  $("loginMsg").textContent="正在載入員工姓名…";
  const p=await api("publicConfig");
  $("loginName").innerHTML=(p.users||[])
    .map(x=>`<option>${esc(x)}</option>`)
    .join("");

  $("loginMsg").textContent=(p.users||[]).length?"":"目前沒有可登入的在職員工，請檢查 Users 資料。";
  if(token){
    try{
      await refresh();
      await linkOneSignalUser(me);
    }catch(e){
      await logout();
    }
  }
}

async function login() {
  const name=$("loginName").value;
  const pin=$("loginPin").value;

  $("loginMsg").textContent="";

  if(!name||!pin){
    showStatus("error","資料未填完整","請選擇姓名並輸入密碼。");
    hideStatus(1800);
    return;
  }

  $("loginBtn").disabled=true;
  showStatus("loading","登入中","正在確認帳號與密碼，請稍候…");

  try{
    const r=await api("login",{name,pin});

    token=r.token;
    safeStore.setItem("savage_token",token);

    me=r.user;
    data=r;

    await linkOneSignalUser(me);

    showStatus("success",`已登入，${me.name}，歡迎回來！`,"");

    setTimeout(()=>{
      showApp();
      renderAll();
      hideStatus();
    },900);
  }catch(e){
    const msg=e.message||"登入失敗，請稍後再試";

    $("loginMsg").textContent=msg;

    showStatus(
      "error",
      msg.includes("密碼")?"密碼錯誤":"登入失敗",
      msg
    );

    hideStatus(2200);
  }finally{
    $("loginBtn").disabled=false;
  }
}
async function logout(){
  try{
    await unlinkOneSignalUser();
  }catch(e){
    console.warn("解除 OneSignal 身分失敗：",e);
  }

  token="";
  me=null;
  data=null;
  safeStore.removeItem("savage_token");

  $("appView").hidden=true;
  $("loginView").hidden=false;
  if($("loginPin"))$("loginPin").value="";
}
function showApp(){$("loginView").hidden=true;$("appView").hidden=false;$("hello").textContent=`${me.name}，你好`;$("todayText").textContent=new Date().toLocaleDateString("zh-TW",{dateStyle:"full"});$("adminTab").hidden=me.role!=="admin"}
async function refresh(month){const r=await api("refresh",{month:month||ym()});me=r.user;data=r;showApp();renderAll()}
function renderAll(){renderStaffNotice();renderToday();renderMonth();renderOff();renderSubstitute();renderOil();renderSalary(data.salary)}

function noticeConfig(){return(data&&data.staffNotice)||{}}
function blockedOffDates(){return Array.isArray(noticeConfig().blockedOffDates)?noticeConfig().blockedOffDates:[]}
function formatNoticeDate(d){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(d||"")))return String(d||"");
  const x=new Date(d+"T00:00:00");
  const weekday=["日","一","二","三","四","五","六"][x.getDay()];
  return `${Number(d.slice(5,7))}/${Number(d.slice(8,10))}（${weekday}）`;
}
function blockedDatesHtml(dates){return dates.map(d=>`<span class="blocked-date-chip">${esc(formatNoticeDate(d))}</span>`).join("")}
function renderStaffNotice(){
  const n=noticeConfig(),dates=blockedOffDates();
  const marquee=$("staffMarquee"),marqueeText=$("staffMarqueeText");
  if(marquee&&marqueeText){
    const show=!!n.marqueeEnabled&&!!String(n.marqueeText||"").trim();
    marquee.hidden=!show;
    marqueeText.textContent=show?String(n.marqueeText):"";
  }
  const restriction=$("offRestrictionNotice");
  if(restriction){
    restriction.innerHTML=dates.length?`<div class="restriction-card"><strong>⚠️ 目前禁止排休日期</strong><div class="blocked-date-list">${blockedDatesHtml(dates)}</div></div>`:"";
  }
  validateOffDate();
  const body=String(n.body||"").trim();
  const popupKey=`${me?me.name:""}|${n.updatedAt||n.title||body}`;
  if(n.popupEnabled&&body&&noticeShownKey!==popupKey){
    noticeShownKey=popupKey;
    $("staffNoticeTitle").textContent=n.title||"員工公告";
    $("staffNoticeBody").textContent=body;
    const blocked=$("staffNoticeBlocked");
    if(dates.length){
      blocked.hidden=false;
      blocked.innerHTML=`<b>🚫 禁止排休日期</b><div class="blocked-date-list">${blockedDatesHtml(dates)}</div>`;
    }else{
      blocked.hidden=true;blocked.innerHTML="";
    }
    $("staffNoticeModal").hidden=false;
  }
}
function validateOffDate(){
  const input=$("offDate"),warning=$("offDateWarning"),btn=$("offSubmit");
  if(!input||!warning||!btn)return false;
  const d=input.value,blocked=d&&blockedOffDates().includes(d);
  warning.hidden=!blocked;
  warning.textContent=blocked?`🚫 ${formatNoticeDate(d)} 為禁止排休日，請選擇其他日期。`:"";
  btn.disabled=!!blocked;
  return !!blocked;
}
function closeStaffNotice(){if($("staffNoticeModal"))$("staffNoticeModal").hidden=true}

function renderToday(){const rows=data.schedule.filter(x=>x.date===today());$("page-today").innerHTML=`<div class="card"><h2>今天誰上班</h2>${rows.length?rows.map(x=>`<div class="shift"><div class="time">${esc(x.timeSlot)}</div><div><b>${esc(x.employeeName)}</b><div class="muted">${esc(x.status||"已排班")}</div></div></div>`).join(""):"<p>今天尚未排班或店休。</p>"}</div>`}
function renderMonth(){const rows=data.schedule.filter(x=>x.date.slice(0,7)===ym()),leaves=(data.offRequests||[]).filter(x=>x.employeeName===me.name&&x.requestDate.slice(0,7)===ym()&&x.status==="已核准");const h={};rows.forEach(x=>h[x.employeeName]=(h[x.employeeName]||0)+Number(x.actualHours??x.plannedHours??0));$("page-month").innerHTML=`<div class="card"><h2>本月排班總時數</h2>${Object.entries(h).map(([n,v])=>`<span class="badge">${esc(n)}：${v.toFixed(1)} 小時</span>`).join(" ")||"尚無資料"}</div><div class="card table-wrap"><h2>已排班</h2><table><tr><th>日期</th><th>班別</th><th>員工</th><th>時數</th></tr>${rows.map(x=>`<tr><td>${x.date}</td><td>${esc(x.timeSlot)}</td><td>${esc(x.employeeName)}</td><td>${Number(x.actualHours??x.plannedHours??0)}</td></tr>`).join("")||`<tr><td colspan="4">尚無排班</td></tr>`}</table></div><div class="card table-wrap"><h2>我的已核准排休</h2><table><tr><th>日期</th><th>時段</th><th>狀態</th></tr>${leaves.map(x=>`<tr><td>${x.requestDate}</td><td>${esc(x.slot)}</td><td>${esc(x.status)}</td></tr>`).join("")||`<tr><td colspan="3">本月沒有已核准排休</td></tr>`}</table></div>`}
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
async function submitOff(){try{if(validateOffDate())throw Error("這一天設定為禁止排休，請選擇其他日期");await api("offRequest",{date:$("offDate").value,slot:$("offSlot").value,note:$("offNote").value});toast("排假申請已送出");await refresh()}catch(e){toast(e.message)}}
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
async function loadAdmin() {
  try {
    const r = await api("adminDashboard", {
      month: $("adminMonth").value
    });

    employees = r.employees || [];

    renderEmployees();
    renderAdminSchedule(r.schedule || []);
    renderScheduleProgress(r.schedule || []);
    renderAdminLeave(r.leaveRequests || []);

    $("settingOilPrice").value =
      r.settings && r.settings.oilPrice != null
        ? r.settings.oilPrice
        : "";

    $("settingEfficiency").value =
      r.settings && r.settings.efficiency != null
        ? r.settings.efficiency
        : "";

    const notice = r.settings && r.settings.staffNotice ? r.settings.staffNotice : {};
    $("noticePopupEnabled").checked = !!notice.popupEnabled;
    $("noticeTitle").value = notice.title || "";
    $("noticeBody").value = notice.body || "";
    $("noticeMarqueeEnabled").checked = !!notice.marqueeEnabled;
    $("noticeMarqueeText").value = notice.marqueeText || "";
    $("blockedOffDates").value = Array.isArray(notice.blockedOffDates) ? notice.blockedOffDates.join("\n") : "";

    $("shiftEmployee").innerHTML = employees
      .filter(x => x.status === "在職")
      .map(x => `<option>${esc(x.name)}</option>`)
      .join("");

    const pendingSubstitutes = r.pendingSubstitutes || [];

    $("adminSubstitute").innerHTML = pendingSubstitutes.length
      ? pendingSubstitutes.map(x => `
          <div class="sub-card">
            <div class="sub-head">
              <b>${esc(x.date)}｜${esc(x.timeSlot)}</b>

              <span class="badge ${subStatusClass(x.status)}">
                ${esc(x.status)}
              </span>
            </div>

            <div class="sub-flow">
              <span>原班：${esc(x.requester)}</span>
              <span class="sub-arrow">→</span>
              <span>
                代班：${esc(x.substituteEmployee || "尚未指定")}
              </span>
            </div>

            <div class="muted">
              ${esc(x.note || "")}
            </div>

            <div class="sub-actions">
              <button
                class="primary"
                data-admin-sub="${x.row}"
                data-admin-status="已核准"
              >
                核准代班
              </button>

              <button
                class="red"
                data-admin-sub="${x.row}"
                data-admin-status="已拒絕"
              >
                拒絕
              </button>
            </div>
          </div>
        `).join("")
      : "目前沒有待審核的代班。";

    const pendingOff = r.pendingOff || [];

    const pendingOffHtml = pendingOff.length
      ? pendingOff.map(x => `
          <div class="shift">
            <div>${esc(x.requestDate)}</div>

            <div>
              <b>
                ${esc(x.employeeName)}｜${esc(x.slot)}
              </b>
            </div>

            <div>
              <button
                class="mini"
                data-off="${x.row}"
                data-status="已核准"
              >
                核准
              </button>

              <button
                class="mini red"
                data-off="${x.row}"
                data-status="已拒絕"
              >
                拒絕
              </button>
            </div>
          </div>
        `).join("")
      : "目前沒有待審核";

    const payroll = r.payroll || [];

    const payrollRows = payroll.map(x => `
      <tr>
        <td>${esc(x.name)}</td>
        <td>${x.hours}</td>
        <td>${money(x.basePay)}</td>
        <td>${money(x.bonuses)}</td>
        <td>${money(x.oilSubsidy)}</td>
        <td>${money(x.deductions)}</td>
        <td><b>${money(x.netPay)}</b></td>
      </tr>
    `).join("");

    $("adminResult").innerHTML = `
      <h3>待審核排假</h3>

      ${pendingOffHtml}

      <h3>薪資預覽</h3>

      <div class="table-wrap">
        <table>
          <tr>
            <th>員工</th>
            <th>時數</th>
            <th>基本</th>
            <th>獎金</th>
            <th>里程</th>
            <th>扣款</th>
            <th>實領</th>
          </tr>

          ${payrollRows}
        </table>
      </div>
    `;

  } catch (e) {
    console.error("載入老闆後台失敗：", e);
    toast(e.message);
  }
}
function renderEmployees(){$("employeeList").innerHTML=employees.map(x=>`<div class="shift"><div>${esc(x.id)}</div><div><b>${esc(x.name)}</b><div class="muted">${esc(x.salaryType)}｜${esc(x.status)}</div></div><div><button class="mini" data-edit-emp="${x.row}">編輯</button><button class="mini red" data-disable-emp="${x.row}">${x.status==="在職"?"停用":"恢復"}</button></div></div>`).join("")}
function getScheduleProgress(rows,month){
  const total=daysInMonth(month);
  const scheduled=(rows||[]).map(x=>String(x.date||"")).filter(d=>d.slice(0,7)===month).sort();
  const latestScheduled=scheduled.at(-1)||"";
  const saved=safeStore.getItem(progressKey(month))||"";
  const completed=[latestScheduled,saved].filter(Boolean).sort().at(-1)||"";
  const completedDay=completed?Math.min(Number(completed.slice(8,10)),total):0;
  const next=completedDay<total?`${month}-${String(completedDay+1).padStart(2,"0")}`:"";
  return{total,completed,completedDay,next,remaining:Math.max(total-completedDay,0)};
}
function renderScheduleProgress(rows){
  const month=$("adminMonth").value;
  if(!month)return;
  const p=getScheduleProgress(rows,month);
  const percent=p.total?Math.round(p.completedDay/p.total*100):0;
  $("scheduleProgress").innerHTML=`
    <div class="safe">
      <b>${p.completed?`目前已排到 ${esc(p.completed)}`:"這個月還沒開始排班"}</b>
      <div class="muted" style="margin-top:5px">完成度：${p.completedDay}／${p.total} 天（${percent}%）${p.next?`｜下一天：${esc(p.next)}`:"｜本月日期已全部完成"}</div>
      <div style="height:8px;background:#dceff2;border-radius:99px;overflow:hidden;margin-top:9px"><div style="height:100%;width:${percent}%;background:#89c8d3"></div></div>
    </div>`;
  if(p.next&&(!$('shiftDate').value||$('shiftDate').value.slice(0,7)!==month))$('shiftDate').value=p.next;
}
function renderAdminSchedule(rows){$("adminSchedule").innerHTML=`<div class="table-wrap"><table><tr><th>日期</th><th>員工</th><th>班別</th><th>時數</th><th></th></tr>${rows.map(x=>`<tr><td>${x.date}</td><td>${esc(x.employeeName)}</td><td>${esc(x.timeSlot)}</td><td>${x.plannedHours??""}</td><td><button class="mini red" data-delete-shift="${x.row}">刪除</button></td></tr>`).join("")}</table></div>`}
function renderAdminLeave(rows){$("adminLeave").innerHTML=`<div class="table-wrap"><table><tr><th>日期</th><th>員工</th><th>排休時段</th><th>狀態</th></tr>${rows.map(x=>`<tr><td>${x.requestDate}</td><td>${esc(x.employeeName)}</td><td>${esc(x.slot)}</td><td><span class="badge">${esc(x.status)}</span></td></tr>`).join("")||`<tr><td colspan="4">所選月份尚無排休資料</td></tr>`}</table></div>`}
function selectedShiftType(){return $("shiftType").value==="自訂"?$("shiftCustom").value:$("shiftType").value}
function inferredShiftHours(slot){const s=String(slot||"");if(s.includes("全天"))return 8;const m=s.match(/(\d{1,2}):(\d{2})\s*[~～-]\s*(\d{1,2}):(\d{2})/);return m?((Number(m[3])*60+Number(m[4]))-(Number(m[1])*60+Number(m[2])))/60:0}
function autoFillShiftHours(force=false){const hours=inferredShiftHours(selectedShiftType());if(hours&&(!$("shiftHours").value||force))$("shiftHours").value=hours}
async function checkConflict(){if(!$("shiftDate").value||!$("shiftEmployee").value||!selectedShiftType())return;try{const r=await api("checkScheduleConflict",{date:$("shiftDate").value,employee:$("shiftEmployee").value,timeSlot:selectedShiftType()});$("conflictBox").innerHTML=r.conflict?`<div class="warning">⚠️ ${esc(r.message)}</div>`:`<div class="safe">此日期目前沒有排假衝突</div>`;return r.conflict}catch(e){toast(e.message)}}
async function saveShift(){try{if(await checkConflict())throw Error("這個班別和排休時段衝突，已阻止誤排班");const type=selectedShiftType();await api("saveShift",{date:$("shiftDate").value,employee:$("shiftEmployee").value,timeSlot:type,hours:$("shiftHours").value});toast("排班已新增");await loadAdmin();await refresh()}catch(e){toast(e.message)}}
async function finishShiftDay(){
  const date=$("shiftDate").value,month=$("adminMonth").value;
  if(!date) return toast("請先選擇排班日期");
  if(date.slice(0,7)!==month) return toast("排班日期和後台月份不同");
  safeStore.setItem(progressKey(month),date);
  const next=nextDate(date);
  if(next.slice(0,7)===month){$("shiftDate").value=next;toast(`已記錄，接著排 ${next}`)}
  else toast("這個月已排到最後一天");
  await loadAdmin();
  $("shiftDate").scrollIntoView({behavior:"smooth",block:"center"});
}
async function saveEmployee(){try{await api("saveEmployee",{row:$("empEditRow").value,name:$("empName").value,pin:$("empPin").value,role:$("empRole").value,salaryType:$("empSalaryType").value,employeeId:$("empId").value,monthly:$("empMonthly").value,hourly:$("empHourly").value});toast("員工資料已儲存");["empEditRow","empName","empPin","empId","empMonthly","empHourly"].forEach(id=>$(id).value="");await loadAdmin()}catch(e){toast(e.message)}}
async function saveSettings(){try{await api("saveSettings",{oilPrice:$("settingOilPrice").value,efficiency:$("settingEfficiency").value});toast("設定已儲存")}catch(e){toast(e.message)}}
async function saveStaffNotice(sendPush=false){
  try{
    const payload={
      popupEnabled:$("noticePopupEnabled").checked,
      title:$("noticeTitle").value,
      body:$("noticeBody").value,
      marqueeEnabled:$("noticeMarqueeEnabled").checked,
      marqueeText:$("noticeMarqueeText").value,
      blockedOffDates:$("blockedOffDates").value,
      sendPush
    };
    const r=await api("saveStaffNotice",payload);
    toast(sendPush?(r.pushError?`公告已儲存，但推播失敗：${r.pushError}`:`公告已儲存，已推播 ${r.pushed||0} 位員工`):"公告與禁止排休日期已儲存");
    await refresh();
    await loadAdmin();
  }catch(e){toast(e.message)}
}
async function publishSchedule(){
  try{
    const month=$("adminMonth").value;
    if(!month)throw Error("請先選擇要公布的月份");
    const p=getScheduleProgress((data&&data.schedule)||[],month);
    if(p.remaining&& !confirm(`目前進度記錄到 ${p.completed||"尚未開始"}，還有 ${p.remaining} 天未完成。仍要繼續公布嗎？`))return;
    if(!confirm(`確定公布 ${month} 班表並通知全體員工嗎？`))return;
    showStatus("loading","正在公布班表","正在發送通知給全體員工…");
    const r=await api("publishSchedule",{month});
    showStatus("success","班表已公布",`${r.month} 班表已通知 ${r.count} 位員工。`);
    hideStatus(2200);
  }catch(e){
    showStatus("error","公布失敗",e.message);
    hideStatus(2200);
  }
}
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
$("adminLoad").onclick=loadAdmin;$("saveShift").onclick=saveShift;$("saveEmployee").onclick=saveEmployee;$("saveSettings").onclick=saveSettings;$("saveStaffNotice").onclick=()=>saveStaffNotice(false);$("saveAndPushStaffNotice").onclick=()=>saveStaffNotice(true);$("publishSchedule").onclick=publishSchedule;$("exportPayroll").onclick=exportPayroll;
$("finishShiftDay").onclick=finishShiftDay;$("closeStaffNotice").onclick=closeStaffNotice;$("offDate").onchange=validateOffDate;
$("adminMonth").onchange=()=>{const month=$("adminMonth").value,p=getScheduleProgress([],month);if(p.next)$("shiftDate").value=p.next;loadAdmin()};
$("shiftDate").onchange=checkConflict;$("shiftEmployee").onchange=checkConflict;$("shiftType").onchange=()=>{autoFillShiftHours(true);checkConflict()};$("shiftCustom").oninput=()=>{if($("shiftType").value==="自訂")autoFillShiftHours(true)};$("oilPhoto").onchange=e=>{$("oilPreview").innerHTML=e.target.files[0]?`<img class="photo" src="${URL.createObjectURL(e.target.files[0])}">`:""};
function startLogin(){const b=$("retryLoginLoad");if(b)b.disabled=true;boot().catch(e=>{$("loginMsg").textContent=e.message;toast(e.message)}).finally(()=>{if(b)b.disabled=false})}
$("retryLoginLoad").onclick=startLogin;
/* 整月自動排班，沿用 app.js 的 api、token 及老闆登入。 */
let autoState={features:[],rules:null,draft:null,employees:[],busy:false};
const au=id=>document.getElementById(id);
const auEsc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function auRun(fn){if(autoState.busy)return;autoState.busy=true;au('auWork').disabled=true;au('auStatus').textContent='處理中…';try{await fn()}catch(e){au('auStatus').textContent=e.message;toast(e.message)}finally{autoState.busy=false;au('auWork').disabled=false}}
async function auCall(action,input={}){return api('autoSchedule',{action,input})}
function auMonth(){return au('auMonth').value}
function auOptions(values,chosen){return values.map(x=>`<option value="${auEsc(x.value)}" ${x.value===chosen?'selected':''}>${auEsc(x.text)}</option>`).join('')}
function auRulesView(){const r=autoState.rules;au('auRules').innerHTML=`<h3>各班需要人數</h3><p>每週固定規則會重複套用。0 表示該天不用這個班。初始數字是範例，請先依店內需求修改。</p><div class="table-wrap"><table><thead><tr><th>班別時間</th><th>計薪時數</th>${['日','一','二','三','四','五','六'].map(d=>'<th>週'+d+'</th>').join('')}<th></th></tr></thead><tbody>${r.shifts.map((t,i)=>`<tr><td><input aria-label="班別時間" data-shift="${i}" data-field="label" value="${auEsc(t.label)}"></td><td><input aria-label="計薪時數" type="number" min="0.5" step="0.5" data-shift="${i}" data-field="hours" value="${t.hours}"></td>${t.need.map((n,d)=>`<td><input aria-label="週${d}人數" type="number" min="0" step="1" data-shift="${i}" data-day="${d}" value="${n}"></td>`).join('')}<td><button data-remove-shift="${i}">移除</button></td></tr>`).join('')}</tbody></table></div><button id="auAddShift">新增班別</button> <button id="auAddFullDay" ${r.shifts.some(t=>t.label==='全天班')?'disabled':''}>${r.shifts.some(t=>t.label==='全天班')?'已加入全天班':'新增全天班（8 小時）'}</button><p>全天班：09:00～13:00、16:00～20:00，共 8 小時。只上全天班的員工，請只勾選「全天班」。全天、早班、晚班的人數是分別需求；例如全天 1 人加早班 1 人，代表上午共需 2 人。</p><h3>員工可上班時段</h3>${r.employees.map((e,i)=>`<fieldset class="au-person"><legend><label><input type="checkbox" data-emp="${i}" data-field="enabled" ${e.enabled?'checked':''}> ${auEsc(e.name)} 參與排班</label></legend><div>可上班別 ${r.shifts.map(t=>`<label class="au-check"><input type="checkbox" data-emp="${i}" data-slot="${auEsc(t.id)}" ${e.shifts.includes(t.id)?'checked':''}>${auEsc(t.label)}</label>`).join('')}</div><div>可上星期 ${['日','一','二','三','四','五','六'].map((d,k)=>`<label class="au-check"><input type="checkbox" data-emp="${i}" data-week="${k}" ${e.days.includes(k)?'checked':''}>${d}</label>`).join('')}</div><div class="grid2"><label>每月工時上限<input type="number" min="0" step="0.5" data-emp="${i}" data-field="maxHours" value="${e.maxHours}"></label><label>最多連續上班天數<input type="number" min="1" max="31" data-emp="${i}" data-field="maxDays" value="${e.maxDays}"></label></div></fieldset>`).join('')}<label>店休日期（逗號或換行分隔）<textarea id="auClosed" placeholder="2026-10-01">${auEsc(r.closedDates.join('\n'))}</textarea></label><div id="auHolidayRules"></div><button id="auSaveRules">儲存規則</button>`;
 auHolidayView();
 au('auRules').onchange=e=>{const el=e.target;if(el.dataset.shift!==undefined){const t=r.shifts[+el.dataset.shift];if(el.dataset.day!==undefined)t.need[+el.dataset.day]=Number(el.value);else t[el.dataset.field]=el.dataset.field==='label'?el.value:Number(el.value)}if(el.dataset.emp!==undefined){const person=r.employees[+el.dataset.emp];if(el.dataset.slot!==undefined){person.shifts=el.checked?[...new Set([...person.shifts,el.dataset.slot])]:person.shifts.filter(x=>x!==el.dataset.slot)}else if(el.dataset.week!==undefined){const d=+el.dataset.week;person.days=el.checked?[...new Set([...person.days,d])]:person.days.filter(x=>x!==d)}else person[el.dataset.field]=el.type==='checkbox'?el.checked:Number(el.value)}if(el.id==='auClosed')r.closedDates=el.value.split(/[\s,，]+/).filter(Boolean);au('auStatus').textContent='規則已修改，請儲存並重新產生草稿。';};
 au('auAddFullDay').onclick=()=>{if(r.shifts.some(t=>t.label==='全天班'))return;if(r.shifts.length>=12)return toast('最多可設定 12 種班別');let id='FULL';for(let n=1;r.shifts.some(t=>t.id===id);n++)id='FULL'+n;r.shifts.push({id,label:'全天班',hours:8,need:[0,0,0,0,0,0,0]});auRulesView();au('auStatus').textContent='已加入全天班：請設定各星期需求人數、勾選員工可上全天班，再儲存規則。';};
 au('auAddShift').onclick=()=>{r.shifts.push({id:'S'+Date.now(),label:'10:00~14:00',hours:4,need:[0,0,0,0,0,0,0]});auRulesView()};
 au('auRules').querySelectorAll('[data-remove-shift]').forEach(b=>b.onclick=()=>{const id=r.shifts[+b.dataset.removeShift].id;r.shifts.splice(+b.dataset.removeShift,1);r.employees.forEach(e=>e.shifts=e.shifts.filter(x=>x!==id));Object.values(r.dateOverrides||{}).forEach(o=>delete o.need[id]);auRulesView()});
 au('auSaveRules').onclick=()=>auRun(async()=>{auCheckDateSupport();await auCall('rules',{rules:r});au('auStatus').textContent='規則已儲存，下個月也可沿用。'});
}
function auDraftView(){const d=autoState.draft,box=au('auDraft');if(!d){box.innerHTML='<p>尚未產生草稿。</p>';return}const done=d.status==='confirmed',r=autoState.rules;box.innerHTML=`<h3>${auEsc(d.month)} ${done?'已寫入正式班表':'班表草稿'}</h3><p>下表是本次新增班次；正式班表的既有班次會保留。修改員工會自動鎖定，重新產生時只重排未鎖定的草稿班次。</p><div class="au-summary">${(d.summary||[]).map(s=>`<span class="badge">${auEsc(s.name)}：${s.hours}／${s.maxHours} 小時</span>`).join(' ')}</div><p id="auDirty" class="warning" hidden>草稿已修改，請按「檢查並儲存草稿」更新缺人提示與工時。</p><div class="table-wrap"><table><tr><th>日期</th><th>班別</th><th>員工</th><th>鎖定</th><th></th></tr>${d.assignments.map((a,i)=>`<tr><td>${auEsc(a.date)}${auHolidayBadge(a.date)}</td><td>${auEsc(r.shifts.find(t=>t.id===a.shift)?.label||a.shift)}</td><td><select aria-label="排班員工" data-au-person="${i}" ${done?'disabled':''}>${auOptions(r.employees.filter(e=>e.enabled).map(e=>({value:e.name,text:e.name})),a.name)}</select></td><td><input aria-label="鎖定班次" type="checkbox" data-au-lock="${i}" ${a.locked?'checked':''} ${done?'disabled':''}></td><td><button data-au-delete="${i}" ${done?'disabled':''}>移除</button></td></tr>`).join('')}</table></div><p>店休設定只影響本次新增班次；正式班表的既有班次仍保留，請另行檢查。國定假日標示不會自動調移員工休假或更改薪資。</p><h3>缺人時段：${d.gaps.length} 筆</h3>${d.gaps.map(g=>`<div class="warning">${auEsc(g.date)} ${auEsc(r.shifts.find(t=>t.id===g.shift)?.label||g.shift)} 缺 ${g.missing} 人<br><small>${auEsc(g.reasons)}</small></div>`).join('')||'<p>目前需求已排滿。</p>'}${done?'':`<div class="grid3"><label>日期<input id="auManualDate" type="date" min="${d.month}-01" max="${d.month}-${daysInMonth(d.month)}"></label><label>班別<select id="auManualShift">${auOptions(r.shifts.map(t=>({value:t.id,text:t.label})))}</select></label><label>員工<select id="auManualName">${auOptions(r.employees.filter(e=>e.enabled).map(e=>({value:e.name,text:e.name})))}</select></label></div><button id="auManualAdd">加入指定班次並鎖定</button><div class="au-actions"><button id="auReview">檢查並儲存草稿</button><button id="auConfirm" class="primary">確認寫入正式班表</button></div><label class="au-check"><input id="auAllowGaps" type="checkbox"> 我已檢查，允許保留缺人時段</label><p>確認後員工即可看到新班次。需要推播時，使用原本的「公布班表並通知全體員工」。</p>`}`;
 if(done)return;
 const dirty=()=>au('auDirty').hidden=false;
 box.querySelectorAll('[data-au-person]').forEach(el=>el.onchange=()=>{const a=d.assignments[+el.dataset.auPerson];a.name=el.value;a.locked=true;auDraftView();dirty()});
 box.querySelectorAll('[data-au-lock]').forEach(el=>el.onchange=()=>{d.assignments[+el.dataset.auLock].locked=el.checked;dirty()});
 box.querySelectorAll('[data-au-delete]').forEach(el=>el.onclick=()=>{d.assignments.splice(+el.dataset.auDelete,1);auDraftView();dirty()});
 au('auManualAdd').onclick=()=>{const date=au('auManualDate').value;if(date.slice(0,7)!==d.month)return toast('請選擇本月日期');d.assignments.push({date,shift:au('auManualShift').value,name:au('auManualName').value,locked:true});auDraftView();dirty()};
 au('auReview').onclick=()=>auRun(async()=>{const x=await auCall('review',{month:d.month,id:d.id,assignments:d.assignments});autoState.draft=x.draft;auDraftView();au('auStatus').textContent='草稿已檢查及儲存。'});
 au('auConfirm').onclick=()=>auRun(async()=>{auCheckDateSupport();const allowGaps=au('auAllowGaps').checked;const x=await auCall('review',{month:d.month,id:d.id,assignments:d.assignments});autoState.draft=x.draft;auDraftView();if(x.draft.gaps.length&&!allowGaps)throw Error('仍有缺人時段，請調整或勾選允許缺額。');if(!confirm('確認將 '+d.month+' 草稿寫入正式班表？員工將可看到新增班次。')){au('auStatus').textContent='草稿已儲存，尚未寫入正式班表。';return}const result=await auCall('confirm',{month:d.month,id:d.id,assignments:x.draft.assignments,allowGaps});autoState.draft.status='confirmed';auDraftView();au('auStatus').textContent='已新增 '+(result.count||0)+' 筆正式班次。';await loadAdmin();await refresh();});
}
au('auLoad').onclick=()=>auRun(async()=>{const x=await auCall('load',{month:auMonth()});autoState.features=x.features||[];autoState.rules=x.rules;autoState.employees=x.employees;const names=new Set(x.employees.map(e=>e.name));autoState.rules.employees=autoState.rules.employees.filter(e=>names.has(e.name));for(const e of x.employees)if(!autoState.rules.employees.some(v=>v.name===e.name))autoState.rules.employees.push({name:e.name,enabled:false,shifts:[],days:[0,1,2,3,4,5,6],maxHours:200,maxDays:6});autoState.draft=x.draft;auRulesView();auDraftView();au('auGenerate').disabled=false;au('auStatus').textContent='已載入。先確認規則，再產生草稿。'});
au('auGenerate').onclick=()=>auRun(async()=>{if(!autoState.rules)throw Error('請先載入規則');if(autoState.draft&&autoState.draft.month!==auMonth())throw Error('月份已變更，請先重新載入');auCheckDateSupport();await auCall('rules',{rules:autoState.rules});const x=await auCall('generate',{month:auMonth(),fixed:autoState.draft?.assignments||[]});autoState.draft=x.draft;auDraftView();au('auStatus').textContent='草稿已產生。尚未寫入正式班表。';});
au('auMonth').value=ym();au('auMonth').onchange=()=>{autoState.draft=null;autoState.rules=null;au('auRules').innerHTML='';au('auDraft').innerHTML='';au('auGenerate').disabled=true;au('auStatus').textContent='請載入所選月份';};

$('logoutBtn').addEventListener('click',()=>{autoState.rules=null;autoState.draft=null;au('auRules').innerHTML='';au('auDraft').innerHTML='';au('auGenerate').disabled=true;au('auStatus').textContent='請先載入月份。';});

function auCheckDateSupport(){if(Object.keys(autoState.rules.dateOverrides||{}).length&&!autoState.features.includes('dateOverrides-v1'))throw Error('後端尚未更新指定日期排班功能，已停止儲存／產生，避免忽略你的設定。');}
function auHolidayBadge(date){const h=window.SAVAGE_HOLIDAYS?.entries(date.slice(0,7)).days.find(x=>x.date===date);return h?'<br><small>'+auEsc(h.name||'連假週末')+' · '+auEsc(h.kind)+'</small>':'';}
function auHolidayView(){
 const r=autoState.rules,box=au('auHolidayRules'),month=auMonth(),info=window.SAVAGE_HOLIDAYS?.entries(month);
 const supported=autoState.features.includes('dateOverrides-v1');
 const dates=new Map((info?.days||[]).map(d=>[d.date,d]));
 Object.keys(r.dateOverrides||{}).filter(d=>d.startsWith(month)).forEach(date=>{if(!dates.has(date))dates.set(date,{date,name:'指定日期',kind:''});});
 box.innerHTML=`<h3>國定假日與連假安排</h3><p>${info?.supported?'假日資料：2026、2027 年；核對日期 2026-09-29。':'此年份尚無核對完成的假日資料，不能視為沒有假日；請自行新增指定日期。'} <a href="https://data.gov.tw/dataset/14718" target="_blank" rel="noopener">官方日曆來源</a></p><p>連假及政府機關補假僅供參考。店面是否營業由你設定；員工補假、出勤及薪資需另行處理。</p>${(info?.breaks||[]).map(b=>`<span class="badge">${b.start}～${b.end}（${b.length} 天參考連假）</span>`).join(' ')}${supported?'':'<p class="warning">後端尚未支援指定日期人數，目前可查看假日；設定功能需更新後端後使用。</p>'}<div class="table-wrap"><table><thead><tr><th>日期／假日</th><th>營業安排</th>${r.shifts.map(t=>'<th>'+auEsc(t.label)+'人數</th>').join('')}</tr></thead><tbody>${[...dates.values()].sort((a,b)=>a.date.localeCompare(b.date)).map(h=>{const o=(r.dateOverrides||{})[h.date],dow=new Date(h.date+'T00:00:00Z').getUTCDay(),closed=r.closedDates.includes(h.date);return `<tr><td>${h.date}（${'日一二三四五六'[dow]}）<br>${auEsc(h.name||'連假週末')}<br><small>${auEsc(h.kind)}${closed?' · 已列店休，優先不排班':''}</small></td><td><select aria-label="${h.date}營業安排" data-holiday-date="${h.date}" ${supported?'':'disabled'}>${auOptions([{value:'weekly',text:'沿用每週規則'},{value:'open',text:'營業／指定人數'},{value:'closed',text:'店休'}],o?.mode||'weekly')}</select></td>${r.shifts.map(t=>`<td><input aria-label="${h.date} ${auEsc(t.label)}人數" type="number" min="0" max="50" step="1" data-holiday-need="${h.date}" data-holiday-shift="${auEsc(t.id)}" value="${o?.need?.[t.id]??t.need[dow]}" ${!supported||o?.mode!=='open'||closed?'disabled':''}></td>`).join('')}</tr>`}).join('')}</tbody></table></div><label>新增其他指定日期<input id="auSpecialDate" type="date" min="${month}-01" max="${month}-${daysInMonth(month)}"></label><button id="auAddSpecial" ${supported?'':'disabled'}>新增指定日期</button><p>選「店休」不會刪除原本已排班次。設定後請儲存規則，並重新產生草稿。</p>`;
 box.onchange=e=>{e.stopPropagation();const el=e.target;r.dateOverrides=r.dateOverrides||{};if(el.dataset.holidayDate){const date=el.dataset.holidayDate;if(el.value==='weekly')delete r.dateOverrides[date];else r.dateOverrides[date]={mode:el.value,need:r.dateOverrides[date]?.need||{}};auHolidayView();}else if(el.dataset.holidayNeed){const n=Number(el.value);if(el.value===''||!Number.isInteger(n)||n<0||n>50){toast('人數需為 0～50 的整數');auHolidayView();return;}r.dateOverrides[el.dataset.holidayNeed].need[el.dataset.holidayShift]=n;}au('auStatus').textContent='日期設定已修改，請儲存規則並重新產生草稿。';};
 au('auAddSpecial').onclick=()=>{const date=au('auSpecialDate').value;if(!date||date.slice(0,7)!==month)return toast('請選擇本月日期');r.dateOverrides=r.dateOverrides||{};if(!r.dateOverrides[date])r.dateOverrides[date]={mode:'open',need:{}};auHolidayView();au('auStatus').textContent='已加入指定日期，請設定並儲存規則。';};
}

startLogin();
})();
