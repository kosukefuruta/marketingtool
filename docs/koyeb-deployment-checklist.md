# Koyeb デプロイ設定チェックリスト

最終更新: 2026-09-20

## Service設定

- Builder: `Dockerfile`
- 公開ポート: `8000` / HTTP
- Liveness用HTTPヘルスチェック: `/health`
- Readiness確認: デプロイ後に `/ready` がHTTP 200を返すこと
- インスタンス数: 初回リリースでは1台
- リージョン: Neon PostgreSQLに近いリージョン

`/health`はプロセスが応答できるかだけを確認する。`/ready`はPostgreSQLへ接続できるかも確認するため、デプロイ確認には両方を使う。

## Koyeb Secrets

次の値をKoyebの環境変数ではなくSecretsとして登録する。

| 名前 | 取得元・用途 |
|---|---|
| `DATABASE_URL` | Neonの接続文字列。SSL必須の接続文字列を使用 |
| `BETTER_AUTH_SECRET` | 32バイト以上の暗号学的乱数 |
| `SES_ACCESS_KEY_ID` | Owtellの送信だけを許可したAWS IAMキー |
| `SES_SECRET_ACCESS_KEY` | 上記IAMキーのSecret |
| `STRIPE_SECRET_KEY` | Stripe本番用Secret key |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook endpoint作成後に表示されるSigning secret |

## Koyeb環境変数

| 名前 | 本番値 |
|---|---|
| `APP_BASE_URL` | `https://tool.owtell.com` |
| `BETTER_AUTH_URL` | `https://tool.owtell.com` |
| `SES_REGION` | SES Identityが存在するリージョン（現候補: `ap-northeast-1`） |
| `AWS_SES_CONFIGURATION_SET` | Owtell専用Configuration Set名 |
| `MAIL_FROM` | `Owtell <support@tool.owtell.com>` |
| `STRIPE_PRICE_ID` | 月額1,980円プランの本番Price ID |
| `TRUSTED_PROXY_HEADER` | `x-forwarded-for`（Koyebが末尾へ追加する送信元IPを使用） |

Koyebが与える`PORT`はアプリが自動で利用するため、通常は手動設定しない。
`TRUSTED_PROXY_HEADER`には、利用するプロキシが保証するヘッダーだけを設定する。Koyebでは`x-forwarded-for`の末尾IPだけが真正と保証されるため、アプリも末尾を利用する。未設定または不正なIPの場合は、無料診断のレート制限上、安全側の共通キーとして扱われる。

## 外部サービス側の設定

### DNS

- `tool.owtell.com`をKoyebのCustom Domainへ接続する
- HTTPS証明書の発行完了後に本番の認証・課金を確認する

### Stripe

- Webhook URL: `https://tool.owtell.com/api/webhooks/stripe`
- 対象イベント:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `setup_intent.succeeded`

### Amazon SES

- `tool.owtell.com`のIdentityとDKIMを確認する
- Owtell専用Configuration Setを作成する
- IAMキーはSES送信に必要な最小権限だけを付与する

## 初回デプロイ後の確認

1. `/health`がHTTP 200を返す
2. `/ready`がHTTP 200を返す
3. OTPメールを送信してログインできる
4. サイトを1件登録できる
5. Stripeテスト環境でCheckoutを完了できる
6. Webhook反映後だけ有料状態になる
7. 契約設定画面で解約予約と支払方法変更ができる
8. 再デプロイ後もログイン・サイト・契約情報が残る

## 現在の注意点

コンテナ起動時に`pnpm db:migrate`を実行する構成である。複数インスタンスを同時起動するとマイグレーションが競合する可能性があるため、専用のリリース処理へ分離するまでは1台で運用する。
