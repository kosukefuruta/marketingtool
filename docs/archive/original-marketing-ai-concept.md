# Marketing AI 構想・システム設計案

> [!NOTE]
> これはプロジェクト初期の構想を保存した履歴資料であり、現在の仕様やロードマップではありません。
> 現在のプロダクト方針は [`docs/product-plan.md`](../product-plan.md) を参照してください。

## 1. 概要

企業・個人事業主が、自社の商品・顧客・競合・価格・過去のマーケティング上の意思決定などを継続的に理解しているAIに相談できるサービスを構築する。

単なる「マーケティング特化型チャットAI」ではなく、

- Marketing Memory
- Marketing Workflow
- LLM

を分離した構造とする。

特に **Marketing MemoryをLLMから独立させる**ことを重要な設計思想とする。

これによりOpenAI、Anthropic、Google等のモデルを将来変更しても、ユーザー企業について蓄積した知識を維持できる。


---

# 2. プロダクトコンセプト

一般的な生成AIは基本的に、

```
質問
↓
回答
```

という構造である。

Marketing AIでは、

```
企業・商品を理解
↓
過去の意思決定を理解
↓
現在の状況を理解
↓
質問に必要なMemoryを取得
↓
マーケティングの専門的なWorkflowで分析
↓
提案
↓
人間が意思決定
↓
意思決定・結果をMemoryへ保存
↓
次回はその状態から相談
```

という継続的なサイクルを作る。

目指すのは、

> 「マーケティングについて答えるAI」

ではなく、

> 「自社のマーケティングを継続的に理解しているAI」

である。


---

# 3. 想定ユーザー

初期ターゲットとして以下を想定する。

- 個人開発者
- スタートアップ
- 中小企業
- EC事業者
- SaaS事業者
- マーケティング担当者
- マーケティング支援会社

特に、

- 専任マーケターがいない
- 経営者や開発者がマーケティングも担当している
- ChatGPT等には既にマーケティング相談をしている
- 毎回サービスの前提を説明するのが面倒
- AIに企業情報を渡すことには不安がある

というユーザーを想定する。


---

# 4. 全体アーキテクチャ

Marketing AIの中核機能はAPIとして実装する。

Webアプリ、MCP、将来のPublic APIなどはすべて同じMarketing APIを利用する。

```
                    ┌───────────────┐
                    │    Web App    │
                    └───────┬───────┘
                            │
                    ┌───────▼───────┐
Claude / Cursor →   │ Marketing API │ ← Public API
      MCP            └───────┬───────┘
                             │
                ┌────────────▼────────────┐
                │    Marketing Engine     │
                │                         │
                │ ・Consult               │
                │ ・LP Review             │
                │ ・Copy Review           │
                │ ・Pricing Review        │
                │ ・SEO Review            │
                │ ・Strategy              │
                │ ・Research              │
                └─────────┬───────┬───────┘
                          │       │
                ┌─────────▼─┐   ┌─▼──────────────┐
                │ Marketing │   │  LLM Adapter   │
                │  Memory   │   │                │
                └───────────┘   │ OpenAI         │
                                │ Anthropic      │
                                │ Google         │
                                │ etc.           │
                                └────────────────┘
```


---

# 5. LLMとサービスを分離する

Marketing AIそのものを特定LLMに依存させない。

概念的には以下のようなインターフェースを設ける。

```typescript
interface LLMProvider {
  generate(
    context: MarketingContext,
    prompt: string
  ): Promise<LLMResponse>;
}
```

その上で、

```text
OpenAIProvider
AnthropicProvider
GeminiProvider
```

などを実装する。

これにより、

```
Marketing Memory
      +
Marketing Workflow
      +
GPT
```

から、

```
Marketing Memory
      +
Marketing Workflow
      +
Claude
```

への変更などを可能にする。

将来より優れたモデルが登場しても、企業固有のMarketing Memoryは維持する。


---

# 6. Marketing Memory

## 6.1 基本思想

チャット履歴そのものをMemoryの中心にはしない。

マーケティング上意味のある情報を抽出し、構造化して保存する。

例：

```
Project Memory

Company
├─ 会社概要
├─ 事業
└─ ブランド

Product
├─ 商品概要
├─ 機能
├─ 強み
├─ 弱み
└─ 提供価値

Customer
├─ ターゲット
├─ ペルソナ
├─ 課題
├─ 購買理由
└─ 購買障壁

Market
├─ 市場
├─ 競合
├─ 代替手段
└─ 市場仮説

Business
├─ 価格
├─ 収益モデル
├─ KPI
├─ CAC
├─ CVR
└─ LTV

Strategy
├─ ポジショニング
├─ チャネル
├─ SEO
├─ 広告
└─ GTM

History
├─ Decision
├─ Hypothesis
├─ Experiment
├─ Result
└─ Learning
```


