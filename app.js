
'use strict';

const $ = id => document.getElementById(id);
const config = window.APP_CONFIG || {};

const configReady =
  /^https:\/\/[^/]+\.supabase\.co\/?$/.test(config.supabaseUrl || '') &&
  !!config.supabaseAnonKey &&
  !config.supabaseAnonKey.includes('YOUR-');

const sb = configReady && window.supabase
  ? window.supabase.createClient(
      config.supabaseUrl,
      config.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      }
    )
  : null;

let activePublic = null;
let activities = [];
let submissions = [];
let currentActivity = null;
let authedUser = null;

const fields = [
  'topic', 'college', 'activity_date', 'location',
  'organizer', 'attendees', 'tweet', 'tweet_url',
  'overview', 'is_active'
];

const clean = v => String(v ?? '').trim();
const countChars = s => [...clean(s).replace(/\s/g, '')].length;

function notice(msg, error = false) {
  const el = $('notice');
  el.textContent = msg;
  el.classList.remove('hidden');
  el.classList.toggle('error', error);
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function clearNotice() {
  $('notice').classList.add('hidden');
}

function show(tab) {
  clearNotice();
  $('publicView').classList.toggle('hidden', tab !== 'public');
  $('adminView').classList.toggle('hidden', tab !== 'admin');
  $('publicTab').classList.toggle('active', tab === 'public');
  $('adminTab').classList.toggle('active', tab === 'admin');
  if (tab === 'admin') verifyAdmin();
}

$('publicTab').onclick = () => show('public');
$('adminTab').onclick = () => show('admin');

function errText(error) {
  const msg = error?.message || '操作失败';
  if (msg.includes('Failed to fetch')) {
    return '网络连接失败，请检查 Supabase 配置及网络。';
  }
  if (msg.includes('Invalid login')) {
    return '邮箱或密码错误。';
  }
  return msg;
}

// 读取当前开放的学习活动
async function publicLoad() {
  if (!sb) {
    $('currentTopic').textContent = '尚未配置 Supabase';
    $('activityStatus').textContent = '未连接';
    $('sendBtn').disabled = true;
    notice('请先编辑 config.js，配置 Supabase URL 和密钥。', true);
    return;
  }

  try {
    const { data, error } = await sb.rpc('get_active_activity');
    if (error) throw error;

    activePublic = data?.[0] || null;
    $('currentTopic').textContent =
      activePublic?.topic || '暂未开放新的学习活动';
    $('currentCollege').textContent = activePublic?.college || '';
    $('activityStatus').textContent =
      activePublic ? '征集中' : '未开放';
    $('sendBtn').disabled = !activePublic;

    if (activePublic) {
      $('submitForm').elements.college.value = activePublic.college;
    }
  } catch (e) {
    $('currentTopic').textContent = '活动读取失败';
    $('sendBtn').disabled = true;
    notice(errText(e), true);
  }
}

// 字数统计
$('reflection').addEventListener('input', () => {
  $('wordCount').textContent =
    countChars($('reflection').value) + ' 字';
});

// 提交学习心得
$('submitForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!activePublic || !sb) {
    return notice('当前没有开放的学习活动。', true);
  }

  const form = e.target;
  const vals = Object.fromEntries(new FormData(form));
  const n = countChars(vals.content);

  if (n < 100 || n > 3000) {
    return notice('心得正文须在100～3000字之间；建议200～300字。', true);
  }

  if (!/^\d{4}$/.test(clean(vals.grade))) {
    return notice('年级请填写4位入学年份，如2026。', true);
  }

  if (n < 200 || n > 300) {
    if (!confirm(`目前心得为${n}字，建议200～300字。仍要提交吗？`)) {
      return;
    }
  }

  $('sendBtn').disabled = true;

  try {
    const { error } = await sb.rpc('submit_reflection', {
      p_activity_id: activePublic.id,
      p_name: clean(vals.name),
      p_grade: clean(vals.grade),
      p_college: clean(vals.college),
      p_content: clean(vals.content)
    });

    if (error) throw error;

    form.reset();
    $('reflection').dispatchEvent(new Event('input'));

    if (activePublic) {
      form.elements.college.value = activePublic.college;
    }

    notice('提交成功！你的心得已进入待审核列表。无需重复提交。');
  } catch (e) {
    notice(errText(e), true);
  } finally {
    $('sendBtn').disabled = false;
  }
});

// 验证管理员权限
async function verifyAdmin() {
  if (!sb) {
    notice('尚未配置 Supabase，无法登录。', true);
    return;
  }

  try {
    const { data: { user } } = await sb.auth.getUser();

    if (!user) {
      authedUser = null;
      displayLoggedOut();
      return;
    }

    const { data, error } = await sb
      .from('admin_users')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      authedUser = null;
      displayLoggedOut();
      notice('当前账号未被列入授权管理员名单。', true);
      return;
    }

    authedUser = user;
    $('loginCard').classList.add('hidden');
    $('dashboard').classList.remove('hidden');

    await refreshActivities();
  } catch (e) {
    displayLoggedOut();
    notice(errText(e), true);
  }
}

