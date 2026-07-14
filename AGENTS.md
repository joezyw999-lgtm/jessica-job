# AGENTS.md

## 项目概览

**面经整理** - AI 驱动的面经图片识别与内容清洗工具。

### 核心功能

- 图片粘贴（Ctrl+V 粘贴截图，支持多图）
- AI 识别面经中的公司、岗位、行业、内容（视觉模型 + 结构化提取）
- AI 清洗面经内容（去除寒暄、水话、广告，保留有效信息）
- 结果表格展示与编辑
- CSV 导出
- Chrome 扩展程序（侧边栏快速识别）

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **AI**: 自定义 LLM API（OpenAI 兼容格式 / 豆包多模态）
- **数据库**: Supabase (PostgreSQL + Storage)
- **Chrome Extension**: Manifest V3

## 环境变量配置

部署时需要配置以下环境变量：

```bash
# LLM API（必填）
LLM_API_KEY=your-api-key
LLM_BASE_URL=https://api.example.com/v1
LLM_MODEL=gpt-4o

# Supabase（必填）
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## 目录结构

```
├── public/                      # 静态资源
│   ├── mianjing-chrome-extension.zip     # Chrome 扩展安装包
│   └── chrome-extension-manifest.json    # 扩展版本 manifest
├── chrome-extension/           # Chrome 扩展源码
│   ├── manifest.json
│   ├── sidepanel.html / .js / .css
│   ├── popup.html / .js / .css
│   └── background.js
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── extract/          # AI 图片面经识别 API
│   │   │   ├── extract-text/     # AI 文本面经识别 API
│   │   │   ├── clean/            # AI 内容清洗 API
│   │   │   ├── upload/           # 图片上传 API (Supabase Storage)
│   │   │   ├── records/          # 面经记录 CRUD API (分页+筛选)
│   │   │   ├── chrome-extension/ # 扩展下载与更新
│   │   ├── globals.css           # 全局样式
│   │   ├── layout.tsx            # 根布局
│   │   └── page.tsx              # 主页面（面经整理）
│   ├── components/               # 业务组件
│   │   ├── ui/                   # Shadcn UI 组件库
│   │   ├── ImagePastePanel.tsx   # 图片粘贴/上传面板
│   │   ├── TextExtractPanel.tsx  # 文本识别面板
│   │   ├── RecordList.tsx        # 左侧缩略图列表
│   │   ├── RecordTable.tsx       # 记录表格+分页+筛选
│   │   ├── RecordEditDialog.tsx  # 编辑弹窗
│   │   ├── ImagePreviewDialog.tsx # 图片预览弹窗
│   │   └── StatusBadge.tsx       # 状态徽章
│   ├── hooks/                    # 自定义 Hooks
│   │   ├── useDeviceId.ts        # 设备 ID 管理
│   │   ├── useRecords.ts         # 记录 CRUD + 分页查询
│   │   ├── useImageExtract.ts    # 图片识别流程
│   │   ├── useTextExtract.ts     # 文本识别流程
│   │   └── useGlobalPaste.ts     # 全局粘贴监听
│   ├── types/
│   │   └── interview.ts          # 面经记录类型定义
│   ├── lib/
│   │   ├── llm-client.ts         # LLM API 客户端
│   │   └── utils.ts              # 工具函数
│   └── storage/database/         # Supabase 客户端
│       ├── supabase-client.ts
│       └── shared/schema.ts
├── DESIGN.md                     # 设计规范
├── AGENTS.md                     # 本文件
├── package.json
└── tsconfig.json
```

## 构建与测试命令

```bash
pnpm install        # 安装依赖
pnpm dev            # 开发环境
pnpm build          # 构建
pnpm start          # 生产环境
pnpm ts-check       # TypeScript 类型检查
pnpm lint           # ESLint 检查
```

## API 接口

### POST /api/upload
上传面经图片到 Supabase Storage。

- **请求**: FormData，字段 `file` (图片文件)
- **响应**: `{ success: true, data: { imageUrl, fileKey, fileName } }`
- **限制**: JPG/PNG/GIF/WebP/BMP，最大 10MB

### POST /api/extract
AI 识别面经图片，提取结构化信息（含行业识别+内容清洗，一步到位）。

- **请求**: `{ imageUrl: string }` 或 `{ imageUrls: string[] }`
- **响应**: `{ success: true, data: { company, position, industry, content, originalContent } }`

### POST /api/extract-text
从文本中识别面经结构化信息。

- **请求**: `{ text: string }`
- **响应**: `{ success: true, data: { company, position, industry, content } }`

### POST /api/clean
AI 清洗面经内容，只保留有效信息。

- **请求**: `{ content: string }`
- **响应**: `{ success: true, data: { cleanedContent } }`

### GET /api/records
分页获取面经记录，支持筛选。

- **参数**:
  - `page` (默认 1)
  - `page_size` (默认 20)
  - `keyword` - 模糊搜索公司/岗位/内容
  - `company` / `position` / `industry` / `category` / `experienceType` / `country` - 精确筛选
- **响应**: `{ success: true, data: [...], pagination: { page, pageSize, total, hasMore } }`

### POST /api/records
新增面经记录（含去重：同设备+同公司+同岗位+内容前50字相同）。

- **请求**: `{ image_url, company, position, industry, content, original_content, status, device_id, ... }`
- **响应**: `{ success: true, data: { id, ... }, isDuplicate?: true }`

### PATCH /api/records/[id]
更新面经记录。

### DELETE /api/records/[id]
删除面经记录。

### POST /api/records/refresh-urls
批量刷新图片 URL（Supabase 公开 URL 一致性校验）。

## 编码规范

- TypeScript strict 模式，禁止隐式 any
- 函数参数和返回值必须有明确类型
- 前端组件使用 shadcn/ui，遵循其 API 风格
- 样式使用 Tailwind CSS
- 禁止在 JSX 中直接使用 `typeof window`、`Date.now()` 等动态数据

## 注意事项

- LLM API 配置缺失时，接口返回 500 并提示配置环境变量
- 图片通过 Supabase Storage 的 `images` bucket 存储，需设置为 Public
- AI 返回的 JSON 需要健壮解析（支持 markdown 代码块包裹、纯文本等情况）
- Chrome 扩展与主站通过 `device_id` 关联，扩展识别后直接写入数据库