---

# 7. Memoryの種類

Memoryには少なくとも以下の種類を持たせることを検討する。

## Fact

確認済みの事実。

例：

```
Basicプランは月額980円
```

## Goal

目標。

例：

```
6ヶ月以内に有料ユーザー100人を目指す
```

## Constraint

制約。

例：

```
初期段階では広告予算を月5万円以内にする
```

## Hypothesis

まだ確認されていない仮説。

例：

```
ユーザーは価格より設定の簡単さを重視している可能性がある
```

## Proposal

AIまたは人間から出された提案。

例：

```
Basicプランを780円へ変更する
```

## Decision

人間によって確定された意思決定。

例：

```
Basicプランは980円を維持する
```

## Experiment

実施する検証。

例：

```
新しいファーストビューを50%のユーザーに表示する
```

## Result

施策・実験結果。

## Learning

結果から得られた知見。


---

# 8. Decision Memory

特に重要なのが意思決定履歴である。

単に、

```
Basicプランは980円
```

と保存するだけでなく、

```json
{
  "type": "decision",
  "content": "Basicプランは980円とする",
  "reason": "780円との差額よりARPUを優先すると判断したため",
  "alternatives": [
    "780円",
    "1,280円"
  ],
  "status": "active",
  "created_at": "...",
  "updated_at": "..."
}
```

のように「なぜそうしたのか」まで保存する。

これにより、

> 「なぜこの価格にしたのか？」

という質問にも後から回答できる。


---

# 9. AIの提案と人間の意思決定を分離する

AIが提案しただけではDecisionにしない。

```
AI Proposal
↓
ユーザー確認
↓
採用
↓
Decision
```

とする。

UI例：

```
PROPOSAL

Basicプランを980円から780円へ変更する

理由：
価格障壁を下げ、有料転換率を上げるため。

[採用する]
[保留]
[却下]
```

「採用する」が押された場合のみDecision Memoryとして登録する。

AIが企業方針を勝手に変更しない構造にする。


---

# 10. Memoryのメタデータ

各Memoryには可能な限り以下を持たせる。

```json
{
  "id": "...",
  "project_id": "...",
  "type": "fact",
  "category": "pricing",
  "content": "...",

  "source_type": "user",
  "source_reference": null,

  "confidence": "high",

  "security_level": "internal",

  "allow_llm": true,

  "status": "active",

  "created_at": "...",
  "updated_at": "..."
}
```

特に、

- 情報の種類
- 出典
- 信頼度
- 機密レベル
- LLMへの送信可否
- 現在も有効か

を区別できるようにする。


---

# 11. 情報の出典

Memoryには出典を持たせる。

例：

```text
user
website
uploaded_document
research
analytics
AI_inference
```

例えば、

```
競合AのBasicプランは月額4,980円
```

なら、

```
source_type:
website

source_reference:
競合公式料金ページ

verified_at:
2026-08-17
```

とする。

一方、

```
この市場では価格より操作性が重要である可能性がある
```

なら、

```
source_type:
AI_inference

confidence:
medium
```

とする。

事実とAIの推測を明確に分離する。


---

# 12. セキュリティ設計

Marketing AIでは、

- 売上
- 広告費
- CVR
- CAC
- 未公開商品
- 価格戦略
- 顧客情報
- 競合戦略

などの機密情報を扱う可能性が高い。

そのためPrivacy/SecurityはEnterprise向け追加機能ではなく、基本設計に含める。


---

# 13. Memoryの機密区分

例えば以下の4段階を検討する。

## PUBLIC

公開情報。

例：

- Webサイト
- 公開価格
- 公開商品情報

## INTERNAL

一般的な社内情報。

例：

- ターゲット
- マーケティング方針
- 社内KPI

## CONFIDENTIAL

重要な機密情報。

例：

- 売上
- 広告費
- CVR
- CAC
- 未公開商品
- 未公開価格

## RESTRICTED

外部LLMへの送信を禁止する情報。

例：

- 個人情報
- 顧客名簿
- 特に機密性の高い契約情報
- 認証情報等


---

# 14. 「保存」と「外部AI送信」を分離する

非常に重要な仕様。

情報について、

1. Marketing AIに保存してよいか
2. 外部LLMへ送信してよいか