function displayLoggedOut() {
  $('loginCard').classList.remove('hidden');
  $('dashboard').classList.add('hidden');
}

// 管理员登录
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!sb) return;

  const { email, password } =
    Object.fromEntries(new FormData(e.target));

  try {
    const { error } = await sb.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await verifyAdmin();
  } catch (err) {
    notice(errText(err), true);
  }
});

// 退出登录
$('logoutBtn').onclick = async () => {
  if (sb) await sb.auth.signOut();

  authedUser = null;
  displayLoggedOut();
  notice('已安全退出管理员账号。');
};

// 加载活动
async function refreshActivities(preferred) {
  const { data, error } = await sb
    .from('activities')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  activities = data || [];
  const sel = $('activitySelect');

  const wanted =
    preferred ||
    sel.value ||
    activities.find(a => a.is_active)?.id ||
    activities[0]?.id;

  sel.replaceChildren();

  for (const a of activities) {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent =
      `${a.is_active ? '● 当前开放 · ' : ''}` +
      `${a.topic} (${a.activity_date || '未设日期'})`;
    sel.append(opt);
  }

  if (wanted && activities.some(a => a.id === wanted)) {
    sel.value = wanted;
  }

  await chooseActivity();
}

$('activitySelect').onchange = () => chooseActivity();

async function chooseActivity() {
  currentActivity = activities.find(
    a => a.id === $('activitySelect').value
  ) || null;

  const form = $('activityForm');

  if (!currentActivity) {
    form.reset();
    submissions = [];
    renderSubmissions();
    return;
  }

  for (const f of fields) {
    const input = form.elements[f];
    if (!input) continue;

    if (input.type === 'checkbox') {
      input.checked = !!currentActivity[f];
    } else {
      input.value = currentActivity[f] ?? '';
    }
  }

  await refreshSubmissions();
}

// 保存活动信息
$('activityForm').onsubmit = async e => {
  e.preventDefault();

  if (!currentActivity) return;

  const values = {};

  for (const f of fields) {
    const input = e.target.elements[f];

    values[f] = input.type === 'checkbox'
      ? input.checked
      : f === 'attendees'
        ? Math.max(0, Number(input.value) || 0)
        : clean(input.value);
  }

  try {
    if (values.is_active) {
      const ids = activities
        .filter(a => a.is_active && a.id !== currentActivity.id)
        .map(a => a.id);

      if (ids.length) {
        const r = await sb
          .from('activities')
          .update({ is_active: false })
          .in('id', ids);

        if (r.error) throw r.error;
      }
    }

    const { error } = await sb
      .from('activities')
      .update(values)
      .eq('id', currentActivity.id);

    if (error) throw error;

    await refreshActivities(currentActivity.id);
    await publicLoad();

    notice('活动信息已保存。');
  } catch (err) {
    notice('保存失败：' + errText(err), true);
  }
};

// 新建活动
$('newActivityBtn').onclick = async () => {
  const topic = prompt('请输入新学习活动主题：');
  if (!topic?.trim()) return;

  try {
    const { data, error } = await sb
      .from('activities')
      .insert({
        topic: topic.trim(),
        college: '电子与信息学院',
        organizer: '华南理工大学电子与信息学院研究生会',
        is_active: false
      })
      .select('id')
      .single();

    if (error) throw error;

    await refreshActivities(data.id);
    notice('新活动已创建。填写信息后勾选“开放为当前收集活动”并保存即可。');
  } catch (e) {
    notice(errText(e), true);
  }
};

// 加载心得投稿
async function refreshSubmissions() {
  if (!currentActivity) return;

  const { data, error } = await sb
    .from('submissions')
    .select('*')
    .eq('activity_id', currentActivity.id)
    .order('created_at', { ascending: true });

  if (error) {
    notice(errText(error), true);
    return;
  }

  submissions = data || [];
  renderSubmissions();
}

$('refreshBtn').onclick = () => refreshSubmissions();
$('statusFilter').onchange = () => renderSubmissions();
$('searchBox').oninput = () => renderSubmissions();

function make(tag, cls, text) {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = String(text);
  return el;
}

