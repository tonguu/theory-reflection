'use strict';
const $ = id => document.getElementById(id);
const cfg = window.APP_CONFIG || {};
const sb = cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase
 ? window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true}}) : null;
let active=null, activities=[], activity=null, submissions=[],tokens=[];
let draftMode=false;
try{tokens=JSON.parse(localStorage.getItem('theory_v2_tokens')||'[]')}catch{tokens=[]}
const clean=x=>String(x??'').trim(),length=x=>[...clean(x).replace(/\s/g,'')].length;
const esc=x=>clean(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function notice(msg,error=false){let e=$('notice');e.textContent=msg;e.classList.remove('hidden');e.classList.toggle('error',error);e.scrollIntoView({block:'nearest',behavior:'smooth'})}
function err(e){return e?.message||String(e||'未知错误')}
function check(){if(!sb)throw Error('Supabase 尚未配置，请先核对 config.js 与页面脚本。')}
function show(name){for(const n of ['Submit','History','Admin']){$(n.toLowerCase()+'View')?.classList.toggle('hidden',n!==name);$('tab'+n).classList.toggle('active',n===name)}if(name==='Admin')verifyAdmin();if(name==='History')loadHistory()}
$('tabSubmit').onclick=()=>show('Submit');$('tabHistory').onclick=()=>show('History');$('tabAdmin').onclick=()=>show('Admin');
function asDate(s){return s?new Date(s):null}
function remaining(a){if(!a?.deadline)return '尚未设置截止时间';let ms=asDate(a.deadline)-Date.now();if(ms<=0)return '征集已截止';let days=Math.floor(ms/86400000),hours=Math.floor(ms%86400000/3600000),mins=Math.floor(ms%3600000/60000);return `距离截止还有 ${days}天 ${hours}小时 ${mins}分钟`}
function renderCountdown(){if(!active)return;let end=!!active.deadline&&new Date(active.deadline).getTime()<=Date.now();$('countdown').textContent=remaining(active);$('publicStatus').textContent=end?'已截止':'征集中';$('sendBtn').disabled=end}
setInterval(renderCountdown,60000);
async function loadPublic(){try{check();const {data,error}=await sb.rpc('get_active_activity');if(error)throw error;active=data?.[0]||null;
 $('publicTopic').textContent=active?.topic||'暂无开放学习活动';$('publicMonth').textContent=active?.study_month?`${active.study_month}月理论学习`:'本期理论学习';
 $('publicDeadline').textContent=active?.deadline?`截止：${new Date(active.deadline).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})}（北京时间）`:'';
 $('noticeText').textContent=active?.notice_text||'暂无通知';$('materialTitle').textContent=active?.material_title||'请根据本期学习主题阅读相关材料';
 const link=$('materialLink');link.classList.add('hidden');if(/^https:\/\//.test(active?.material_url||'')){link.href=active.material_url;link.classList.remove('hidden')}
 $('sendBtn').disabled=!active;renderCountdown();
 }catch(e){$('publicTopic').textContent='读取活动失败';$('sendBtn').disabled=true;notice('请检查数据库升级脚本是否运行：'+err(e),true)}}
$('reflection').oninput=()=>{$('wordCount').textContent=length($('reflection').value)+'字'};
$('submitForm').onsubmit=async e=>{e.preventDefault();try{check();if(!active)throw Error('暂无开放学习活动');if(active.deadline&&Date.now()>=new Date(active.deadline))throw Error('本期活动已截止');let f=Object.fromEntries(new FormData(e.target));let n=length(f.content);if(n<100||n>3000)throw Error('心得字数应在100～3000字之间');if(!/^20\d{2}$/.test(f.grade))throw Error('年级填写4位年份');if((n<200||n>300)&&!confirm(`目前${n}字，建议200～300字，仍要提交吗？`))return;
 $('sendBtn').disabled=true;const {data,error}=await sb.rpc('submit_reflection_v2',{p_activity_id:active.id,p_name:clean(f.name),p_grade:clean(f.grade),p_college:clean(f.college),p_content:clean(f.content)});if(error)throw error;const row=data?.[0];if(!row?.edit_token)throw Error('未收到恢复码，请联系管理员');tokens.unshift(row.edit_token);tokens=[...new Set(tokens)];localStorage.setItem('theory_v2_tokens',JSON.stringify(tokens));$('newToken').textContent=row.edit_token;$('recoveryAfterSubmit').classList.remove('hidden');$('submitForm').reset();notice('心得已提交。请复制保存下方恢复码，以便以后修改。');
 }catch(ex){notice(err(ex),true)}finally{renderCountdown()}};
$('copyToken').onclick=()=>navigator.clipboard.writeText($('newToken').textContent).then(()=>notice('恢复码已复制')).catch(()=>notice('复制失败，请长按恢复码手动复制',true));
$('recoverBtn').onclick=()=>{let t=clean($('recoveryInput').value);if(!/^[0-9a-f]{64}$/i.test(t)){notice('请输入提交时获得的64位恢复码',true);return}tokens.unshift(t);tokens=[...new Set(tokens)];localStorage.setItem('theory_v2_tokens',JSON.stringify(tokens));$('recoveryInput').value='';loadHistory()};
async function loadHistory(){let wrap=$('historyList');wrap.replaceChildren();if(!tokens.length){wrap.textContent='本设备暂未保存投稿。你可以在上方粘贴恢复码找回。';return}check();for(const token of tokens){const box=document.createElement('div');box.className='history-entry';box.textContent='读取中…';wrap.append(box);try{const {data,error}=await sb.rpc('get_my_reflection',{p_token:token});if(error)throw error;let r=data?.[0];if(!r){box.textContent='有一条恢复码无对应投稿（可能投稿已删除）。';continue}box.replaceChildren();let h=document.createElement('h3');h.textContent=`${r.study_month||'?'}月 · ${r.topic} / ${r.name}`;let state=document.createElement('p');state.className='muted';state.textContent=`${r.approved?'已审核':'待审核'} · 更新于 ${new Date(r.updated_at).toLocaleString('zh-CN')}`;let ta=document.createElement('textarea');ta.value=r.content;let b=document.createElement('button');b.className='primary';b.textContent='保存修改并重新送审';let a=document.createElement('button');a.className='ghost';a.textContent='复制恢复码';a.onclick=()=>navigator.clipboard.writeText(token).then(()=>notice('已复制恢复码'));b.onclick=async()=>{if(length(ta.value)<100||length(ta.value)>3000){notice('心得正文需100～3000字',true);return}b.disabled=true;try{let {error}=await sb.rpc('update_my_reflection',{p_token:token,p_content:clean(ta.value)});if(error)throw error;notice('已保存修改，审核状态已重置为待审核');await loadHistory()}catch(e){notice(err(e),true)}finally{b.disabled=false}};box.append(h,state,ta,b,a)}catch(e){box.textContent='查询失败：'+err(e)}}}

// --- 管理员 ---
function loginView(logged){$('loginCard').classList.toggle('hidden',logged);$('dashboard').classList.toggle('hidden',!logged)}
async function verifyAdmin(){try{check();const {data:{user},error:e1}=await sb.auth.getUser();if(e1)throw e1;if(!user){loginView(false);return}const {data,error}=await sb.from('admin_users').select('user_id').eq('user_id',user.id).maybeSingle();if(error)throw error;if(!data){loginView(false);notice('当前账号不在授权管理员名单中',true);return}loginView(true);await loadActivities()}catch(e){loginView(false);notice(err(e),true)}}
$('loginForm').onsubmit=async e=>{e.preventDefault();try{check();let f=Object.fromEntries(new FormData(e.target));let {error}=await sb.auth.signInWithPassword(f);if(error)throw error;await verifyAdmin()}catch(ex){notice(err(ex),true)}};
$('logoutBtn').onclick=async()=>{await sb.auth.signOut();loginView(false);notice('已退出登录')};
async function loadActivities(id){
 const {data,error}=await sb.from('activities').select('*').order('created_at',{ascending:false});
 if(error)throw error;
 activities=data||[];
 const sel=$('activitySelect');
 const wanted=id||sel.value||activities.find(a=>a.is_active)?.id||activities[0]?.id;
 sel.replaceChildren();
 for(const a of activities){
  const o=document.createElement('option');o.value=a.id;
  o.textContent=`${a.is_active?'● 正在征集 · ':'已关闭 · '}${a.study_month||'?'}月 · ${a.topic}`;
  sel.append(o);
 }
 if(wanted&&activities.some(a=>a.id===wanted))sel.value=wanted;
 await selectActivity();
}
$('activitySelect').onchange=selectActivity;
function formatBeijingInput(ts){if(!ts)return '';return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(ts)).replace(' ','T')}
async function selectActivity(){
 draftMode=false;
 activity=activities.find(a=>a.id===$('activitySelect').value)||null;
 const form=$('activityForm');
 submissions=[];
 renderList();
 $('activitySubmissionHint').textContent=activity
  ? `当前筛选：${activity.study_month||'?'}月 · ${activity.topic}。只显示和导出此活动的投稿。`
  : '尚未选中学习活动';
 if(!activity){form.reset();$('parseText').value='';$('draftTip').classList.add('hidden');return}
 $('draftTip').classList.add('hidden');
 for(const name of ['topic','college','activity_date','location','organizer','attendees','tweet','tweet_url','overview','study_month','material_title','material_url','meeting_format']){
  if(form.elements[name])form.elements[name].value=activity[name]??'';
 }
 form.elements.deadline_local.value=formatBeijingInput(activity.deadline);
 form.elements.is_active.checked=!!activity.is_active;
 $('parseText').value=activity.notice_text||'';
 await loadSubmissions();
}
// 智能提取：支持多行主题、【9月理论学习心得征集】、中文空格、多个网址及截止时间。
function parseNotice(raw){
 const s=clean(raw).replace(/\\\s*\r?\n/g,'\n').replace(/https\\\s*:/g,'https:').replace(/\\\s*\//g,'/').replace(/\r/g,'');
 const lines=s.split('\n').map(v=>clean(v)).filter(Boolean);
 const result={};
 // 优先识别通知标题里的月份，避免把截止时间“12月”误识别为学习月份。
 const header=s.match(/[【\[]\s*(\d{1,2})\s*月\s*(?:理论学习|学习心得)/)
   || s.match(/(?<!\d)(\d{1,2})\s*月\s*理论学习(?:心得征集|收集|通知|活动)?/);
 if(header && +header[1]>=1 && +header[1]<=12)result.study_month=+header[1];
 // 查找主题提示行，既支持下一行，也支持冒号同一行填写。
 const topicIndex=lines.findIndex(x=>/(?:现发布.*?理论学习主题|本期.*?理论学习主题|学习主题|^主题)\s*[：:]/.test(x));
 if(topicIndex>=0){
   const inline=lines[topicIndex].replace(/^.*?(?:理论学习主题|学习主题|主题)\s*[：:]\s*/, '').trim();
   const candidate=inline || lines.slice(topicIndex+1).find(x=>!/^\s*[[【（(🌹🌞☕]/.test(x)&&!/^学习(?:内容|材料)/.test(x));
   if(candidate)result.topic=candidate.replace(/^[“\"「]+|[”\"」]+$/g,'').slice(0,120);
 }
 if(!result.topic){
   let m=s.match(/(?:学习主题|围绕.*?主题)[：:]\s*([^\n]+)/);
   if(m)result.topic=clean(m[1]).slice(0,120);
 }
 const materialLine=lines.findIndex(x=>/(?:学习内容|学习材料|材料链接)\s*[：:]/.test(x));
 if(materialLine>=0){
   const vicinity=lines.slice(materialLine,materialLine+3).join(' ');
   const title=vicinity.match(/《([^》]+)》/);
   if(title)result.material_title='《'+title[1]+'》';
   else {
      let tail=lines[materialLine].replace(/^.*?(?:学习内容|学习材料|材料链接)\s*[：:]\s*/,'').replace(/https?:\/\/\S+/g,'').trim();
      if(tail)result.material_title=tail.slice(0,150);
   }
   const found=vicinity.match(/https?:\/\/[^\s<>】\]]+/);
   if(found)result.material_url=found[0].replace(/[，。,；;、）)]+$/,'');
 }
 if(!result.material_url){
   const urls=[...s.matchAll(/https?:\/\/[^\s<>】\]]+/g)].map(x=>x[0].replace(/[，。,；;、）)]+$/,''));
   result.material_url=urls.find(u=>/mp\.weixin\.qq\.com|gov\.cn|news\.cn|people\.com\.cn/.test(u))||urls.find(u=>!u.includes('docs.qq.com'))||'';
 }
 if(!result.material_url)delete result.material_url;
 // 明确“截止”“提交”“前”等上下文，避免把会议日期识别成截止时间。
 const deadlineChunk=lines.find(x=>/(?:截止|提交|报送|前】|前\]|前完成)/.test(x)&&/\d{1,2}\s*月\s*\d{1,2}\s*日/.test(x)) || '';
 const dm=deadlineChunk.match(/(?:(20\d{2})\s*年\s*)?(\d{1,2})\s*月\s*(\d{1,2})\s*日\s*(?:(\d{1,2})\s*(?:点|时|[:：])\s*(\d{1,2})?\s*分?)?/);
 if(dm){
   const now=new Date();
   const year=+(dm[1]||new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Shanghai',year:'numeric'}).format(now));
   const hh=+(dm[4]||17), mm=+(dm[5]||0);
   const validDate=new Date(Date.UTC(year,+dm[2]-1,+dm[3]));
   if(validDate.getUTCFullYear()===year&&validDate.getUTCMonth()===+dm[2]-1&&validDate.getUTCDate()===+dm[3]&&hh<=23&&mm<=59)
     result.deadline_local=`${year}-${dm[2].padStart(2,'0')}-${dm[3].padStart(2,'0')}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
 }
 return result;
}
$('parseBtn').onclick=()=>{
 const raw=$('parseText').value.trim();
 if(!raw)return notice('请先将完整的理论学习通知粘贴在上方，再点击智能提取。',true);
 const vals=parseNotice(raw),f=$('activityForm');
 let count=0;
 for(const [k,v] of Object.entries(vals)){
   if(!f.elements[k] || v===undefined || v==='')continue;
   f.elements[k].value=v;
   count++;
 }
 if(!count)return notice('没有识别到字段。请检查通知是否包含“学习主题”“学习内容”“X月理论学习”等格式；仍可手动填写。',true);
 const names={topic:'学习主题',study_month:'学习月份',material_title:'材料标题',material_url:'材料链接',deadline_local:'截止时间'};
 const missing=Object.keys(names).filter(k=>!(f.elements[k]?.value)).map(k=>names[k]);
 $('parseResult').textContent='已提取：'+Object.keys(vals).filter(k=>vals[k]!==undefined&&vals[k]!==''&&names[k]).map(k=>names[k]).join('、')+(missing.length?'；需人工补充：'+missing.join('、'):'；主要字段已识别')+'。请核对后保存。';
 $('parseResult').classList.remove('hidden');
 notice(`已识别并填入 ${count} 项。请检查截止时间年份和学习主题，确认后点击“保存活动”。`);
};
$('newActivityBtn').onclick=()=>{
 // 只在前端开草稿，保存前不写入数据库，不要求先输入主题。
 draftMode=true;
 activity={id:null,topic:'',college:'电子与信息学院',organizer:'华南理工大学电子与信息学院研究生会',is_active:false};
 $('activitySelect').value='';
 $('activityForm').reset();
 $('parseText').value='';
 $('activityForm').elements.college.value=activity.college;
 $('activityForm').elements.organizer.value=activity.organizer;
 $('draftTip').classList.remove('hidden');
 $('parseResult').classList.add('hidden');
 $('activitySubmissionHint').textContent='新建活动草稿：尚未保存到数据库。先粘贴通知，再智能提取，最后保存。';
 submissions=[];renderList();
 $('parseText').focus();
 notice('已创建空白草稿。请先粘贴学习通知，点击“智能提取通知信息”，核对后保存活动。');
};
$('activityForm').onsubmit=async e=>{
 e.preventDefault();
 if(!activity)return notice('请先点击“＋ 新建活动”或选择已有学习活动。',true);
 const f=e.target,vals={};
 for(const k of ['topic','college','activity_date','location','organizer','tweet','tweet_url','overview','material_title','material_url','meeting_format'])vals[k]=clean(f.elements[k].value);
 vals.attendees=Math.max(0,+f.elements.attendees.value||0);
 vals.study_month=+f.elements.study_month.value;
 vals.is_active=f.elements.is_active.checked;
 vals.notice_text=$('parseText').value;
 const local=clean(f.elements.deadline_local.value);
 vals.deadline=local?new Date(local+':00+08:00').toISOString():null;
 try{
   if(!(vals.study_month>=1&&vals.study_month<=12))throw Error('请填写正确的学习月份（1～12）');
   if(!vals.topic)throw Error('请填写或从通知中提取学习主题');
   if(vals.is_active){
     const old=activities.filter(a=>a.is_active&&a.id!==activity.id).map(a=>a.id);
     if(old.length){const r=await sb.from('activities').update({is_active:false}).in('id',old);if(r.error)throw r.error;}
   }
   let res;
   if(draftMode || !activity.id){res=await sb.from('activities').insert(vals).select('id').single();}
   else {res=await sb.from('activities').update(vals).eq('id',activity.id);}
   if(res.error)throw res.error;
   const id=res.data?.id||activity.id;
   draftMode=false;
   await loadActivities(id);
   await loadPublic();
   notice('活动已保存'+(vals.is_active?'并开放投稿':'（当前未开放投稿）')+'。');
 }catch(ex){notice('保存失败：'+err(ex),true)}
};

// 删除已发布活动前先核对数据库归属投稿数量；删除会触发 submissions 外键的 ON DELETE CASCADE。
$('closeActivityBtn').onclick=async()=>{
 if(!activity?.id)return notice('请先保存活动，再进行关闭操作',true);
 const a=activity;
 if(!a.is_active)return notice('该活动已处于关闭状态');
 if(!confirm(`关闭“${a.study_month||'?'}月 · ${a.topic}”吗？关闭后不能继续提交或修改，已提交心得保留。`))return;
 const {error}=await sb.from('activities').update({is_active:false}).eq('id',a.id);
 if(error)return notice('关闭失败：'+err(error),true);
 await loadActivities(a.id);await loadPublic();notice('已关闭活动，已有心得仍保留在该活动下。');
};
$('deleteActivityBtn').onclick=async()=>{
 if(!activity?.id)return notice('当前仅为未保存的草稿，不需要删除数据库记录',true);
 const a=activity;
 let {count,error:e}=await sb.from('submissions').select('id',{head:true,count:'exact'}).eq('activity_id',a.id);
 if(e)return notice('无法核查投稿数量：'+err(e),true);
 count=count||0;
 const label=`${a.study_month||'?'}月 · ${a.topic}`;
 if(!confirm(`【高风险操作】确定永久删除“${label}”吗？\n该活动下 ${count} 条心得也将一并永久删除（包括已审核和待审核），且无法撤销。\n如只是暂时停止征集，请点击“关闭当前活动”。`))return;
 const typed=prompt(`再次确认：请输入本活动的完整主题以删除 ${count} 条关联心得：\n${a.topic}`);
 if(typed!==a.topic)return notice('主题未完全匹配，已取消删除。',true);
 const {error}=await sb.from('activities').delete().eq('id',a.id);
 if(error)return notice('删除失败：'+err(error),true);
 await loadActivities();await loadPublic();notice(`已永久删除“${label}”及其 ${count} 条关联心得。`);
};

async function allRows(table,select,activityId,approvedOnly=false){let list=[],from=0;while(true){let query=sb.from(table).select(select).eq('activity_id',activityId).order('created_at',{ascending:true}).range(from,from+499);if(approvedOnly)query=query.eq('approved',true);let {data,error}=await query;if(error)throw error;list.push(...(data||[]));if(!data||data.length<500)break;from+=500;if(from>100000)throw Error('稿件过多，请分批导出')}return list}
async function loadSubmissions(){if(!activity?.id){submissions=[];renderList();return;}const id=activity.id;try{const rows=await allRows('submissions','*',id);if(activity?.id!==id)return;submissions=rows;renderList()}catch(e){notice('读取稿件失败：'+err(e),true)}}
$('refreshBtn').onclick=loadSubmissions;$('statusFilter').onchange=renderList;$('searchBox').oninput=renderList;
function make(tag,cls,txt){let el=document.createElement(tag);if(cls)el.className=cls;if(txt!==undefined)el.textContent=txt;return el}
function renderList(){
 const wrap=$('submissionList');wrap.replaceChildren();
 $('totalStat').textContent=submissions.length;
 $('approvedStat').textContent=submissions.filter(x=>x.approved).length;
 $('pendingStat').textContent=submissions.filter(x=>!x.approved).length;
 const f=$('statusFilter').value,q=clean($('searchBox').value).toLowerCase();
 const rows=submissions.filter(x=>(f==='all'||(f==='approved'?x.approved:!x.approved))&&[x.name,x.grade,x.content].some(v=>clean(v).toLowerCase().includes(q)));
 if(!rows.length){wrap.textContent='此活动暂无符合条件的稿件（其他活动投稿不会显示在这里）';return}
 for(const x of rows){
  const box=make('article','entry');
  const h=make('h3','entry-title',`${x.name} · ${x.grade}级 · ${x.college} · ${activity?.study_month||'?'}月 ${activity?.topic} · ${x.approved?'✓已审核':'待审核'}`);
  const p=make('p','entry-content',x.content);
  const actions=make('div','entry-actions');
  const approve=make('button','ghost',x.approved?'取消审核':'审核通过');approve.onclick=()=>modify(x.id,{approved:!x.approved});
  const edit=make('button','ghost','编辑');edit.onclick=async()=>{const content=prompt('编辑心得',x.content);if(content!==null){if(length(content)<100||length(content)>3000)return notice('字数需100～3000',true);await modify(x.id,{content:clean(content),approved:false})}};
  const move=make('button','ghost','调整主题');move.onclick=()=>moveSubmission(x);
  const del=make('button','ghost','删除心得');del.onclick=async()=>{if(!confirm(`确定永久删除${x.name}的这份投稿吗？`))return;const {error}=await sb.from('submissions').delete().eq('id',x.id).eq('activity_id',activity.id);if(error)notice(err(error),true);else await loadSubmissions()};
  actions.append(approve,edit,move,del);box.append(h,p,actions);wrap.append(box);
 }
}
async function moveSubmission(x){
 const available=activities.filter(a=>a.id!==x.activity_id);
 if(!available.length)return notice('还没有其他学习主题，请先创建新活动',true);
 const lines=available.map((a,i)=>`${i+1}. ${a.study_month||'?'}月 · ${a.topic}`);
 const answer=prompt(`把“${x.name}”的心得调整到哪个主题？\n请输入序号：\n${lines.join('\n')}`);
 if(answer===null)return;
 const n=Number(answer);
 if(!Number.isInteger(n)||n<1||n>available.length)return notice('无效序号，未修改',true);
 const target=available[n-1];
 if(!confirm(`确认把“${x.name}”的心得从“${activity.topic}”移动到“${target.topic}”吗？\n移动后将进入新活动的待审核列表，原活动导出不会再包含这份心得。`))return;
 const {error}=await sb.from('submissions').update({activity_id:target.id,approved:false}).eq('id',x.id).eq('activity_id',activity.id);
 if(error)return notice('调整失败（可能目标主题存在同姓名、同年级投稿）：'+err(error),true);
 await loadSubmissions();notice(`调整成功，已转至“${target.study_month||'?'}月 · ${target.topic}”并重置为待审核。`);
}
async function modify(id,changes){let {error}=await sb.from('submissions').update(changes).eq('id',id);if(error)notice(err(error),true);else await loadSubmissions()}

// --- 生成 PPT：保留上传封面的红色背景，标题/正文为可编辑的 PPT 文字框 ---
function drawSlideCanvas(title,subtitle,date,body){let can=document.createElement('canvas');can.width=1600;can.height=900;let ctx=can.getContext('2d');return new Promise((resolve,reject)=>{let img=new Image();img.onload=()=>{ctx.drawImage(img,0,0,1600,900);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.shadowColor='rgba(0,0,0,.25)';ctx.shadowBlur=8;ctx.font='bold 56px sans-serif';let t=clean(title);while(ctx.measureText(t).width>1430&&ctx.font.match(/\d+/)&&parseInt(ctx.font.match(/\d+/)[0])>30)ctx.font=`bold ${parseInt(ctx.font.match(/\d+/)[0])-2}px sans-serif`;ctx.fillText(t,800,300);ctx.font='38px sans-serif';ctx.fillText(subtitle,800,480);ctx.font='28px sans-serif';ctx.fillText(date,800,555);ctx.font='26px sans-serif';ctx.fillText('华南理工大学电子与信息学院研究生会',800,680);ctx.shadowBlur=0;resolve(can.toDataURL('image/png'))};img.onerror=()=>reject(Error('加载 PPT 红色背景图失败'));img.src='ppt-background.png'})}
async function coverData(a){return drawSlideCanvas(a.topic,'理论学习会',a.activity_date||`${a.study_month||''}月理论学习`)}
function fn(a,ext){return `【${a.study_month||'X'}月理论学习】电子与信息学院理论学习报告.${ext}`}
async function downloadBlob(blob,name){const file=new File([blob],name,{type:blob.type||'application/octet-stream'});if(navigator.canShare?.({files:[file]})&&navigator.share){try{await navigator.share({files:[file],title:name});return}catch(e){if(e.name==='AbortError')return}}const url=URL.createObjectURL(blob);let a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notice('已请求浏览器保存文件；手机请检查浏览器下载记录或文件 App。')}
// 原 Word 模板，保留原生表格和版式；使用 OOXML 将 PPT 预览/实拍图嵌入「附图」位置。
function imgDrawing(rid,idx,w=5100000,h=2870000){return `<w:p xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${w}" cy="${h}"/><wp:docPr id="${800+idx}" name="理论学习图${idx}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${idx}" name="学习配图${idx}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${w}" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`}
async function addImagesToDocx(zip,images){let xml=zip.file('word/document.xml').asText(),rel=zip.file('word/_rels/document.xml.rels').asText(),ct=zip.file('[Content_Types].xml').asText();let output='';for(let i=0;i<images.length;i++){let rid='rIdTheoImg'+i,file='theory_img_'+i+'.png';let buf=images[i].split(',')[1];zip.file('word/media/'+file,buf,{base64:true});rel=rel.replace('</Relationships>',`<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${file}"/></Relationships>`);output+=imgDrawing(rid,i,5100000,2870000)}
 if(!ct.includes('Extension="png"'))ct=ct.replace('</Types>','<Default Extension="png" ContentType="image/png"/></Types>');
 // Replace entire PPT_IMAGE placeholder paragraph; not only the text token
 const docXml=new DOMParser().parseFromString(xml,'application/xml');const W='http://schemas.openxmlformats.org/wordprocessingml/2006/main';let target=[...docXml.getElementsByTagNameNS(W,'p')].find(p=>p.textContent.includes('[[PPT_IMAGE]]'));if(!target)throw Error('Word模板中的PPT_IMAGE锚点不存在');const frag=new DOMParser().parseFromString('<root>'+output+'</root>','application/xml');if(frag.getElementsByTagName('parsererror').length)throw Error('插图结构生成失败');for(let n of [...frag.documentElement.childNodes])target.parentNode.insertBefore(docXml.importNode(n,true),target);target.parentNode.removeChild(target);xml=new XMLSerializer().serializeToString(docXml);
 zip.file('word/document.xml',xml);zip.file('word/_rels/document.xml.rels',rel);zip.file('[Content_Types].xml',ct)}
async function fileToDataURL(file){return new Promise((resolve,reject)=>{let r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file)})}
function normalizePng(data){return new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>{let c=document.createElement('canvas');let max=1500,scale=Math.min(1,max/im.width,max/im.height);c.width=Math.round(im.width*scale);c.height=Math.round(im.height*scale);c.getContext('2d').drawImage(im,0,0,c.width,c.height);resolve(c.toDataURL('image/png'))};im.onerror=reject;im.src=data})}
$('exportWordBtn').onclick=async()=>{let button=$('exportWordBtn');button.disabled=true;try{if(!activity)throw Error('尚未选择活动');if(!window.PizZip||!window.docxtemplater)throw Error('Word生成组件未加载');const selectedId=activity.id;let rows=await allRows('submissions','*',selectedId,true);if(activity?.id!==selectedId)throw Error('所选活动已变更，请重新导出');if(!rows.length)throw Error('没有已审核通过的心得');if(rows.length<3&&!confirm('当前审核通过少于3份，仍要导出吗？'))return;let response=await fetch('report-template.docx');if(!response.ok)throw Error('无法读取新版 Word 模板');let doc=new window.docxtemplater(new window.PizZip(await response.arrayBuffer()),{paragraphLoop:true,linebreaks:true,nullGetter:()=>''});doc.render({topic:activity.topic,date:activity.activity_date||'（待填写）',location:activity.location||'（待填写）',organizer:activity.organizer||'华南理工大学电子与信息学院研究生会',attendees:activity.attendees||'××',tweet:activity.tweet||'否',tweet_url:activity.tweet_url||'',overview:activity.overview||'（请补充实际学习会内容概要）',entries:rows.map((s,i)=>({number:i+1,college:s.college,grade:s.grade,name:s.name,content:s.content}))});let zip=doc.getZip();let images=[await coverData(activity),await drawSlideCanvas('学习主题',activity.topic,activity.material_title||'本期学习材料'),await drawSlideCanvas('学习内容概要',(activity.overview||'请由管理员补充学习要点').slice(0,46),activity.activity_date||'理论学习会')];for(let file of $('photoFiles').files){images.push(await normalizePng(await fileToDataURL(file)))}await addImagesToDocx(zip,images);let b=zip.generate({type:'blob',mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',compression:'DEFLATE'});await downloadBlob(b,fn(activity,'docx'));}catch(e){console.error(e);notice('Word导出失败：'+err(e),true)}finally{button.disabled=false}};

// 报道为基于真实数据的确定性草稿，不虚构参会人数、现场氛围和发言；可复制后再人工审核。
function newsText(a,rows){let date=clean(a.activity_date)||'（学习日期待补充）',count=a.attendees?`共${a.attendees}人参加`:'参加人数待补充';let p=[`电子与信息学院研究生会开展${a.study_month||'本'}月理论学习会`,`${date}，电子与信息学院研究生会开展${a.study_month||'本'}月理论学习活动。${count}，围绕“${a.topic}”主题进行学习交流。`,a.overview?clean(a.overview):`本次理论学习围绕“${a.topic}”展开。学习内容为《${a.material_title||'本期学习材料'}》。具体学习过程和实际开展情况请由组织者核实补充。`];if(rows.length){let chunks=rows.slice(0,8).map(r=>{let excerpt=clean(r.content).replace(/\s+/g,' ');let first=excerpt.match(/^.{20,135}?[。！？]/)?.[0]||excerpt.slice(0,115);return `${r.grade}级研究生${r.name}在心得中写道：“${first}”`});p.push('学习心得交流中，'+chunks.join('；')+'。')}p.push('下一步，学院研究生会将持续组织理论学习，引导青年学生结合专业学习和科研实践深化认识、积极交流。');return p.join('\n\n')}
$('exportNewsBtn').onclick=async()=>{try{let rows=await allRows('submissions','*',activity.id,true);$('newsOutput').value=newsText(activity,rows);$('newsPanel').classList.remove('hidden');$('newsPanel').scrollIntoView({behavior:'smooth'});notice('报道初稿已生成。请核实学习时间、人数、引述及现场情况后发布。')}catch(e){notice(err(e),true)}};
$('copyNewsBtn').onclick=()=>navigator.clipboard.writeText($('newsOutput').value).then(()=>notice('报道已复制')).catch(()=>notice('复制失败，请手动全选文本',true));
loadPublic();
