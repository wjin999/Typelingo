# TypeLingo

通过跟打日语例句，联结汉字、读音与语义，熟悉助词和句型。

**[在线使用](https://wjin999.github.io/Typelingo/)** · 无需注册，建议先开启日语输入法。

## 使用

- 内置 egg rolls JLPT N5–N1 卡组，共 15,891 条例句与短语，支持中文翻译和假名注音。
- 选择卡组与等级后开始练习，输入完整日语句子并按 Enter 继续。
- 可导入自己的 Anki `.apkg` 卡组，需包含日语和中文字段；仅提取文本及已有注音，不导入媒体或复习进度。
- 练习记录和导入卡组保存在当前浏览器，不会自动同步。可导出／恢复进度；备份不含卡组，请保留原始 `.apkg` 文件。

## 本地运行

需要 Node.js 24 或更高版本。

```bash
npm ci
npm run dev
```

`npm test` 运行测试，`npm run build` 构建网页。推送到 `main` 后自动发布至 GitHub Pages。

## 卡组来源

默认卡组由 **[egg rolls](https://github.com/5mdld/anki-jlpt-decks)** 制作，采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh-hans) 许可。本项目提取文本、整理注音并去重，改变了数据格式与呈现方式。卡组内容限非商业使用，完整署名和修改说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
