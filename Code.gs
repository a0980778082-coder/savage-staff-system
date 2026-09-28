const TZ="Asia/Taipei",TTL=21600;
const N={U:"Users",S:"Schedule",O:"OffRequests",D:"DeliverySubsidy",P:"SalaryDetails",C:"SystemSettings",R:"SubstituteRequests"};
function doGet(){return ContentService.createTextOutput("小野人員工系統 v9 API 正常");}
function legacyDoPost_(e){try{ensureTimeZone_();const p=JSON.parse(e.postData.contents||"{}"),m=p.mode;if(m==="publicConfig")return out_({ok:true,users:users_().filter(x=>x.status==="在職").map(x=>x.name)});if(m==="login")return login_(p);const s=sess_(p.token),f={refresh:()=>payload_(s,p.month),offRequest:()=>off_(s,p),oil:()=>oil_(s,p),salary:()=>out_({ok:true,salary:salary_(s.name,p.month)}),downloadPayslip:()=>payslip_(s,p),requestSubstitute:()=>requestSubstitute_(s,p),respondSubstitute:()=>respondSubstitute_(s,p),cancelSubstitute:()=>cancelSubstitute_(s,p),reviewSubstitute:()=>reviewSubstitute_(s,p),adminDashboard:()=>admin_(s,p),reviewOff:()=>review_(s,p),checkScheduleConflict:()=>conflict_(s,p),saveShift:()=>saveShift_(s,p),deleteShift:()=>deleteShift_(s,p),saveEmployee:()=>saveEmployee_(s,p),toggleEmployee:()=>toggleEmployee_(s,p),saveSettings:()=>saveSettings_(s,p),saveStaffNotice:()=>saveStaffNotice_(s,p),publishSchedule:()=>publishSchedule_(s,p),exportPayroll:()=>export_(s,p)};if(!f[m])throw Error("不支援的操作");return f[m]()}catch(err){return out_({ok:false,message:err.message||"系統錯誤"})}}
function setupSystem(){const ss=SpreadsheetApp.getActive();ss.setSpreadsheetTimeZone(TZ);mk_(ss,N.U,["姓名","密碼","角色","薪資類型","月薪","時薪","責任獎金","全勤獎金","技術獎金","勞保","健保","在職狀態","員工編號"]);mk_(ss,N.S,["ID","日期","星期","班別","員工姓名","狀態","實際時數","預計時數","備註"]);mk_(ss,N.O,["時間戳記","員工姓名","申請日期","申請時段","備註","狀態","審核人","審核時間"]);mk_(ss,N.D,["時間戳記","外送日期","姓名","起始里程","結束里程","公里數","油價","補貼金額","照片網址","備註","狀態","月份"]);mk_(ss,N.P,["月份","姓名","責任獎金","全勤獎金","技術獎金","勞保扣款","健保扣款","手動工時","其他扣款","其他加給","備註"]);mk_(ss,N.C,["設定項目","設定值"]);mk_(ss,N.R,["時間戳記","班表列號","日期","班別","原員工","代班員工","備註","狀態","回覆時間","審核人","審核時間","原班表狀態"]);const c=sh_(N.C);if(c.getLastRow()==1)c.getRange(2,1,5,2).setValues([["目前油價",30],["每公升公里數",40],["單次里程上限",300],["照片資料夾ID",""],["店名","小野人餐盒製造所"]]);const u=sh_(N.U);if(u.getLastRow()==1)u.appendRow(["老闆","admin1234","admin","月薪",0,0,0,0,0,0,0,"在職","A001"]);return "完成";}
function mk_(ss,n,h){let s=ss.getSheetByName(n);if(!s)s=ss.insertSheet(n);if(!s.getLastRow())s.getRange(1,1,1,h.length).setValues([h]);s.setFrozenRows(1)}
function login_(p){const u=users_().find(x=>x.name===String(p.name).trim());if(!u||u.status!=="在職")throw Error("找不到在職員工");if(String(u.pin)!==String(p.pin||""))throw Error("密碼錯誤");const t=Utilities.getUuid();CacheService.getScriptCache().put("s:"+t,JSON.stringify({name:u.name,role:u.role,id:u.id}),TTL);return out_(p.lightweight===true?{ok:true,user:{name:u.name,role:u.role,employeeId:u.id},token:t}:{...payloadObj_({name:u.name,role:u.role,id:u.id}),token:t})}
function sess_(t){const c=CacheService.getScriptCache(),v=c.get("s:"+t);if(!v)throw Error("登入已逾時");c.put("s:"+t,v,TTL);return JSON.parse(v)}
function adminOnly_(s){if(s.role!=="admin")throw Error("只有老闆後台可以操作")}
function payload_(s,m){return out_(payloadObj_(s,m))}
function payloadObj_(s,m){return{ok:true,user:{name:s.name,role:s.role,employeeId:s.id},schedule:schedules_(),offRequests:offs_(),oilRows:oilRows_(s.name),salary:salary_(s.name,m),substituteRequests:substitutes_(),activeEmployees:users_().filter(x=>x.status==="在職").map(x=>x.name),staffNotice:staffNotice_()}}
function users_(){return rowsR_(N.U).filter(r=>r["姓名"]).map(r=>({row:r._row,name:String(r["姓名"]).trim(),pin:r["密碼"],role:String(r["角色"]||"staff"),salaryType:String(r["薪資類型"]||"時薪"),monthly:num_(r["月薪"]),hourly:num_(r["時薪"]),b1:num_(r["責任獎金"]),b2:num_(r["全勤獎金"]),b3:num_(r["技術獎金"]),labor:num_(r["勞保"]),health:num_(r["健保"]),status:String(r["在職狀態"]||""),id:String(r["員工編號"]||"")}))}
function schedules_(){return rowsR_(N.S).filter(r=>r["日期"]&&r["員工姓名"]&&String(r["狀態"]||"")!=="排休"&&!String(r["班別"]||"").includes("排休")).map(r=>({row:r._row,id:r["ID"],date:date_(r["日期"]),weekday:r["星期"],timeSlot:String(r["班別"]||""),employeeName:String(r["員工姓名"]).trim(),status:String(r["狀態"]||""),actualHours:nullNum_(r["實際時數"]),plannedHours:nullNum_(r["預計時數"]),note:String(r["備註"]||"")}))}
function offs_(){return rowsR_(N.O).filter(r=>r["員工姓名"]&&r["申請日期"]).map(r=>({row:r._row,employeeName:String(r["員工姓名"]).trim(),requestDate:date_(r["申請日期"]),slot:String(r["申請時段"]||""),note:String(r["備註"]||""),status:String(r["狀態"]||"待審核")}))}
function oilRows_(n){return rows_(N.D).filter(r=>String(r["姓名"])===n&&String(r["狀態"]||"有效")!=="作廢").map(r=>({date:date_(r["外送日期"]),km:num_(r["公里數"]),amount:num_(r["補貼金額"]),photoUrl:String(r["照片網址"]||""),note:String(r["備註"]||"")}))}
function off_(s,p){const d=date_(p.date);if(!d)throw Error("請選擇日期");if(staffNotice_().blockedOffDates.includes(d))throw Error(`${d} 為禁止排休日，請選擇其他日期`);if(offs_().some(x=>x.employeeName===s.name&&x.requestDate===d&&!["已拒絕","已取消"].includes(x.status)))throw Error("這一天已申請過");sh_(N.O).appendRow([new Date(),s.name,dateObj_(d),p.slot||"全天排休",p.note||"","待審核","",""]);return out_({ok:true})}
function review_(s, p) {
  adminOnly_(s);

  const row = num_(p.row);
  const status = String(p.status || "").trim();

  if (!["已核准", "已拒絕"].includes(status)) {
    throw Error("不支援的排假審核狀態");
  }

  const offSheet = sh_(N.O);
  const values = offSheet
    .getRange(row, 1, 1, 8)
    .getValues()[0];

  const employeeName = String(values[1] || "").trim();
  const requestDate = date_(values[2]);
  const requestSlot = String(values[3] || "全天排休");
  const currentStatus = String(values[5] || "");

  if (!employeeName || !requestDate) {
    throw Error("找不到排假申請資料");
  }

  if (["已核准", "已拒絕"].includes(currentStatus)) {
    throw Error("這筆排假申請已經審核過");
  }

  offSheet
    .getRange(row, 6, 1, 3)
    .setValues([[
      status,
      s.name,
      new Date()
    ]]);

  SpreadsheetApp.flush();

  try {
    notifyOffReviewResult_(
      employeeName,
      status,
      requestDate,
      requestSlot
    );
  } catch (pushError) {
    console.error(
      "排假審核已完成，但員工推播失敗：" +
      pushError.message
    );
  }

  return out_({
    ok: true,
    status: status
  });
}
function conflict_(s,p){adminOnly_(s);const d=date_(p.date),n=String(p.employee),slot=String(p.timeSlot||""),x=offs_().find(v=>v.employeeName===n&&v.requestDate===d&&["待審核","已核准"].includes(v.status)&&offConflictsShift_(v.slot,slot));return out_({ok:true,conflict:!!x,message:x?`${n} 在 ${d} 已申請「${x.slot}」，與「${slot}」時段衝突，狀態：${x.status}`:""})}
function saveShift_(s,p){adminOnly_(s);const d=date_(p.date),n=String(p.employee),slot=String(p.timeSlot||""),x=offs_().find(v=>v.employeeName===n&&v.requestDate===d&&["待審核","已核准"].includes(v.status)&&offConflictsShift_(v.slot,slot));if(x)throw Error(`${n} 當天已申請「${x.slot}」，與「${slot}」時段衝突，系統已阻止誤排班`);if(schedules_().some(v=>v.employeeName===n&&v.date===d&&v.status!=="取消"))throw Error("此員工當天已經有班");const enteredHours=num_(p.hours),hours=enteredHours>0?enteredHours:infer_(slot);sh_(N.S).appendRow([Utilities.getUuid(),dateObj_(d),week_(d),slot,n,"已排班","",hours,String(p.note||"")]);return out_({ok:true})}
function deleteShift_(s, p) {
  adminOnly_(s);

  const row = num_(p.row);
  const shift = schedules_().find(x => x.row === row);

  if (!shift) {
    throw Error("找不到要刪除的班表");
  }

  const employeeName = shift.employeeName;
  const shiftDate = shift.date;
  const timeSlot = shift.timeSlot;

  sh_(N.S).deleteRow(row);

  try {
    notifyShiftDeleted_(
      employeeName,
      shiftDate,
      timeSlot
    );
  } catch (pushError) {
    console.error(
      "班表已刪除，但員工推播失敗：" +
      pushError.message
    );
  }

  return out_({
    ok: true
  });
}

