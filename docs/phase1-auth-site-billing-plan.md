# Phase 1 実装計画: 認証・サイト登録・課金

最終更新: 2026-09-20
対象: 有料版の最初の実装単位
関連資料: [有料機能 要件定義書](paid-feature-requirements.md)

## 1. このPhaseのゴール

ユーザーが次の操作を完了できる状態にする。

1. アカウントを作成する
2. メールアドレスを確認する
3. ログインする
4. 利用するサイトを1件登録する
5. 月額プランを契約する
6. 契約状態を確認する
7. 支払方法の変更または解約を行う
8. ログアウトして再ログインしても登録情報が保持される

このPhaseでは新しい診断項目を追加しない。現在公開中の無料診断は従来どおり利用可能にし、有料版の認証・サイト・契約データとは分離して維持する。

## 2. 完了条件

以下をすべて満たした時点でPhase 1完了とする。

- 本番環境でメールOTPによる新規登録、ログイン、再ログインができる
- 1ユーザーにつき1サイトだけ登録できる
- Stripeのテスト環境と本番環境の両方で契約を開始できる
- StripeからのWebhookで契約状態がDBへ反映される
- Owtellの契約設定画面から支払方法変更と解約予約ができる（カード入力のみStripe Checkoutの`setup`モードへ委譲する）
- 解約予約後も契約終了日までは有料状態として扱われる
- Webアプリの再起動後もユーザー、サイト、契約状態が失われない
- 他ユーザーのサイトや契約情報へアクセスできない
- 既存の無料診断が壊れていない
- 主要フローの自動テストと手動の本番確認手順が用意されている

## 3. 採用する構成

### 3.1 推奨技術

| 用途 | 採用候補 | 理由 |
|---|---|---|
| 実行環境 | Node.js 22 / TypeScript | 現行コードを継続利用できる |
| Webフレームワーク | Next.js App Router | 公開画面、認証画面、ログイン後のダッシュボード、フォーム、APIを一つの構成で管理できる |
| 画面 | React Server Components + Server Actions | サーバー側中心で構築し、必要な操作だけClient Componentにできる |
| DB | PostgreSQL。初期候補はNeon Launch | アプリ再起動と独立して永続化でき、初期の固定費を抑えやすい |
| ORM・マイグレーション | Drizzle ORM / Drizzle Kit | TypeScriptでスキーマを管理し、SQL変更を履歴化できる |
| 認証 | Better Auth | Linbyと同じメールOTP方式とDBセッションを利用できる |
| 決済 | Stripe Checkout + Billing | カード情報を自システムで保持しなくてよい。契約管理画面はOwtell側で実装し、カード入力のみCheckoutの`setup`モードへ委譲する |
| メール | Amazon SES | 認証・再設定などのトランザクションメールを低コストで送信できる |
| テスト | Node test runner + Playwright | ロジック、HTTP、ブラウザフローを分けて確認できる |

導入時には各ライブラリの安定版を固定し、ロックファイルを更新する。特定バージョン番号は計画書へ固定せず、実装開始時に互換性を確認する。

### 3.2 外部サービスの役割

- Koyeb: Webアプリの運用
- Neon: PostgreSQLの運用
- Stripe: Checkout、継続課金、請求、支払方法、解約、領収書
- 既存の本番Amazon SES環境: 6桁のログイン用OTPメール
- Owtellアプリ: ユーザー、サイト、契約状態、画面のアクセス制御

契約の正本はStripe、アプリ内の契約テーブルはアクセス判定用の同期データとする。

KoyebのPostgreSQLも利用できるが、無料インスタンスは月5時間の計算時間に制限され、有料のsmallは月29.76米ドルである。初期の月額1,980円サービスでは固定費の割合が大きいため、まずNeonの使用量課金プランを推奨する。本番サービスを無料枠だけへ依存せず、復旧期間、バックアップ、想定負荷を確認して最終決定する。

## 4. 今回行うアプリ構成の整理

現在は`src/server.ts`にHTML、ルーティング、診断ジョブが集約されている。機能追加前にNext.js App Routerへ移行し、挙動を変えずに次の単位へ分離する。

