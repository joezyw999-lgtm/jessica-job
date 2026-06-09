# 面经整理 - 项目交接文档

## 一、项目概述

**面经整理**是一个 AI 驱动的面经图片识别与内容清洗工具，帮助求职者快速将面经截图转化为结构化信息。

### 核心功能

| 功能 | 说明 |
|------|------|
| 图片粘贴识别 | Ctrl+V 粘贴截图（支持多图），AI 识别公司、岗位、面试轮次、内容 |
| 纯文字识别 | 粘贴面经文字，AI 提取结构化信息 |
| AI 内容清洗 | 去除寒暄、水话、广告，保留面试问题（不删减精简面试问题） |
| 结果表格展示 | 可编辑、可展开、可预览图片 |
| 多图预览灯箱 | 同一记录多张图可左右切换查看 |
| CSV 导出 | 一键导出为 CSV 文件 |
| Chrome 扩展 | 侧边栏快捷识别，支持图片/文字粘贴 |
| 数据持久化 | Supabase 数据库存储，刷新不丢失 |
| 扩展↔网页同步 | 扩展识别结果自动同步到网页（executeScript 事件传递） |

### 在线地址

| 环境 | 地址 | 说明 |
|------|------|------|
| Coze 生产环境 | https://b7e913e5-0d09-443d-a560-7d16316d211f.dev.coze.site | 国内直连，主力使用 |
| Vercel 备用 | https://jessica-job.vercel.app | 需 VPN，仅作备用展示 |

---

## 二、技术架构

### 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **AI SDK**: coze-coding-dev-sdk（LLM + S3Storage）
- **AI 模型**: doubao-seed-2-0-pro-260215（识别）、doubao-seed-2-0-lite-260215（清洗）
- **数据库**: Supabase (PostgreSQL)
- **对象存储**: S3 兼容存储（通过 coze-coding-dev-sdk 的 S3Storage）
- **包管理器**: pnpm（严禁使用 npm/yarn）

### 目录结构

```
├── public/
│   └── mianjing-chrome-extension.zip   # 预构建的扩展 ZIP
├── scripts/
│   ├── build.sh     # 生产构建脚本（打包扩展 + next build）
│   ├── dev.sh       # 开发启动脚本
│   └── start.sh     # 生产启动脚本
├── chrome-extension/                    # Chrome 扩展源码
│   ├── manifest.json
│   ├── sidepanel.html
│   ├── sidepanel.js
│   ├── sidepanel.css
│   ├── background.js
│   └── icon*.png
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── extract/route.ts        # AI 图片识别+清洗（多模态）
│   │   │   ├── extract-text/route.ts   # AI 纯文字识别+清洗
│   │   │   ├── upload/route.ts         # 图片上传到 S3
│   │   │   ├── records/route.ts        # 面经记录 CRUD
│   │   │   ├── records/[id]/route.ts   # 单条记录操作
│   │   │   ├── records/refresh-urls/route.ts  # 刷新图片预签名 URL
│   │   │   └── chrome-extension/
│   │   │       ├── download/route.ts   # 下载扩展 ZIP
│   │   │       └── update/route.ts     # 扩展更新检查
│   │   ├── campus/                      # 校招雷达页面（已废弃，代码已删除）
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                     # 主页面（面经整理）
│   ├── components/ui/                   # shadcn/ui 组件库
│   ├── hooks/
│   ├── storage/database/
│   │   ├── supabase-client.ts           # Supabase 客户端
│   │   └── shared/schema.ts             # 数据库 schema 定义
│   └── lib/utils.ts
├── .coze                                # Coze 部署配置（勿手动修改）
├── AGENTS.md                            # 项目规范文件
├── DESIGN.md                            # 设计规范文件
├── HANDOVER.md                          # 本文件
├── package.json
└── tsconfig.json
```

---

## 三、数据库

### 使用的 Supabase 实例

- **URL**: `https://br-happy-jird-75392028.supabase2.aidap-global.cn-beijing.volces.com`
- **区域**: 北京

### 核心表：mianjing_records

| 字段 | 类型 | 说明 |
|------|------|------|
| id | varchar (PK) | UUID |
| image_url | text | 主图 URL |
| image_file_key | varchar | S3 文件 key |
| company | varchar | 公司 |
| position | varchar | 岗位+面试轮次（如"产品经理一面"） |
| industry | varchar | 行业 |
| original_content | text | AI 原始识别内容 |
| content | text | 清洗后内容 |
| status | varchar | 状态：extracting / done |
| device_id | varchar | 设备标识（已废弃，不再用于过滤） |
| category | varchar | 分类 |
| experience_type | varchar | 经验类型 |
| country | varchar | 国家 |
| image_urls | text | JSON 数组，多图 URL 列表 |
| created_at | timestamptz | 创建时间 |
| updated_at | timestamptz | 更新时间 |

### 其他表（历史遗留，功能已下线）

- `campus_records` — 校招雷达记录
- `campus_search_tasks` — 校招搜索任务
- `recruitment_records` — 招聘信息记录
- `wechat_import_tasks` / `wechat_import_images` — 公众号导入任务

