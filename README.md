## 最新：卡片标题再放大

分类标题从桌面18–30px、手机18px调整为桌面22–36px、手机22px；字号以外的字重、位置、视频和交互不变。当前检查 tests/card-title-size-check.mjs，回滚基线 baseline/before-card-title-larger/，恢复四个关联文件后回到上一版字号。最新ZIP：阮靖怡-视觉设计作品集-卡片大标题版.zip。

```text
请保持卡面分类标题桌面clamp(22px,2.9vw,36px)、手机22px，其他布局与轮播交互不变；后续修改请备份，重新编译轮播并更新缓存版本，运行card-title-size-check、类型检查与自动测试，核对五类标题无溢出，并验证独立副本回滚。
```

以下为历史版本记录；当前字号和回滚以本段为准。

## 最新：卡面简化与标题放大

五张卡面已移除银色芯片、右上 JWT、右下交叠圆银行标志。分类标题桌面为 clamp(18px,2.4vw,30px)，手机为18px，原来分别最高14px与10px。视频、卡片厚度、正反面、磁条、示例卡号、循环翻转、五类作品入口、蓝天透明背景、作品展示标题和页面顺序均保留。

最新 ZIP：阮靖怡-视觉设计作品集-卡面简化版.zip。当前检查：tests/card-cleanup-check.mjs；回滚基线：baseline/before-card-cleanup/。回滚需要在成品目录外建立专用副本文件夹，传入该文件夹中 index.html 的绝对路径；ROLLBACK.sh 会一并恢复 HTML、App.tsx、index.css 和轮播编译文件，以恢复原芯片/标志及小标题，而不覆盖成品。

```text
后续维护请保留简化卡面：无芯片、无 JWT、无交叠圆标志，分类标题在桌面18–30px、手机18px。保留轮播交互、视频、五类入口、18项原作品及其他页面。修改源文件后重新编译并更新HTML中的轮播缓存版本；运行card-cleanup-check、类型检查、自动测试、桌面和手机验收，并在独立文件夹验证四文件回滚。
```

以下为历史版本记录；检查与回滚以本段为准。

## 最新：作品展示标题

轮播上方新增居中的“作品展示”标题，沿用其他区块的字体、字重变化和胭脂粉 #E890A8 横线。透明蓝天背景、作品展示前置顺序及银行卡效果不变。当前检查：tests/works-title-check.mjs；当前回滚基线：baseline/before-works-title.html（只撤销可见标题，保留前置和透明背景）。最新 ZIP：阮靖怡-视觉设计作品集-作品标题版.zip。

```text
继续维护时，保留轮播上方的“作品展示”标题及 #E890A8 横线；作品展示紧邻 ABOUT ME 之前，背景透明；其他页与银行卡交互不变。修改后检查 works-title-check、桌面和手机标题位置、自动测试与副本回滚。
```

以下为历史版本说明；回滚与检查以本段为准。

## 2026-10-22 最新调整

作品展示已移到 ABOUT ME 前面：**首页 → 作品展示 → ABOUT ME → 互动实验室 → 荣誉经历**。作品区的三层背景均为透明，露出原蓝天背景；银行卡卡面、厚度、视频和交互不变。最新检查使用 tests/works-order-check.mjs，回滚基线为 baseline/before-works-order.html（恢复顺序，保留透明背景）。最新压缩包：阮靖怡-视觉设计作品集-作品展示前置版.zip。

```text
后续维护请保持作品展示紧邻 ABOUT ME 之前，作品区背景透明，保留五张银行卡和18项原作品；修改后运行 works-order-check、类型检查、自动测试，并在另一份副本验证回滚。
```

---
以下为上版实现说明（其中黑底要求已由上述透明背景替代；旧回滚命令请改用 works-order-check.mjs）。

# 阮靖怡 · 视觉设计作品集｜3D 银行卡分类版

## 本次完成

作品展示 `#works` 改为黑底、五张立体银行卡轮播：**品牌IP / 动态影像 / 广告视觉 / 舞台设计 / 个人创作**。保留示例的视频背景、银色芯片、JWT 标识、交叠圆、磁条和背面示例卡号；这些卡片信息只作视觉展示。

- React Hooks + Tailwind CSS v4 + requestAnimationFrame；未引入外部动画库。
- 1350px 透视、五层实体厚度、正反面、鼠标惯性视差、循环停驻与平滑切换。
- 可点击箭头、小圆点，使用方向键 / Home / End、横向拖动或 Shift + 滚轮；播放按钮支持暂停。
- 点击卡片展开原类别作品；五类分别为 2 / 5 / 3 / 5 / 3 项，共 18 项。原作品详情弹窗继续使用；点击“返回3D卡片”收起分类。
- 屏幕外与后台页面停止动画和视频；可见卡面按需播放，测试时最多同时播放 3 个视频。减少动态效果偏好默认暂停并关闭视差。
- 样式放在 Shadow DOM 内，作品区之外的首页、互动实验室、简历、联系页面及邮件提交逻辑保持原样。
- 视频使用用户给定的五条 CloudFront 地址，未下载进包，播放需要网络；缺少网络时保留彩色卡片底色。