```text
app/
  (public)/               トップ、無料診断、料金、法務表示
  (auth)/                 登録、ログイン、確認、再設定
  onboarding/             サイト登録、契約開始、完了
  dashboard/              ログイン後画面
  settings/               サイト、契約、アカウント
  api/
    auth/[...all]/        Better Auth Route Handler
    audit/                 現行の無料診断API
    billing/              Checkout、Portal
    webhooks/stripe/      Stripe Webhook
  layout.tsx              共通レイアウト
lib/
  auth/                   Better Auth設定と認証ガード
  billing/                Stripeクライアントと契約同期
  db/                     Neon接続、Drizzleスキーマ
  mail/                   Amazon SESクライアントとテンプレート
  sites/                  URL正規化、登録、更新
  config.ts               環境変数の検証
components/               再利用するUI
src/audit.ts              現行の診断処理。このPhaseでは判定を変更しない
```

診断処理はこのPhaseでは機能変更しない。無料診断の画面とAPIをNext.jsへ移しても、同じ入力と結果になることをテストで保証する。

Next.jsは画面、短いDB操作、認証、Stripe連携のBackend for Frontendとして使う。長時間かかる診断処理や将来のSearch Console定期同期はNext.jsのServer ActionやRoute Handler内で完結させず、後続Phaseで独立ワーカーへ移す。

## 5. ユーザーフロー

### 5.1 新規契約

```text
料金画面
  → メールアドレス入力
  → OTPメール送信
  → 6桁のOTPを確認してログイン
  → サイトURL登録
  → Stripe Checkout
  → 完了画面
  → Webhook反映確認
  → ダッシュボード
```

Checkoutから戻ったことだけでは契約を有効にしない。署名検証済みWebhookで有効状態を確認してから、有料ユーザーとして扱う。

サイトは決済前に`pending`状態で保存し、契約有効化後に利用可能にする。Checkoutを中断した場合は、ログイン後に同じサイトから再開できる。

### 5.2 ログイン後の分岐

| 状態 | 遷移先 |
|---|---|
| メール未確認 | 確認メール再送画面 |
| サイト未登録 | サイト登録画面 |
| サイト登録済み・契約なし | 料金確認・Checkout開始画面 |
| Checkout直後・Webhook待ち | 契約確認中画面 |
| 契約有効 | ダッシュボード |
| 支払い失敗・猶予中 | 支払い更新案内 |
| 解約予約 | ダッシュボード。契約終了日を表示 |
| 契約終了 | 再契約画面 |

### 5.3 解約

```text
契約設定
  → Owtellの契約設定画面で解約を予約
  → StripeのSubscriptionを更新
  → Webhook受信
  → アプリに終了予定日を表示
  → 終了日までは利用可能
  → 終了後は有料機能を停止
```

MVPでは即時解約や日割り返金をアプリから提供しない。例外対応はStripe管理画面から運営者が行う。

## 6. 画面要件

### 6.1 公開画面

- `/pricing`: 月額、税込表記、含まれる機能、解約条件
- `/login`: メールアドレス入力、OTP送信、6桁のOTP確認、再送導線

### 6.2 初期設定画面

- `/onboarding/site`: サイト名とURL
- `/onboarding/plan`: 契約内容とCheckout開始
- `/onboarding/complete`: Webhook反映待ちと完了表示

### 6.3 ログイン後画面

- `/dashboard`: Phase 1ではサイト名、契約状態、次のPhaseの案内
- `/settings/site`: サイト情報の確認と変更
- `/settings/billing`: 金額、状態、次回更新日、終了予定日、支払方法、請求履歴、解約予約と取り消し
- `/settings/account`: メールアドレス、ログアウト（後続実装）

### 6.4 エラー画面

- 無効または期限切れの確認リンク
- Checkout中断
- Webhook反映待ち
- 支払い失敗
- サイトURL不正
- 権限不足
- 一時的な外部サービス障害

エラーには再試行方法と問い合わせに使えるリクエストIDを表示する。

## 7. データ設計

### 7.1 認証テーブル

Better Authが要求するスキーマをDrizzleで管理する。

