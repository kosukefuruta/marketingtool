# CLAUDE.md

このファイルはClaude Codeがこのリポジトリで作業するときの引き継ぎ情報です。

## 現在のプロダクト

Owtellは、URLを入力して技術SEO上の問題を診断し、将来的にSEO施策と効果測定を管理するWebサービスです。過去のLPコピー生成構想は採用していません。

- 現行仕様: `docs/seo-audit-v0.1.md`
- プロダクト計画: `docs/product-plan.md`
- 有料機能要件: `docs/paid-feature-requirements.md`
- Phase 1計画: `docs/phase1-auth-site-billing-plan.md`
- Koyeb設定: `docs/koyeb-deployment-checklist.md`
- 次回の実機テスト: `docs/next-session-handoff.md`

## 技術構成

- Node.js 22以上 / TypeScript / pnpm
- Next.js App Router / React
- PostgreSQL（Neon）/ Drizzle ORM
- Better AuthのメールOTP / Amazon SES
- Stripe Checkout（subscription / setup）、Subscription Webhook
- PlaywrightによるSEO診断
- KoyebへDockerfileでデプロイ

## 開発コマンド

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

DBマイグレーション:

```bash
pnpm db:migrate
```

## 本番環境

- URL: `https://tool.owtell.com`
- 2026-09-20時点で `/health`、`/ready`、`/pricing`、`/login` はHTTP 200
- KoyebはDockerfileのデフォルトCommand・Args・Entrypointを使用する
- コンテナ起動時にDBマイグレーション後、Next.jsサーバーを起動する
- Koyebの環境変数は設定済み。値をログやドキュメントへ出さないこと
- SESは `tool.owtell.com` Identity、送信元は `Owtell <support@tool.owtell.com>`
- Stripeはテストモードを設定済み

## 次に行うこと

Phase 1の実機テストを行う。順番と記録項目は`docs/next-session-handoff.md`に従う。

実機テストが完了するまでは、Phase 2のSearch Console連携や施策管理へ進まない。

## 作業上の注意

- ユーザーとのやり取りは日本語で行う
- シークレット値を表示、コミット、ログ出力しない
- 既存の無料SEO診断を壊さない
- Stripe Checkoutから戻っただけでは有料化せず、署名検証済みWebhookだけを正本にする
- Koyebのデプロイが遅い場合、まずヘルスチェック再試行ループと起動ログを確認する
- 変更後は最低限`pnpm typecheck`、`pnpm test`、`pnpm build`を実行する
- 未追跡の旧LP生成関連ファイルは、ユーザーの明示指示なしに削除・コミットしない
