# 面经整理 - 项目交接文档

## 一、项目概述

**面经整理**是一个 AI 驱动的面经图片识别与内容清洗工具，帮助求职者快速将面经截图转化为结构化信息。

### 核心功能

| 功能 | 说明 |
|------|------|
| 图片粘贴识别 | Ctrl+V 粘贴截图（支持多图），AI 识别公司、岗位、行业、内容 |
| 纯文字识别 | 粘贴面经文字，AI 提取结构化信息 |
| AI 内容清洗 | 去除寒暄、水话、广告，保留面试问题（不删减精简面试问题） |
| 结果表格展示 | 可编辑、可展开、可预览图片、支持分页加载 |
| 多图预览灯箱 | 同一记录多张图可左右切换查看 |
| CSV 导出 | 一键导出为 CSV 文件 |
| Chrome 扩展 | 侧边栏快捷识别，支持图片/文字粘贴 |
| 数据持久化 | Supabase 数据库存储，刷新不丢失 |
| 扩展↔网页同步 | 扩展识别结果直接写入数据库，网页端自动同步 |

### 在线地址

| 环境 | 地址 | 说明 |
|------|------|------|
| Vercel 生产环境 | https://jessica-job.vercel.app | 主部署环境 |

---

## 二、技术架构

### 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **AI**: 自定义 LLM API（OpenAI 兼容格式 / 豆包多模态）
- **数据库**: Supabase (PostgreSQL)
- **对象存储**: Supabase Storage (images bucket)
- **包管理器**: pnpm（严禁使用 npm/yarn）

### 目录结构

```
├── public/
│   ├── mianjing-chrome-extension.zip     # 预构建的扩展 ZIP
│   └── chrome-extension-manifest.json    # 扩展版本信息
├── chrome-extension/                     # Chrome 扩展源码
│   ├── manifest.json
│   ├── sidepanel.html / .js / .css
│   ├── popup.html / .js / .css
│   ├── background.js
│   └── icon*.png
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── extract/route.ts          # AI 图片识别+清洗（多模态）
│   │   │   ├── extract-text/route.ts     # AI 纯文字识别+清洗
│   │   │   ├── clean/route.ts            # AI 内容清洗（独立接口）
│   │   │   ├── upload/route.ts           # 图片上传到 Supabase Storage
│   │   │   ├── records/route.ts          # 面经记录 CRUD（分页+筛选）
│   │   │   ├── records/[id]/route.ts     # 单条记录操作
│   │   │   ├── records/refresh-urls/route.ts  # 刷新图片 URL
│   │   │   └── chrome-extension/
│   │   │       ├── download/route.ts     # 下载扩展 ZIP
│   │   │       └── update/route.ts       # 扩展更新检查
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                      # 主页面（面经整理）
│   ├── components/
│   │   ├── ui/                           # shadcn/ui 组件库
│   │   ├── ImagePastePanel.tsx           # 图片粘贴上传面板
│   │   ├── TextExtractPanel.tsx          # 文本识别面板
│   │   ├── RecordList.tsx                # 左侧缩略图列表
│   │   ├── RecordTable.tsx               # 右侧记录表格（分页+筛选）
│   │   ├── RecordEditDialog.tsx          # 编辑弹窗
│   │   ├── ImagePreviewDialog.tsx        # 图片预览弹窗
│   │   └── StatusBadge.tsx               # 状态徽章
│   ├── hooks/
│   │   ├── useDeviceId.ts                # 设备 ID 管理
│   │   ├── useRecords.ts                 # 记录 CRUD + 分页查询
│   │   ├── useImageExtract.ts            # 图片识别流程
│   │   ├── useTextExtract.ts             # 文本识别流程
│   │   └── useGlobalPaste.ts             # 全局粘贴监听
│   ├── types/interview.ts                # 类型定义
│   ├── lib/
│   │   ├── llm-client.ts                 # LLM API 客户端（自定义）
│   │   └── utils.ts
│   └── storage/database/
│       ├── supabase-client.ts            # Supabase 客户端
│       └── shared/schema.ts              # 数据库 schema 定义
├── .coze                                  # Coze 部署配置（保留用于开发）
├── AGENTS.md                              # 项目规范文件
├── DESIGN.md                              # 设计规范文件
├── HANDOVER.md                            # 本文件
├── package.json
└── tsconfig.json
```

---

## 三、数据库

### Supabase 实例

- **项目 URL**: `https://ngkxjqpipjoqfagbnmqb.supabase.co`
- **区域**: 全球（Supabase 免费版）

### 核心表：mianjing_records

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar (PK) | UUID |
| image_url | text | 主图 URL |
| image_file_key | varchar | Supabase Storage 文件 key |
| image_urls | text | JSON 数组，多图 URL 列表 |
| company | varchar | 公司 |
| position | varchar | 岗位+面试轮次（如"产品经理一面"） |
| industry | varchar | 行业 |
| original_content | text | AI 原始识别内容 |
| content | text | 清洗后内容 |
| status | varchar | 状态：extracting / done |
| device_id | varchar | 设备标识（用于去重和简单隔离） |
| category | varchar | 分类 |
| experience_type | varchar | 经验类型 |
| country | varchar | 国家 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### 其他表（历史遗留，功能已下线）

- `campus_records` — 校招雷达记录
- `campus_search_tasks` — 校招搜索任务
- `recruitment_records` — 招聘信息记录
- `wechat_import_tasks` / `wechat_import_images` — 公众号导入任务

> 这些表对应的功能代码已删除，表仍保留在数据库中，可按需清理。

### Storage

- **Bucket**: `images`（需设置为 Public）
- 用于存储面经截图

---

## 四、API 接口

### 图片上传