- `users`
- `sessions`
- `accounts`
- `verifications`

ユーザーIDはUUID文字列とし、メールアドレスには一意制約を付ける。セッションはDBへ保存し、CookieにはSecure、HttpOnly、SameSite=Laxを設定する。

### 7.2 sites

| 列 | 内容 |
|---|---|
| id | UUID、主キー |
| user_id | 所有ユーザー、外部キー、一意 |
| name | 表示名 |
| input_url | ユーザーが入力したURL |
| normalized_origin | 正規化した`scheme://host[:port]`、一意判定用 |
| status | pending / active / archived |
| ownership_status | unverified。Search Console連携時に拡張 |
| created_at | 作成日時 |
| updated_at | 更新日時 |

`user_id`を一意にして、MVPでは1ユーザー1サイトをDBでも保証する。異なるユーザーが同じ公開サイトを登録することは許容し、Search Console連携時に所有確認する。

### 7.3 subscriptions

| 列 | 内容 |
|---|---|
| id | UUID、主キー |
| user_id | ユーザー、外部キー、一意 |
| provider | stripe |
| stripe_customer_id | Stripe Customer ID、一意 |
| stripe_subscription_id | Stripe Subscription ID、一意、未契約時はnull |
| stripe_price_id | 契約中のPrice ID |
| status | incomplete / trialing / active / past_due / canceling / canceled / unpaid |
| current_period_end | 現在の契約期間終了日時 |
| cancel_at_period_end | 期間終了時解約か |
| grace_period_ends_at | 支払い失敗時の猶予終了日時 |
| created_at | 作成日時 |
| updated_at | 更新日時 |

### 7.4 stripe_webhook_events

| 列 | 内容 |
|---|---|
| stripe_event_id | Stripe Event ID、主キー |
| event_type | イベント種別 |
| status | processing / processed / failed |
| received_at | 受信日時 |
| processed_at | 処理完了日時 |
| last_error | 最後の処理エラー。機密情報は保存しない |

Event IDの一意制約でWebhookの二重処理を防ぐ。

## 8. サイト登録ルール

- `https://`または`http://`だけを受け付ける
- URL未指定時に自動補完する場合は`https://`を使用する
- ユーザー名、パスワード、フラグメントを除外する
- origin単位で登録し、登録時のパスとクエリは保存しない
- 国際化ドメインを一貫した形式に正規化する
- `localhost`、プライベートIP、リンクローカルIP、クラウドメタデータを拒否する
- DNS解決結果が公開アドレスであることを検査する
- URLへ到達できない場合は警告するが、一時障害を考慮して登録自体は可能にする
- サイト変更は契約中1回まで等の不必要な制限を設けない。ただし乱用防止の監査ログを残す

サイト所有確認はSearch Console連携のPhaseで実装する。このPhaseでは`ownership_status=unverified`として明示する。

## 9. 認証実装

### 9.1 必須機能

- メールアドレスへの6桁OTP送信と初回アカウント作成
- OTP確認によるメールアドレス所有確認
- ログインとログアウト
- ログイン済みセッションの取得
- OTPの有効期限10分、試行5回、1メールアドレスあたり1時間5送信

### 9.2 セキュリティ設定

- 本番ではHTTPS Cookieだけを使用する
- セッション有効期間は30日、利用中は1日ごとに更新する
- 契約変更など重要操作では新しいセッションを要求する
- 認証エラーからメールアドレスの登録有無を推測しにくくする
- OTP送信と確認へメール単位のレート制限を設ける
- オープンリダイレクトを防ぐため、戻り先URLはアプリ内パスだけを許可する
- 認証シークレットは十分な長さで生成し、Koyeb Secretsに保存する

### 9.3 メール

複数プロジェクトで共有している既存の本番Amazon SES環境を利用する。送信元は`Owtell <support@tool.owtell.com>`とし、既存SES環境と同じAWSリージョンを使用する。

SESの準備では次を行う。

