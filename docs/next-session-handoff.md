# 次回セッション引き継ぎ: Phase 1 実機テスト

最終更新: 2026-09-20

## 現在地

認証・サイト登録・Stripe課金基盤をKoyebへデプロイ済み。

確認済み:

- `https://tool.owtell.com/health` がHTTP 200
- `https://tool.owtell.com/ready` がHTTP 200
- `/pricing` と `/login` がHTTP 200
- Neonへのマイグレーション成功
- DockerfileのデフォルトCMDで、マイグレーション後にNext.jsが起動する
- ローカルの型チェック、24件のテスト、本番ビルド、Docker起動確認が成功
- Amazon SESの`tool.owtell.com` Identityと送信元`support@tool.owtell.com`を設定済み
- Stripeテストモードのキー、Price、Webhookを設定済み

未確認:

- 実メールへのOTP到達
- OTPによる新規登録、ログイン、ログアウト、再ログイン
- サイト登録と変更
- Stripe Checkoutの完了
- Stripe Webhookによる契約反映
- 契約設定画面からの支払方法変更と解約予約
- 再デプロイ後のデータ保持

## 実機テストの順番

### 1. OTP認証

1. `https://tool.owtell.com/login`を開く
2. 実際に受信できるメールアドレスを入力する
3. `Owtell <support@tool.owtell.com>`から6桁OTPが届くことを確認する
4. 10分以内にOTPを入力してログインする
5. ログアウトし、同じメールアドレスで再ログインする

確認するログ:

- Koyebに`[mail] SES send failed`がない
- Amazon SESで送信、バウンス、苦情に異常がない

### 2. サイト登録

1. 公開サイトのURLを登録する
2. パスやクエリがoriginへ正規化されることを確認する
3. ダッシュボードとサイト設定に同じサイトが表示されることを確認する
4. 別URLへ変更し、1ユーザー1サイトの制約が維持されることを確認する

### 3. Stripeテスト決済

1. ダッシュボードから月額プランのCheckoutを開始する
2. Stripeテストカード`4242 4242 4242 4242`を使用する
3. 有効期限は将来の日付、CVCは任意の3桁を入力する
4. Checkout完了直後は「確認中」になり、Webhook反映後だけ有料状態になることを確認する
5. Stripe Workbenchで対象WebhookがHTTP 200になっていることを確認する

対象イベント:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `setup_intent.succeeded`（支払方法の変更に必要。Stripeのエンドポイント設定に追加すること）

Webhook URL:

```text
https://tool.owtell.com/api/webhooks/stripe
```

### 4. 契約設定画面

1. 契約設定を開き、状態・次回請求日・登録カード・請求履歴が表示されることを確認する
2. 「期間終了時に解約する」を実行する
3. Webhook反映後に状態が「解約予定」へ変わり、契約終了日が表示されることを確認する
4. 解約予約後も有料状態が維持されることを確認する
5. 「解約予約を取り消す」で状態が「利用中」へ戻ることを確認する
6. 「支払方法を変更」からStripeのカード登録画面へ遷移し、`4242 4242 4242 4242`で登録できることを確認する
7. 登録後に表示されるカードの末尾4桁が更新されることを確認する

契約状態はWebhook受信後にのみ変わる。操作直後は「Stripeからの確認を待っています」と表示され、反映され次第自動で更新される。

### 5. 永続化

1. Koyebを再デプロイする
2. 再ログインできることを確認する
3. 登録サイトと契約状態が保持されていることを確認する

## 問題発生時に保存する情報

- 操作した時刻（日本時間）
- 対象画面と操作内容
- ブラウザに表示された文言
- Koyebログの該当部分
- Stripe Event IDまたはRequest ID
- SESのMessage ID（確認できる場合）

メールアドレス、OTP、カード情報、APIキー、Webhook署名シークレット、DB接続文字列は記録・共有しない。

## 実機テスト後

すべて成功したら、`docs/phase1-auth-site-billing-plan.md`の完了条件と照合する。未達項目をIssueまたは次のPRへ分け、Phase 1完了後にPhase 2（Search Console連携）へ進む。
