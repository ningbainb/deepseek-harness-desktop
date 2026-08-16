# Search Indexing Design

## Goal

让 DeepSeek Harness Desktop 官网具备清晰、可验证的搜索引擎与 AI 爬虫发现信号，同时保持现有单页下载体验和视觉主题不变。

## Approach

采用静态站点原生 SEO 方案：在首页增加规范 URL、搜索机器人指令、完整社交预览和 JSON-LD 实体；增加可见 FAQ，直接回答品牌、安装和授权问题；发布站点地图、AI 阅读说明与 IndexNow 所有权文件。所有内容继续由 GitHub Pages 静态托管，不引入第三方脚本、分析 SDK 或运行时依赖。

## Discovery Flow

GitHub Pages 发布首页、站点地图和 IndexNow 密钥文件。部署验证通过后，向 IndexNow 提交正式 URL，并在可登录的站长平台提交首页与 sitemap。Google 等没有匿名提交接口的平台通过 Search Console 完成所有权验证后提交；无法跳过的登录、验证码或验证令牌由维护者接手。

## Verification

本地校验检查 canonical、robots、Open Graph、Twitter Card、JSON-LD、sitemap 与 llms.txt。部署后检查正式 URL 的 HTTP 状态和内容，再验证结构化数据可解析、页面无 `noindex`、IndexNow 返回成功状态。