function substitutes_(){return rowsR_(N.R).filter(r=>r["日期"]&&r["原員工"]).map(r=>({row:r._row,scheduleRow:num_(r["班表列號"]),date:date_(r["日期"]),timeSlot:String(r["班別"]||""),requester:String(r["原員工"]||"").trim(),substituteEmployee:String(r["代班員工"]||"").trim(),note:String(r["備註"]||""),status:String(r["狀態"]||""),reviewer:String(r["審核人"]||"")}))}
function employeeConflict_(name,d,timeSlot,excludeRow){const off=offs_().find(x=>x.employeeName===name&&x.requestDate===d&&["待審核","已核准"].includes(x.status)&&offConflictsShift_(x.slot,timeSlot));if(off)return `${name} 當天有排假：${off.slot}，與 ${timeSlot} 時段衝突`;const shifts=schedules_().filter(x=>x.employeeName===name&&x.date===d&&x.row!==excludeRow&&x.status!=="取消"&&!String(x.timeSlot).includes("排休"));if(shifts.length)return `${name} 當天已有班：${shifts.map(x=>x.timeSlot).join("、")}`;return ""}
function requestSubstitute_(s,p){
  const row=num_(p.scheduleRow);
  const shift=schedules_().find(x=>x.row===row);
  if(!shift)throw Error("找不到這筆班表");
  if(shift.employeeName!==s.name)throw Error("只能替自己的班申請代班");
  if(shift.date<date_(new Date()))throw Error("過去的班不能申請代班");
  if(String(shift.timeSlot).includes("排休")||shift.status==="取消")throw Error("這筆不是有效班次");
  if(substitutes_().some(x=>x.scheduleRow===row&&!["已取消","已拒絕"].includes(x.status)))throw Error("這個班已經有代班申請");
  const target=String(p.substituteEmployee||"").trim();
  if(target===s.name)throw Error("不能指定自己代班");
  if(target&&!users_().some(x=>x.name===target&&x.status==="在職"))throw Error("指定的代班員工不存在");
  if(target){
    const issue=employeeConflict_(target,shift.date,shift.timeSlot,row);
    if(issue)throw Error(issue);
  }
  sh_(N.R).appendRow([
    new Date(),row,dateObj_(shift.date),shift.timeSlot,s.name,target,
    p.note||"",target?"待員工接受":"公開徵求","","","",shift.status||""
  ]);
  try{
    if(target){
      notifyEmployee_(target,"新的代班邀請",`${s.name} 邀請你代班：${formatDateText_(shift.date)} ${shift.timeSlot}`);
    }else{
      const ids=users_()
        .filter(x=>x.status==="在職"&&x.name!==s.name&&x.role!=="admin")
        .map(externalIdForUser_);
      sendOneSignalPush_(ids,"公開徵求代班",`${s.name} 公開徵求代班：${formatDateText_(shift.date)} ${shift.timeSlot}`);
    }
  }catch(err){console.error("代班申請推播失敗："+err.message)}
  return out_({ok:true});
}
function respondSubstitute_(s,p){
  const row=num_(p.row),r=substitutes_().find(x=>x.row===row);
  if(!r)throw Error("找不到代班申請");
  const action=String(p.action);
  if(r.status==="公開徵求"){
    if(action!=="accept")throw Error("公開代班只能接受");
    if(r.requester===s.name)throw Error("不能接自己的班");
    const issue=employeeConflict_(s.name,r.date,r.timeSlot,r.scheduleRow);
    if(issue)throw Error(issue);
    sh_(N.R).getRange(row,6).setValue(s.name);
    sh_(N.R).getRange(row,8,1,2).setValues([["待老闆核准",new Date()]]);
  }else{
    if(r.substituteEmployee!==s.name)throw Error("你不是被指定的代班員工");
    if(r.status!=="待員工接受")throw Error("這筆代班目前不能回覆");
    if(action==="accept"){
      const issue=employeeConflict_(s.name,r.date,r.timeSlot,r.scheduleRow);
      if(issue)throw Error(issue);
      sh_(N.R).getRange(row,8,1,2).setValues([["待老闆核准",new Date()]]);
    }else{
      sh_(N.R).getRange(row,8,1,2).setValues([["已拒絕",new Date()]]);
      try{
        notifyEmployee_(r.requester,"代班邀請被拒絕",`${s.name} 無法代班：${formatDateText_(r.date)} ${r.timeSlot}`);
      }catch(err){console.error("代班拒絕通知失敗："+err.message)}
      return out_({ok:true});
    }
  }
  try{
    notifyAdminsSubstituteAccepted_(r.requester,s.name,r.date,r.timeSlot);
  }catch(err){console.error("通知管理員審核失敗："+err.message)}
  return out_({ok:true});
}
function notifyAdminsSubstituteAccepted_(
  requesterName,
  substituteName,
  requestDate,
  timeSlot
) {
  const adminExternalIds = users_()
    .filter(user =>
      user.role === "admin" &&
      user.status === "在職"
    )
    .map(user =>
      user.id
        ? "staff_" + user.id
        : "staff_" + user.name
    )
    .filter(Boolean);

  if (!adminExternalIds.length) {
    console.log("找不到管理員帳號，未發送推播");
    return;
  }

  const formattedDate = Utilities.formatDate(
    new Date(requestDate),
    TZ,
    "yyyy/MM/dd"
  );

  sendOneSignalPush_(
    adminExternalIds,
    "代班等待審核",
    substituteName +
      " 已接受 " +
      requesterName +
      " 的代班：" +
      formattedDate +
      " " +
      timeSlot
  );
}