- 既存SESアカウントと利用リージョンが本番アクセス済みであることを確認する
- `tool.owtell.com`が同じリージョンのSES Identityとして検証済みか確認する
- 未登録の場合だけ、共有環境に影響しない形でEasy DKIM用のDNSレコード、SPF、DMARCを設定する
- Owtell専用のConfiguration Setを作り、送信を他プロジェクトと識別できるようにする
- メールへOwtell用のメッセージタグを付与する
- バウンスと苦情を監視し、恒久的なバウンス先への再送を止める
- Koyeb用にOwtell専用IAMユーザーまたはアクセスキーを作り、対象Identityからの送信に必要な最小権限だけを付与する
- 他プロジェクトのIdentityやSES設定をOwtellの認証情報から変更できないようにする
- 既存のアカウントレベル抑制リスト、送信上限、バウンス・苦情通知の運用を確認する
- Node.jsからAWS SDK for JavaScript v3を使用する

- ログイン用OTP
- 契約開始、支払い失敗、解約予約はStripeメールを基本とし、必要に応じてアプリから補足する

開発・テスト環境では実メール送信を差し替えられる`Mailer`インターフェースを用意する。

## 10. Stripe実装

### 10.1 Stripe側の設定

- Product: Owtell SEO診断ツール 有料版
- Price: 月額1,980円、JPY、税込を想定
- 支払方法: 初期はカード
- 支払方法変更: Checkoutの`setup`モードでカードを登録し、`setup_intent.succeeded`で既定の支払方法に設定する
- Checkout: Stripeホスト型画面を利用
- 本番とテストでProduct ID、Price ID、Webhook Secretを分離

無料試用は初回リリースでは設けないことを推奨する。無料診断が試用の役割を持つためである。導入する場合もStripeの設定値で切り替え、コードに日数を固定しない。

### 10.2 アプリのエンドポイント

- `POST /billing/checkout`: Checkout Sessionを作成
- `GET /billing/complete`: Checkoutからの戻り先。契約確定は行わない
- 契約設定画面のServer Action: 支払方法変更用のCheckout Session作成、解約予約と取り消し
- `POST /webhooks/stripe`: 署名検証後にイベントを処理

Checkout作成時に、アプリの`user_id`をStripe CustomerまたはSubscriptionのmetadataへ設定する。既存Customerがある場合は必ず再利用し、同一ユーザーの重複契約を防ぐ。

### 10.3 処理するWebhook

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `setup_intent.succeeded`（支払方法の変更を既定の支払方法へ反映する）

Stripeのイベント名と必要イベントは実装時の公式仕様で再確認する。Webhookの受信順序には依存せず、必要に応じてStripe APIから最新Subscriptionを取得してDBへ同期する。

### 10.4 契約状態とアクセス

| DB状態 | 有料機能 |
|---|---|
| trialing / active | 利用可能 |
| past_due | 7日間の猶予中は利用可能。警告を表示 |
| canceling | 期間終了日まで利用可能 |
| incomplete / unpaid / canceled | 利用不可 |

アクセス制御は画面を隠すだけでなく、すべての有料APIでサーバー側検証する。

## 11. 環境変数

最低限、次をKoyeb Secrets経由で設定する。

```text
APP_BASE_URL
DATABASE_URL
BETTER_AUTH_SECRET
AWS_REGION
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_SES_CONFIGURATION_SET
MAIL_FROM
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_ID
```

起動時に必須環境変数を検証する。本番で不足している場合は起動を失敗させ、空文字のまま動作させない。値そのものをログへ出力しない。

## 12. 実装ステップ

### Step 0: 事前決定とサービス準備

- 月額1,980円、税込、無料試用なしを仮確定する
- Neon PostgreSQLを作成する
- StripeのProduct、Price、Customer Portalをテスト環境へ作成する
- 既存の本番Amazon SESについて、AWSアカウント、リージョン、送信上限、本番アクセス状態を確認する
- `tool.owtell.com`のIdentity、DKIM、SPF、DMARCの状態を確認し、不足分だけ設定する
- Owtell専用のConfiguration Setとメッセージタグを用意する
- Owtell専用の最小権限IAMユーザーまたはアクセスキーを作成する
- 開発、テスト、本番の環境変数一覧を用意する

成果物: 外部サービスの設定表。シークレット値はリポジトリへ保存しない。

