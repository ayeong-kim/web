/* ===================== UTIL ===================== */
const pad=n=>String(n).padStart(2,'0');
const now=()=>{const d=new Date();return {d:`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`,t:`${pad(d.getHours())}:${pad(d.getMinutes())}`}};
const TODAY=now().d;
const fmtD=s=>s.slice(0,10).replace(/-/g,'.');
const WD=['일','월','화','수','목','금','토'];
const BREEDS={'개':['말티즈','푸들','비숑 프리제','포메라니안','웰시코기','시바견','진돗개','골든 리트리버','믹스'],'고양이':['코리안숏헤어','러시안블루','페르시안','먼치킨','스코티시폴드','브리티시숏헤어','믹스'],'기타':[]};

/* ===================== API (웹서버가 /api → WAS로 전달) ===================== */
async function api(method,path,body){
  const r=await fetch('/api'+path,{method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  if(r.status===401&&path!=='/login'){setUser(null);S.route={name:'login'};render();throw new Error('로그인이 필요합니다.');}
  if(!r.ok)throw new Error(r.status===404?'대상을 찾을 수 없거나 처리할 수 없는 요청입니다.':r.status===422?'입력값을 확인해 주세요.':r.status===401?'아이디 또는 비밀번호가 올바르지 않습니다.':'서버 오류가 발생했습니다.');
  return r.json();
}
// WAS 응답 ↔ 화면용 데이터
const uiPet=p=>({id:p.pid,name:p.pname,type:p.type,breed:p.breed||'',gender:p.gender||'',age:p.age??'',weight:p.weight??'',notes:p.notes||''});
const uiOwner=o=>({id:o.oid,name:o.oname,phone:o.pnum,addr:o.address||'',pets:o.pets.map(uiPet),active:o.active_pids});
const uiConsult=c=>({id:c.cid,petId:c.pid,petName:c.pname,vet:c.vet_name,date:c.date,purpose:c.purpose,diagnosis:c.diagnosis||'',state:c.status});
const apiPet=p=>({pname:p.name,type:p.type,breed:p.breed||null,gender:p.gender||null,age:p.age===''?null:Number(p.age),weight:p.weight===''?null:p.weight,notes:p.notes||null});

/* ===================== STATE ===================== */
const S={user:null,route:{name:'login'},d:{},q:'',flash:'',edit:null,addPet:null,petTab:'info',draft:{},reg:null,errs:{},saveId:true,showPw:false,vets:null};
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const shortG=g=>g==='암컷'?'암':g==='수컷'?'수':'-';
const PLUS='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>';

function setUser(u){S.user=u;try{u?sessionStorage.setItem('user',JSON.stringify(u)):sessionStorage.removeItem('user');}catch(e){}}

// 대기·진료중인 방문이 있는 동물 id → 진료가 끝날 때까지 방문 등록 버튼 비활성화
const VISIT_OFF='title="진료가 끝나면 다시 등록할 수 있습니다" disabled';

// 화면별로 필요한 데이터를 WAS에서 가져옴
const LOAD={
  search:async(r,d,keep)=>{
    if(keep&&S.d.rows){d.rows=S.d.rows;if(d.rows.some(o=>o.id===S.sel)){const o=uiOwner(await api('GET','/desk/owner/'+S.sel));d.rows=d.rows.map(x=>x.id===o.id?o:x);}}   // 목록은 그대로, 선택한 보호자만 다시 조회
    else d.rows=(await api('GET','/desk/owner?name='+encodeURIComponent(S.q.trim()))).map(uiOwner);   // 검색어가 없으면 최근 등록 20명
    d.owner=d.rows.find(o=>o.id===S.sel);if(!d.owner){S.sel=null;return;}d.active=d.owner.active;},
  owner:async(r,d)=>{d.owner=uiOwner(await api('GET','/desk/owner/'+r.id));d.active=d.owner.active;},
  pet:async(r,d)=>{const [p,o,h]=await Promise.all([api('GET','/desk/pet/'+r.id),api('GET','/desk/owner/'+r.oid),api('GET',`/desk/pet/${r.id}/consultation`)]);
    d.pet=uiPet(p);d.owner=uiOwner(o);d.hist=h.map(uiConsult);d.active=d.hist.some(c=>c.state!=='종료')?[d.pet.id]:[];},
  vlist:async(r,d)=>{d.list=(await api('GET','/vet/consultation')).map(uiConsult);},
  consult:async(r,d)=>{await LOAD.vlist(r,d);const c=d.list.find(x=>x.state==='진료중');if(!c)return;
    const [cd,h]=await Promise.all([api('GET','/vet/consultation/'+c.id),api('GET','/vet/consultation/history/'+c.petId)]);
    d.cur=uiConsult(cd);d.curPet=uiPet(cd.pet);d.hist=h.map(uiConsult).filter(x=>x.state==='종료');},
};
async function refresh(keep){   // keep: 검색 목록은 다시 받지 않음 (자동 새로고침, 보호자 선택)
  try{const d={};if(S.user&&LOAD[S.route.name])await LOAD[S.route.name](S.route,d,keep);S.d=d;render();return true;}
  catch(e){if(!S.user){S.route={name:'login'};render();return true;}toast(e.message);return false;}
}
async function go(name,params={}){
  const prev=S.route;S.route={name,...params};S.edit=null;S.addPet=null;S.errs={};if(name!=='owner')S.flash='';
  if(!await refresh())S.route=prev;
  window.scrollTo(0,0);
}
function toast(msg){document.querySelectorAll('.toast').forEach(x=>x.remove());const t=document.createElement('div');t.className='toast';t.textContent=msg;document.body.appendChild(t);setTimeout(()=>t.remove(),2400);}
function closeLayer(){$('#layer').innerHTML='';if(S.visitPid){S.visitPid=null;render();}}

/* ===================== SHELL ===================== */
function bar(){
  const u=S.user, r=S.route.name, vet=u.role==='vet';
  const waiting=vet&&S.d.list?S.d.list.filter(c=>c.state==='대기').length:0;
  const items=vet?[['vlist',`진료 목록${waiting?`<span class="n">${waiting}</span>`:''}`],['consult','현재 진료']]
               :[['search','진료 접수'],['register','신규 보호자 등록']];
  const active=vet?(r==='consult'?'consult':'vlist'):(r==='register'?'register':'search');
  return `<div class="bar"><div class="brand"><i></i>PetClinic<small>${esc(u.branch)}</small></div>
  <nav class="gnb">${items.map(([k,t])=>`<a class="${k===active?'on':''}" onclick="go('${k}')">${t}</a>`).join('')}</nav>
  <div class="util"><span><b>${esc(u.name)}</b> ${vet?'수의사':'데스크'}</span><span class="sep"></span><a onclick="logout()">로그아웃</a></div></div>`;
}
function ph(crumbs,title,sub,act=''){
  return `<div class="ph"><div>${crumbs?`<div class="crumb">${crumbs.map(([t,f])=>f?`<a onclick="${f}">${esc(t)}</a>`:esc(t)).join('<span>/</span>')}</div>`:''}
  <h1>${esc(title)}${sub?`<small>${esc(sub)}</small>`:''}</h1></div><div class="act">${act}</div></div>`;
}

/* ===================== LOGIN ===================== */
function vLogin(){
  return `<div class="login">
    <div class="side"><div class="brand"><i></i>PetClinic</div>
      <div class="copy"><h2>베스틴 글로벌<br>멀티클라우드과정<br>KDT 6기</h2><p>5개 지점 데스크 · 수의사 통합 진료 관리 시스템</p></div></div>
    <div class="form"><div>
      <h1>로그인</h1>
      <div class="muted" style="margin-top:8px">계정 권한에 따라 데스크 / 수의사 화면으로 자동 이동합니다.</div>
      <form onsubmit="event.preventDefault();login()">
        <label class="l">아이디</label><input class="in" id="lid" value="${S.saveId?'desk1':''}" autocomplete="off">
        <label class="l">비밀번호</label>
        <div class="pw"><input class="in" id="lpw" type="${S.showPw?'text':'password'}" style="padding-right:38px">
          <button type="button" onclick="S.showPw=!S.showPw;const v=$('#lpw').value,i=$('#lid').value;render();$('#lpw').value=v;$('#lid').value=i"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
        <label class="chk"><input type="checkbox" ${S.saveId?'checked':''} onchange="S.saveId=this.checked">아이디 저장</label>
        <div id="lerr" class="ferr" style="margin:12px 0 0;display:block;min-height:16px"></div>
        <button class="btn p" style="width:100%;height:46px;margin-top:6px;font-size:14px">로그인</button>
      </form>
      <div class="muted" style="margin-top:22px;font-size:12px;text-align:center">계정 문의는 지점 관리자에게 요청하세요.</div>
    </div></div></div>`;
}
async function login(){
  const id=$('#lid').value.trim(),pw=$('#lpw').value;
  let u;
  try{u=await api('POST','/login',{login_id:id,password:pw});}
  catch(e){$('#lerr').textContent='아이디 또는 비밀번호가 올바르지 않습니다.';return;}
  setUser(u);S.q='';S.sel=null;S.vets=null;go(u.role==='vet'?'vlist':'search');
}
async function logout(){try{await api('DELETE','/login');}catch(e){}setUser(null);S.vets=null;go('login');}

/* ===================== DESK: SEARCH ===================== */
function vSearch(){
  const q=S.q.trim(),rows=S.d.rows||[],o=S.d.owner;
  const hl=n=>q?esc(n).replace(esc(q),`<b style="color:var(--ac)">${esc(q)}</b>`):esc(n);
  // 좌측: 보호자 목록 (최근 등록 20명, 조회하면 이름으로 필터링) / 선택하면 페이지 이동 없이 우측에 채워짐
  const list=`<div class="sec"><h2>보호자<em>${rows.length}</em></h2></div>
    <table class="tbl"><colgroup><col style="width:80px"><col style="width:120px"><col></colgroup>
    <thead><tr><th>보호자명</th><th>휴대폰</th><th>반려동물</th></tr></thead><tbody>
    ${rows.map(r=>`<tr class="click ${r.id===S.sel?'sel':''}" onclick="selOwner(${r.id})"><td>${hl(r.name)}</td><td>${esc(r.phone)}</td>
      <td>${r.pets.map(p=>esc(p.name)).join(', ')||'<span class="muted">-</span>'}</td></tr>`).join('')}
    </tbody></table>${rows.length?'':`<div class="empty">${q?'조회 결과가 없습니다.':'등록된 보호자가 없습니다.'}</div>`}`;
  // 우측: 보호자 상세 틀은 항상 그대로, 선택한 보호자 정보로 채움
  const detail=o?ownerBody(o,ownerAct('s'),1):ownerBody({id:0,name:'',phone:'',addr:'',pets:[]},'',1);
  return bar()+ph(null,'진료 접수','',`<button class="btn" onclick="go('register')">${PLUS}신규 보호자 등록</button>`)+
  `<div class="body"><form style="display:flex;gap:8px" onsubmit="event.preventDefault();S.q=$('#q').value;go('search').then(()=>$('#q').focus())">
    <input class="in" id="q" style="width:480px;height:38px" placeholder="보호자 이름" value="${esc(S.q)}" autofocus>
    <button class="btn p l">조회</button></form><div class="split"><div>${list}</div><div>${detail}</div></div></div>`;
}
function selOwner(id){S.sel=id;S.edit=null;S.addPet=null;S.errs={};S.flash='';refresh(true);}

/* ===================== DESK: REGISTER ===================== */
const blankPet=()=>({name:'',type:'개',breed:'',gender:'',age:'',weight:'',notes:''});
function petRows(p,pre,err,cols=2){
  const e=k=>err[pre+k],fe=k=>e(k)?`<span class="ferr">${e(k)}</span>`:'';
  const f=[
    ['이름<span class="req">*</span>',`<input class="in ${e('name')?'bad':''}" style="max-width:220px" data-f="${pre}name" value="${esc(p.name)}">${fe('name')}`],
    ['종류<span class="req">*</span>',`<div class="rad">${['개','고양이','기타'].map(t=>`<label><input type="radio" name="${pre}type" value="${t}" ${p.type===t?'checked':''}>${t}</label>`).join('')}</div>`],
    ['품종',`<input class="in" style="max-width:220px" data-f="${pre}breed" list="bl-${pre}" value="${esc(p.breed)}" placeholder="입력 또는 선택"><datalist id="bl-${pre}">${(BREEDS[p.type]||[]).map(b=>`<option value="${b}">`).join('')}</datalist>`],
    ['성별<span class="req">*</span>',`<div class="rad">${['수컷','암컷'].map(g=>`<label><input type="radio" name="${pre}gender" value="${g}" ${p.gender===g?'checked':''}>${g}</label>`).join('')}</div>${fe('gender')}`],
    ['나이',`<span class="unit" style="width:120px"><input class="in ${e('age')?'bad':''}" data-f="${pre}age" value="${esc(p.age)}" inputmode="numeric"><em>세</em></span>${fe('age')}`],
    ['몸무게',`<span class="unit" style="width:120px"><input class="in ${e('weight')?'bad':''}" data-f="${pre}weight" value="${esc(p.weight)}" inputmode="decimal"><em>kg</em></span>${fe('weight')}`],
  ];
  // cols=2: 한 줄에 두 항목 (등록 페이지, 보호자 상세), cols=1: 한 줄에 한 항목 (검색 화면 우측 반쪽)
  let html='';
  for(let i=0;i<f.length;i+=cols)html+=`<div class="row" style="grid-template-columns:${cols===2?'140px 1fr 140px 1fr':'140px 1fr'}">${f.slice(i,i+cols).map(([k,v])=>`<div class="k">${k}</div><div class="v">${v}</div>`).join('')}</div>`;
  return html+`<div class="row" style="grid-template-columns:140px 1fr"><div class="k">비고</div><div class="v"><input class="in" data-f="${pre}notes" value="${esc(p.notes)}" placeholder="알레르기, 주의사항 등"></div></div>`;
}
function readPet(pre){
  const g=k=>{const el=document.querySelector(`[data-f="${pre}${k}"]`);return el?el.value.trim():''};
  const r=k=>{const el=document.querySelector(`input[name="${pre}${k}"]:checked`);return el?el.value:''};
  return {name:g('name'),type:r('type')||'개',breed:g('breed'),gender:r('gender'),age:g('age'),weight:g('weight'),notes:g('notes')};
}
function regSync(){ if(!S.reg)return;
  S.reg.owner={name:($('[data-f=oname]')||{}).value||'',phone:($('[data-f=ophone]')||{}).value||'',addr:($('[data-f=oaddr]')||{}).value||''};
  S.reg.pets=S.reg.pets.map((_,i)=>readPet(`p${i}`));
}
function vRegister(){
  if(!S.reg)S.reg={owner:{name:'',phone:'',addr:''},pets:[blankPet()]};
  const R=S.reg,E=S.errs;
  return bar()+ph([['진료 접수',"go('search')"],['신규 보호자 등록']],'신규 보호자 등록')+
  `<div class="body" onchange="if(event.target.name&&event.target.name.endsWith('type')){regSync();render();}">
    <div class="sec"><h2>보호자 정보</h2></div>
    <div class="ig">
      <div class="row" style="grid-template-columns:140px 1fr 140px 1fr">
        <div class="k">보호자명<span class="req">*</span></div><div class="v"><input class="in ${E.oname?'bad':''}" style="width:220px" data-f="oname" value="${esc(R.owner.name)}">${E.oname?`<span class="ferr">${E.oname}</span>`:''}</div>
        <div class="k">휴대폰<span class="req">*</span></div><div class="v"><input class="in ${E.ophone?'bad':''}" style="width:220px" data-f="ophone" value="${esc(R.owner.phone)}" placeholder="010-0000-0000" oninput="fmtPhone(this)">${E.ophone?`<span class="ferr">${E.ophone}</span>`:''}</div>
      </div>
      <div class="row" style="grid-template-columns:140px 1fr"><div class="k">주소</div><div class="v"><input class="in" data-f="oaddr" value="${esc(R.owner.addr)}"></div></div>
    </div>
    <div class="sec mt"><h2>반려동물 정보<em>${R.pets.length}</em></h2><span class="r"><button class="btn s" onclick="regSync();S.reg.pets.push(blankPet());render()">${PLUS}반려동물 추가</button></span></div>
    <div class="ig">${R.pets.map((p,i)=>`<div class="row" style="grid-template-columns:1fr auto"><div class="grp ${i?'sepb':''}">반려동물 ${i+1}</div><div class="grp ${i?'sepb':''}">${R.pets.length>1?`<button class="btn t err" onclick="regSync();S.reg.pets.splice(${i},1);render()">삭제</button>`:''}</div></div>${petRows(p,`p${i}`,E)}`).join('')}</div>
  </div>
  <div class="foot"><button class="btn l" onclick="S.reg=null;go('search')">취소</button><button class="btn p l" onclick="submitReg()">등록</button></div>`;
}
function fmtPhone(el){let d=el.value.replace(/\D/g,'').slice(0,11);el.value=d.length<4?d:d.length<8?d.slice(0,3)+'-'+d.slice(3):d.slice(0,3)+'-'+d.slice(3,d.length-4)+'-'+d.slice(-4);}
function petErrs(p,pre,E){
  if(!p.name)E[pre+'name']='이름을 입력해 주세요.';if(!p.gender)E[pre+'gender']='성별을 선택해 주세요.';
  if(p.age&&!/^\d+$/.test(p.age))E[pre+'age']='숫자만 입력해 주세요.';if(p.weight&&!/^\d+(\.\d+)?$/.test(p.weight))E[pre+'weight']='숫자만 입력해 주세요.';
}
async function submitReg(){
  regSync();const R=S.reg,E={};
  if(!R.owner.name.trim())E.oname='보호자명을 입력해 주세요.';
  if(!/^01\d-\d{3,4}-\d{4}$/.test(R.owner.phone))E.ophone='휴대폰 번호를 확인해 주세요.';
  R.pets.forEach((p,i)=>petErrs(p,`p${i}`,E));
  S.errs=E;if(Object.keys(E).length){render();return;}
  let o;
  try{o=await api('POST','/desk/owner',{oname:R.owner.name.trim(),pnum:R.owner.phone,address:R.owner.addr.trim()||null,pets:R.pets.map(apiPet)});}
  catch(e){toast(e.message);return;}
  S.reg=null;S.flash=`보호자 1명, 반려동물 ${R.pets.length}마리가 등록되었습니다.`;go('owner',{id:o.oid});
}

/* ===================== DESK: OWNER ===================== */
function ownerAct(size=''){
  return S.edit==='owner'?`<button class="btn ${size}" onclick="S.edit=null;S.errs={};render()">취소</button><button class="btn p ${size}" onclick="saveOwner()">저장</button>`:`<button class="btn ${size}" onclick="S.edit='owner';render()">보호자 정보 수정</button>`;
}
function ownerBody(o,act='',cols=2){
  const ps=o.pets,ed=S.edit==='owner',E=S.errs;
  return `${S.flash?`<div class="alert"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1F7A4D" stroke-width="2.4"><path d="M5 12l5 5 9-10"/></svg>${esc(S.flash)}</div>`:''}
    <div class="sec"><h2>보호자 정보</h2><span class="r">${act}</span></div>
    <div class="ig">
      <div class="row" style="grid-template-columns:140px 1fr 140px 1fr">
        <div class="k">보호자명</div><div class="v">${ed?`<input class="in ${E.oname?'bad':''}" style="max-width:240px" id="eoname" value="${esc(o.name)}">${E.oname?`<span class="ferr">${E.oname}</span>`:''}`:esc(o.name)}</div>
        <div class="k">휴대폰</div><div class="v">${ed?`<input class="in ${E.ophone?'bad':''}" style="max-width:240px" id="eophone" value="${esc(o.phone)}" oninput="fmtPhone(this)">${E.ophone?`<span class="ferr">${E.ophone}</span>`:''}`:esc(o.phone)}</div>
      </div>
      <div class="row" style="grid-template-columns:140px 1fr"><div class="k">주소</div><div class="v">${ed?`<input class="in" id="eoaddr" value="${esc(o.addr)}">`:esc(o.addr)||(o.id?'<span class="muted">-</span>':'')}</div></div>
    </div>
    <div class="sec mt"><h2>반려동물<em>${ps.length}</em></h2><span class="r">${S.addPet||!o.id?'':`<button class="btn s" onclick="S.addPet=blankPet();S.errs={};render()">${PLUS}반려동물 추가</button>`}</span></div>
    <table class="tbl"><colgroup><col style="width:13%"><col style="width:28%"><col style="width:9%"><col style="width:9%"><col style="width:11%"><col><col style="width:100px"></colgroup>
    <thead><tr><th>이름</th><th>종류/품종</th><th class="c">성별</th><th class="r">나이</th><th class="r">몸무게</th><th>비고</th><th class="c">관리</th></tr></thead><tbody>
    ${ps.map(p=>`<tr class="${S.visitPid===p.id?'sel':''}"><td><a class="lnk" onclick="S.petTab='info';go('pet',{id:${p.id},oid:${o.id}})">${esc(p.name)}</a></td><td>${esc(p.type)} / ${esc(p.breed)||'-'}</td><td class="c">${shortG(p.gender)}</td><td class="r">${p.age!==''?esc(p.age)+'세':'-'}</td><td class="r">${p.weight!==''?esc(p.weight)+'kg':'-'}</td>
      <td class="${p.notes?'flag':'muted'}">${esc(p.notes)||'-'}</td>
      <td class="c"><button class="btn s p" ${S.d.active.includes(p.id)?VISIT_OFF:''} onclick="openVisit(${p.id})">방문 등록</button></td></tr>`).join('')}
    </tbody></table>${ps.length?'':`<div class="empty">${o.id?'등록된 반려동물이 없습니다.':'왼쪽 목록에서 보호자를 선택하세요.'}</div>`}
    ${S.addPet?`<div class="sec mt"><h2>반려동물 추가</h2><span class="r"><button class="btn s" onclick="S.addPet=null;S.errs={};render()">취소</button><button class="btn s p" onclick="saveAddPet(${o.id})">추가</button></span></div>
      <div class="ig" onchange="if(event.target.name==='addtype'){S.addPet=readPet('add');render();}">${petRows(S.addPet,'add',S.errs,cols)}</div>`:''}`;
}
function vOwner(){
  const o=S.d.owner;
  return bar()+ph([['진료 접수',"go('search')"],['보호자 상세']],o.name,o.phone,ownerAct())+`<div class="body">${ownerBody(o)}</div>`;
}
async function saveOwner(){
  const o=S.d.owner,n=$('#eoname').value.trim(),ph=$('#eophone').value,ad=$('#eoaddr').value.trim(),E={};
  if(!n)E.oname='보호자명을 입력해 주세요.';if(!/^01\d-\d{3,4}-\d{4}$/.test(ph))E.ophone='휴대폰 번호를 확인해 주세요.';
  S.errs=E;if(Object.keys(E).length)return render();
  try{await api('PATCH','/desk/owner/'+o.id,{oname:n,pnum:ph,address:ad||null});}catch(e){return toast(e.message);}
  S.edit=null;S.flash='';await refresh();toast('보호자 정보가 수정되었습니다.');
}
async function saveAddPet(oid){
  const p=readPet('add'),E={};petErrs(p,'add',E);S.errs=E;S.addPet=p;if(Object.keys(E).length)return render();
  try{await api('POST','/desk/pet',{oid,pets:[apiPet(p)]});}catch(e){return toast(e.message);}
  S.addPet=null;S.flash='';await refresh();toast(`${p.name}이(가) 추가되었습니다.`);
}

/* ===================== DESK: PET ===================== */
function vPet(){
  const p=S.d.pet,o=S.d.owner,H=S.d.hist,ed=S.edit==='pet',tab=S.petTab,E=S.errs;
  const v=(k,txt,w='220px',u='')=>ed?(u?`<span class="unit" style="width:120px"><input class="in ${E['ep'+k]?'bad':''}" data-f="ep${k}" value="${esc(p[k])}"><em>${u}</em></span>${E['ep'+k]?`<span class="ferr">${E['ep'+k]}</span>`:''}`:`<input class="in" style="width:${w}" data-f="ep${k}" value="${esc(p[k])}">`):txt;
  const rad=(k,opts)=>ed?`<div class="rad">${opts.map(t=>`<label><input type="radio" name="ep${k}" value="${t}" ${p[k]===t?'checked':''}>${t}</label>`).join('')}</div>`:esc(p[k])||'-';
  const info=`<div class="sec"><h2>반려동물 정보</h2><span class="r">${ed?`<button class="btn s" onclick="S.edit=null;S.errs={};render()">취소</button><button class="btn s p" onclick="savePet()">저장</button>`:`<button class="btn s" onclick="S.edit='pet';render()">수정</button>`}</span></div>
    <div class="ig">
      <div class="row" style="grid-template-columns:140px 1fr 140px 1fr 140px 1fr"><div class="k">이름</div><div class="v">${v('name',esc(p.name))}${E.epname?`<span class="ferr">${E.epname}</span>`:''}</div><div class="k">종류</div><div class="v">${rad('type',['개','고양이','기타'])}</div><div class="k">품종</div><div class="v">${v('breed',esc(p.breed)||'-')}</div></div>
      <div class="row" style="grid-template-columns:140px 1fr 140px 1fr 140px 1fr"><div class="k">성별</div><div class="v">${rad('gender',['수컷','암컷'])}</div><div class="k">나이</div><div class="v">${v('age',p.age!==''?esc(p.age)+'세':'-','','세')}</div><div class="k">몸무게</div><div class="v">${v('weight',p.weight!==''?esc(p.weight)+'kg':'-','','kg')}</div></div>
      <div class="row" style="grid-template-columns:140px 1fr"><div class="k">비고</div><div class="v ${p.notes&&!ed?'flag':''}">${ed?`<input class="in" data-f="epnotes" value="${esc(p.notes)}">`:esc(p.notes)||'<span class="muted">-</span>'}</div></div>
    </div>
    <div class="sec mt"><h2>보호자</h2></div>
    <div class="ig"><div class="row" style="grid-template-columns:140px 1fr 140px 1fr 140px 1fr"><div class="k">보호자명</div><div class="v"><a class="lnk" style="font-weight:500" onclick="go('owner',{id:${o.id}})">${esc(o.name)}</a></div><div class="k">휴대폰</div><div class="v">${esc(o.phone)}</div><div class="k">주소</div><div class="v">${esc(o.addr)||'-'}</div></div></div>`;
  const hist=`<table class="tbl"><colgroup><col style="width:130px"><col style="width:120px"><col style="width:30%"><col><col style="width:100px"></colgroup>
    <thead><tr><th>진료일</th><th>담당 수의사</th><th>방문 목적</th><th>진단</th><th>상태</th></tr></thead><tbody>
    ${H.map(c=>`<tr><td>${fmtD(c.date)}</td><td>${esc(c.vet)}</td><td class="wrap">${esc(c.purpose)}</td><td class="wrap ${c.diagnosis?'':'muted'}">${esc(c.diagnosis)||'-'}</td><td>${stBadge(c.state)}</td></tr>`).join('')}
    </tbody></table>${H.length?'':'<div class="empty">진료 이력이 없습니다.</div>'}`;
  return bar()+ph([['진료 접수',"go('search')"],[o.name,`go('owner',{id:${o.id}})`],['반려동물 상세']],p.name,[p.type,p.breed,shortG(p.gender),p.age!==''&&p.age+'세',p.weight!==''&&p.weight+'kg'].filter(Boolean).join(' · '),
    `<button class="btn p" ${S.d.active.includes(p.id)?VISIT_OFF:''} onclick="openVisit(${p.id})">${PLUS}방문 등록</button>`)+
  `<div class="tabs"><a class="${tab==='info'?'on':''}" onclick="S.petTab='info';S.edit=null;render()">기본 정보</a><a class="${tab==='hist'?'on':''}" onclick="S.petTab='hist';S.edit=null;render()">진료 이력 <span class="muted" style="font-weight:500">${H.length}</span></a></div>
  <div class="body">${tab==='info'?info:hist}</div>`;
}
function stBadge(s){return `<span class="st ${s==='대기'?'w':s==='진료중'?'i':'d'}">${s}</span>`}
async function savePet(){
  const p=S.d.pet,n=readPet('ep'),E={};
  petErrs(n,'ep',E);delete E.epgender;S.errs=E;if(Object.keys(E).length)return render();
  try{await api('PATCH','/desk/pet/'+p.id,apiPet(n));}catch(e){return toast(e.message);}
  S.edit=null;S.errs={};await refresh();toast('반려동물 정보가 수정되었습니다.');
}

/* ===================== VISIT DRAWER ===================== */
async function openVisit(pid){
  const o=S.d.owner,p=o.pets.find(x=>x.id===pid),n=now();
  if(!S.vets){try{S.vets=await api('GET','/desk/vets');}catch(e){return toast(e.message);}}
  S.visitPid=pid;render();
  $('#layer').innerHTML=`<div class="dov" onclick="closeLayer()"></div><aside class="dr">
    <div class="dh"><b>방문 등록</b><button onclick="closeLayer()" aria-label="닫기">✕</button></div>
    <div class="db">
      <dl class="dsum">
        <dt>환자</dt><dd><b>${esc(p.name)}</b> <span class="muted">${esc([p.type,p.breed,shortG(p.gender),p.age!==''&&p.age+'세',p.weight!==''&&p.weight+'kg'].filter(Boolean).join(' · '))}</span></dd>
        <dt>보호자</dt><dd>${esc(o.name)} <span class="muted">${esc(o.phone)}</span></dd>
        ${p.notes?`<dt>비고</dt><dd class="flag">${esc(p.notes)}</dd>`:''}
      </dl>
      <label class="dl">방문일시</label><input class="in" readonly value="${n.d} ${n.t}">
      <label class="dl">담당 수의사<span class="req">*</span></label>
      <select class="in" id="vvet"><option value="">선택</option>${S.vets.map(v=>`<option value="${v.uid}">${esc(v.name)}</option>`).join('')}</select><div class="ferr" id="evvet" style="margin:4px 0 0"></div>
      <label class="dl">방문 목적<span class="req">*</span></label>
      <textarea class="in" id="vpur" rows="7"></textarea><div class="ferr" id="evpur" style="margin:4px 0 0"></div>
    </div>
    <div class="dft"><button class="btn l" onclick="closeLayer()">취소</button><button class="btn p l" style="flex:1" onclick="saveVisit(${pid})">등록</button></div>
  </aside>`;
  $('#vvet').focus();
}
async function saveVisit(pid){
  const sel=$('#vvet'),v=sel.value,pu=$('#vpur').value.trim();
  $('#evvet').textContent=v?'':'담당 수의사를 선택해 주세요.';$('#evpur').textContent=pu?'':'방문 목적을 입력해 주세요.';
  if(!v||!pu)return;
  try{
    const h=await api('GET',`/desk/pet/${pid}/consultation`);
    if(h.some(c=>c.status!=='종료')){$('#evpur').textContent='이미 대기 또는 진료 중인 방문이 있습니다.';return;}
    await api('POST',`/desk/pet/${pid}/consultation`,{vet_uid:Number(v),purpose:pu});
  }catch(e){return toast(e.message);}
  const name=sel.options[sel.selectedIndex].text;
  $('#layer').innerHTML='';S.visitPid=null;S.flash='';await refresh();toast(`방문이 등록되었습니다. 담당 ${name} · 대기`);
}

/* ===================== VET: LIST ===================== */
function vVlist(){
  const L=S.d.list,cur=L.find(c=>c.state==='진료중'),q=L.filter(c=>c.state==='대기');
  const rows=[...(cur?[cur]:[]),...q],d=new Date();
  return bar()+ph(null,'진료 목록',`${fmtD(TODAY)} (${WD[d.getDay()]})`)+
  `<div class="body">
    <table class="tbl"><colgroup><col style="width:60px"><col style="width:120px"><col style="width:140px"><col><col style="width:110px"><col style="width:120px"></colgroup>
    <thead><tr><th class="c">순번</th><th class="c">접수</th><th>환자</th><th>방문 목적</th><th>상태</th><th></th></tr></thead><tbody>
    ${rows.map(c=>{const qi=q.indexOf(c),first=qi===0&&!cur;
      return `<tr class="${first||c.state==='진료중'?'sel':''}"><td class="c">${qi>=0?(qi===0?`<b>${qi+1}</b>`:qi+1):'-'}</td><td class="c">${fmtD(c.date).slice(5)} ${c.date.slice(11,16)}</td>
      <td style="font-weight:600">${esc(c.petName)}</td><td>${esc(c.purpose)}</td><td>${stBadge(c.state)}</td>
      <td class="c">${c.state==='진료중'?`<button class="btn s p" onclick="go('consult')">진료 화면</button>`:`<button class="btn s ${first?'p':''}" ${first?'':'disabled'} onclick="startConsult(${c.id})">진료 시작</button>`}</td></tr>`}).join('')}
    </tbody></table>${rows.length?'':'<div class="empty">배정된 진료가 없습니다.</div>'}
  </div>`;
}
// 5초마다 다시 조회 → 수의사 진료 목록(새 접수), 데스크 보호자·반려동물 상세(진료 상태·방문 등록 버튼)
// 수정 중이거나 방문 등록 창이 열려 있으면 입력이 지워지지 않게 건너뜀
setInterval(()=>{
  if(!S.user||document.hidden)return;
  const r=S.route.name;
  if(document.activeElement&&document.activeElement.matches('input,textarea,select'))return;
  if(r==='vlist'||((r==='owner'||r==='pet'||r==='search')&&!S.edit&&!S.addPet&&!S.visitPid))refresh(true);
},5000);
async function startConsult(id){try{await api('PATCH',`/vet/consultation/${id}/start`);}catch(e){return toast(e.message);}go('consult');}

/* ===================== VET: CONSULT ===================== */
function vConsult(){
  const c=S.d.cur;
  if(!c)return bar()+ph([['진료 목록',"go('vlist')"],['현재 진료']],'현재 진료')+`<div class="body"><div class="empty" style="border:0">진행 중인 진료가 없습니다.<div style="margin-top:14px"><button class="btn" onclick="go('vlist')">진료 목록으로</button></div></div></div>`;
  const p=S.d.curPet,H=S.d.hist,dr=S.draft[c.id]??c.diagnosis;
  return bar()+`<div class="ph" style="align-items:center;padding-top:14px;padding-bottom:14px"><div><div class="crumb"><a onclick="go('vlist')">진료 목록</a><span>/</span>현재 진료</div><h1>${esc(p.name)}</h1></div>
    <div class="act" style="gap:16px">${stBadge('진료중')}<button class="btn p" style="height:36px;padding:0 20px" onclick="endConsult(${c.id})">진료 종료</button></div></div>
  <div style="padding:20px 32px 0">
    <div class="ig">
      <div class="row" style="grid-template-columns:100px 1fr 100px 1fr 100px 1fr 100px 1fr 100px 1fr">
        <div class="k">종류</div><div class="v">${esc(p.type)}</div><div class="k">품종</div><div class="v">${esc(p.breed)||'-'}</div>
        <div class="k">성별</div><div class="v">${esc(p.gender)||'-'}</div><div class="k">나이</div><div class="v">${p.age!==''?esc(p.age)+'세':'-'}</div><div class="k">몸무게</div><div class="v">${p.weight!==''?esc(p.weight)+'kg':'-'}</div>
      </div>
      <div class="row" style="grid-template-columns:100px 1fr"><div class="k">방문 목적</div><div class="v">${esc(c.purpose)}</div></div>
      <div class="row" style="grid-template-columns:100px 1fr"><div class="k">비고</div><div class="v" style="${p.notes?'color:var(--err)':''}">${esc(p.notes)||'<span class="muted">-</span>'}</div></div>
    </div>
  </div>
  <div class="cs">
    <div style="display:flex;flex-direction:column">
      <div class="sec"><h2>진단</h2><span class="r ferr" id="ediag"></span></div>
      <textarea class="in" id="diag" style="flex:1;min-height:360px;font-size:13.5px;line-height:1.75;resize:none" oninput="S.draft[${c.id}]=this.value">${esc(dr)}</textarea>
    </div>
    <div>
      <div class="sec"><h2>진료 이력<em>${H.length}</em></h2></div>
      <table class="tbl"><colgroup><col style="width:96px"><col style="width:64px"><col></colgroup>
      <thead><tr><th>진료일</th><th>수의사</th><th>방문 목적 / 진단</th></tr></thead><tbody>
      ${H.map(h=>`<tr><td style="vertical-align:top;padding-top:12px">${fmtD(h.date)}</td><td style="vertical-align:top;padding-top:12px">${esc(h.vet)}</td><td class="wrap"><div style="color:var(--tx2)">${esc(h.purpose)}</div><div style="margin-top:3px">${esc(h.diagnosis)||'<span class="muted">-</span>'}</div></td></tr>`).join('')}
      </tbody></table>${H.length?'':'<div class="empty">이전 진료 이력이 없습니다.</div>'}
    </div>
  </div>`;
}
async function endConsult(id){
  const t=$('#diag').value.trim();
  if(!t){$('#ediag').textContent='진단 내용을 입력해 주세요.';$('#diag').classList.add('bad');$('#diag').focus();return;}
  try{await api('PATCH','/vet/consultation/'+id,{diagnosis:t});await api('PATCH',`/vet/consultation/${id}/end`);}catch(e){return toast(e.message);}
  const name=S.d.curPet.name;delete S.draft[id];await go('vlist');toast(`${name} 진료가 종료되었습니다.`);
}

/* ===================== RENDER ===================== */
const VIEWS={login:vLogin,search:vSearch,register:vRegister,owner:vOwner,pet:vPet,vlist:vVlist,consult:vConsult};
function render(){
  if(!S.user&&S.route.name!=='login')S.route={name:'login'};
  const html=VIEWS[S.route.name]();if(html!==undefined)$('#app').innerHTML=html;
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeLayer();});
try{S.user=JSON.parse(sessionStorage.getItem('user'));}catch(e){}
S.route={name:S.user?(S.user.role==='vet'?'vlist':'search'):'login'};
refresh();
