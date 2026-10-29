(()=>{'use strict';
const $=id=>document.getElementById(id), statuses=['待分配','待处理','处理中','待补资料','待复核','已回复'];
const seed=[{id:'d1',kind:'7501',assignee:'a',container_no:'DEMO5400887',bill_no:'DEMO-BL-001',status:'处理中',mail_subject:'7501 DEMO5400887',notes:'示例：核对申报资料',due_at:null},{id:'d2',kind:'DO',assignee:'b',container_no:'DEMO7057404',bill_no:'DEMO-BL-002',status:'待处理',mail_subject:'DO DEMO7057404',notes:'示例：检查到货通知',due_at:null},{id:'d3',kind:'ISF',assignee:'a',container_no:'DEMO2996101',bill_no:'DEMO-BL-003',status:'待复核',mail_subject:'ISF DEMO2996101',notes:'示例：等待确认',due_at:null},{id:'d4',kind:'装箱单',assignee:'b',container_no:'DEMO1234567',bill_no:'DEMO-BL-004',status:'已回复',mail_subject:'装箱单 DEMO1234567',notes:'示例：已回复原邮件',due_at:null}];
let demo=JSON.parse(localStorage.getItem('ct_demo_tasks')||'null')||seed, mode='demo', sb=null, currentUser=null, profile=null, remote=[];let showingArchived=false;
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const persist=()=>localStorage.setItem('ct_demo_tasks',JSON.stringify(demo));const role=()=>mode==='demo'?$('demoRole').value:(profile?.role==='admin'?'admin':currentUser?.id);
const name=v=>mode==='demo'?({a:'员工A',b:'员工B'}[v]||'待分配'):(v?escape(v===currentUser?.id?'我':v.slice(0,8)):'待分配');
const visible=()=>{let all=mode==='demo'?demo:remote;return all.filter(t=>(mode==='demo'||(showingArchived?!!t.archived_at:!t.archived_at))&&(role()==='admin'||t.assignee===role())&&(!$('typeFilter').value||t.kind===$('typeFilter').value)&&(!$('search').value||[t.container_no,t.bill_no,t.mail_subject].some(v=>String(v||'').toLowerCase().includes($('search').value.toLowerCase()))));};
function render(){const admin=role()==='admin',items=visible();$('demoRole').parentElement.style.display=mode==='demo'?'':'none';$('addBtn').style.display=admin?'':'none';$('archiveToggle').style.display=admin&&mode==='cloud'?'':'none';$('archiveToggle').textContent=showingArchived?'查看当前任务':'查看已归档';$('listTitle').textContent=showingArchived?'已归档任务':admin?'全部任务':'我的任务';$('countLabel').textContent=`${items.length} 条`;$('nTotal').textContent=items.length;$('nDoing').textContent=items.filter(x=>x.status==='处理中').length;$('nReview').textContent=items.filter(x=>x.status==='待复核').length;$('nDone').textContent=items.filter(x=>x.status==='已回复').length;
$('notice').textContent=mode==='demo'?'演示模式：仅使用虚构数据。本页身份切换不是安全权限，不能用于真实客户资料。':`云端模式：${currentUser?.email||''} · ${admin?'管理员':'操作员'}。实际任务访问权限由云端数据库控制。`;
$('taskList').innerHTML=items.map(t=>`<article class="task"><div class="topline"><div><span class="tag">${escape(t.kind)}</span> <strong>${escape(t.container_no||t.bill_no||'未填写编号')}</strong></div><span class="status ${t.status==='已回复'?'done':''}">${escape(t.status)}</span></div><div class="meta"><span>负责人：${name(t.assignee)}</span><span>提单号：${escape(t.bill_no||'—')}</span><span>截止：${escape(t.due_at?t.due_at.replace('T',' ').slice(0,16):'未设置')}</span></div><p>邮件：${escape(t.mail_subject||'—')}</p><p>备注：${escape(t.notes||'—')}</p><div class="foot"><label>任务进度 <select data-status="${escape(t.id)}">${statuses.map(x=>`<option ${x===t.status?'selected':''}>${x}</option>`).join('')}</select></label>${admin?`<button class="outline" data-edit="${escape(t.id)}">编辑派单</button>${mode==='cloud'?`<button class="outline" data-archive="${escape(t.id)}">${t.archived_at?'恢复任务':'归档任务'}</button><button class="outline danger" data-delete="${escape(t.id)}">永久删除</button>`:''}`:''}</div></article>`).join('')||'<div class="empty">暂无符合条件的任务</div>';
$('taskList').querySelectorAll('[data-status]').forEach(e=>e.onchange=()=>updateStatus(e.dataset.status,e.value));$('taskList').querySelectorAll('[data-edit]').forEach(e=>e.onclick=()=>openTask(e.dataset.edit));$('taskList').querySelectorAll('[data-archive]').forEach(e=>e.onclick=()=>archiveTask(e.dataset.archive));$('taskList').querySelectorAll('[data-delete]').forEach(e=>e.onclick=()=>deleteTask(e.dataset.delete));}
async function archiveTask(id){if(mode!=='cloud'||role()!=='admin')return;const t=remote.find(x=>x.id===id);if(!t)return;const archived=!t.archived_at;if(!confirm(archived?'确定归档这条任务？归档后可恢复。':'确定恢复这条任务？'))return;try{const r=await sb.from('tasks').update({archived_at:archived?new Date().toISOString():null}).eq('id',id);if(r.error)throw r.error;await loadRemote();render();}catch(e){alert('操作失败：'+e.message)}}
async function deleteTask(id){if(mode!=='cloud'||role()!=='admin')return;const t=remote.find(x=>x.id===id);if(!t)return;const mark=t.container_no||t.bill_no||id;if(prompt('永久删除无法在页面恢复。请输入 DELETE 确认删除任务：'+mark)!=='DELETE')return;try{const r=await sb.from('tasks').delete().eq('id',id);if(r.error)throw r.error;await loadRemote();render();}catch(e){alert('删除失败：'+e.message)}}
async function updateStatus(id,status){try{if(mode==='demo'){const t=demo.find(x=>x.id===id);t.status=status;persist();}else{const r=profile.role==='admin'?await sb.from('tasks').update({status,completed_at:status==='已回复'?new Date().toISOString():null}).eq('id',id):await sb.rpc('update_my_task_status',{p_task_id:id,p_status:status});if(r.error)throw r.error;await loadRemote();}render();}catch(e){alert('保存失败：'+e.message);render();}}
let editId=null;function openTask(id=null){if(role()!=='admin')return;editId=id;const t=(mode==='demo'?demo:remote).find(x=>x.id===id)||{};const f=$('taskForm');for(const k of ['kind','assignee','container_no','bill_no','due_at','status','mail_subject','notes'])if(f.elements[k])f.elements[k].value=t[k]||({kind:'7501',status:'待分配'}[k]||'');if(mode!=='demo'){const sel=f.elements.assignee;sel.innerHTML='<option value="">待分配</option>'+users.map(p=>`<option value="${escape(p.id)}">${escape(p.display_name||p.id)}</option>`).join('');sel.value=t.assignee||'';}else{f.elements.assignee.innerHTML='<option value="">待分配</option><option value="a">员工A</option><option value="b">员工B</option>';f.elements.assignee.value=t.assignee||'';}$('dialogTitle').textContent=id?'编辑任务':'新建任务';$('taskDialog').showModal();}
let users=[];async function submitTask(){const f=$('taskForm'),obj=Object.fromEntries(new FormData(f).entries());for(const k of ['assignee','due_at'])if(!obj[k])obj[k]=null;if(mode==='demo'){if(editId){Object.assign(demo.find(x=>x.id===editId),obj)}else demo.unshift({id:'d'+Date.now(),...obj});persist();}else{const query=editId?sb.from('tasks').update(obj).eq('id',editId):sb.from('tasks').insert(obj),r=await query;if(r.error)throw r.error;await loadRemote();}render();$('taskDialog').close();}
async function loadRemote(){const r=await sb.from('tasks').select('id,kind,assignee,container_no,bill_no,due_at,status,mail_subject,notes,completed_at,archived_at').order('created_at',{ascending:false});if(r.error)throw r.error;remote=r.data||[];if(profile?.role==='admin'){const p=await sb.from('profiles').select('id,display_name,role');if(!p.error)users=p.data||[];}}
async function connect(){try{if(!window.supabase)throw Error('联网依赖未加载，请检查网络。');const url=$('sbUrl').value.trim(),key=$('sbKey').value.trim();if(!/^https:\/\/.+\.supabase\.co\/?$/.test(url))throw Error('请输入正确的Supabase项目地址');if(!key)throw Error('缺少客户端公开密钥');localStorage.setItem('ct_sb_config',JSON.stringify({url,key}));sb=window.supabase.createClient(url,key);const a=await sb.auth.signInWithPassword({email:$('loginEmail').value.trim(),password:$('loginPassword').value});if(a.error)throw a.error;currentUser=a.data.user;const p=await sb.from('profiles').select('role,display_name').eq('id',currentUser.id).single();if(p.error)throw p.error;profile=p.data;mode='cloud';await loadRemote();$('configDialog').close();render();}catch(e){$('authText').textContent='连接失败：'+e.message;}}
$('modeBtn').onclick=()=>$('configDialog').showModal();$('closeConfig').onclick=()=>$('configDialog').close();$('closeDialog').onclick=()=>$('taskDialog').close();$('demoRole').onchange=render;$('typeFilter').onchange=render;$('search').oninput=render;$('refreshBtn').onclick=async()=>{if(mode==='cloud')try{await loadRemote();}catch(e){alert(e.message)}render()};$('addBtn').onclick=()=>openTask();$('archiveToggle').onclick=()=>{showingArchived=!showingArchived;render()};$('taskForm').onsubmit=async e=>{e.preventDefault();try{await submitTask()}catch(err){alert('保存失败：'+err.message)}};$('connectBtn').onclick=connect;$('demoBtn').onclick=()=>{mode='demo';profile=null;currentUser=null;$('configDialog').close();render()};$('signoutBtn').onclick=async()=>{if(sb)await sb.auth.signOut();mode='demo';profile=null;currentUser=null;$('authText').textContent='已退出云端';render()};

let activePanel='tasks', knowledgeItems=[], knowledgeEditId=null;
function setPanel(panel){
  activePanel=panel;
  $('taskPanel').hidden=panel!=='tasks';
  $('knowledgePanel').hidden=panel!=='knowledge';
  $('tasksTab').className=panel==='tasks'?'primary':'outline';
  $('knowledgeTab').className=panel==='knowledge'?'primary':'outline';
  if(panel==='knowledge')refreshKnowledge();
}
async function refreshKnowledge(){
  if(mode!=='cloud'||!sb||!currentUser){
    $('knowledgeNotice').textContent='请先在运行模式中使用测试账号登录云端。演示模式不保存客户资料。';
    knowledgeItems=[];renderKnowledge();return;
  }
  try{
    const {data,error}=await sb.from('customer_knowledge')
      .select('id,importer_name,importer_number,surety_number,bond_type,importer_address,notes,verification_status,created_by,created_at,verified_at')
      .order('created_at',{ascending:false}).limit(500);
    if(error)throw error;
    knowledgeItems=data||[];
    $('knowledgeNotice').textContent='云端知识库：新资料默认待核实；员工仅能看到已核实资料及自己录入的待核实资料。';
    renderKnowledge();
  }catch(e){
    $('knowledgeNotice').textContent='知识库读取失败：'+e.message;
    knowledgeItems=[];renderKnowledge();
  }
}
function renderKnowledge(){
  const q=$('knowledgeSearch').value.trim().toLowerCase();
  const items=knowledgeItems.filter(x=>[x.importer_name,x.importer_number,x.surety_number].some(v=>String(v||'').toLowerCase().includes(q)));
  $('knowledgeCount').textContent=items.length+' 条';
  const admin=mode==='cloud'&&profile?.role==='admin';
  $('knowledgeAdd').style.display=mode==='cloud'?'':'none';
  $('knowledgeList').innerHTML=items.map(x=>`
  <article class="task">
    <div class="topline"><strong>${escape(x.importer_name)}</strong><span class="status">${escape(x.verification_status)}</span></div>
    <div class="meta"><span>Importer Number：${escape(x.importer_number||'未填写')}</span><span>Surety Number：${escape(x.surety_number||'未填写')}</span><span>Bond：${escape(x.bond_type||'未填写')}</span></div>
    <p>地址：${escape(x.importer_address||'未填写')}</p>
    <p>备注：${escape(x.notes||'无')}</p>
    ${admin?`<div class="foot"><button class="outline" type="button" data-knowledge-edit="${escape(x.id)}">编辑 / 审核</button></div>`:''}
  </article>`).join('')||'<div class="empty">暂无符合条件的客户资料</div>';
  $('knowledgeList').querySelectorAll('[data-knowledge-edit]').forEach(b=>b.onclick=()=>openKnowledge(b.dataset.knowledgeEdit));
}
function openKnowledge(id=null){
  if(mode!=='cloud'||!currentUser){alert('请先登录云端测试账号');return;}
  if(id&&profile?.role!=='admin')return;
  knowledgeEditId=id;
  const x=knowledgeItems.find(v=>v.id===id)||{};
  const form=$('knowledgeForm');
  for(const key of ['importer_name','importer_number','surety_number','bond_type','importer_address','notes','verification_status']){
    if(form.elements[key])form.elements[key].value=x[key]|| (key==='verification_status'?'待核实':'');
  }
  $('verificationField').hidden=!(id&&profile?.role==='admin');
  $('knowledgeDialogTitle').textContent=id?'编辑 / 审核客户资料':'新增客户资料';
  $('knowledgeDialog').showModal();
}
async function submitKnowledge(e){
  e.preventDefault();
  const form=$('knowledgeForm'),fd=new FormData(form);
  const obj={};
  for(const key of ['importer_name','importer_number','surety_number','bond_type','importer_address','notes'])obj[key]=String(fd.get(key)||'').trim();
  if(!obj.importer_name){alert('请填写客户名称');return;}
  try{
    let result;
    if(knowledgeEditId){
      if(profile?.role!=='admin')throw Error('无管理员权限');
      obj.verification_status=String(fd.get('verification_status')||'待核实');
      obj.verified_by=obj.verification_status==='已核实'?currentUser.id:null;
      obj.verified_at=obj.verification_status==='已核实'?new Date().toISOString():null;
      obj.updated_at=new Date().toISOString();
      result=await sb.from('customer_knowledge').update(obj).eq('id',knowledgeEditId);
    }else{
      obj.created_by=currentUser.id;
      obj.verification_status='待核实';
      result=await sb.from('customer_knowledge').insert(obj);
    }
    if(result.error)throw result.error;
    $('knowledgeDialog').close();
    await refreshKnowledge();
  }catch(err){alert('保存客户资料失败：'+err.message);}
}
$('tasksTab').onclick=()=>setPanel('tasks');
$('knowledgeTab').onclick=()=>setPanel('knowledge');
$('knowledgeSearch').oninput=renderKnowledge;
$('knowledgeRefresh').onclick=refreshKnowledge;
$('knowledgeAdd').onclick=()=>openKnowledge();
$('knowledgeClose').onclick=()=>$('knowledgeDialog').close();
$('knowledgeForm').onsubmit=submitKnowledge;

async function restoreCloudSession(){
  try{
    const saved=JSON.parse(localStorage.getItem('ct_sb_config')||'null');
    if(!saved?.url||!saved?.key||!window.supabase)return;
    $('sbUrl').value=saved.url;
    $('sbKey').value=saved.key;
    sb=window.supabase.createClient(saved.url,saved.key);
    const {data,error}=await sb.auth.getSession();
    if(error)throw error;
    if(!data.session?.user)return;
    currentUser=data.session.user;
    const p=await sb.from('profiles').select('role,display_name').eq('id',currentUser.id).single();
    if(p.error)throw p.error;
    profile=p.data;
    mode='cloud';
    await loadRemote();
    render();
  }catch(e){
    console.error('Restore Supabase session failed:',e);
    $('authText').textContent='恢复云端登录失败：'+e.message;
    mode='demo';currentUser=null;profile=null;render();
  }
}
try{const saved=JSON.parse(localStorage.getItem('ct_sb_config')||'null');if(saved){$('sbUrl').value=saved.url;$('sbKey').value=saved.key;}}catch(e){console.warn('Invalid saved cloud configuration',e);}
if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js').catch(()=>{});
render();
restoreCloudSession();
})();
