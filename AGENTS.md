# AGENTS.md

## 项目概览

**面经整理** - AI 驱动的面经图片识别与内容清洗工具 + 校招雷达全网信息采集系统。

### 核心功能

- 图片粘贴（Ctrl+V 粘贴截图，支持多图）
- AI 识别面经中的公司、岗位、内容（视觉模型 + 结构化提取）
- AI 清洗面经内容（去除寒暄、水话、广告，保留有效信息）
- 结果表格展示与编辑
- CSV 导出
- 校招雷达：AI 全网采集校园招聘信息（Web Search + LLM 分析 + 三层查重）

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **AI SDK**: coze-coding-dev-sdk (LLM + S3Storage + WebSearch)
- **AI 模型**: doubao-seed-2-0-pro-260215 (识别), doubao-seed-2-0-lite-260215 (清洗/校招分析)

## 目录结构

```
├── public/                 # 静态资源
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── extract/    # AI 面经识别+清洗 API
│   │   │   │   └── route.ts
│   │   │   ├── clean/      # AI 内容清洗 API (备用)
│   │   │   │   └── route.ts
│   │   │   ├── upload/     # 图片上传 API (S3)
│   │   │   │   └── route.ts
│   │   │   └── records/    # 面经记录 CRUD API (Supabase)
│   │   │       ├── route.ts
│   │   │       └── [id]/route.ts
│   │   │   ├── campus/     # 校招雷达 API
│   │   │   │   ├── search/       # 全网搜索+AI分析 (SSE)
│   │   │   │   │   └── route.ts
│   │   │   │   ├── records/      # 校招记录 CRUD + 查重
│   │   │   │   │   ├── route.ts
│   │   │   │   │   └── [id]/route.ts
│   │   │   │   └── search-tasks/ # 搜索任务查重
│   │   │   │       └── route.ts
│   │   ├── globals.css     # 全局样式
│   │   ├── layout.tsx      # 根布局
│   │   ├── page.tsx        # 主页面（面经整理）
│   │   └── campus/         # 校招雷达页面
│   │       └── page.tsx
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
│   ├── storage/database/   # Supabase 客户端
│   │   ├── supabase-client.ts
│   │   └── shared/schema.ts
│   └── lib/utils.ts        # 工具函数
├── DESIGN.md               # 设计规范
├── AGENTS.md               # 本文件
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
上传面经图片到对象存储。

- **请求**: FormData，字段 `file` (图片文件)
- **响应**: `{ success: true, data: { imageUrl, fileKey, fileName } }`
- **限制**: JPG/PNG/GIF/WebP/BMP，最大 10MB

### POST /api/extract
AI 识别面经图片，提取结构化信息（含行业识别+内容清洗，一步到位）。

- **请求**: `{ imageUrl: string }`
- **响应**: `{ success: true, data: { company, position, industry, content, originalContent } }`
- **模型**: doubao-seed-2-0-pro-260215 (支持多模态)

### POST /api/clean
AI 清洗面经内容，只保留有效信息。

- **请求**: `{ content: string }`
- **响应**: `{ success: true, data: { cleanedContent } }`
- **模型**: doubao-seed-2-0-lite-260215

### GET /api/records
获取所有面经记录（从 Supabase 数据库）。

- **响应**: `{ success: true, data: [...] }`

### POST /api/records
新增面经记录到数据库。

- **请求**: `{ image_url, company, position, industry, content, original_content, status }`
- **响应**: `{ success: true, data: { id, ... } }`

### PATCH /api/records/[id]
更新面经记录。

- **请求**: `{ company?, position?, industry?, content?, original_content?, status? }`
- **响应**: `{ success: true, data: { ... } }`

### DELETE /api/records/[id]
删除面经记录。

- **响应**: `{ success: true }`

### POST /api/campus/search
全网搜索校园招聘信息（SSE 流式响应）。

- **请求**: `{ forceRefresh?: boolean }`
- **响应**: SSE 事件流（event: start/progress/found/record/warning/complete/error）
- **模型**: doubao-seed-2-0-lite-260215 (分析)
- **查重**: 三层查重（搜索任务24h/链接24h/记录去重）

### GET /api/campus/records
获取校招记录列表（支持筛选和分页）。

- **参数**: `page`, `page_size`, `recruitment_type`, `year`, `source_type`, `keyword`, `status`
- **响应**: `{ success: true, data: [...], total, page, pageSize }`

### POST /api/campus/records
新增校招记录（含查重）。

- **请求**: `{ company_name, recruitment_type, year?, cohort?, theme?, positions?, locations?, requirements?, application_url?, source_url, source_name?, source_type?, description? }`
- **响应**: `{ success: true, data: { id, ... } }`

### PATCH /api/campus/records/[id]
更新校招记录。

- **请求**: `{ company_name?, recruitment_type?, year?, ... }`
- **响应**: `{ success: true, data: { ... } }`

### DELETE /api/campus/records/[id]
删除校招记录。

- **响应**: `{ success: true }`

### GET /api/campus/search-tasks
获取搜索任务历史和最近搜索时间。

- **响应**: `{ success: true, data: [...], lastSearchTime }`

## 编码规范

- TypeScript strict 模式，禁止隐式 any
- 函数参数和返回值必须有明确类型
- 使用 `Message` 类型从 `coze-coding-dev-sdk` 导入，而非手动定义
- 前端组件使用 shadcn/ui，遵循其 API 风格
- 样式使用 Tailwind CSS + 行内 style 覆盖自定义颜色（基于 DESIGN.md 配色）
- 禁止在 JSX 中直接使用 `typeof window`、`Date.now()` 等动态数据

## 注意事项

- `coze-coding-dev-sdk` 仅可在后端代码中使用，严禁前端引用
- 图片 URL 通过 `generatePresignedUrl` 生成，禁止自行拼接
- 上传文件名必须符合 S3 命名规范
- AI 返回的 JSON 需要健壮解析（支持 markdown 代码块包裹、纯文本等情况）
