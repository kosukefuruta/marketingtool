# SEO診断ツール v0.1

任意の公開サイトのURLを入力し、サイト内を巡回して技術SEO上の問題をMarkdownで出力する。

## 使い方

```bash
pnpm seo:audit <URL>
pnpm seo:audit <URL> --max=100 --output=seo-report.md
```

`https://`を省略したドメイン名も入力できる。既定では最大100ページを巡回し、`seo-report.md`を生成する。

## 診断項目

- HTTPエラーと取得失敗
- title、meta description、H1の欠落と重複
- meta robotsのnoindex
- canonicalの欠落と別ドメイン指定
- htmlのlang属性
- 可視テキストが極端に少ないページ
- alt属性のない画像
- リダイレクト
- robots.txtとXMLサイトマップの取得状況

サイトマップに掲載されたURLと、ページ内の内部リンクから見つけた同一オリジンのURLを巡回する。外部サイト、ログインが必要なページ、Search Consoleの実績データはv0.1の対象外。

Web版は標準100ページ、最大300ページ。画像・動画・フォントは取得せず、HTML・CSS・JavaScriptを使ったSEO診断に必要な描画に絞る。

## 制約

- 診断は機械的に確定できる項目に限る
- 検索順位や上位表示を保証しない
- JavaScriptで描画されるページを扱うためPlaywrightを使う
- URLパラメータが異なるページは別URLとして扱う（計測用パラメータは除去する）
