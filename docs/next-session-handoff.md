# 次回セッション引き継ぎ

最終更新: 2026-09-27

## 現在地

Phase 1（認証・サイト登録・Stripe課金）の実機テストは完了している。実装の中心は、`docs/goal-driven-action-planning.md`の目標駆動型SEO施策エンジンへ移っている。

`main`はクリーンで、`pnpm typecheck`と`pnpm test`（19ファイル・107件、1スキップ）が通る。最新コミットは2026-09-22のPR #35。

### Phase 1で確認済み

- 本番環境でのメールOTPによる新規登録、ログイン、ログアウト、再ログイン
- サイト登録とURLのorigin正規化
- Stripeテストモードでの契約開始と、署名検証済みWebhookによる契約状態の反映
- Owtellの契約設定画面（`/settings/billing`）での解約予約、解約予約の取り消し、支払方法変更
- 解約予約後も契約終了日までは有料状態として扱われること
- 再デプロイ後にユーザー、登録サイト、契約状態が保持されること

Stripe Customer Portalは使わず、契約管理画面はOwtell側で実装している。カード入力のみCheckoutの`setup`モードへ委譲する。

### Phase 1完了条件のうち、扱いが変わった項目

- **Stripe本番モードでの契約開始**: 未確認。本番キー・Price・Webhookの設定と実際の課金確認が残っている
- **1ユーザー1サイト**: 仕様変更により無効。`site`テーブルは`unique(user_id, normalized_origin)`で、1ユーザーが複数サイトを登録できる。サイトごとのワークスペース構成へ移行済み

### Phase 1後に実装した機能

- サイトワークスペース（`/dashboard/sites/[siteId]`）と複数サイト対応
- Googleログインによる連携と、Search Console・GA4からのデータ取得（`lib/google-data.ts`）
- サイトごとのGoogleプロパティ選択（`/dashboard/sites/[siteId]/integrations/google`）
- 指標別の目標登録と、目標のKPI分解シナリオ（`lib/goals.ts`、`lib/goal-breakdowns.ts`）
- 観測レートのベイズ推定（`lib/bayesian-rate.ts`）
- GA4キーイベントの段階割り当て（`lib/goal-key-events.ts`）
- CTAページの手動設定（`lib/goal-cta-pages.ts`、上限20件）
- GA4セッションによるファネル実績表示と、ページRPMの推定・手動入力（`lib/page-rpm.ts`）
- 診断結果のページ一覧と詳細の分割、結果サマリー

## 次にやること

`docs/goal-driven-action-planning.md`§20の設計資料が未着手である。着手順の候補は次のとおり。

1. 施策型カタログ（施策ID、対象、操作、適用・除外条件、効果、測定、依存関係）
2. 状態・シグナル辞書（現在状態の定義、必要データ、判定式、確信度）
3. カバレッジマトリクス（目標・要因・状態・データ・施策・予測・測定の接続検査）
4. 実データでの施策インスタンス生成プロトタイプ

並行して残っている運用課題は次のとおり。

- Stripe本番モードの設定と契約開始確認
- `docs/paid-feature-requirements.md`の施策管理・効果測定（施策の状態、実施日、修正前後、メモ、実施前後比較）の実装

DataForSEOの導入は、外部SEOデータAPIとして計画済みだが着手はPhase 2完了後とする。契約前にデータ保存可否の確認が必要である。

## 問題発生時に保存する情報

- 操作した時刻（日本時間）
- 対象画面と操作内容
- ブラウザに表示された文言
- Koyebログの該当部分
- Stripe Event IDまたはRequest ID
- SESのMessage ID（確認できる場合）

メールアドレス、OTP、カード情報、APIキー、Webhook署名シークレット、DB接続文字列は記録・共有しない。

メールが届かないときは、必ずKoyebのログで`[mail]`を確認する。Better Authは送信をバックグラウンドタスクで実行するため、送信に失敗しても画面は成功表示になる。