function oil_(s,p){
  const d=date_(p.date),start=num_(p.start),end=num_(p.end);
  if(!d)throw Error("請選擇外送日期");
  if(end<=start)throw Error("回店里程必須大於出發里程");
  const km=Math.round((end-start)*10)/10,max=num_(get_("單次里程上限"))||300;
  if(km>max)throw Error(`單次里程不可超過 ${max} 公里`);
  const oilPrice=num_(get_("目前油價")),efficiency=num_(get_("每公升公里數"));
  if(oilPrice<=0||efficiency<=0)throw Error("請先完成油價與油耗設定");
  let photoUrl="";
  if(p.photo){try{photoUrl=saveDataUrlPhoto_(p.photo,s.name,d)}catch(err){console.error("照片儲存失敗："+err.message)}}
  const amount=Math.round(km/efficiency*oilPrice);
  sh_(N.D).appendRow([new Date(),dateObj_(d),s.name,start,end,km,oilPrice,amount,photoUrl,String(p.note||""),"有效",d.slice(0,7)]);
  return out_({ok:true,km,amount});
}
function saveDataUrlPhoto_(dataUrl,name,d){
  const m=String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if(!m)throw Error("照片格式錯誤");
  const blob=Utilities.newBlob(Utilities.base64Decode(m[2]),m[1],`${d}_${name}_${Date.now()}.jpg`);
  const folderId=String(get_("照片資料夾ID")||"").trim();
  const file=folderId?DriveApp.getFolderById(folderId).createFile(blob):DriveApp.createFile(blob);
  return file.getUrl();
}
function cancelSubstitute_(s,p){
  const row=num_(p.row),r=substitutes_().find(x=>x.row===row);
  if(!r)throw Error("找不到代班申請");
  if(r.requester!==s.name)throw Error("只能取消自己的代班申請");
  if(["已核准","已取消","已拒絕"].includes(r.status))throw Error("這筆代班目前不能取消");
  sh_(N.R).getRange(row,8,1,2).setValues([["已取消",new Date()]]);
  try{
    if(r.substituteEmployee)notifyEmployee_(r.substituteEmployee,"代班申請已取消",`${r.requester} 已取消：${formatDateText_(r.date)} ${r.timeSlot}`);
  }catch(err){console.error("取消代班通知失敗："+err.message)}
  return out_({ok:true});
}
function reviewSubstitute_(s,p){
  adminOnly_(s);
  const row=num_(p.row),status=String(p.status||""),r=substitutes_().find(x=>x.row===row);
  if(!["已核准","已拒絕"].includes(status))throw Error("不支援的代班審核狀態");
  if(!r)throw Error("找不到代班申請");
  if(r.status!=="待老闆核准")throw Error("這筆代班目前不在待審核狀態");
  if(!r.substituteEmployee)throw Error("尚未指定代班員工");
  if(status==="已核准"){
    const issue=employeeConflict_(r.substituteEmployee,r.date,r.timeSlot,r.scheduleRow);
    if(issue)throw Error(issue);
    const sheet=sh_(N.S);
    sheet.getRange(r.scheduleRow,5).setValue(r.substituteEmployee);
    sheet.getRange(r.scheduleRow,6).setValue("已排班");
    const note=String(sheet.getRange(r.scheduleRow,9).getValue()||"");
    sheet.getRange(r.scheduleRow,9).setValue([note,`代班：${r.requester} → ${r.substituteEmployee}`].filter(Boolean).join("；"));
  }
  sh_(N.R).getRange(row,8).setValue(status);
  sh_(N.R).getRange(row,10,1,2).setValues([[s.name,new Date()]]);
  SpreadsheetApp.flush();
  try{
    const title=status==="已核准"?"代班已核准":"代班未核准";
    const message=status==="已核准"
      ?`${formatDateText_(r.date)} ${r.timeSlot} 已由 ${r.substituteEmployee} 代班`
      :`${formatDateText_(r.date)} ${r.timeSlot} 的代班申請已被拒絕`;
    notifyEmployees_([r.requester,r.substituteEmployee],title,message);
  }catch(err){console.error("代班審核通知失敗："+err.message)}
  return out_({ok:true,status});
}
function saveEmployee_(s,p){
  adminOnly_(s);
  const row=num_(p.row),name=String(p.name||"").trim(),pin=String(p.pin||"").trim();
  if(!name||!pin)throw Error("姓名與登入密碼必填");
  const values=[name,pin,String(p.role||"staff"),String(p.salaryType||"時薪"),num_(p.monthly),num_(p.hourly),0,0,0,0,0,"在職",String(p.employeeId||"").trim()];
  if(row){
    const current=sh_(N.U).getRange(row,1,1,13).getValues()[0];
    for(let i=6;i<=11;i++)values[i]=current[i];
    sh_(N.U).getRange(row,1,1,13).setValues([values]);
  }else{
    if(users_().some(x=>x.name===name))throw Error("員工姓名已存在");
    sh_(N.U).appendRow(values);
  }
  return out_({ok:true});
}
function toggleEmployee_(s,p){
  adminOnly_(s);
  const cell=sh_(N.U).getRange(num_(p.row),12),next=String(cell.getValue())==="在職"?"停用":"在職";
  cell.setValue(next);
  return out_({ok:true,status:next});
}
function saveSettings_(s,p){
  adminOnly_(s);
  const oilPrice=num_(p.oilPrice),efficiency=num_(p.efficiency);
  if(oilPrice<=0||efficiency<=0)throw Error("油價與每公升公里數必須大於 0");
  set_("目前油價",oilPrice);set_("每公升公里數",efficiency);
  return out_({ok:true});
}

