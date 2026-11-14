# DeepSeek 官网会话同步

把 chat.deepseek.com 上的会话导入为 DSH 本地会话。**当前版本 0.3.0 已具备完整链路**：拉列表 → 勾选 → 读取 → 转换 → 打包 → 送入官方导入器。

## 原理

不逆向、不破解，读的是官网自己用的两个接口：

| 用途 | 接口 |
| --- | --- |
| 会话列表（分页） | `GET /api/v0/chat_session/fetch_page?lte_cursor.pinned=false&lte_cursor.updated_at=<秒>` |
| 单会话全文 | `GET /api/v0/chat/history_messages?chat_session_id=<id>` |

拿到后用 `CompressionStream('deflate-raw')` 压成一版 `export_format_version: 3` 归档，POST 给 DSH 自带的导入路由：

```
POST /api/deepseek-chat-import/archive?workspaceId=<工作区 id>
```

**导入仍然由官方插件完成**，本插件只负责取数与转换。全程不落盘、不上传外网。

## 使用

1. 右侧边栏点「+」，选「DeepSeek 官网同步」。
2. 在网页区登录官网（一次即可，登录态存在独立分区）。
3. 点「同步会话」，拉取会话清单（网页区会自动收起）。
4. 勾选要导入的会话，选目标工作区。
5. 点「导入所选」。

## 几个设计取舍

- **只拉勾选的**：逐个会话请求，不预取全部，避免触发频控。
- **去重靠 id**：导入过的会话记在浏览器 localStorage，再次同步时置灰。
- **图片会搬运**：`FILE` 片段里带 `signed_path` 的图片由 Host 侧下载（浏览器受 CORS 限制读不到），写进 `chat_sessions/{id}_files/`，并把 `export_path` 指回该条目。上限：单张 4 MB、单个会话 40 张。
- **扩展名必须跟随真实格式**：站点图片显示名恒为 `image.png`，但文件主机实际返回 **WebP**。导入器按扩展名推导 mediaType 再校验字节，名字叫 `.png` 而内容是 WebP 会被判非法、退化成文件卡片。因此归档里的扩展名由魔数决定（png/webp/jpg/gif）。
- **只保留四类片段**：`REQUEST` / `RESPONSE` / `THINK` / `FILE`。搜索卡片等类型因字段结构与导入器校验不完全对齐，暂不写入，避免整会话被判非法。

## 已知限制

- **仅桌面应用可用**，网页版无法创建受管浏览器视图。
- 依赖桌面端内部桥接 `dshDesktop.browser`（`protocolVersion: 1`），非公开 API。
- 官网接口若调整字段，映射层需同步更新。
- 大批量导入（几百个会话）可能触发官网频控，建议分批。

## 验证状态

- 离线单测 36 项全通过：CRC-32、时间戳换算、片段/会话映射、ZIP 结构（用标准解压器还原校验）、附件命名与格式判定。
- **真机全链路已通过**（2026-11-14）：登录 → 同步列表 → 勾选 → 导入 → 会话出现在 DSH，**图片正常显示**（已核对归档扩展名、字节魔数、附件库落盘三项）。

## 排障

| 现象 | 原因与处理 |
| --- | --- |
| `INVALID_TOKEN` | 令牌头没截到。在网页区点开一个会话再点「查看令牌」，确认有 `authorization` |
| 提示已导入但没新会话 | 记账写错了。点「重置记账」后重新导入（0.4.1 已修） |
| `workspace-not-found` | 目标工作区 id 失效，重新选一次工作区 |
| 拉不到列表 | 先在网页区登录，再点「同步会话」 |

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
