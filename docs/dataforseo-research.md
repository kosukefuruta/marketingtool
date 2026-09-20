# DataForSEO 調査記録

最終更新: 2026-09-21
調査方法: 公式サイト、公式ドキュメント、公式料金ページ、公式配布CSV、利用規約の確認

## 1. 結論

Owtellの有料版および将来の上位版にDataForSEOを組み込む前提で計画する。従量課金の単価が想定価格（月1,980円）に対して十分小さく、原価が制約にならないため。

ただし着手はPhase 1の実機テストとPhase 2（Search Console連携）の完了後とする。DataForSEOはSearch Consoleの代替ではない。

## 2. サービス概要

- 運営: DataForSEO OU（エストニア共和国登記、法人番号14502291、Tallinn所在）
- 性格: 自社UIを持たず、構造化データ（生JSON）を返すSEOデータAPIの提供事業者
- 想定顧客（公式記載）: SEO代理店、SEOツール開発者、エンタープライズ、EC事業者、メディア
- 課金: 完全従量課金。月額サブスクリプションなし
- 最低入金額: 50米ドル。最低月額の記載は確認できず
- 無料枠: 登録時に1米ドルのクレジット（期間無制限）、Sandboxは無料

出典: https://dataforseo.com/ , https://dataforseo.com/pricing

## 3. 提供API

| API | 返すもの |
|---|---|
| SERP API | Google / Bing / YouTube / Yahoo / Baidu / Naver / Seznam の検索結果。Organic、AI Mode、Maps、Local Finder、News、Images ほか |
| Keywords Data API | Google Ads（検索ボリューム、キーワード候補）、Google Trends、Bing Ads、Clickstream |
| Backlinks API | 被リンク、参照ドメイン、ドメイン指標 |
| OnPage API | サイトクロールによる技術SEO診断 |
| DataForSEO Labs API | キーワードリサーチ、競合調査、検索意図、順位履歴 |
| Business Data API | Googleビジネスプロフィール、Google Hotels、Trustpilot、Tripadvisor |
| その他 | AI Optimization、Reviews、App Data、Merchant、Domain Analytics、Content Analysis |

OnPage APIの主なエンドポイント: task_post、summary、pages、duplicate_tags、duplicate_content、links、redirect_chains、non_indexable、waterfall、keyword_density、raw_html、instant_pages、page_screenshot、lighthouse。

出典: https://docs.dataforseo.com/v3/ , https://docs.dataforseo.com/v3/on_page-overview/

## 4. 単価（すべて米ドル）

| 用途 | 単価 | 課金単位 |
|---|---|---|
| SERP（Google Organic、標準・約5分） | 0.0006 | 検索結果10件＝1 SERP |
| SERP（Priority、約1分） | 0.0012 | 同上 |
| SERP（Live、約6秒） | 0.002 | 同上 |
| OnPage クロール（BASIC） | 0.00015 | 1ページ |
| OnPage（JavaScript実行） | 0.0015 | 1ページ |
| OnPage（ブラウザレンダリング） | 0.0051 | 1ページ |
| Lighthouse | 0.005 | 1ページ |
| Instant Pages（単一ページLive診断） | 0.00015 | 1ページ |
| キーワードボリューム（Google Ads、標準） | 0.06 | 1タスク（最大1,000キーワード） |
| 被リンク | 0.024＋0.000036/行 | リクエスト＋返却行 |
| DataForSEO Labs（多くのエンドポイント） | 0.012＋0.00012/件 | タスク＋アイテム |

SERPの注意点: `depth=100` は10 SERP分として課金される。検索演算子（site:、intitle: など）の使用で単価が5倍になる。

出典: https://dataforseo.com/pricing/google-serp/google-organic-serp-api , https://dataforseo.com/pricing/on-page/onpage-api , https://dataforseo.com/help-center/cost-of-onpage-api-parameters

## 5. Owtellの原価に当てはめた試算

1米ドル150円、月額1,980円（約13米ドル）を前提とする。

| 想定機能 | 数量 | 月額原価 |
|---|---|---|
| 検索順位の週次計測 | 150キーワード×週1回 | 約0.36米ドル（約54円） |
| 検索順位の週次計測 | 300キーワード×週1回 | 約0.72米ドル（約108円） |
| サイト診断をOnPage APIへ移管 | 300ページ×月1回 | 約0.045米ドル（約7円） |
| キーワードボリューム取得 | 1,000キーワード×月1回 | 0.06米ドル（約9円） |