> 这些表对应的功能代码已删除，表仍保留在数据库中，可按需清理。

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
Body: { imageUrl: string }
响应: { success: true, data: { company, position, industry, content, originalContent } }
模型: doubao-seed-2-0-pro-260215 (多模态)
```

### AI 文字识别+清洗

```
POST /api/extract-text
Content-Type: application/json
Body: { content: string }
响应: { success: true, data: { company, position, industry, content, originalContent } }
模型: doubao-seed-2-0-lite-260215
```

### 面经记录 CRUD

```
GET    /api/records          # 获取所有记录
POST   /api/records          # 新增记录
PATCH  /api/records/[id]     # 更新记录
DELETE /api/records/[id]     # 删除记录
POST   /api/records/refresh-urls  # 刷新图片预签名 URL
```

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
扩展识别 → sendRecordToWebsite()
         → chrome.scripting.executeScript 在网页标签页派发
           window.dispatchEvent(new CustomEvent('mianjing-new-record', { detail: {...} }))
         → 网页监听事件 → POST /api/records 保存到数据库
         → 网页列表即时更新
```

### 扩展设置

- **API 地址**：默认指向 Coze 沙箱域名（国内直连），可在设置面板修改
- **设备 ID**：显示在设置面板，可手动同步
- **版本号**：在 manifest.json 中维护，当前 2.2.0

### 扩展更新

修改 `chrome-extension/` 下的文件后：
1. 更新 `manifest.json` 的 `version`
2. 运行 `bash scripts/build.sh`（会自动打包扩展 ZIP 到 `public/`）
3. 部署后用户重新下载安装

---

## 六、AI 识别与清洗规则

### 识别规则（extract / extract-text）

1. 从面经中提取：公司、岗位（含面试轮次如一面/二面/群面/初面/终面）、行业、内容
2. 岗位字段格式示例：`产品经理一面`、`群面`、`数据分析终面`
3. 内容只保留面试问题，不需要总结答案或回答要点

### 清洗规则

1. 去除寒暄、水话、广告等无效信息
2. 只保留面试问题
3. **禁止删减或精简面试问题**（问题必须完整保留原文）
4. 不需要总结面经中的答案或回答要点

---

## 七、环境变量

### Coze 沙箱（自动注入，无需手动配置）

| 变量 | 说明 |
|------|------|
| COZE_WORKSPACE_PATH | 项目工作目录 |
| COZE_PROJECT_DOMAIN_DEFAULT | 对外访问域名 |
| DEPLOY_RUN_PORT | 服务端口（5000） |
| COZE_SUPABASE_URL | Supabase 地址 |
| COZE_SUPABASE_ANON_KEY | Supabase 匿名 Key |
| COZE_SUPABASE_SERVICE_ROLE_KEY | Supabase 服务角色 Key |
| COZE_WORKLOAD_API_TOKEN | Coze API Token |
| COZE_INTEGRATION_BASE_URL | 集成 API 地址 |
| COZE_INTEGRATION_MODEL_BASE_URL | 模型 API 地址 |
| COZE_OUTBOUND_AUTH_ENDPOINT | 出站认证地址 |
| COZE_BUCKET_ENDPOINT_URL | S3 存储地址 |
| COZE_BUCKET_NAME | S3 存储桶名 |
| COZE_WORKLOAD_IDENTITY_* | Workload Identity 凭证 |

### Vercel（需手动配置）

需配置以上所有变量，其中 Supabase 三项必须与 Coze 沙箱一致才能数据互通。

---

## 八、构建与部署

### Coze 平台

```bash
# 开发
coze dev

# 构建
coze build

# 生产启动
coze start
```

### 手动构建流程

```bash
pnpm install              # 安装依赖
bash scripts/build.sh     # 打包扩展 ZIP + next build
pnpm start                # 启动生产服务
```

### Vercel

连接 GitHub 仓库 `https://github.com/joezyw999-lgtm/jessica-job.git`，push 到 main 自动部署。

---

## 九、已知问题与注意事项

1. **Coze 沙箱休眠**：一段时间不活动会休眠，可用 UptimeRobot 等心跳监控服务保持活跃
2. **Vercel 需 VPN**：vercel.app 域名国内无法直连
3. **Vercel + Supabase**：Vercel 服务器在国外，Supabase 是北京节点，可能存在跨域延迟或连接问题
4. **API Token 过期**：Coze 平台的 Workload Identity Token 可能会轮换，如果 Vercel 识别功能突然失败需检查 Token 是否还有效
5. **扩展需重新安装**：扩展代码更新后，用户需重新下载安装才能生效
6. **device_id 已废弃**：记录不再按 device_id 过滤，所有用户共享同一份数据列表
7. **历史遗留数据库表**：campus_records、recruitment_records 等表的功能已下线，可按需清理

---

## 十、GitHub 仓库

- 地址：https://github.com/joezyw999-lgtm/jessica-job.git
- 分支：main
- 协作：push 到 main 后 Vercel 自动部署

---

## 十一、设计规范

详见 `DESIGN.md`，核心要点：
- 主色：沉稳青墨 `#2D6A6A`，次色：暖琥珀 `#D4853A`
- 背景：极淡暖灰 `#F8F7F5`
- 字体：思源黑体 + Inter
- 禁止蓝紫色渐变、禁止大面积纯黑背景
