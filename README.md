# 报价单AI审核系统

基于 Next.js + Supabase + 阿里云百炼 的智能报价单审核工具。

## 功能特性

- 扫码上传报价单（Excel / PDF / 图片）
- AI自动审核数据完整性和计算准确性
- 审核结果实时反馈给提交人
- 后台管理查看全部审核记录
- 完全免费部署和运行

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 + React + Tailwind CSS |
| 后端 | Next.js API Routes |
| 数据库 | Supabase PostgreSQL |
| 文件存储 | Supabase Storage |
| OCR识别 | 阿里云百炼 Qwen-VL-Plus |
| 规则审核 | 阿里云百炼 qwen-plus + 本地规则引擎 |
| 部署 | Vercel（免费） |

## 快速部署指南

### 第一步：注册账号（5分钟）

#### 1.1 注册 GitHub 账号
1. 打开 https://github.com/signup
2. 填写邮箱、密码、用户名
3. 验证邮箱

#### 1.2 注册 Vercel 账号
1. 打开 https://vercel.com/signup
2. 选择 "Continue with GitHub" 用GitHub登录
3. 完成引导流程

#### 1.3 注册 Supabase 账号
1. 打开 https://supabase.com/
2. 点击 "Start your project"
3. 选择 "Continue with GitHub" 登录

#### 1.4 获取阿里云百炼 API Key
1. 打开 https://bailian.console.aliyun.com/
2. 用阿里云账号登录（没有就注册一个）
3. 点击左侧 "API-KEY 管理"
4. 创建新的 API Key，复制保存

### 第二步：创建 Supabase 项目（3分钟）

1. 在 Supabase Dashboard 点击 "New project"
2. 填写项目名称（如 `quote-audit`）
3. 选择地区（选最近的，如 Singapore 或 Tokyo）
4. 等待项目创建完成（约1分钟）

#### 2.1 获取连接信息
1. 进入项目 → 左侧 "Project Settings" → "API"
2. 复制以下两个值：
   - `Project URL` → 对应 `NEXT_PUBLIC_SUPABASE_URL`
   - `service_role secret` → 对应 `SUPABASE_SERVICE_ROLE_KEY`

#### 2.2 创建数据库表
1. 进入项目 → 左侧 "SQL Editor"
2. 新建查询，粘贴 `database.sql` 文件中的全部内容
3. 点击 "Run" 执行

### 第三步：部署到 Vercel（5分钟）

#### 3.1 上传代码到 GitHub
1. 在 GitHub 创建新仓库（如 `quote-audit-system`）
2. 将本项目代码推送上去：
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/你的用户名/quote-audit-system.git
   git push -u origin main
   ```

#### 3.2 在 Vercel 导入项目
1. 打开 Vercel Dashboard
2. 点击 "Add New Project"
3. 选择刚才创建的 GitHub 仓库
4. 点击 "Import"

#### 3.3 配置环境变量
在 Vercel 项目配置页面，添加以下环境变量：

| 变量名 | 值 |
|--------|-----|
| `NEXT_PUBLIC_SUPABASE_URL` | 你的 Supabase Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 你的 Supabase service_role key |
| `BAILIAN_API_KEY` | 你的百炼 API Key |
| `ADMIN_PASSWORD` | 你自己设的管理员密码 |

#### 3.4 部署
1. 点击 "Deploy"
2. 等待构建完成（约2分钟）
3. 部署成功后，Vercel 会提供域名（如 `https://quote-audit-system.vercel.app`）

### 第四步：生成二维码（1分钟）

1. 打开任意在线二维码生成器（如 https://cli.im/ ）
2. 填入你的 Vercel 域名
3. 生成二维码，下载保存
4. 打印出来，项目人员扫码即可使用

## 系统页面说明

| 页面 | 地址 | 用途 |
|------|------|------|
| 上传页 | `/` | 项目人员扫码进入，上传报价单 |
| 结果页 | `/result/记录ID` | 查看单次审核详情 |
| 后台页 | `/admin` | 管理员查看全部记录和统计 |

## 审核规则（V1.0）

### 文档级必填项
- 报价单标题不能为 `***` 或空
- 报价有效期必须填写

### 明细行级必填项
- 序号、商品名称、规格型号、品牌、单位、数量、不含税单价、税率、含税单价、含税金额
- 品牌字段必须独立填写，不能将规格型号中的文字误识别为品牌

### 计算校验
- 含税单价 = 不含税单价 × (1 + 税率)，保留两位小数
- 含税金额 = 含税单价 × 数量
- 税率缺失时，可根据含税单价和不含税单价自动反推

### 空行处理
- 核心字段全部为空的行为空行，自动跳过不报错

## 费用说明

| 项目 | 免费额度 | 10单/天预估费用 |
|------|---------|---------------|
| Vercel 部署 | 无限带宽 | 0元 |
| Supabase 数据库 | 500MB | 0元 |
| Supabase 存储 | 1GB | 0元 |
| 百炼 OCR (Qwen-VL) | 新用户100万Token | ~0.5元/月 |
| 百炼 LLM (qwen-plus) | 新用户100万Token | ~0.5元/月 |
| **合计** | | **约1元/月** |

## 文件目录结构

```
quote-audit-system/
├── app/
│   ├── api/
│   │   ├── upload/route.ts      # 文件上传和审核API
│   │   └── records/route.ts     # 记录查询API
│   ├── result/[id]/page.tsx     # 审核结果详情页
│   ├── admin/page.tsx           # 管理后台
│   ├── page.tsx                 # 上传首页
│   ├── layout.tsx               # 根布局
│   └── globals.css              # 全局样式
├── lib/
│   ├── supabase.ts              # Supabase客户端
│   ├── bailian.ts               # 百炼API封装
│   └── audit-engine.ts          # 本地规则引擎
├── types/
│   └── index.ts                 # TypeScript类型定义
├── database.sql                  # 数据库表结构
├── .env.local.example            # 环境变量模板
└── README.md                     # 本文件
```

## 本地开发（可选）

```bash
# 安装依赖
npm install

# 复制环境变量模板
cp .env.local.example .env.local
# 然后编辑 .env.local 填入你的实际配置

# 启动开发服务器
npm run dev
```

访问 http://localhost:3000

## 注意事项

1. **安全**：生产环境请修改 `app/admin/page.tsx` 中的默认密码 `admin123`
2. **文件大小**：Supabase免费版单个文件上限约50MB
3. **百炼额度**：新用户免费额度有效期90天，用完后按量计费（费用极低）
4. **数据备份**：建议定期导出 Supabase 数据库备份

## 后续优化建议

- 接入微信扫码登录（需要公众号/小程序）
- 添加邮件通知功能
- 支持更多报价单模板格式
- 添加审核历史趋势图表