を別々に管理する。

例：

| 情報 | 保存 | 外部LLM |
|---|---|---|
| 商品情報 | YES | YES |
| ターゲット | YES | YES |
| 売上 | YES | YES |
| 顧客名 | YES | NO |
| 顧客名簿 | NO/YES | NO |

これにより、

> 「Marketing AIには管理させたいが、OpenAI等には送信したくない」

という要求にも対応できる。


---

# 15. 必要なMemoryだけをLLMへ送信する

質問のたびに全MemoryをLLMへ送らない。

例えば、

> LPのファーストビューを改善して

という質問なら、

```
Product
Target
Positioning
Competitors
Brand
Current LP
```

など必要な情報だけを取得する。

処理イメージ：

```
User Question
      ↓
Intent Analysis
      ↓
Context Planner
      ↓
Memory Retrieval
      ↓
Security Filter
      ↓
Prompt Builder
      ↓
LLM
```

これにより、

- 不必要な情報送信を防ぐ
- APIコストを下げる
- コンテキストを整理する
- 回答精度を上げる

ことを狙う。


---

# 16. Marketing Engine

LLMに単純なプロンプトを送るだけではなく、マーケティング業務ごとのWorkflowを持たせる。

初期候補：

```text
Consult
LP Review
Copy Review
Pricing Review
SEO Review
Positioning
Competitor Analysis
Customer Analysis
Strategy
Research
```

例えばLP Reviewでは、

```
商品理解
↓
ターゲット確認
↓
顧客課題
↓
競合・代替手段
↓
ポジショニング
↓
ファーストビュー評価
↓
ベネフィット評価
↓
信頼性評価
↓
CTA評価
↓
CV導線評価
↓
改善案
```

という専用Workflowを実行する。

このWorkflow自体をMarketing AIの商品価値の一部とする。


---

# 17. 回答を内部的に構造化する

ユーザーには通常の文章として表示してよいが、LLMからのレスポンスは可能な限り構造化する。

例：

```json
{
  "answer": "...",

  "assumptions": [],

  "memory_used": [],

  "recommendations": [],

  "proposed_memories": [],

  "proposed_decisions": [],

  "follow_up_questions": []
}
```

これにより、

```
回答
↓
新しいMemory候補
↓
Decision候補
↓
Action候補
```

として処理できる。


---

# 18. Webアプリ

Webアプリでは複数プロジェクトを管理できるようにする。

例：

```
Projects

YoteiLine
Marketing AI

PassPage
Marketing AI

SellPage
Marketing AI
```

各プロジェクトでは、

```text
Overview
Chat
Memory
Reviews
Research
Decisions
```

などを提供する。


---

# 19. Memory UI

ユーザーが、

> 「AIが自社について何を覚えているのか」

を確認できることを重要視する。

例：

```
ターゲット
────────────────
小規模イベント主催者

Security:
INTERNAL

AI利用:
許可

[編集]
[削除]


競合
────────────────
Googleフォーム
TIGET
Peatix

Security:
PUBLIC

AI利用:
許可

[編集]
[削除]
```

AIのMemoryをブラックボックスにしない。


---

# 20. Privacy / Data Control UI

ユーザーが以下を自分で管理できるようにする。

- AIが覚えている情報の確認
- Memory編集
- Memory削除
- LLM送信可否
- プロジェクト削除
- 全データ削除
- データエクスポート

将来的には、

- 使用LLM
- データ保持期間
- BYOK
- 専用環境

なども検討する。


---

# 21. LLM Provider

初期はOpenAI APIを利用してよい。

ただしMarketing Engineから直接OpenAI固有コードを呼ぶのではなく、Provider Adapterを経由させる。

```
Marketing Engine
       ↓
LLM Provider Interface
       ↓
┌─────────────┐
│ OpenAI      │
│ Anthropic   │
│ Gemini      │
│ Azure etc.  │
└─────────────┘
```

将来的にモデルを切り替えられる設計とする。


---

# 22. Web / MCP / API

Marketing EngineをAPIとして作ることで、複数のインターフェースを提供できる。

## Web

一般ユーザー向け。

```
Web App
↓
Marketing API
```

## MCP

Claude Code、Cursor等から利用。

```
Claude Code
↓
MCP
↓
Marketing API
```

例えばMCPでは、

```text
marketing_consult
review_landing_page
review_pricing
review_copy
research_competitors
```

などを提供できる。

## Public API

将来的に他社サービスからMarketing AIを利用可能にする。


