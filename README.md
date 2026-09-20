# Marketing Tool

URLを入力すると、公開サイトを巡回して技術SEO上の問題をMarkdownにまとめるCLIツールです。

外部の検索順位APIや有料サービスは使いません。JavaScriptで描画されるサイトも確認できるよう、Playwrightでページを読み込みます。

## 必要な環境

- Node.js 22以上
- pnpm

## セットアップ

```bash
pnpm install
pnpm exec playwright install chromium
```

## 使い方

```bash
pnpm seo:audit https://example.com
```

`https://`は省略できます。

```bash
pnpm seo:audit example.com
```

既定では最大100ページを巡回し、カレントディレクトリに`seo-report.md`を生成します。

```bash
pnpm seo:audit example.com --max=50 --output=report.md
```

### オプション

| オプション | 内容 | 既定値 |
|---|---|---:|
| `--max=<件数>` | 巡回する最大ページ数（1〜1000） | 100 |
| `--output=<パス>` | レポートの出力先 | `seo-report.md` |

## 診断項目

- HTTPエラーとページ取得失敗
- title、meta description、H1の欠落
- titleとmeta descriptionの重複
- meta robotsの`noindex`
- canonicalの欠落と別ドメイン指定
- HTMLのlang属性
- 可視テキストが極端に少ないページ
- alt属性のない画像
- リダイレクト
- robots.txtとXMLサイトマップの取得状況

XMLサイトマップとページ内の内部リンクから、同じオリジンのURLを発見して巡回します。

公開Web版は標準100ページ、最大300ページを診断します。巡回時はSEO診断に不要な画像・動画・フォントの取得を省略し、通信量とメモリ使用量を抑えます。

Web版の診断はバックグラウンドで実行されます。画面遷移せずに診断状況を確認し、完了すると同じページ内にMarkdownレポートを表示します。レポートは完了から約1時間、実行したサーバーのメモリ上に保持されます。JavaScriptが無効な環境では進捗ページへ遷移します。

## 開発

```bash
pnpm typecheck
```

## Koyebへデプロイ

このリポジトリにはPlaywrightとChromiumを含む`Dockerfile`があります。

1. KoyebでWeb Serviceを作成する
2. GitHubの`kosukefuruta/marketingtool`を選択する
3. Builderに`Dockerfile`を選択する
4. 公開ポートを`8000`、プロトコルをHTTPにする
5. HTTPヘルスチェックのパスを`/health`にする
6. デプロイする

アプリケーションはKoyebが設定する`PORT`環境変数を利用します。Chromiumを起動するため、メモリ不足になる場合はインスタンスサイズを上げてください。

詳しい現在の仕様は[docs/seo-audit-v0.1.md](docs/seo-audit-v0.1.md)を参照してください。

## 現在の制約

- 公開ページのみが対象です。ログインが必要なページには対応していません。
- 検索順位やSearch Consoleのデータは取得しません。
- 判定は機械的に確認できる技術項目が中心です。
- コンテンツ品質や検索順位の向上を保証するものではありません。