// 显示投稿列表
function renderSubmissions() {
  const wrap = $('submissionList');
  wrap.replaceChildren();

  $('totalStat').textContent = submissions.length;
  $('approvedStat').textContent =
    submissions.filter(s => s.approved).length;
  $('pendingStat').textContent =
    submissions.filter(s => !s.approved).length;

  const filter = $('statusFilter').value;
  const query = clean($('searchBox').value).toLowerCase();

  const rows = submissions.filter(s =>
    (filter === 'all' ||
      (filter === 'approved' ? s.approved : !s.approved)) &&
    [s.name, s.grade, s.college, s.content].some(t =>
      String(t || '').toLowerCase().includes(query)
    )
  );

  if (!rows.length) {
    wrap.append(make('p', 'muted', '该筛选条件下暂无投稿。'));
    return;
  }

  for (const s of rows) {
    const item = make('article', 'entry');
    const head = make('div', 'entry-top');
    const title = make('div');

    const name = make(
      'div',
      'entry-title',
      `${s.name} · ${s.grade}级 · ${s.college}`
    );

    const meta = make(
      'div',
      'entry-meta',
      `提交时间 ${new Date(s.created_at).toLocaleString('zh-CN')} · ${countChars(s.content)} 字`
    );

    const status = make(
      'span',
      'status' + (s.approved ? ' good' : ''),
      s.approved ? '已通过' : '待审核'
    );

    const body = make('p', 'entry-content', s.content);
    const buttons = make('div', 'entry-actions');

    title.append(name, meta);
    head.append(title, status);

    const approve = make(
      'button',
      'mini',
      s.approved ? '撤回通过' : '审核通过'
    );
    approve.onclick = () => changeApproval(s, !s.approved);

    const edit = make('button', 'mini', '编辑内容');
    edit.onclick = () => editSubmission(s);

    const del = make('button', 'mini danger', '删除');
    del.onclick = () => deleteSubmission(s);

    buttons.append(approve, edit, del);
    item.append(head, body, buttons);
    wrap.append(item);
  }
}

// 审核心得
async function changeApproval(s, val) {
  try {
    const { error } = await sb
      .from('submissions')
      .update({ approved: val })
      .eq('id', s.id);

    if (error) throw error;
    await refreshSubmissions();
  } catch (e) {
    notice(errText(e), true);
  }
}

// 编辑心得
async function editSubmission(s) {
  const newValue = prompt(
    `修改 ${s.name} 的心得内容：`,
    s.content
  );

  if (newValue === null) return;

  if (countChars(newValue) < 100 || countChars(newValue) > 3000) {
    return notice('正文长度须在100～3000字之间。', true);
  }

  try {
    const { error } = await sb
      .from('submissions')
      .update({ content: newValue.trim() })
      .eq('id', s.id);

    if (error) throw error;

    await refreshSubmissions();
    notice('修改已保存。');
  } catch (e) {
    notice(errText(e), true);
  }
}

// 删除心得
async function deleteSubmission(s) {
  if (!confirm(`确定永久删除 ${s.name} 的这份心得吗？操作无法撤销。`)) {
    return;
  }

  try {
    const { error } = await sb
      .from('submissions')
      .delete()
      .eq('id', s.id);

    if (error) throw error;

    await refreshSubmissions();
    notice('投稿已删除。');
  } catch (e) {
    notice(errText(e), true);
  }
}

function filenameSafe(s) {
  return String(s)
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .slice(0, 70);
}

// 导出完整 Word
$('exportBtn').onclick = async () => {
  if (!currentActivity) {
    return notice('请先选择一场学习活动。', true);
  }

  const rows = submissions.filter(s => s.approved);

  if (!rows.length) {
    return notice('没有已通过的心得，请先进行审核。', true);
  }

  if (rows.length < 3 &&
      !confirm(`当前仅${rows.length}份已通过心得，模板建议至少3份。仍要导出吗？`)) {
    return;
  }

  const btn = $('exportBtn');
  btn.disabled = true;
  btn.textContent = '正在生成…';

  try {
    if (!window.PizZip || !window.docxtemplater || !window.saveAs) {
      throw Error('Word 导出组件未成功加载，请联网后刷新网页。');
    }

    const res = await fetch('report-template.docx', {
      cache: 'no-store'
    });

    if (!res.ok) {
      throw Error('未找到报告模板文件 report-template.docx');
    }

    const zip = new window.PizZip(await res.arrayBuffer());

    const doc = new window.docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
      nullGetter: () => ''
    });

    const a = currentActivity;

    doc.render({
      college: a.college || '电子与信息学院',
      topic: a.topic || '',
      date: a.activity_date || '',
      location: a.location || '',
      organizer: a.organizer ||
        `华南理工大学${a.college}研究生会`,
      overview: a.overview || '（待补充学习内容概要）',
      attendees: a.attendees || '××',
      tweet: a.tweet || '否',
      tweet_url: a.tweet_url || '',
      entries: rows.map((s, i) => ({
        number: i + 1,
        college: s.college || a.college,
        grade: s.grade,
        name: s.name,
        content: s.content
      }))
    });

    const blob = doc.getZip().generate({
      type: 'blob',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      compression: 'DEFLATE'
    });

    window.saveAs(
      blob,
      `【${new Date().getMonth() + 1}月理论学习】${filenameSafe(a.college)}-${filenameSafe(a.topic)}.docx`
    );

    notice(`已生成包含${rows.length}份审核通过心得的Word报告。学习开展照片请在Word中补充。`);
  } catch (e) {
    console.error(e);
    notice('导出失败：' + errText(e), true);
  } finally {
    btn.disabled = false;
    btn.textContent = '导出完整 Word';
  }
};

// 初始化
publicLoad();
