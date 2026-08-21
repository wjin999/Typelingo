# TypeLingo

TypeLingo 是一个通过跟打英文句子练习英语输入的纯前端网页应用。

页面展示英文原句，用户输入完全相同的英文内容。系统逐字符显示正确、错误和未输入状态，并在练习结束后统计打字速度、正确率和错误次数。

## 核心功能

- 从 JSON 文件加载英文句子
- 每组随机选择最多 10 个句子
- 展示英文原句并进行英文跟打
- 严格检查大小写、空格和标点
- 逐字符显示正确和错误状态
- 支持使用 Backspace 修正输入
- 完成句子后按 Enter 继续
- 统计练习用时、正确率和 WPM
- 支持重新练习出错的句子
- 使用 localStorage 保存历史成绩

## 内容格式

课程内容统一使用 JSON：

{
  "schemaVersion": 1,
  "id": "en-basic",
  "title": "Basic English Sentences",
  "targetLanguage": "en",
  "items": [
    {
      "id": "en-basic-0001",
      "text": "I like apples."
    },
    {
      "id": "en-basic-0002",
      "text": "She drinks water every morning."
    }
  ]
}

## 技术方案

- React
- Vite
- TypeScript
- CSS
- localStorage
- GitHub Pages

## 项目限制

第一版不包含：

- 中文翻译
- 用户登录
- 后端服务
- 云端数据库
- 在线排行榜
- 用户内容导入
- AI 或 LLM API

## 数据说明

课程内容保存在项目的 JSON 文件中。

用户的练习记录保存在当前浏览器中。清除网站数据、更换浏览器或更换设备可能导致记录丢失。