```
POST /api/upload
Content-Type: multipart/form-data
字段: file (图片文件)
限制: JPG/PNG/GIF/WebP/BMP, 最大 10MB
响应: { success: true, data: { imageUrl, fileKey, fileName } }
```

### AI 图片识别+清洗

```
POST /api/extract
Content-Type: application/json
Body: { imageUrl: string } 或 { imageUrls: string[] }
响应: { success: true, data: { company, position, industry, content, originalContent } }
```

### AI 文字识别+清洗

```
POST /api/extract-text
Content-Type: application/json
Body: { text: string }
响应: { success: true, data: { company, position, industry, content, originalContent } }
```

### AI 内容清洗

```
POST /api/clean
Content-Type: application/json
Body: { content: string }
响应: { success: true, data: { cleanedContent } }
```

### 面经记录 CRUD

```
GET    /api/records                    # 分页查询（支持筛选）
POST   /api/records                    # 新增记录（含去重）
PATCH  /api/records/[id]               # 更新记录
DELETE /api/records/[id]               # 删除记录
POST   /api/records/refresh-urls       # 刷新图片 URL
```

**GET /api/records 参数**:
- `page` - 页码，默认 1
- `page_size` - 每页数量，默认 20
- `keyword` - 模糊搜索（公司/岗位/内容）
- `company` / `position` / `industry` / `category` / `experienceType` / `country` - 精确筛选
- 响应: `{ data: [...], pagination: { page, pageSize, total, hasMore } }`

**POST /api/records 去重规则**:
- 同设备 + 同公司 + 同岗位 + 内容前 50 字相同 → 判定为重复，返回已有记录

### Chrome 扩展

```
GET  /api/chrome-extension/download  # 下载扩展 ZIP
GET  /api/chrome-extension/update    # 扩展更新检查
```

### CORS

所有 API 已添加 `Access-Control-Allow-Origin: *` 和 OPTIONS 预检处理，支持扩展跨域调用。

---

## 五、Chrome 扩展

### 架构

- **Manifest V3** + Side Panel API
- 侧边栏 UI：`sidepanel.html` + `sidepanel.js` + `sidepanel.css`
- 后台脚本：`background.js`
- 统一粘贴区：自动检测粘贴内容是图片还是文字

### 数据同步机制

扩展识别完成后的数据流：

```
扩展识别 → 调用 POST /api/records 直接保存到数据库
         → 派发 CustomEvent('mianjing-data-changed') 通知网页刷新
         → 网页端轮询（15s）+ 可见性触发刷新
```

### 扩展设置

- **API 地址**：默认 `https://jessica-job.vercel.app`，可在设置面板修改
- **设备 ID**：显示在设置面板，用于与网页端同步
- **版本号**：在 manifest.json 中维护，当前 2.5.0

### 扩展更新

修改 `chrome-extension/` 下的文件后：
1. 更新 `manifest.json` 的 `version`
2. 用 archiver 重新打包 ZIP 到 `public/mianjing-chrome-extension.zip`
3. 同步更新 `public/chrome-extension-manifest.json`
4. 部署后用户重新下载安装

---

## 六、AI 识别与清洗规则

### 识别规则（extract / extract-text）

1. 从面经中提取：公司、岗位（含面试轮次如一面/二面/群面/初面/终面）、行业、内容
2. 岗位字段格式示例：`产品经理一面`、`群面`、`数据分析终面`
3. 行业必须从指定列表中选择（57 个行业，详见 INDUSTRY_LIST）
4. 内容只保留面试问题，不需要总结答案或回答要点

### 清洗规则

1. 去除寒暄、水话、广告等无效信息
2. 只保留面试问题
3. **禁止删减或精简面试问题**（问题必须完整保留原文）
4. 不需要总结面经中的答案或回答要点

---

## 七、环境变量配置

部署时需要配置以下环境变量：

| 变量 | 必填 | 说明 |
|------|------|------|
| `LLM_API_KEY` | ✅ | LLM API Key |
| `LLM_BASE_URL` | ✅ | API Base URL，如 `https://api.example.com/v1` |
| `LLM_MODEL` | ✅ | 模型名称，如 `gpt-4o`、`doubao-seed-2-0-pro-260215` |
| `SUPABASE_URL` | ✅ | Supabase 项目 URL |
| `SUPABASE_ANON_KEY` | ✅ | Supabase anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | Supabase service_role key（服务端使用） |

### 图片识别注意事项

如果使用的 LLM 模型支持视觉（图片识别），直接配置即可。
如果模型不支持图片，需要使用支持多模态的模型（如 GPT-4o、豆包 seed-pro 等）。

---

## 八、构建与部署

### 本地开发

```bash
pnpm install      # 安装依赖
pnpm dev          # 启动开发服务器（端口 5000）
```

### 生产构建

```bash
pnpm install       # 安装依赖
pnpm build         # 构建
pnpm start         # 启动生产服务
```

### Vercel 部署

连接 GitHub 仓库 `https://github.com/joezyw999-lgtm/jessica-job.git`，push 到 main 自动部署。

在 Vercel 项目设置中配置上述环境变量。

---

## 九、已知问题与注意事项

1. **Vercel 需 VPN**：vercel.app 域名国内无法直连
2. **扩展需重新安装**：扩展代码更新后，用户需重新下载安装才能生效
3. **历史遗留数据库表**：campus_records、recruitment_records 等表的功能已下线，可按需清理
4. **Supabase Storage**：images bucket 必须设置为 Public，否则图片无法访问
5. **LLM 模型选择**：图片识别需要使用支持视觉/多模态的模型

---

## 十、GitHub 仓库

- 地址：https://github.com/joezyw999-lgtm/jessica-job.git
- 分支：main
- 协作：push 到 main 后 Vercel 自动部署

---