---

# 23. MCPの位置付け

MCP自体をプロダクト本体にはしない。

本体は、

```
Marketing Memory
+
Marketing Engine
+
Marketing API
```

とする。

MCPはAPIを呼び出すクライアントの一つとして扱う。

これにより、

```
                  Web
                   │
                   ▼
Claude → MCP → Marketing API ← External App
                   │
                   ▼
            Marketing Engine
                   │
          ┌────────┴────────┐
          ▼                 ▼
       Memory              LLM
```

という構造にする。


---

# 24. APIイメージ

初期案として例えば以下。

```text
POST   /projects
GET    /projects/{id}
PATCH  /projects/{id}

POST   /projects/{id}/chat

GET    /projects/{id}/memories
POST   /projects/{id}/memories
PATCH  /projects/{id}/memories/{memoryId}
DELETE /projects/{id}/memories/{memoryId}

GET    /projects/{id}/decisions
POST   /projects/{id}/decisions

POST   /projects/{id}/reviews/lp
POST   /projects/{id}/reviews/copy
POST   /projects/{id}/reviews/pricing
POST   /projects/{id}/reviews/seo

POST   /projects/{id}/research/competitors
POST   /projects/{id}/strategy/positioning
```

最終的なREST設計については実装時に再検討する。


---

# 25. MVP

最初から全機能を実装しない。

まず自社の複数プロジェクトで実際に利用し、必要な機能を見極める。

## v0.1

最低限、

1. Project
2. Marketing Memory
3. Chat / Consult
4. OpenAI API
5. Decision履歴

を実装する。


---

# 26. v0.1の利用イメージ

例えばプロジェクトについて、

```
商品概要
ターゲット
競合
価格
現在の戦略
```

を登録する。

その後、

> この料金体系どう思う？

と相談する。

Marketing AIは、

```
質問
↓
関連Memory取得
↓
Security Filter
↓
マーケティング用Prompt
↓
OpenAI API
↓
回答
↓
新しいMemory候補を抽出
↓
必要ならユーザーへ保存提案
```

という処理を行う。


---

# 27. 自社利用による検証

初期段階では外販よりも、自社プロジェクトで使うことを優先する。

複数の異なるサービスで利用することで、

```
プロジェクト固有

商品
顧客
競合
価格
ブランド
戦略


共通化可能

マーケティング思考
Memory管理
LPレビュー
価格評価
SEO評価
競合分析
戦略策定
意思決定管理
```

の境界を見つける。

共通化できる部分が、将来の外販用Marketing Engineになる。


---

# 28. 将来的な専門Workflow

実際の利用状況を見ながら追加する。

候補：

## LP Review

LPの構成、訴求、CTA、信頼性、CV導線などを評価。

## Copy Review

コピーの、

- 明確性
- 具体性
- ベネフィット
- 差別化
- 信頼性
- 行動喚起

を評価。

## Pricing Review

- 価格
- プラン構成
- Free/有料境界
- Upgrade Trigger
- アンカリング
- 競合価格

などを評価。

## SEO Review

- Search Intent
- Title
- H1
- コンテンツ構造
- 内部リンク
- 競合
- SERP

などを評価。

## Positioning

- Target
- Problem
- Alternative
- Differentiation
- Benefit
- Reason to Believe

などからポジショニングを整理。

## Competitor Research

競合情報を調査しMemoryとして蓄積する。


---

# 29. 将来的なプラン

現時点では仮案。

## Free

- 1 Project
- 基本Chat
- Memory制限

## Pro

月額数千円程度を想定。

- 複数Project
- Marketing Memory
- LP Review
- Copy Review
- Pricing Review
- SEO Review
- Research
- Decision履歴

## Business

- チーム
- 高度なPrivacy設定
- LLM選択
- 詳細な権限管理
- 外部データ連携

## Enterprise

必要になった段階で検討。

- BYOK
- Azure OpenAI等
- SSO
- 監査ログ
- 専用環境
- 独自保持ポリシー


---

# 30. このプロダクトの競争優位

LLMそのものは競争優位にしない。

OpenAIやAnthropic等のモデルは今後も進化するため、特定モデルに依存しない。

資産となるのは、

```
Marketing Memory
+
Marketing Workflow
+
企業固有の蓄積データ
```

である。

利用期間が長くなるほど、

- 商品理解
- 顧客理解
- 競合理解
- 過去の施策
- 成功・失敗
- 意思決定
- 判断理由
- KPI

が蓄積される。

その結果、

> 「一般論を答えるAI」