### Step 1: Next.js App Routerへの移行

- Next.js App RouterとReactを導入する
- 現在のトップ画面をServer Componentへ移す
- 公開診断APIをRoute Handlerへ移す
- DockerfileをNext.jsの本番ビルドとstandalone出力へ対応させる
- Koyebの`PORT=8000`とヘルスチェックを維持する
- URL、Cookie、セキュリティヘッダーの共通処理を追加する
- 既存の無料診断に回帰テストを追加する

完了条件: 公開画面と無料診断の挙動が変更前と同じである。

### Step 2: DB基盤

- PostgreSQL接続を追加する
- Drizzleスキーマと初回マイグレーションを作成する
- ローカル・CI・本番でマイグレーションを実行する方法を用意する
- `/health`はプロセス確認、`/ready`はDB接続確認に分ける

完了条件: Koyeb上で再デプロイしてもテストデータが保持される。

### Step 3: 認証

- Better AuthをDBへ接続する
- Amazon SESのメール送信アダプターを追加する
- OTP送信、確認、ログイン、ログアウト画面を実装する
- 認証ガードとレート制限を追加する
- セッションCookieとCSRF対策を検証する

完了条件: OTPによる初回登録からログアウト、再ログインまでE2Eテストが通る。

### Step 4: サイト登録

- `sites`テーブルを追加する
- URL正規化と公開アドレス検査を共通関数として実装する
- 登録、表示、変更画面を実装する
- 1ユーザー1サイトをDB制約とアプリの両方で保証する
- サイト操作の所有者検証をテストする

完了条件: 別ユーザーのサイトIDを指定しても閲覧・変更できない。

### Step 5: Stripe Checkout

- Stripe Customerをユーザーごとに作成・再利用する
- Checkout Session作成を実装する
- 成功、中断、重複クリックを処理する
- テストクロックまたはStripeテスト環境で月次契約を確認する

完了条件: 二重クリックや再試行でも同じユーザーへ意図しない複数契約が作られない。

### Step 6: Webhookと契約アクセス制御

- 署名検証に必要なraw bodyを保持する
- Webhookイベントテーブルを追加する
- 対象イベントを冪等に処理する
- 契約状態を同期する
- 有料ガードを全対象ルートへ適用する
- Webhookの遅延、再送、順序逆転をテストする

完了条件: Checkoutの戻りURLを直接開いても有料化されず、Webhook後だけ有料状態になる。

### Step 7: 契約設定画面

- 支払方法変更用のCheckout Session作成と、解約予約・取り消しを実装する
- 契約状態、次回更新日、解約予定日を表示する
- 支払方法変更と期間終了時解約を確認する。契約状態の変更はWebhook受信後にのみ画面へ反映する
- 支払い失敗時の案内を実装する

完了条件: 解約予約後も終了日までは利用でき、終了後は有料APIが拒否される。

### Step 8: 本番準備

- 特定商取引法に基づく表示、利用規約、プライバシーポリシーへの導線を追加する
- Koyeb Secretsを設定する
- 本番DBマイグレーション手順とロールバック手順を確認する
- Stripe本番Webhookを登録する
- 既存の本番Amazon SESからOwtell専用設定を使った本番送信を確認する
- 他プロジェクトの送信設定やメトリクスへ影響がないことを確認する
- 監視、エラーログ、アラートを設定する
- 少額の実カード決済から解約まで通しで確認する

完了条件: リリースチェックリストをすべて満たし、障害時の無効化手順がある。

## 13. テスト計画

### 13.1 単体テスト

- URL正規化
- プライベートアドレス拒否
- 契約状態からアクセス可否への変換
- Checkout作成時の重複防止
- WebhookイベントからDB状態への変換
- リダイレクト先の検証

### 13.2 DB・HTTP統合テスト

- ユーザーとサイトの外部キー・一意制約
- セッション失効
- メール確認前のサイト登録拒否
- 他ユーザーのリソースへのアクセス拒否
- Webhookの署名不正、再送、順序逆転
- 契約終了後の有料API拒否

### 13.3 ブラウザE2E