function isValidDateText_(text){
  const m=String(text||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m)return false;
  const y=Number(m[1]),mo=Number(m[2]),d=Number(m[3]);
  const x=new Date(Date.UTC(y,mo-1,d));
  return x.getUTCFullYear()===y&&x.getUTCMonth()===mo-1&&x.getUTCDate()===d;
}
function parseBlockedOffDates_(raw){
  const values=Array.isArray(raw)?raw:String(raw||"").split(/[\s,，、;；]+/);
  const list=values.map(x=>String(x||"").trim()).filter(Boolean);
  const bad=list.filter(x=>!isValidDateText_(x));
  if(bad.length)throw Error("禁止排休日期格式錯誤："+bad.join("、")+"。請使用 YYYY-MM-DD");
  return [...new Set(list)].sort();
}
function boolSetting_(key){return ["1","true","yes","on"].includes(String(get_(key)||"").toLowerCase())}
function staffNotice_(){
  let blocked=[];
  try{blocked=parseBlockedOffDates_(String(get_("禁止排休日期")||""))}catch(err){console.error(err.message)}
  return{
    popupEnabled:boolSetting_("員工彈窗公告啟用"),
    title:String(get_("員工公告標題")||"員工公告"),
    body:String(get_("員工公告內容")||""),
    marqueeEnabled:boolSetting_("員工跑馬燈啟用"),
    marqueeText:String(get_("員工跑馬燈文字")||""),
    blockedOffDates:blocked,
    updatedAt:String(get_("員工公告更新時間")||"")
  };
}
function saveStaffNotice_(s,p){
  adminOnly_(s);
  const blocked=parseBlockedOffDates_(p.blockedOffDates);
  set_("員工彈窗公告啟用",p.popupEnabled?"1":"0");
  set_("員工公告標題",String(p.title||"").trim());
  set_("員工公告內容",String(p.body||"").trim());
  set_("員工跑馬燈啟用",p.marqueeEnabled?"1":"0");
  set_("員工跑馬燈文字",String(p.marqueeText||"").trim());
  set_("禁止排休日期",blocked.join(","));
  set_("員工公告更新時間",Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd HH:mm:ss"));
  let pushed=0,pushError="";
  if(p.sendPush){
    const staff=users_().filter(x=>x.status==="在職"&&x.role!=="admin");
    const ids=staff.map(externalIdForUser_);
    if(ids.length){
      const title=String(p.title||"員工公告").trim()||"員工公告";
      const parts=[];
      if(String(p.body||"").trim())parts.push(String(p.body).trim());
      if(blocked.length)parts.push("禁止排休："+blocked.join("、"));
      try{
        sendOneSignalPush_(ids,title,parts.join("｜")||"員工系統公告已更新，請登入查看。");
        pushed=ids.length;
      }catch(err){
        pushError=err.message||"推播失敗";
        console.error("公告已儲存，但推播失敗："+pushError);
      }
    }
  }
  return out_({ok:true,pushed,pushError,staffNotice:staffNotice_()});
}

function publishSchedule_(s,p){
  adminOnly_(s);
  const month=month_(p.month);
  const shifts=schedules_().filter(x=>x.date.slice(0,7)===month&&x.status!=="取消"&&!String(x.timeSlot).includes("排休"));
  if(!shifts.length)throw Error(`${month} 尚未建立任何班表`);
  const ids=users_().filter(x=>x.status==="在職"&&x.role!=="admin").map(externalIdForUser_);
  sendOneSignalPush_(ids,"新月份班表已公布",`${month} 班表已公布，請登入員工系統確認自己的班次。`);
  set_("最後公布班表月份",month);set_("最後公布班表時間",new Date());
  return out_({ok:true,month,count:ids.length});
}
function externalIdForUser_(u){return u.id?"staff_"+u.id:"staff_"+u.name}
function notifyEmployee_(name,title,message){
  const u=users_().find(x=>x.name===name&&x.status==="在職");
  if(!u){console.log("找不到在職員工："+name);return}
  sendOneSignalPush_([externalIdForUser_(u)],title,message);
}
function notifyEmployees_(names,title,message){
  const set=new Set((names||[]).filter(Boolean));
  sendOneSignalPush_(users_().filter(x=>x.status==="在職"&&set.has(x.name)).map(externalIdForUser_),title,message);
}
function formatDateText_(d){return Utilities.formatDate(new Date(d),TZ,"yyyy/MM/dd")}
function sendMorningShiftReminder(){
  sendShiftReminderForDate_(date_(new Date()),"今天上班提醒","今天");
}
function sendEveningShiftReminder(){
  const tomorrow=new Date(Date.now()+24*60*60*1000);
  sendShiftReminderForDate_(date_(tomorrow),"明日上班提醒","明天");
}
function sendShiftReminderForDate_(dateText,title,dayWord){
  const props=PropertiesService.getScriptProperties(),key=`LAST_${title}_${dateText}`;
  if(props.getProperty(key)==="sent")return;
  const shifts=schedules_().filter(x=>x.date===dateText&&x.status!=="取消"&&!String(x.timeSlot).includes("排休"));
  shifts.forEach(x=>{
    try{notifyEmployee_(x.employeeName,title,`${x.employeeName}，${dayWord} ${x.timeSlot} 有排班，請準時上班。`)}
    catch(err){console.error(x.employeeName+" 提醒失敗："+err.message)}
  });
  props.setProperty(key,"sent");
}
function setupNotificationTriggers(){
  ScriptApp.getProjectTriggers().forEach(t=>{
    if(["sendMorningShiftReminder","sendEveningShiftReminder"].includes(t.getHandlerFunction()))ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("sendMorningShiftReminder").timeBased().everyDays(1).atHour(8).nearMinute(30).inTimezone(TZ).create();
  ScriptApp.newTrigger("sendEveningShiftReminder").timeBased().everyDays(1).atHour(20).nearMinute(0).inTimezone(TZ).create();
  return "已建立每天早上 08:30 與晚上 20:00 的班表提醒";
}

function salary_(n,m){const month=month_(m),u=users_().find(x=>x.name===n);if(!u)throw Error("找不到員工");const p=rows_(N.P).find(r=>month_(r["月份"])===month&&String(r["姓名"])===n)||{},manual=nullNum_(p["手動工時"]),hrs=manual===null?hours_(n,month):manual,base=u.salaryType==="月薪"?u.monthly:Math.round(hrs*u.hourly),bonus=def_(p["責任獎金"],u.b1)+def_(p["全勤獎金"],u.b2)+def_(p["技術獎金"],u.b3)+num_(p["其他加給"]),ded=def_(p["勞保扣款"],u.labor)+def_(p["健保扣款"],u.health)+num_(p["其他扣款"]),oil=rows_(N.D).filter(r=>String(r["姓名"])===n&&month_(r["月份"]||r["外送日期"])===month&&String(r["狀態"]||"有效")!=="作廢").reduce((t,r)=>t+num_(r["補貼金額"]),0);return{month,name:n,salaryType:u.salaryType,hours:Math.round(hrs*100)/100,basePay:base,bonuses:bonus,oilSubsidy:oil,deductions:ded,netPay:base+bonus+oil-ded}}
function hours_(n,m){return schedules_().filter(x=>x.employeeName===n&&x.date.slice(0,7)===m&&x.status!=="取消"&&!x.timeSlot.includes("排休")).reduce((t,x)=>{const actual=num_(x.actualHours),planned=num_(x.plannedHours);return t+(actual>0?actual:planned>0?planned:infer_(x.timeSlot))},0)}
function infer_(x){const m=String(x).match(/(\d{1,2}):(\d{2})\s*[~～-]\s*(\d{1,2}):(\d{2})/);return m?((+m[3]*60+ +m[4])-(+m[1]*60+ +m[2]))/60:String(x).includes("全天")?8:0}

function payslip_(s,p){const x=salary_(s.name,p.month),u=users_().find(v=>v.name===s.name),shop=String(get_("店名")||"小野人餐盒製造所"),doc=DocumentApp.create(`${shop}_${x.month}_${s.name}_薪資條`),body=doc.getBody();body.appendParagraph(shop).setHeading(DocumentApp.ParagraphHeading.TITLE);body.appendParagraph(`${x.month} 員工薪資條`).setHeading(DocumentApp.ParagraphHeading.HEADING1);const info=body.appendTable([["員工姓名",s.name],["員工編號",u&&u.id?u.id:""],["薪資類型",x.salaryType],["計薪月份",x.month]]);info.setBorderWidth(1);body.appendParagraph("");const t=body.appendTable([["項目","金額／時數"],["計薪總時數",`${x.hours} 小時`],["基本薪資",moneyText_(x.basePay)],["獎金／其他加給",moneyText_(x.bonuses)],["機車里程補貼",moneyText_(x.oilSubsidy)],["勞健保及其他扣款",`-${moneyText_(x.deductions)}`],["實領薪資",moneyText_(x.netPay)]]);t.setBorderWidth(1);for(let i=0;i<t.getNumRows();i++){t.getRow(i).getCell(0).setWidth(220);t.getRow(i).getCell(1).setWidth(220)}body.appendParagraph("");body.appendParagraph(`製表日期：${Utilities.formatDate(new Date(),TZ,"yyyy-MM-dd")}`);body.appendParagraph("本薪資條為系統產生，僅供員工本人查閱。");doc.saveAndClose();const file=DriveApp.getFileById(doc.getId()),blob=file.getAs(MimeType.PDF).setName(`${x.month}_${s.name}_薪資條.pdf`);file.setTrashed(true);return out_({ok:true,filename:blob.getName(),base64:Utilities.base64Encode(blob.getBytes())})}
function moneyText_(n){return `NT$ ${Math.round(num_(n)).toLocaleString("en-US")}`}
function admin_(s,p){adminOnly_(s);const month=month_(p.month);return out_({ok:true,employees:users_(),schedule:schedules_().filter(x=>x.date.slice(0,7)===month),leaveRequests:offs_().filter(x=>x.requestDate.slice(0,7)===month),pendingOff:offs_().filter(x=>x.status==="待審核"),pendingSubstitutes:substitutes_().filter(x=>x.status==="待老闆核准"),payroll:users_().filter(x=>x.status==="在職").map(x=>salary_(x.name,month)),settings:{oilPrice:num_(get_("目前油價")),efficiency:num_(get_("每公升公里數")),staffNotice:staffNotice_()}})}
function export_(s,p){adminOnly_(s);const m=month_(p.month),r=users_().filter(x=>x.status==="在職").map(x=>salary_(x.name,m)),all=[["月份","姓名","薪資類型","總時數","基本薪資","獎金","里程補貼","扣款","實領薪資"],...r.map(x=>[x.month,x.name,x.salaryType,x.hours,x.basePay,x.bonuses,x.oilSubsidy,x.deductions,x.netPay])];return out_({ok:true,csv:all.map(a=>a.map(csv_).join(",")).join("\r\n")})}
// Cache only within one read-only request. Writes always read live data.
let requestRows_=null;
function readRequest_(fn){requestRows_=Object.create(null);try{return fn()}finally{requestRows_=null}}
function rows_(n){if(requestRows_&&Object.prototype.hasOwnProperty.call(requestRows_,n))return requestRows_[n].map(r=>({...r}));const v=sh_(n).getDataRange().getValues(),h=v.shift().map(String),rows=v.map(r=>Object.fromEntries(h.map((x,i)=>[x,r[i]])));if(requestRows_)requestRows_[n]=rows;return rows.map(r=>({...r}))}function rowsR_(n){return rows_(n).map((x,i)=>({...x,_row:i+2}))}
function sh_(n){const s=SpreadsheetApp.getActive().getSheetByName(n);if(!s)throw Error("找不到工作表："+n);return s}
function get_(k){const r=rows_(N.C).find(x=>String(x["設定項目"])===k);return r?r["設定值"]:""}function set_(k,v){const a=rowsR_(N.C).find(x=>String(x["設定項目"])===k);a?sh_(N.C).getRange(a._row,2).setValue(v):sh_(N.C).appendRow([k,v])}
function out_(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}
function date_(x){if(!x)return"";const s=String(x);if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;return Utilities.formatDate(new Date(x),TZ,"yyyy-MM-dd")}function month_(x){if(!x)return Utilities.formatDate(new Date(),TZ,"yyyy-MM");const s=String(x);if(/^\d{4}-\d{2}$/.test(s))return s;if(/^\d{1,2}$/.test(s))return Utilities.formatDate(new Date(),TZ,"yyyy")+"-"+s.padStart(2,"0");return Utilities.formatDate(new Date(x),TZ,"yyyy-MM")}
function dateObj_(x){const d=date_(x);if(!/^\d{4}-\d{2}-\d{2}$/.test(d))throw Error("日期格式錯誤");return new Date(d+"T00:00:00+08:00")}
function week_(x){const d=date_(x),a=d.split("-").map(Number);return["週日","週一","週二","週三","週四","週五","週六"][new Date(Date.UTC(a[0],a[1]-1,a[2])).getUTCDay()]}
function shiftRange_(slot){const s=String(slot||"");if(s.includes("全天"))return[9,20];const m=s.match(/(\d{1,2}):?(\d{2})?\s*[~～-]\s*(\d{1,2}):?(\d{2})?/);if(!m)return null;return[Number(m[1])+Number(m[2]||0)/60,Number(m[3])+Number(m[4]||0)/60]}
function leaveRange_(slot){const s=String(slot||"");if(s.includes("全天"))return[0,24];if(s.includes("上午"))return[0,14];if(s.includes("下午"))return[14,18];if(s.includes("晚班"))return[16,24];return[0,24]}
function offConflictsShift_(offSlot,shiftSlot){const leave=leaveRange_(offSlot),shift=shiftRange_(shiftSlot);if(!shift)return true;return shift[0]<leave[1]&&leave[0]<shift[1]}
function ensureTimeZone_(){const ss=SpreadsheetApp.getActive();if(ss.getSpreadsheetTimeZone()!==TZ)ss.setSpreadsheetTimeZone(TZ)}
function fixDateTimeZone(){
  ensureTimeZone_();
  const specs=[[N.S,2],[N.O,3],[N.D,2],[N.R,3]];
  specs.forEach(([name,col])=>{const sheet=sh_(name),last=sheet.getLastRow();if(last>1)sheet.getRange(2,col,last-1,1).setNumberFormat("yyyy/MM/dd")});
  const schedule=sh_(N.S),last=schedule.getLastRow();
  if(last>1){const dates=schedule.getRange(2,2,last-1,1).getValues();schedule.getRange(2,3,last-1,1).setValues(dates.map(([d])=>[d?week_(d):""]))}
  SpreadsheetApp.flush();
  return "已完成：試算表時區、日期格式及班表星期皆已校正為台灣時間";
}
function separateScheduleAndLeaveData(){
  ensureTimeZone_();
  const approved=new Set(offs_().filter(x=>x.status==="已核准").map(x=>`${x.employeeName}|${x.requestDate}|${x.slot}`));
  const sheet=sh_(N.S),last=sheet.getLastRow();
  if(last<=1)return "Schedule 沒有需要整理的資料";
  const values=sheet.getRange(2,1,last-1,9).getValues();
  const rows=[];
  values.forEach((r,i)=>{
    const date=date_(r[1]),slot=String(r[3]||""),name=String(r[4]||"").trim(),status=String(r[5]||"");
    if((status==="排休"||slot.includes("排休"))&&approved.has(`${name}|${date}|${slot}`))rows.push(i+2);
  });
  rows.sort((a,b)=>b-a).forEach(row=>sheet.deleteRow(row));
  SpreadsheetApp.flush();
  return `整理完成：已從 Schedule 移除 ${rows.length} 筆重複排休；排休仍完整保留在 OffRequests`;
}
function fillMissingScheduleHours(){
  const sheet=sh_(N.S),last=sheet.getLastRow();
  if(last<=1)return "Schedule 沒有需要補正的班表";
  const values=sheet.getRange(2,1,last-1,9).getValues();
  let updated=0;
  values.forEach((r,i)=>{
    const slot=String(r[3]||""),status=String(r[5]||""),planned=num_(r[7]);
    if(status!=="取消"&&!slot.includes("排休")&&planned<=0){
      const hours=infer_(slot);
      if(hours>0){sheet.getRange(i+2,8).setValue(hours);updated++}
    }
  });
  SpreadsheetApp.flush();
  return `已補正 ${updated} 筆班表時數：全天班 8 小時，09:00~13:00 與 10:00~14:00 為 4 小時，09:00~14:00 為 5 小時，16:00~20:00 為 4 小時。`;
}
function num_(x){const n=Number(x);return Number.isFinite(n)?n:0}function nullNum_(x){return x===""||x==null?null:num_(x)}function def_(x,d){return x===""||x==null?d:num_(x)}function csv_(x){return`"${String(x??"").replace(/"/g,'""')}"`}
function sendOneSignalPush_(externalIds, title, message) {
  const props = PropertiesService.getScriptProperties();
  const appId = props.getProperty("ONESIGNAL_APP_ID");
  const apiKey = props.getProperty("ONESIGNAL_REST_API_KEY");

  if (!appId || !apiKey) {
    throw new Error("OneSignal 設定不完整");
  }

  const ids = Array.isArray(externalIds)
    ? externalIds.filter(Boolean).map(String)
    : [String(externalIds)].filter(Boolean);

  if (!ids.length) {
    return;
  }

  const payload = {
    app_id: appId,
    target_channel: "push",
    include_aliases: {
      external_id: ids
    },
    headings: {
      zh_Hant: title,
      en: title
    },
    contents: {
      zh_Hant: message,
      en: message
    },
    url: "https://a0980778082-coder.github.io/savage-staff-system/"
  };

  const response = UrlFetchApp.fetch(
    "https://api.onesignal.com/notifications",
    {
      method: "post",
      contentType: "application/json",
      headers: {
        Authorization: "Key " + apiKey
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    }
  );

  const statusCode = response.getResponseCode();
  const body = response.getContentText();

  if (statusCode < 200 || statusCode >= 300) {
    console.error("OneSignal 發送失敗：" + body);
    throw new Error("推播通知發送失敗");
  }

  console.log("OneSignal 發送成功：" + body);
}

function notifyAdminsOfSubstituteRequest_(
  requesterName,
  date,
  timeSlot
) {
  const adminExternalIds = users_()
    .filter(user =>
      user.role === "admin" &&
      user.status === "在職"
    )
    .map(user =>
      user.id
        ? "staff_" + user.id
        : "staff_" + user.name
    )
    .filter(Boolean);

  if (!adminExternalIds.length) {
    console.log("找不到管理員帳號，未發送推播");
    return;
  }

  sendOneSignalPush_(
    adminExternalIds,
    "新的代班申請",
    requesterName +
      " 提出代班申請：" +
      date +
      " " +
      timeSlot
  );
}
function testOneSignalPush() {
  sendOneSignalPush_(
    ["staff_E003"],
    "後端推播測試",
    "如果看到這則通知，代表 Apps Script 自動推播正常。"
  );
}
function notifySubstituteReviewResult_(
  requesterName,
  status,
  requestDate,
  timeSlot,
  substituteEmployee
) {
  const requester = users_().find(
    user => user.name === requesterName
  );

  if (!requester) {
    console.log("找不到代班申請人：" + requesterName);
    return;
  }

  const externalIds = [];

  if (requester.id) {
    externalIds.push("staff_" + requester.id);
    externalIds.push("員工_" + requester.id);
  } else {
    externalIds.push("staff_" + requester.name);
  }

  const formattedDate = Utilities.formatDate(
    new Date(requestDate),
    TZ,
    "yyyy/MM/dd"
  );

  const approved = status === "已核准";

  const title = approved
    ? "代班申請已核准"/*  */
    : "代班申請未核准";

  const message = approved
    ? `${formattedDate} ${timeSlot} 已核准，代班員工：${substituteEmployee}`
    : `${formattedDate} ${timeSlot} 的代班申請已被拒絕`;

  sendOneSignalPush_(
    [...new Set(externalIds)],
    title,
    message
  );
}
function testAdminSubstituteData() {
  const data = substitutes_().filter(
    x => x.status === "待老闆核准"
  );

  console.log(JSON.stringify(data, null, 2));
}
function notifyOffReviewResult_(
  employeeName,
  status,
  requestDate,
  requestSlot
) {
  const employee = users_().find(user =>
    user.name === employeeName &&
    user.status === "在職"
  );

  if (!employee) {
    console.log("找不到排假申請人：" + employeeName);
    return;
  }

  const externalIds = [];

  if (employee.id) {
    externalIds.push("staff_" + employee.id);
    externalIds.push("員工_" + employee.id);
  } else {
    externalIds.push("staff_" + employee.name);
  }

  const formattedDate = Utilities.formatDate(
    new Date(requestDate),
    TZ,
    "yyyy/MM/dd"
  );

  const approved = status === "已核准";

  const title = approved
    ? "排假申請已核准"
    : "排假申請未核准";

  const message = approved
    ? `${formattedDate} ${requestSlot} 的排假申請已核准`
    : `${formattedDate} ${requestSlot} 的排假申請已被拒絕`;

  sendOneSignalPush_(
    [...new Set(externalIds)],
    title,
    message
  );
}
function notifyShiftDeleted_(
  employeeName,
  shiftDate,
  timeSlot
) {
  const employee = users_().find(user =>
    user.name === employeeName &&
    user.status === "在職"
  );

  if (!employee) {
    console.log("找不到原上班員工：" + employeeName);
    return;
  }

  const externalIds = [];

  if (employee.id) {
    externalIds.push("staff_" + employee.id);
    externalIds.push("員工_" + employee.id);
  } else {
    externalIds.push("staff_" + employee.name);
  }

  const formattedDate = Utilities.formatDate(
    new Date(shiftDate),
    TZ,
    "yyyy/MM/dd"
  );

  sendOneSignalPush_(
    [...new Set(externalIds)],
    "班表取消通知",
    `${formattedDate} ${timeSlot} 的班表已被刪除或取消`
  );
}

function doPost(e){
 try{const p=JSON.parse(e.postData.contents||'{}');if(p.mode==='autoSchedule')return out_(autoScheduleApi(p.token,p.action,p.input));
 const mutations=['offRequest','oil','requestSubstitute','respondSubstitute','cancelSubstitute','reviewSubstitute','reviewOff','saveShift','deleteShift','saveEmployee','toggleEmployee','saveSettings','saveStaffNotice','publishSchedule'];
 if(!mutations.includes(p.mode))return readRequest_(()=>legacyDoPost_(e));
 const lock=LockService.getScriptLock();lock.waitLock(30000);try{return legacyDoPost_(e)}finally{lock.releaseLock()}
 }catch(err){return out_({ok:false,message:err.message})}
}
// 自動排班：管理員登入、規則保存、隔離草稿、確認寫入。
function autoScheduleApi(token, action, input) {
  try {
    ensureTimeZone_();
    const s=sess_(token); adminOnly_(s); if(!users_().some(u=>u.name===s.name&&u.role==='admin'&&u.status==='在職'))throw Error('管理員權限已停用'); input=input||{};
    if(action==='load')return {ok:true,features:['dateOverrides-v1'],rules:asRules_(),employees:users_().filter(u=>u.status==='在職').map(u=>({name:u.name,id:u.id,role:u.role})),draft:asReadDraft_(input.month)};
    const lock=LockService.getScriptLock();lock.waitLock(30000);
    try {
      if(action==='rules'){asValidateRules_(input.rules);set_('自動排班規則',JSON.stringify(input.rules));return {ok:true};}
      if(action==='generate'){
        const rules=asRules_();asValidateRules_(rules);
        const month=asMonth_(input.month),old=asReadDraft_(month);
        if(old&&old.status==='confirmed')throw Error('本月草稿已確認。請在原後台調整正式班表。');
        const snapshot=asSnapshot_(),fixed=(input.fixed||[]).filter(x=>x.locked);
        const result=asBuild_(month,rules,snapshot,fixed);
        const draft={month,id:Utilities.getUuid(),status:'draft',fingerprint:asFingerprint_(snapshot,rules),assignments:result.assignments,gaps:result.gaps,summary:result.summary,createdBy:s.name};
        asWriteDraft_(draft);return {ok:true,draft};
      }
      if(action==='review'){
        const month=asMonth_(input.month),draft=asReadDraft_(month),rules=asRules_(),snapshot=asSnapshot_();
        if(!draft||draft.id!==input.id||draft.status!=='draft')throw Error('草稿已更新或已確認，請重新載入');
        if(asFingerprint_(snapshot,rules)!==draft.fingerprint)throw Error('排班資料或規則已變更，請重新產生草稿');
        const checked=asBuild_(month,rules,snapshot,input.assignments||[],true);
        draft.assignments=checked.assignments;draft.gaps=checked.gaps;draft.summary=checked.summary;asWriteDraft_(draft);return {ok:true,draft};
      }
      if(action==='confirm'){
        const month=asMonth_(input.month),draft=asReadDraft_(month);
        if(!draft||draft.id!==input.id)throw Error('草稿已更新，請重新載入。');
        if(draft.status==='confirmed')return {ok:true,alreadyConfirmed:true};
        const rules=asRules_(),snapshot=asSnapshot_();
        if(asFingerprint_(snapshot,rules)!==draft.fingerprint)throw Error('員工、排休、班表或規則已改變，請重新產生草稿。');
        const assignments=input.assignments||draft.assignments;
        // 再驗證全部指定班次，防止前端修改姓名、日期或工時。
        const checked=asBuild_(month,rules,snapshot,assignments.map(x=>({...x,locked:true})),true);
        if(checked.gaps.length&&!input.allowGaps)throw Error('仍有缺人時段，請先調整，或勾選允許缺額後確認。');
        const ss=sh_(N.S),headers=ss.getRange(1,1,1,ss.getLastColumn()).getValues()[0];
        ['ID','日期','星期','班別','員工姓名','狀態','實際時數','預計時數','備註'].forEach(k=>{if(!headers.includes(k))throw Error('Schedule 缺少欄位：'+k);});
        const rows=checked.assignments.map((a,i)=>{const t=rules.shifts.find(t=>t.id===a.shift);const obj={'ID':'auto:'+draft.id+':'+i,'日期':dateObj_(a.date),'星期':week_(a.date),'班別':t.label,'員工姓名':a.name,'狀態':'已排班','實際時數':'','預計時數':t.hours,'備註':'自動排班草稿確認 '+draft.id};return headers.map(h=>obj[h]===undefined?'':obj[h]);});
        // 同一草稿已有寫入時禁止重複追加；復原時由老闆檢查正式班表。
        if(snapshot.schedule.some(x=>String(x.id).startsWith('auto:'+draft.id+':')))throw Error('此草稿已有正式班次，請重新載入並檢查，避免重複寫入。');
        if(rows.length)ss.getRange(ss.getLastRow()+1,1,rows.length,headers.length).setValues(rows);
        draft.status='confirmed';draft.assignments=checked.assignments;draft.gaps=checked.gaps;draft.confirmedBy=s.name;draft.confirmedAt=new Date().toISOString();asWriteDraft_(draft);
        return {ok:true,count:rows.length,gaps:checked.gaps.length};
      }
      throw Error('不支援的自動排班操作');
    }finally{lock.releaseLock();}
  }catch(e){return {ok:false,message:e.message};}
}
function asMonth_(m){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(m)))throw Error('請選擇年月');return m;}
function asRules_(){const raw=get_('自動排班規則');return raw?JSON.parse(raw):{shifts:[{id:'AM',label:'09:00~13:00',hours:4,need:[1,1,1,1,1,1,1]},{id:'PM',label:'16:00~20:00',hours:4,need:[1,1,1,1,1,1,1]}],employees:users_().filter(u=>u.status==='在職'&&u.role!=='admin').map(u=>({name:u.name,enabled:true,shifts:['AM','PM'],days:[0,1,2,3,4,5,6],maxHours:200,maxDays:6})),closedDates:[]};}
function asValidateRules_(r){
 if(!r||!Array.isArray(r.shifts)||!r.shifts.length||r.shifts.length>12||!Array.isArray(r.employees)||!Array.isArray(r.closedDates))throw Error('排班規則格式錯誤');
 const ids=new Set(),names=new Set();
 r.shifts.forEach(t=>{const range=asRange_(t.label);if(!/^[A-Za-z0-9_-]{1,20}$/.test(t.id)||ids.has(t.id)||!range||range[1]<=range[0]||range[0]<0||range[1]>24||!Number.isFinite(t.hours)||t.hours<=0||t.hours>range[1]-range[0]||!Array.isArray(t.need)||t.need.length!==7||t.need.some(n=>!Number.isInteger(n)||n<0||n>50))throw Error('班別格式錯誤：代碼不可重複，需有效時間、工時及週日到週六人數');ids.add(t.id);});
 r.employees.forEach(e=>{if(!e.name||names.has(e.name)||!Array.isArray(e.shifts)||e.shifts.some(x=>!ids.has(x))||!Array.isArray(e.days)||e.days.some(d=>!Number.isInteger(d)||d<0||d>6)||!Number.isFinite(e.maxHours)||e.maxHours<0||!Number.isInteger(e.maxDays)||e.maxDays<1||e.maxDays>31)throw Error('員工規則錯誤：'+e.name);names.add(e.name);});
 r.closedDates.forEach(d=>asDateCheck_(d));
 const overrides=r.dateOverrides||{};
 if(typeof overrides!=='object'||Array.isArray(overrides))throw Error('指定日期規則格式錯誤');
 Object.keys(overrides).forEach(date=>{asDateCheck_(date);const o=overrides[date];
 if(!o||!['open','closed'].includes(o.mode)||!o.need||typeof o.need!=='object'||Array.isArray(o.need))throw Error('指定日期規則格式錯誤：'+date);
 Object.keys(o.need).forEach(id=>{const n=o.need[id];if(!ids.has(id)||!Number.isInteger(n)||n<0||n>50)throw Error('指定日期人數錯誤：'+date);});
 });
}
function asDateCheck_(d){if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||new Date(d+'T00:00:00Z').toISOString().slice(0,10)!==d)throw Error('日期格式錯誤：'+d);}
function asRange_(label){if(label==='全天班')return [9,20];const m=String(label).match(/^(\d{2}):(\d{2})[~～-](\d{2}):(\d{2})$/);if(!m||+m[2]>59||+m[4]>59)return null;return [+m[1]+ +m[2]/60,+m[3]+ +m[4]/60];}
function asSnapshot_(){return {users:users_().map(u=>({name:u.name,status:u.status})),schedule:schedules_(),offs:offs_()};}
function asFingerprint_(snapshot,rules){return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify({snapshot,rules})));}
function asDraftSheet_(){const ss=SpreadsheetApp.getActive();let s=ss.getSheetByName('AutoScheduleDrafts');if(!s){s=ss.insertSheet('AutoScheduleDrafts');s.appendRow(['月份','草稿JSON','更新時間']);}return s;}
function asReadDraft_(month){if(!month)return null;asMonth_(month);const s=SpreadsheetApp.getActive().getSheetByName('AutoScheduleDrafts');if(!s||s.getLastRow()<2)return null;const r=s.getRange(2,1,s.getLastRow()-1,2).getValues().find(r=>String(r[0])===month);return r?JSON.parse(r[1]):null;}
function asWriteDraft_(d){const json=JSON.stringify(d);if(json.length>45000)throw Error('草稿過大，請減少班別或人數');const s=asDraftSheet_(),rows=s.getDataRange().getValues(),i=rows.findIndex(r=>String(r[0])===d.month);s.getRange(i<0?s.getLastRow()+1:i+1,1).setNumberFormat('@');s.getRange(i<0?s.getLastRow()+1:i+1,1,1,3).setValues([[d.month,json,new Date()]]);}
// 純計算函式：不寫表、不傳通知。
function asBuild_(month,rules,data,fixed,onlyFixed){
 asMonth_(month);asValidateRules_(rules);
 const active=new Set(data.users.filter(u=>u.status==='在職').map(u=>u.name));
 const emps=rules.employees.filter(e=>e.enabled&&active.has(e.name));
 const shifts=rules.shifts,slots=[],result=[],gaps=[],hours={},days={},busy=[];
 const last=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).getUTCDate();
 const valid=data.schedule.filter(s=>s.status!=='取消'&&!s.timeSlot.includes('排休'));
 for(const s of valid){const range=asRange_(s.timeSlot);busy.push({date:s.date,name:s.employeeName,range});(days[s.employeeName]||(days[s.employeeName]=new Set())).add(s.date);if(s.date.slice(0,7)===month)hours[s.employeeName]=(hours[s.employeeName]||0)+(s.plannedHours==null?infer_(s.timeSlot):s.plannedHours);}
 for(let d=1;d<=last;d++){const date=month+'-'+String(d).padStart(2,'0'),dow=new Date(date+'T00:00:00Z').getUTCDay();const override=(rules.dateOverrides||{})[date];if(rules.closedDates.includes(date)||override?.mode==='closed')continue;for(const t of shifts){const range=asRange_(t.label);const covered=new Set(busy.filter(b=>b.date===date&&b.range&&b.range[0]<=range[0]&&b.range[1]>=range[1]).map(b=>b.name)).size;slots.push({date,dow,shift:t.id,need:Math.max(0,(override?.mode==='open'&&Object.prototype.hasOwnProperty.call(override.need,t.id)?override.need[t.id]:t.need[dow])-covered)});}}
 function reason(e,slot){
 const t=shifts.find(t=>t.id===slot.shift),r=asRange_(t.label);
 if(!e||!e.shifts.includes(t.id)||!e.days.includes(slot.dow))return '不在可上班時段';
 if((hours[e.name]||0)+t.hours>e.maxHours+1e-8)return '超出每月工時上限';
 if(busy.some(b=>b.name===e.name&&b.date===slot.date&&(!b.range||(r[0]<b.range[1]&&b.range[0]<r[1]))))return '與既有班次重疊';
 if(data.offs.some(o=>o.employeeName===e.name&&o.requestDate===slot.date&&['待審核','已核准'].includes(o.status)&&offConflictsShift_(o.slot,t.label)))return '有排休申請';
 const set=days[e.name]||new Set();let count=1;
 for(const direction of [-1,1]){for(let step=1;step<=31;step++){const dt=new Date(slot.date+'T00:00:00Z');dt.setUTCDate(dt.getUTCDate()+direction*step);if(!set.has(dt.toISOString().slice(0,10)))break;count++;}}
 if(count>e.maxDays)return '超出連續上班天數上限';return '';
 }
 function add(e,slot,locked){const t=shifts.find(t=>t.id===slot.shift);result.push({date:slot.date,shift:t.id,name:e.name,locked:!!locked});slot.need--;hours[e.name]=(hours[e.name]||0)+t.hours;(days[e.name]||(days[e.name]=new Set())).add(slot.date);busy.push({date:slot.date,name:e.name,range:asRange_(t.label)});}
 for(const a of fixed||[]){const slot=slots.find(s=>s.date===a.date&&s.shift===a.shift),e=emps.find(e=>e.name===a.name);if(!slot||slot.need<=0)throw Error('鎖定班次不在需求中或人數已滿：'+a.date+' '+a.shift);const why=reason(e,slot);if(why)throw Error('鎖定班次無法安排：'+a.name+' '+a.date+' '+why);add(e,slot,a.locked);}
 if(!onlyFixed){
 // 先處理可用人數少的日期時段，再以目前總工時較少者優先。
 const pending=slots.slice();while(pending.length){pending.sort((a,b)=>emps.filter(e=>!reason(e,a)).length-emps.filter(e=>!reason(e,b)).length||a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift));const slot=pending.shift();while(slot.need>0){const choices=emps.filter(e=>!reason(e,slot)).sort((a,b)=>(hours[a.name]||0)-(hours[b.name]||0)||a.name.localeCompare(b.name));if(!choices.length)break;add(choices[0],slot,false);}}
 }
 for(const slot of slots)if(slot.need>0)gaps.push({date:slot.date,shift:slot.shift,missing:slot.need,reasons:emps.map(e=>e.name+'：'+(reason(e,slot)||'可手動調整')).join('；')||'沒有可排班員工'});
 result.sort((a,b)=>a.date.localeCompare(b.date)||a.shift.localeCompare(b.shift)||a.name.localeCompare(b.name));
 return {assignments:result,gaps,summary:emps.map(e=>({name:e.name,hours:hours[e.name]||0,maxHours:e.maxHours}))};
}