から、

> 「この会社ならどうすべきかを考えられるAI」

へ成長する。


---

# 31. 継続利用の価値

Marketing Memoryが蓄積されることで、利用期間が長いほどAIの価値が高まる。

例えば新規状態では、

> 値下げした方がいい？

に対して一般的なマーケティング論しか回答できない。

長期間利用している場合、

```
以前にも値下げを検討した
↓
当時は価格よりActivationが問題だった
↓
Activation改善施策を実施した
↓
登録→利用率が改善した
↓
現在は別のボトルネックが存在する
```

という過去を踏まえて判断できる。

これが自然なスイッチングコストになる。

ただしユーザーを囲い込む目的でデータを持ち出せなくするのではなく、Memoryのエクスポート機能は提供する方針とする。


---

# 32. Privacyを競争優位にする

Marketing Memoryが価値の中心になるほど、

> 「企業情報をAIに渡して大丈夫なのか？」

という不安も大きくなる。

そのため、

**MemoryとPrivacyをセットで設計する。**

ユーザーに対して、

- AIが何を覚えているか分かる
- 自分で編集できる
- 自分で削除できる
- AIに送らない情報を指定できる
- プロジェクト全体を削除できる
- データをエクスポートできる

状態を提供する。

目指す価値は、

> 「自社を理解して育っていくMarketing AI」

でありながら、

> 「何を覚え、何を外部AIへ渡すかはユーザー自身が管理できる」

ことである。


---

# 33. 開発フェーズ案

## Phase 1

自社利用。

```
Marketing API
+
Marketing Memory
+
OpenAI API
+
簡易UIまたはClaude Code Skill
```

複数の自社プロジェクトで利用する。


## Phase 2

専門Workflow追加。

```
LP Review
Pricing Review
Copy Review
SEO Review
Competitor Research
```

実際に利用頻度の高いものだけ実装する。


## Phase 3

Webサービス化。

```
Project管理
Chat
Memory UI
Decision UI
Reviews
Research
Privacy設定
```

を実装する。


## Phase 4

外販開始。

Free / Pro等の料金体系を導入。


## Phase 5

MCP提供。

Claude Code / Cursor等からMarketing APIを利用できるようにする。


## Phase 6

Business / Enterprise。

需要に応じて、

- チーム
- BYOK
- LLM選択
- SSO
- 監査ログ
- 専用環境

などを追加する。


---

# 34. エンジニアと相談したい主な論点

実装前に以下について相談したい。

## Architecture

- Marketing EngineとLLM Providerの分離方法
- Web / MCP / API共通化
- 将来のLLM切り替えをどこまで抽象化するか

## Memory

- Memoryのデータモデル
- 構造化MemoryとVector Searchの役割分担
- Memory検索方法
- 古いMemoryの扱い
- 矛盾するMemoryの扱い
- Memory更新履歴
- Decision履歴

## AI

- Memory抽出をどのタイミングで行うか
- Memoryを自動保存するか承認制にするか
- Structured Outputの利用
- Context Plannerの実装
- WorkflowとPromptの管理方法

## Security

- テナント分離
- DB暗号化
- アクセス制御
- 管理者アクセス
- LLM送信前のSecurity Filter
- ログに機密情報を残さない設計
- 削除時のバックアップ等の扱い

## Privacy

- allow_llmの実装
- Security Level
- データエクスポート
- 完全削除
- LLM Providerごとのデータポリシー管理

## Scalability

- Memory増加時のContext生成
- Vector DBが必要になるタイミング
- APIコスト管理
- キャッシュ
- 長期Memoryの要約

## MVP

- v0.1で必要な最小DB構造
- 最小API
- 最小UI
- 後から変更しにくい部分だけ先に設計すべきか
- 将来機能のために現段階でどこまで抽象化すべきか


---

# 35. 最初に実現したい状態

最初のゴールは大規模なSaaSを完成させることではない。

自社の複数プロジェクトについて、

```
「このプロジェクトのマーケティングについて相談したい」
```

と言うだけで、

AIが、

```
商品
顧客
競合
価格
過去の議論
過去の意思決定
現在の戦略
```

を理解した状態から議論を開始できること。

そして議論によって生まれた新しい知見や意思決定がMarketing Memoryへ蓄積され、次の相談に利用されること。

まずこのループを成立させる。

```
理解
↓
相談
↓
提案
↓
意思決定
↓
記憶
↓
次回の相談
```

この体験が実際に価値を生むことを自社利用で確認した後、Webサービスとして外販する。
