# even-g2-app

一个用于 Even G2 / Even Hub 场景的中越翻译前端插件项目。  
这个项目负责采集输入文本、调用 Render 上部署的翻译 API，并把翻译结果返回到前端显示流程中。

## 功能说明

当前版本已完成：

- 前端项目初始化与本地运行
- 调用 Render 部署的翻译接口
- 将输入文本发送到后端翻译 API
- 接收并处理翻译结果
- 项目代码已托管到 GitHub

## 项目结构

```text
even-g2-app/
├─ public/
├─ src/
│  ├─ assets/
│  ├─ counter.ts
│  ├─ main.ts
│  └─ style.css
├─ app.json
├─ index.html
├─ package.json
├─ tsconfig.json
└─ vntranslator.ehpk
```

## 安装依赖

```bash
npm install
```

## 本地运行

```bash
npm run dev
```

如果项目支持构建，也可以使用：

```bash
npm run build
```

## 后端接口

本项目前端会调用 Render 上部署的翻译 API。  
后端仓库与接口服务需要先正常部署后，前端调用才会成功。

请把 `src/main.ts` 中使用的接口地址改成你当前可用的 Render 服务地址。

例如：

```ts
const API_URL = "https://vn-translator-api.onrender.com/translate";
```

## 关键文件

- `src/main.ts`：前端主逻辑，负责请求翻译接口与处理返回结果
- `src/style.css`：页面样式
- `app.json`：应用配置
- `vntranslator.ehpk`：项目相关打包/插件文件

## 开发记录

当前 GitHub 已保存一个可工作的初始版本：

- Initial frontend project with Render translation API

这个版本可作为后续继续开发的基线版本。

## 常用 Git 命令

查看状态：

```bash
git status
```

提交修改：

```bash
git add .
git commit -m "Describe your change"
git push
```

## 后续计划

- 优化翻译请求错误处理
- 增加加载状态提示
- 优化翻译结果显示
- 进一步接入 Even G2 / Even Hub 实际插件流程