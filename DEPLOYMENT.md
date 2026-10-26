# 邮箱留言后端｜Vercel 部署说明

## 当前状态与目标

- 部署平台：**Vercel**。
- 固定接收邮箱：**2690722460@qq.com**，由服务端 `CONTACT_TO` 配置。
- 网站将姓名、联系方式和留言提交到同域 `POST /api/contact`，Node.js 后端通过 Nodemailer 与外部 SMTP 邮箱服务发信。
- **SMTP 授权码、实际部署域名与真实收信验收仍需由账户持有人完成。** 本文不代表已发布网站或已收到邮件。
- 页面显示成功的条件是 SMTP 服务接受目标收件人的这次提交；这仍不等同于已经进入收件箱。最终应检查收件箱与垃圾箱。

Vercel 支持使用 Nodemailer 连接外部 SMTP 服务；本项目使用 Node.js Functions，而不是 Edge Runtime。[Vercel 邮件发送说明](https://vercel.com/kb/guide/sending-emails-from-an-application-on-vercel)、[Node.js Functions 文档](https://vercel.com/docs/functions/runtimes/node-js)。

## 1. 准备 QQ 邮箱 SMTP 授权码

1. 由账户持有人登录作为发件人的 QQ 邮箱，在邮箱设置中启用 SMTP 并生成授权码。
2. 推荐使用 `SMTP_HOST=smtp.qq.com`、`SMTP_PORT=465`、`SMTP_SECURE=true`；`SMTP_USER` 填完整发件邮箱，`SMTP_PASS` 填 SMTP 授权码，**不是邮箱登录密码**。
3. 本项目默认将邮件发送到 `2690722460@qq.com`。发件邮箱可以配置为该邮箱；如更换发件邮箱，应同时使用与该邮箱匹配的 SMTP 账户与授权码。

QQ 邮箱 `smtp.qq.com` 与 465 / SSL 配置可见[腾讯云官方配置文档](https://intl.cloud.tencent.com/zh/document/product/1266/71700)。Nodemailer 中 465 使用连接即 TLS；若使用服务商支持的 587 端口，设置 `SMTP_SECURE=false`，本项目仍要求 STARTTLS。[Nodemailer SMTP 文档](https://nodemailer.com/smtp)。

授权码只填入部署平台的环境变量，或自己的本地 `.env.local` 文件。不要写进 `index.html`、提交到 Git、打印到日志、截图分享或打进交付压缩包。

## 2. 导入 Vercel 项目

1. 将本项目源码放入自己的 Git 仓库，保留 `api/`、`backend/`、`assets/`、`index.html`、`package.json`、锁文件与 `vercel.json`。
2. 在 Vercel 导入该仓库。若仓库外面还有一层文件夹，将 **Root Directory** 设为本项目所在目录。
3. 使用下列设置：

| 设置 | 值 |
| --- | --- |
| Framework Preset | `Other` |
| Node.js Version | `22.x` |
| Build Command | `npm run build` |
| Output Directory | `public` |
| Install Command | `npm ci`，使用随包的 `package-lock.json` |

构建先编译 React / Tailwind 轮播，再将 `index.html` 和 `assets/` 复制到 `public/`。`api/contact.mjs` 作为 Vercel Function 入口，后端源码与本地环境文件不复制到静态目录。不要只上传 HTML 后将项目当成纯静态站点部署，否则缺少邮件 API。[Vercel 项目构建与输出配置](https://vercel.com/docs/project-configuration)。

## 3. 配置环境变量

在 Vercel 项目的环境变量中填写以下内容，并选择需要生效的 Production / Preview 环境。变更后重新部署。

| 变量 | 配置值 / 作用 |
| --- | --- |
| `SMTP_HOST` | `smtp.qq.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true`；587 则为 `false`，代码要求 STARTTLS |
| `SMTP_USER` | `2690722460@qq.com`，或实际用于发件的完整邮箱 |
| `SMTP_PASS` | 该发件邮箱生成的 SMTP 授权码；只存环境变量 |
| `CONTACT_TO` | `2690722460@qq.com`；只由服务器决定 |
| `APP_ORIGIN` | 实际站点的完整 HTTPS 来源，包含协议、不含路径，例如 `https://YOUR_DOMAIN`；此处是占位示例，不是已部署网址 |

`APP_ORIGIN` 可用逗号分隔多个精确来源，不接受通配符或 `null`。例如自定义域名与其他已确认站点来源需要分别填写；不要将 URL 路径填入其中。服务端也会使用 Vercel 提供的 `VERCEL_PROJECT_PRODUCTION_URL`、`VERCEL_URL` 识别对应部署来源，不信任访客自行传入的 Host 来决定允许来源。

以下为进阶可选变量，初次部署通常不需要修改：

| 变量 | 默认值 / 作用 |
| --- | --- |
| `TRUST_PROXY` | `false`。仅在明确受信代理会覆盖转发头的情况下开启；影响访客 IP 的识别与限流。 |
| `SMTP_VERIFY_ON_START` | `false`。本地 Node 服务启动时是否执行 SMTP 登录检查。 |
| `HOST` | 本地 Node 服务默认 `127.0.0.1`；Vercel Functions 不需要配置。 |
| `PORT` | 本地 Node 服务默认 `4180`；不是 SMTP 端口，Vercel Functions 不需要配置。 |

没有 `SMTP_FROM` / `EMAIL_FROM` 配置项。发件地址来自 `SMTP_USER`；访客填写的联系方式只有在是有效邮箱时才用作回复地址，不能改变发件账户、SMTP 配置或收件人。

## 4. 部署后进行真实收信验收

1. 部署成功后，打开 Vercel 返回的**实际网址**。检查页面、素材与互动实验能正常打开。
2. 打开「给我留言」，输入可辨认的测试姓名、联系方式与一条不含敏感信息的测试留言。
3. 点击发送，等待服务端结果。SMTP 配置缺失时应报错，而不是假装发送成功；发信失败时保留表单内容以便重试。
4. 在 `2690722460@qq.com` 检查收件箱、垃圾箱，核对姓名、联系方式、正文与发送时间。
5. 只有完成第 4 步后，才记录为「真实收信已验证」。如果页面成功但暂未找到邮件，继续检查邮箱分类、反垃圾过滤与邮箱服务的投递结果，不将其直接记为已收信。

本地测试、构建成功、Vercel 发布成功、SMTP 登录成功、真实邮箱收信是不同的验证层级；请分别记录。当前交付没有替用户填写授权码，也没有虚构部署网址或收信结果。

## 5. 本地运行与 SMTP 登录检查

需要 Node.js 22 或以上。在项目根目录运行：

```powershell
npm ci
npm start
```

默认打开 `http://127.0.0.1:4180`，页面与 `/api/contact` 同源。没有配置 SMTP 时可以预览作品集，但留言不会发信成功。

如要配置本地 SMTP，可在自己的机器上创建 `.env.local`，填写与上表相同的变量；本地 `APP_ORIGIN` 用 `http://127.0.0.1:4180`。本地服务会优先读取 `.env.local`，再读取 `.env`，但不会覆盖进程中已经设置的环境变量。该文件只保存在自己的环境中，不随项目分享。

SMTP 登录检查命令：

```powershell
node backend/server.mjs --verify-smtp
```

它只检查 SMTP 连接与认证，**不发送测试邮件，也不证明收件箱投递**。命令的结果含义如下，实际执行结果以自己的终端和 `VERIFICATION.txt` 为准：

| 输出 | 退出状态 | 含义 |
| --- | --- | --- |
| `SMTP verification succeeded.` | `0` | 连接与认证通过；尚未验证邮件收信 |
| `SMTP configuration incomplete.` | `1` | 缺少必需的 SMTP 配置 |
| `SMTP verification failed.` | `1` | 连接或认证检查失败 |

本地自动化测试可运行 `npm test`。这类测试与模拟邮件传输不替代第 4 节的真实邮箱验收。

## 6. API 与运行说明

请求为同域 `POST /api/contact`，`Content-Type: application/json`。字段为 `name`、`contactInfo`、`content`，另有隐藏的反垃圾字段 `website`，正常提交保持为空。前端不会传 SMTP 凭据或目标收件人。

后端会校验输入、来源与发送频率，等待 Nodemailer 的发送结果；配置缺失返回 `503`，SMTP 发信失败返回 `502`，不会返回虚假的成功结果。部署后查看错误时，只检查错误类型，不在日志中输出 SMTP 授权码或完整留言内容。

现有限流为每个来源 IP 每 15 分钟最多 5 次，计数存于**单个实例内存**。Vercel 多实例之间不共享计数，重启或冷启动也可能重置。若公开站点出现垃圾留言，应接入共享限流存储或验证码，而不把内存限流当成全局防刷系统。

## 7. 自有 Node 服务器（备用方式）

若以后改用自有服务器，仍可使用 `npm ci`、`npm start`。将 SMTP 等变量注入服务进程，默认服务监听 `127.0.0.1:4180`，由自己的 HTTPS 反向代理将同一站点下的页面及 `/api/contact` 转发给 Node 服务，并将该实际 HTTPS 来源加入 `APP_ORIGIN`。

让进程管理器维护服务，并按服务器的受信代理实际情况配置 `TRUST_PROXY`。此段仅给出通用结构，不预设具体云厂商、域名、服务器路径或已配置的反向代理。

## 后续维护提示词

```text
请维护这个 Vercel 作品集的真实邮箱留言流程。
保持 Node.js 22、api/contact.mjs 入口、node backend/build-static.mjs 构建、public 静态输出与现有锁文件一致。
浏览器只向同域 POST /api/contact 提交 name、contactInfo、content，website 隐藏字段为空。
收件人只由服务端 CONTACT_TO 决定并保持 2690722460@qq.com；SMTP 凭据仅从服务器环境变量读取，不接受浏览器传入，不进入前端、Git、日志或压缩包。
必须等待真实 SMTP 提交结果：失败或缺配置显示真实错误，成功也不得冒充邮箱收件箱已验收。
保留既有粉绿配色、首页三处定色与桃粉描边、四条纯色横杠、18 项作品和全部互动实验。
分别记录自动化检查、部署状态、SMTP 登录检查与真实收信验收；没有实际结果时明确记为待配置或待验证。
本次需要修改的是：［填写需求］。
```
