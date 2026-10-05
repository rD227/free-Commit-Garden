# free-Commit-Garden

把 GitHub 贡献记录种成四季像素花园。独立运行、无运行时依赖，也可接入 Hexo / Butterfly 或普通 HTML 网站。

周视图使用侧视植物，保留错开节奏的随风摇摆；月视图使用俯视灌木，保持静止。春季樱花与细雨、夏季绿叶、秋季枫叶与左右飘落的小落叶、冬季针叶与雪点沿用同一套配色。素材为原创生成图片，创作提示词随源码公开，没有打包 Forkest 的代码或图片。

月视图每天贡献达到 15 次时，可在灌木上出现季节装饰；每个月最多选贡献最高的四天。春天是麻雀、秋天是松鼠，夏天按日期交替显示青蛙与柠檬汽水，冬天在雪松上环绕同画风的小像素彩灯。小动物轻微上下浮动；点击汽水杯所在的日期格会让它翻转一次。“减少动态效果”开启时这些运动会停止。

## 先看演示

需要 Node.js 20 或更新版本。无需安装第三方依赖。

```sh
git clone git@github.com:rD227/free-Commit-Garden.git
cd free-Commit-Garden
npm run demo
npm run serve
```

打开 <http://127.0.0.1:4173/>。演示页明确标记使用示例数据，不请求 GitHub。切换 Week / Month，拖动画面、滑动或使用底部小滚动条，可连续浏览日期。

## 使用自己的贡献数据

```sh
npm run build -- --username YOUR_GITHUB_USERNAME
npm run serve
```

构建从 GitHub 公开贡献日历获取数据，无需令牌；网络失败时使用缓存，全无数据时标记不可用。生成文件保存在 `dist/`，可以部署到任意静态网站托管服务。默认时区为 `Asia/Shanghai`，北半球季节。

```sh
npm run build -- --username YOUR_GITHUB_USERNAME --timezone Europe/London --hemisphere north --root /my-garden/ --out dist
```

`--root` 指定部署 URL 的子路径。在本地预览相同子路径时运行 `npm run serve -- --root /my-garden/`。`--hemisphere south` 使用南半球季节。

也可使用自己提供的离线数据：

```sh
npm run build -- --username YOUR_GITHUB_USERNAME --input contributions.json
```

数据格式：

```json
{
  "username": "YOUR_GITHUB_USERNAME",
  "updatedAt": "2026-10-04T00:00:00Z",
  "source": "local",
  "contributions": [
    { "date": "2026-09-28", "count": 2 },
    { "date": "2026-09-29", "count": 6 }
  ]
}
```

实际输入至少提供七天记录。使用 `--input` 时不发出 GitHub 请求，并关闭访客端公共 API 刷新。缺失日期显示 `?`，未来日期显示 `·`，不会冒充零贡献。

## 嵌入普通网页

先生成并上传 `dist/js/`、`dist/css/`、`dist/garden/`、`dist/LICENSE` 和 `dist/NOTICE`，再添加：

```html
<link rel="stylesheet" href="/css/pixel-garden.css">
<div id="garden"></div>
<script src="/js/pixel-garden-core.js" defer></script>
<script src="/js/pixel-garden.js" data-target="#garden" data-config="/garden/config.json" defer></script>
```

`data-target` 指定页面容器。部署在子路径时，为所有资源 URL 添加相应前缀。页面不需要 Font Awesome 或 Butterfly。

## 接入 Hexo / Butterfly

将本仓库的三个 JS/CSS 文件复制到博客对应的 `source/js/`、`source/css/`，将 `source/garden/sprites/`、`scripts/pixel-garden.js` 一并复制到同名路径，并随组件保留 `LICENSE` / `NOTICE`。不要覆盖已有目录内的其他文件。

按 [examples/hexo.yml](examples/hexo.yml) 添加配置和注入脚本，构建博客即可。不指定 `data-target` 时自动挂载到 Butterfly 头像卡片；桌面齿轮展开菜单中的植物按钮可移到文章主栏，手机自动使用头像卡片。无需修改主题子仓库。

完整的生长规则、时间与缓存逻辑、位置切换和动画参数见 [接入说明](docs/pixel-garden/README.md)。

## 性能与数据来源

- 只为可见的一到两个时间段创建植物、日期按钮和天气粒子；七个空容器维持滑动布局。花园离开视口或标签页进入后台时卸载画面。
- 每个周面板最多七株植物摇摆；月视图植物不摇摆。遵循浏览器的“减少动态效果”设置。
- 构建读取 GitHub 公开贡献日历。可选访客刷新来自 [GitHub Contributions API](https://github.com/grubersjoe/github-contributions-api)，这是独立公共服务，可在配置中关闭。
- 四季天气为视觉装饰，没有收集位置，也没有接入实时天气 API。

## 开发与文件

```sh
npm test
npm run demo
```

| 路径 | 用途 |
| --- | --- |
| `source/js/pixel-garden-core.js` | 日期、季节、生长阶段和 SVG 场景 |
| `source/js/pixel-garden.js` | 挂载、滑动、可见区域渲染与缓存 |
| `source/css/pixel-garden.css` | 周月卡片与动画样式 |
| `source/garden/sprites/` | 四季两种视角的图集与裁切清单 |
| `scripts/pixel-garden.js` | Hexo 生成器，也可供 Node 构建调用 |
| `scripts/build.cjs` / `scripts/serve.cjs` | 独立构建与本地预览 |
| `tests/` | 日期边界、数据回退、素材与独立构建检查 |
| `docs/pixel-garden/SPRITE-PROMPTS.md` | 原创素材生成提示词 |
| `docs/pixel-garden/DECORATION-PROMPTS.md` | 动物与汽水杯素材生成提示词 |

## 许可证

Copyright (C) 2026 rD227 (XvSu)。代码、文档和随附花园素材以 **GNU GPL v3 或更新版本**（`GPL-3.0-or-later`）发布，见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。许可证由作者提供，应用示例中的项目名称已改为 free-Commit-Garden。

GPL 允许商用与收费销售；分发修改版时需要遵守 GPL 的源码与许可要求，并非“禁止出售”许可证。此前按 MIT 发布的历史版本继续保留其原授权，本次换证适用于这一版本及后续版本。GNU GPL 的义务主要由分发触发；只在服务端运行而未分发的改动与 AGPL 的网络条款不同。详情见 [GNU 官方 FAQ](https://www.gnu.org/licenses/gpl-faq.en.html)。

本项目不包含博客文章、Butterfly 主题或其他项目，其许可证不改变这些内容的许可。
