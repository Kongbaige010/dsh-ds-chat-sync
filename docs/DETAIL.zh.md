# DeepSeek 官网会话同步

在 DSH 右侧边栏读官网会话，转换后交给官方导入器写成本地会话。

## 流程

```
登录官网 → 同步会话 → 勾选 → 选工作区 → 导入所选
```

- **同步会话**：在页面内循环翻页 `fetch_page`，直到游标取完，得到完整清单（标题、更新时间）。
- **勾选**：已导入过的置灰，去重记录在浏览器 localStorage 里。
- **导入**：对每个勾选会话请求 `history_messages`，映射成 `export_format_version: 3` 的归档结构，压缩打包，POST 到官方导入路由。

## 字段映射

| 归档格式 | 官网接口 | 处理 |
| --- | --- | --- |
| `id` | `chat_session.id` | 直接 |
| `title` | `chat_session.title` | 空值转 `null` |
| `current_message_id` | 同名 | 直接 |
| `inserted_at` / `updated_at` | unix 秒浮点 | 转 ISO 8601 |
| `messages[].id` | `message_id` | 改名 |
| `messages[].parent_id` | 同名 | 直接 |
| `messages[].role` / `status` | 同名 | 直接 |
| `messages[].inserted_at` | unix 秒浮点 | 转 ISO 8601 |
| `messages[].fragments` | 同名 | 过滤类型、去掉内部 id |

官网特有字段（`title_type`、`model_type`、`seq_id`、`feedback` 等）全部丢弃，导入器不读。

## 片段取舍

只写入 `REQUEST` / `RESPONSE` / `THINK` / `FILE`。

其余类型（`TOOL_SEARCH`、`TOOL_OPEN`、`READ_LINK` 等）在官网侧与导出侧的字段结构不完全一致，写入有被判非法的风险，因此先不写。被丢弃的片段不影响消息本身。

`FILE` 片段里的图片会搬运：`signed_path` 存在时由 **Host 半包**下载字节（浏览器端受 CORS 限制读不到，文件主机不返回 `Access-Control-Allow-Origin`），写成 `chat_sessions/{会话id}_files/{文件id}_{文件名}.{真实格式}`，并把片段的 `export_path` 指回该条目。上限为单张 4 MB、单会话 40 张。

**扩展名陷阱**：站点返回的图片显示名恒为 `image.png`，但文件主机实际给的是 **WebP**。导入器按扩展名推导 mediaType 再校验字节，名字与内容不符会被判非法、退化成文件卡片。所以归档扩展名一律由字节魔数决定。

非图片文件（pdf、docx 等）不搬运，保持文件卡片。

## 打包实现

- 压缩用浏览器内置 `CompressionStream('deflate-raw')`，不可用时自动退回 store（不压缩）。
- ZIP 结构由插件自己拼：本地文件头 + 中央目录 + EOCD，CRC-32 自算。
- 无第三方依赖，不引入任何 npm 包。

## 限制

- 仅桌面应用可用；网页版无法创建受管浏览器视图。
- 依赖桌面端内部桥接 `dshDesktop.browser`（`protocolVersion: 1`）。
- 官网接口若调整，映射层需同步更新。
- 大批量导入可能触发官网频控。
