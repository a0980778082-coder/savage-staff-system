(()=>{
"use strict";
const $=id=>document.getElementById(id),cfg=window.SAVAGE_CONFIG;
let token=localStorage.getItem("savage_token")||"",me=null,data=null,employees=[],noticeShownKey="";
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
  const r=await fetch(cfg.API_URL,{
    method:"POST",
    headers:{"Content-Type":"text/plain;charset=utf-8"},
    body:JSON.stringify({mode,token,...p})
  });
  const j=await r.json();
  if(!j.ok)throw Error(j.message||"操作失敗");
  return j;
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

  const p=await api("publicConfig");
  $("loginName").innerHTML=(p.users||[])
    .map(x=>`<option>${esc(x)}</option>`)
    .join("");

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
    localStorage.setItem("savage_token",token);

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
  localStorage.removeItem("savage_token");

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
  const saved=localStorage.getItem(progressKey(month))||"";
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
  localStorage.setItem(progressKey(month),date);
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
boot().catch(e=>toast(e.message));
})();