## 打开与部署

解压 `阮靖怡-视觉设计作品集-3D银行卡分类版.zip` 后保持目录结构。已编译的轮播在 `assets/works-carousel/works-carousel.js`，`index.html` 直接引用；无需前端 CDN 运行 React。推荐通过本地 HTTP 或正式网站浏览。

在本目录使用 Node.js 22.x：

```text
npm ci
npm run check:works
npm test
npm run build
npm start
```

本地地址为 `http://127.0.0.1:4180/#works`。Vercel 框架选 Other，构建命令 **npm run build**，输出目录 **public**。构建先编译轮播，再仅把网页与 assets 复制到 public。本次交付的是本地源码及成品包，未新增线上部署。

留言后端继续向服务端 `CONTACT_TO=2690722460@qq.com` 发信，真实收信仍取决于部署和 SMTP 环境变量；详细步骤见 `DEPLOYMENT.md`。密钥不放入网页、源码或压缩包。

## 维护文件

- `src/App.tsx`：银行卡组件、播放与交互。
- `src/index.css`：Tailwind 入口与独立卡片样式。
- `src/carouselMath.mjs`：五类映射、示例视频和卡号、圆柱变换计算。
- `src/main.tsx`：Shadow DOM 挂载；Vite 以经典 IIFE 输出，兼容现有单页结构。
- `src/assets/`：JetBrains Mono 字体及 OFL 许可证。
- `index.html`：作品区与原筛选、作品详情的桥接；其余内容不改。
- `tests/works-carousel-check.mjs`：基线哈希、修改范围、142 个原素材哈希、脚本语法检查。
- `tests/carousel-math.test.mjs`：五类循环、停驻、透视、边界与鼠标倾斜测试。
- `tests/works-carousel-browser.json`：桌面和手机真实浏览器操作结果。
- `DIFF_FILE.diff`、`VERIFICATION.txt`：HTML 差异与实际检查证据。
- `baseline/before-works-carousel.html`：本次改造前完整备份，SHA-256 `71d4786ef003eec241f1ad4c47ff074843a000a316b0821419544955647b1583`。
- `baseline/` 中其他历史备份与原有 142 个二进制素材保持不变；原有粉绿配色和简历字母薄荷青绿悬停继续保留。

## 检查与回滚

```powershell
node tests/works-carousel-check.mjs baseline "$PWD/baseline/before-works-carousel.html"
node tests/works-carousel-check.mjs modified "$PWD/index.html"
Copy-Item -LiteralPath ./index.html -Destination ./rollback-test.html
node rollback.mjs "$PWD/rollback-test.html"
```

也可在 Bash 中执行 `./ROLLBACK.sh /absolute/path/rollback-test.html`。回滚只覆盖指定的另一份 HTML 副本，恢复原作品网格、筛选按钮与原有行为，不覆盖成品或任何基线。新增 React 源码和编译文件保留，但还原后的 HTML 不再加载它们。原后端、素材与配色不变。回滚副本上的 SHA-256 与基线一致；交付的 `index.html` 保持新版。

## 后续修改提示词

```text
请维护本目录的视觉设计作品集，仅修改我指定的部分。
作品展示采用黑底五张银行卡，对应品牌IP、动态影像、广告视觉、舞台设计、个人创作。
保留视频、芯片、JWT、正反面、体积厚度、1350px 透视、鼠标惯性及循环停驻。
保留原18项作品数据、详情弹窗、142个原始二进制素材和所有其他页面。
继续采用Shadow DOM隔离样式，不让Tailwind重置影响首页和互动实验室。
修改React源文件后重新构建IIFE，并运行类型检查、45项自动化测试和works-carousel-check。
实测五类入口、原详情、桌面与手机布局、暂停/继续、拖动和另一份副本上的回滚。
保留基线哈希，更新差异、验证记录、截图和不含node_modules或密钥的ZIP。
本次具体修改：［填写需求］。
```

实现参考：[React useEffect](https://react.dev/reference/react/useEffect)、[Tailwind Vite 安装](https://tailwindcss.com/docs/installation/using-vite)、[Vite 构建](https://vite.dev/guide/build.html)。

## 最新完整包 · 2026-10-26

当前66项作品、135项详情媒体。品牌IP4项，动态影像36项，视觉创作12项，舞台设计5项，UI设计3项，营销切片6项。新增内容包含高清岭南插画海报、博物馆APP（4张）、咖啡店APP（7张）及意大利面品牌IP（2张）；视觉创作新增两张独立插画，不显示作品名或文件名。

解压后可打开根目录index.html离线预览；部署源码包含src、assets、admin、api、backend、supabase与Vercel配置。依赖目录未打入ZIP，部署时按package-lock.json安装后构建。邮箱和作品管理仍需配置自己的平台环境变量；打包不代表已更新线上Vercel网站。
