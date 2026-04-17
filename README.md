# xBuilderPulse

移动端友好的 Web 阅读器,用于展示 [BuilderPulse/BuilderPulse](https://github.com/BuilderPulse/BuilderPulse) 每日情报汇总。支持中英双语、RSS 订阅与 Web Push 通知,每小时自动轮询上游仓库并在有更新时重建站点并推送。

线上: <https://xbuilderpulse.vercel.app>

## 功能

- 中英双语切换(`/en`、`/zh`)
- 归档列表 + 报告详情页,Markdown 渲染(Shiki 代码高亮、GitHub Light/Dark 主题)
- RSS 订阅(`/en/rss.xml`、`/zh/rss.xml`)
- Web Push 每日通知(iOS 16.4+ 需先「添加到主屏幕」安装为 PWA)
- 自动轮询:GitHub Actions 每小时调用一次 rebuild 端点,发现上游有新 commit 时触发 Vercel Deploy Hook 并向订阅者推送

## 技术栈

- [Astro 5](https://astro.build) + React 19 岛屿架构
- Tailwind CSS 4 + `@tailwindcss/typography`
- [marked](https://marked.js.org) + [marked-shiki](https://github.com/bent10/marked-extensions) + [Shiki](https://shiki.style)
- [@astrojs/vercel](https://docs.astro.build/en/guides/integrations-guide/vercel/) serverless adapter
- [@upstash/redis](https://upstash.com) 存储推送订阅与 `last-sha`
- [web-push](https://github.com/web-push-libs/web-push) VAPID 推送

## 项目结构

```
src/
├── components/         # Astro + React 组件 (Footer, SubscribeButton, LangSwitch, ...)
├── layouts/            # Base layout (meta, manifest, SW 注册)
├── lib/
│   ├── github.ts       # GitHub API 客户端 + 报告解析,带内存缓存
│   ├── kv.ts           # Upstash Redis 封装,支持 UPSTASH_* 和 KV_REST_API_* 两种命名
│   └── push.ts         # web-push 封装:sendOne + fanout
├── pages/
│   ├── index.astro     # 根路径 → /en
│   ├── [lang]/
│   │   ├── index.astro       # 首页(最新 + 最近列表)
│   │   ├── archive.astro     # 归档
│   │   ├── rss.xml.ts        # RSS feed
│   │   └── [year]/[slug].astro  # 报告详情
│   └── api/
│       ├── subscribe.ts
│       ├── unsubscribe.ts
│       └── cron/rebuild.ts   # 轮询 + 触发 Deploy Hook + fanout push
└── styles/

public/
├── sw.js               # Service Worker(push + notificationclick)
├── manifest.webmanifest
└── icons/

.github/workflows/
└── poll-upstream.yml   # 每小时 GET /api/cron/rebuild

scripts/
└── generate-vapid.mjs  # 本地生成 VAPID 公私钥
```

## 本地开发

```bash
pnpm install
pnpm dev
```

访问 <http://localhost:4321>。

类型检查:

```bash
pnpm astro check
```

## 环境变量

在 Vercel 项目或本地 `.env.local` 配置:

| 变量 | 必填 | 说明 |
| --- | --- | --- |
| `GITHUB_TOKEN` | 否 | 提升 GitHub API 速率限制(建议配置) |
| `CRON_SECRET` | 是 | `/api/cron/rebuild` 的 Bearer token |
| `DEPLOY_HOOK_URL` | 是 | Vercel Deploy Hook URL(上游有更新时触发重建) |
| `PUBLIC_VAPID_PUBLIC_KEY` | 是 | 浏览器订阅用的 VAPID 公钥(`PUBLIC_` 前缀使其注入到客户端) |
| `VAPID_PRIVATE_KEY` | 是 | 服务端签名推送的 VAPID 私钥 |
| `VAPID_SUBJECT` | 是 | `mailto:you@example.com` |
| `UPSTASH_REDIS_REST_URL` / `KV_REST_API_URL` | 是 | Upstash Redis(二选一,前者对应 Upstash 直连,后者对应 Vercel Marketplace 集成) |
| `UPSTASH_REDIS_REST_TOKEN` / `KV_REST_API_TOKEN` | 是 | 同上 |

生成一对 VAPID 密钥:

```bash
node scripts/generate-vapid.mjs
```

## 自动更新机制

两层兜底:

1. **GitHub Actions**(主)——`.github/workflows/poll-upstream.yml` 每小时 `cron: '7 * * * *'` 调用 `/api/cron/rebuild`;不触发重新部署,仅触发重建检查。仓库 secret 需配置 `CRON_SECRET`。
2. **Vercel Cron**(兜底)——`vercel.json` 每日 UTC 05:00 执行同一端点(Hobby 计划仅允许每日频率)。

`/api/cron/rebuild` 逻辑:

1. 比对上游 `main` 最新 commit sha 与 Redis 中 `bp:last-sha`
2. 不同(或带 `?force=1`)则 POST `DEPLOY_HOOK_URL` 触发 Vercel 重新部署
3. 并行:按语言拉最新报告,`fanout` 向所有订阅者推送标题/摘要/链接
4. 更新 `bp:last-sha`

## Web Push 说明

- 订阅存于 Upstash Redis Hash(`bp:subs`),按 endpoint 稳定哈希去重
- 推送失败 404/410 自动从订阅列表移除
- iOS 要求:Safari 16.4+ + 已安装为 PWA(添加到主屏幕后从 home screen 打开)——`SubscribeButton` 会检测并提示
- 通知正文由 `buildPushBody` 处理:剥离 markdown → 提取首条编号要点 → 按句末截断(支持中英标点),避免中途截断或出现 `**` 残留

## 归属

Powered by [BuilderPulse/BuilderPulse](https://github.com/BuilderPulse/BuilderPulse).