日次計測は原価が跳ね上がる（300キーワード×30日で約5.4米ドル）ため、`product-plan.md`の「月1回の診断・随時の施策更新」という周期と整合する範囲に留める。

参考: Nobilistaは150キーワードで月額990円（税込）、300キーワードで月額1,860円（税込）。

## 6. 技術仕様

- 認証: HTTP Basic認証。`Authorization: Basic <base64(login:password)>`。URLパラメータ不可。ダッシュボードのAPI Accessタブで取得し、ログインパスワードとは別
- レスポンス: 既定はJSON（UTF-8）。URL末尾に`.xml` / `.html`も可
- レート制限: 全体で2,000リクエスト/分。Google Ads Liveは12/分、Tasks Readyは20/分など例外あり
- 同時実行: 最大30（OnPage、Labs、Backlinks等）
- 1回のtask_postで最大100タスク。OnPageのInstant Pages等は最大20
- Live方式は即時に返るが結果を保存しない。Task方式はキュー経由で、結果はJSON 30日、raw_html 7日保存される
- Backlinks APIとDataForSEO Labs APIはLiveのみ

出典: https://docs.dataforseo.com/v3/auth/ , https://dataforseo.com/help-center/rate-limits-and-request-limits , https://dataforseo.com/help-center/how-long-do-you-keep-results

## 7. 日本市場への対応

- 日本のlocation_codeは2392（country_iso_code=JP、language_code=ja）。キーワードDBは約3.1億件、SERPは約1,661万件と記載
- SERP用ロケーションCSVにcountry_iso_code=JPの地域が27,892件。都道府県単位の指定が可能（例: 20624 Hokkaido、20627 Miyagi）
- `se_domain`パラメータで`google.co.jp`を明示指定できる

出典: https://cdn.dataforseo.com/v3/locations/locations_and_languages_dataforseo_labs_2026_09_01.csv , https://docs.dataforseo.com/v3/serp/google/organic/task_post/

## 8. 導入前に確認すること

1. **取得データの保存と、ユーザーへの表示の可否**。利用規約本文に保存・再配布・再販を明示的に許可または禁止する条項を確認できなかった。Owtellは取得データを保存して契約者に表示する前提のため、契約前にDataForSEOへ書面で確認する
2. **利用規約第7条**: 取得したSERPデータを、提供元の検索エンジン事業者と競合する目的、またはその事業上の利益に悪影響を与える目的で使用してはならない。違反時の補償義務も定められている
3. **返金条件**: API creditsの初回購入に限り30日間の無条件返金。実装ミスによる消費は返金対象外
4. **提供対象外地域**: ロシア、ベラルーシ、キューバ、イラン、シリア、ミャンマー、北朝鮮、クリミアおよびロシア占領下のウクライナ領土
5. **障害時の責任**: システム停止やデータ損失について責任を負わないと明記されている。順位計測が止まった場合のOwtell側の表示方針を決めておく

出典: https://dataforseo.com/terms-of-service （最終更新 2026年6月12日）

## 9. Owtellでの用途（優先度順）

### 9.1 上位版の検索順位計測

`product-plan.md`の将来の上位版に位置づける。原価が安く、日本市場に需要があることはNobilistaの価格帯から確認できる。Search Consoleの平均掲載順位とは別に、指定キーワードの実際の検索結果上の順位を提供する。

### 9.2 施策の優先度付けに使う検索ボリューム

Keywords Data APIで、施策の対象キーワードの月間検索ボリュームを取得する。「この修正は月間ボリューム◯のキーワードに効く」と示せると、施策管理の説得力が上がる。

### 9.3 サイト診断のクロール基盤の移管（任意）

OnPage APIは1,000ページあたり0.15米ドル。現在のPlaywrightによる自前クロールは、単一の実行枠とコンテナのメモリを消費している。移管すれば運用は軽くなるが、プロダクトの差別化には寄与せず、既存の無料診断は動作しているため急がない。

## 10. 位置づけの注意

DataForSEOはSearch Consoleの代替ではない。Search Consoleはユーザー自身のサイトの実績（表示回数、クリック数、CTR、平均掲載順位）を無料で返す一次データであり、`product-plan.md`第8章の効果測定はこれに依存する。DataForSEOが返すのは外部から観測した検索結果であり、効果測定の正本にはしない。

Owtellの差別化は引き続き施策の実行管理と効果測定に置く。DataForSEOを導入しても、診断項目数やデータ量で総合SEOツールと正面から競争する方針には変えない。
