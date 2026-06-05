# AGENTS.md

## 项目概览

**面经识客** - AI 驱动的面经图片识别与内容清洗工具。用户上传面试经验截图，AI 自动识别公司名称、岗位信息和面经内容，并智能清洗冗余信息，只保留有效面试干货。

### 核心功能

- 图片粘贴（Ctrl+V 粘贴截图，支持多图）
- AI 识别面经中的公司、岗位、内容（视觉模型 + 结构化提取）
- AI 清洗面经内容（去除寒暄、水话、广告，保留有效信息）
- 结果表格展示与编辑
- CSV 导出

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **AI SDK**: coze-coding-dev-sdk (LLM + S3Storage)
- **AI 模型**: doubao-seed-2-0-pro-260215 (识别), doubao-seed-2-0-lite-260215 (清洗)

## 目录结构

```
├── public/                 # 静态资源
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── extract/    # AI 面经识别 API
│   │   │   │   └── route.ts
│   │   │   ├── clean/      # AI 内容清洗 API
│   │   │   │   └── route.ts
│   │   │   └── upload/     # 图片上传 API (S3)
│   │   │       └── route.ts
│   │   ├── globals.css     # 全局样式
│   │   ├── layout.tsx      # 根布局
│   │   └── page.tsx        # 主页面（单页应用）
│   ├── components/ui/      # Shadcn UI 组件库
│   ├── hooks/              # 自定义 Hooks
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
AI 识别面经图片，提取结构化信息。

- **请求**: `{ imageUrl: string }`
- **响应**: `{ success: true, data: { company, position, content } }`
- **模型**: doubao-seed-2-0-pro-260215 (支持多模态)

### POST /api/clean
AI 清洗面经内容，只保留有效信息。

- **请求**: `{ content: string }`
- **响应**: `{ success: true, data: { cleanedContent } }`
- **模型**: doubao-seed-2-0-lite-260215

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