- OTPによる新規登録
- ログインとログアウト
- サイト登録と変更
- StripeテストCheckout
- Portalでの解約予約
- モバイル幅とキーボード操作
- 無料診断の回帰確認

### 13.4 手動本番確認

- `tool.owtell.com`でCookieがSecureになる
- 確認メールが主要メールサービスへ届く
- Stripe本番の少額契約がDBへ反映される
- Stripeの請求メールと領収書を確認できる
- 解約予約と終了日時が一致する
- Koyeb再デプロイ後もログイン、サイト、契約が保持される

## 14. デプロイとマイグレーション方針

- スキーマ変更はSQLマイグレーションとしてリポジトリ管理する
- 本番起動ごとに複数インスタンスが同時マイグレーションしないよう、専用リリースコマンドで実行する
- 破壊的変更は「列追加 → データ移行 → アプリ切替 → 後日削除」の順に行う
- DBマイグレーション失敗時は新バージョンを公開しない
- StripeとAmazon SESを無効にした状態でも、無料診断とヘルスチェックは稼働できるようにする
- 課金障害時は新規Checkoutを停止し、既存ユーザーの状態を勝手に無効化しない

## 15. 実装時に作るPR

変更量を抑え、確認と切り戻しを容易にするため、次の単位を推奨する。

1. `refactor/nextjs-app-router`: Next.js移行と無料診断の回帰テスト
2. `feature/database-foundation`: PostgreSQL、Drizzle、マイグレーション
3. `feature/authentication`: 認証とメール
4. `feature/site-registration`: サイト登録
5. `feature/stripe-checkout`: CheckoutとCustomer作成
6. `feature/subscription-webhooks`: Webhook、契約同期、有料ガード
7. `feature/billing-portal`: 契約設定と解約
8. `release/paid-foundation`: 法務表示、本番設定、通し確認

各PRで`pnpm typecheck`、単体・統合テスト、無料診断の回帰テストを必須にする。

## 16. 実装開始前に決める項目

推奨する初期値を併記する。

| 項目 | 推奨初期値 |
|---|---|
| 月額 | 1,980円（税込） |
| 無料試用 | なし |
| 認証方式 | Linbyと同じメールOTP。Googleログインは後日 |
| DB | Neon LaunchのPostgreSQL。Koyebアプリと同一または近接地域 |
| メール | 既存の本番Amazon SES、`support@tool.owtell.com`、Owtell専用Configuration Set |
| 解約 | 期間終了時のみ |
| 支払い失敗猶予 | 7日 |
| サイト所有確認 | Phase 2のSearch Console連携時 |
| サイト変更 | 回数制限なし |

価格と販売条件は法務表示、Stripe設定、画面文言へ影響するため、Stripe実装へ入る前に確定する。

## 17. 参考資料

- [Koyeb Database Services](https://www.koyeb.com/docs/databases)
- [KoyebからNeonへ接続する方法](https://www.koyeb.com/docs/integrations/databases/neon)
- [Neonの料金体系](https://neon.com/blog/new-usage-based-pricing)
- [Koyebの環境変数とSecrets](https://www.koyeb.com/docs/build-and-deploy/environment-variables)
- [Better Auth](https://better-auth.com/docs/introduction)
- [Better AuthのDB構成](https://better-auth.com/docs/concepts/database)
- [Drizzleのマイグレーション](https://orm.drizzle.team/docs/migrations)
- [Stripe Checkout](https://docs.stripe.com/payments/checkout/quickstarts)
- [Stripe Customer Portal](https://docs.stripe.com/customer-management/integrate-customer-portal?locale=ja-JP)
- [Amazon SESのドメインIdentityとDKIM](https://docs.aws.amazon.com/ses/latest/dg/creating-identities.html)
- [Amazon SESの本番アクセスとSandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html)
- [AWS SDK for JavaScript v3のSES送信例](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/javascript_ses_code_examples.html)
- [Next.js App RouterのフォームとServer Actions](https://nextjs.org/docs/app/guides/forms)
- [Next.jsをBackend for Frontendとして使う](https://nextjs.org/docs/app/guides/backend-for-frontend)
- [Better AuthのNext.js連携](https://better-auth.com/docs/integrations/next)
