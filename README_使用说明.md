# 理论学习心得收集工具（GitHub Pages + Supabase）

## 功能

- 手机/电脑网页提交：姓名、年级、学院、学习心得，字数统计及建议 200～300 字提醒。
- 每场学习活动独立收集，可保留历史活动、设置当前开放活动。
- **最多 6 位管理员**，使用邮箱 + 密码登录；只有已登记的管理员可查看投稿、审核、修改、删除，以及导出 Word。
- 直接根据上传的校研会报告模板生成 DOCX，保留学习纪要表格与心得段落结构，自动编号，只导出审核通过的心得。照片区域留待负责人在 Word 中加入。
- 普通投稿人不能查询其他投稿人，管理员资格由 Supabase 数据库行级安全策略强制检查。

## 步骤一：创建 Supabase 项目

1. 在 https://supabase.com/dashboard 创建免费项目。
2. 进入 **SQL Editor**，复制 `database.sql` 全部内容并执行。它会创建表、投稿函数、管理员 RLS 权限和第一场示例学习活动。
3. 进入 **Project Settings → API Keys**（不同版本的页面名称可能略有差异），找到 **Project URL** 和 **publishable key**（如使用旧项目也可用 anon public key）。
4. 打开 `config.js`，将 `supabaseUrl` 和 `supabaseAnonKey` 换成上述两项。注意这两个是预期可公开的客户端值，**不可使用 service_role / secret key**。

## 步骤二：添加 6 位管理员

1. 进入 Supabase **Authentication → Users → Add user**，创建 6 个独立账号，设置不同邮箱/初始密码。一般可用“Auto Confirm User”以便直接登录（以后台页面实际选项为准）。管理员登录后应尽快自行改密码；推荐项目启用邮箱验证、密码安全和 MFA（Supabase 配置）。
2. 在 Users 列表复制每位账号的 **UUID**（不是邮箱）。
3. 在 SQL Editor 执行下列 SQL，替换 6 个占位符为真实 UUID：

```sql
insert into public.admin_users(user_id) values
('第1位管理员UUID'),('第2位管理员UUID'),('第3位管理员UUID'),
('第4位管理员UUID'),('第5位管理员UUID'),('第6位管理员UUID');
```

管理员表有数据库触发器，最多允许 6 个账号；非授权用户即使知道管理页面链接，也无法读取数据。增加/替换账号须在 Supabase 后台操作（删除原账号 admin_users 行后再新增）。注意，创建六个账号本身不会自动赋予管理员权，必须完成第 3 步的名单登记。

## 步骤三：上传 GitHub Pages

1. GitHub 新建公开仓库，例如 `theory-reflection`。
2. 将 `index.html`、`style.css`、`app.js`、`config.js`、`database.sql`、`report-template.docx` 和本说明上传仓库根目录。
3. 仓库 → **Settings → Pages → Build and deployment → Deploy from a branch**，选择 `main` 分支 `/ (root)`，保存。
4. GitHub Pages 发布后打开 `https://你的用户名.github.io/theory-reflection/`。可以转发到微信群，大家在手机浏览器填写；管理员从右上角入口登录。
5. 登录后可创建新的学习活动，编辑主题、日期、地点、学习纪要和推文链接；勾选“开放为当前收集活动”。
6. 审核投稿后点击“导出完整 Word”，将获得一份 `.docx` 文件。

## 数据与安全须知

- GitHub Pages 仅托管静态文件，**数据真实存储在你自己的 Supabase 项目中**；浏览器需要联网才能运行。
- Supabase 的 `public.submissions` 表没有开放访客的 SELECT 权限。访客只能通过 `submit_reflection` 函数写入待审核投稿，无法设置 `approved=true`。所有管理员读写权限都通过数据库 RLS 再次检查。
- 不要将管理员邮箱密码、Supabase secret/service_role 密钥放入 GitHub 仓库。
- 公开表单可能遇到机器人滥用：SQL 已限制内容长度、活动是否开放和姓名+年级重复投稿，但**不包含验证码和服务端限流**。正式大规模开放前，建议部署 Cloudflare Turnstile 配合服务端校验或 Supabase Edge Function 以防自动化滥用。
- 目前使用第三方 CDN 加载 Supabase JS、PizZip、Docxtemplater、FileSaver；如果学校网络无法访问这些域名，网页和 Word 导出功能可能受影响，可将依赖静态文件改为本地托管。
- 这是可部署的工具源码，**并没有替你创建 Supabase 项目或 GitHub 仓库**。上传之前需按步骤配置。
- 导出由管理员浏览器本地处理，正常情况下无需上传心得到额外文档生成服务。

## 常见问题

**为什么网页显示“尚未配置 Supabase”？** 需要修改 `config.js` 并提交到 GitHub。

**管理员登录后仍然提示未授权？** 检查后台 `admin_users` 是否正确插入了对应 Auth Users UUID。

**每次活动只能提交3份吗？** 不是，任意数量都可以提交，管理员筛选后导出。模板建议至少3份，每份200～300字。

**为什么页面在本地双击打开时导出失败？** 浏览器的 `file://` 安全限制可能阻止读取模板。请通过 GitHub Pages HTTPS 地址使用。

**如何让投稿内容不出现在 GitHub？** 不要手动上传数据；所有真实投稿只在 Supabase 数据库中，不会进入 GitHub 仓库。
