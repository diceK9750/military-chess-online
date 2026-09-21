# military-chess-online
2-player asynchronous online strategy game inspired by military chess

日本の軍人将棋を基礎とする、2人用・スマートフォン優先の不完全情報型戦略ゲームです。別々の端末から同時接続なしで操作し、数日・数週間・数か月後にも再開できます。現実時間による手番期限は設けません。

## 現状

第1段階（開発環境と最小画面）・第2段階（純粋なゲームルール計算）を実装しています。React / TypeScript / Viteによるローカル画面と、正式仕様v0.1に対応する独立したルール層を備えています。

開発用ローカル対局は架空の全駒を表示します。実際の秘密情報分離やオンライン対戦を実証するものではありません。Supabase、DB、認証、招待、サーバー処理、GitHub Pages公開、通知は未実装・未設定です。

## 開発と検証

Node.js 22.12以上とnpmを使用します。依存版はpackage-lock.jsonで固定します（確認環境：Node 24.19.0 / npm 12.0.2）。

```sh
npm ci
npx playwright install chromium
npm run dev
```

開発サーバーはlocalhost限定です。画面の「開発用ローカル対局」から両側の配置を編集・確定します。駒と移動先を選び、確認後に実行します。検証用メニューでHQ間飛行機や司令部占領の少数駒盤面も開けます。

```sh
npm run typecheck
npm test
npm run build
npm run test:e2e
# 上記すべてを順に実行
npm run check
```

`npm run test:watch`は単体テストの監視、`npm run preview`はビルド成果物のローカル確認です。Playwrightは開発サーバーを起動し、Chromiumでモバイル・PCの操作と320/390/768/1280px幅を確認します。実スマートフォンの指操作・実機検証は未実施です。

- `src/game/`：ネットワーク・DB・React・ブラウザに依存しない盤面、配置、移動、戦闘、終局計算。入力を変更せず新状態を返します。
- `src/ui/`：配置・盤面・着手確認・終局表示。正式ルールの再定義はしません。
- `src/dev/`：架空の初期配置・検証盤面、交換可能な一時保存アダプター。実利用者の秘密データは扱いません。
- `src/**/*.test.*` / `tests/`：Vitest・React Testing LibraryとPlaywright。225組の戦闘期待値はGAME_RULES.mdから読み取ります。

配置交換だけを開発専用LocalStorageキーに自動保存します。進行中盤面・READYは再読込で失われます。サーバーの永続保存や認証の代用ではありません。正式先手抽選は将来サーバーで行い、ローカル検証では先手を明示指定します。`client_move_id`・`state_version`による通信制御も第3段階の対象です。

## 仕様の基準

- [ゲームルール](docs/GAME_RULES.md)：正規座標・論理地点・駒・勝敗表・終局・U1〜U5の決定記録・R1。
- [アーキテクチャ](docs/ARCHITECTURE.md)：技術候補と、認証・永続化・再接続・通信の正式方針。
- [セキュリティ](docs/SECURITY.md)：対局中の秘密保護、終局後の参加者限定公開、不正操作対策。
- [保存データ設計](docs/DATA_MODEL.md)：保存項目・制約・秘密情報分離・長期保存。
- [サーバー処理設計](docs/SERVER_LOGIC.md)：作成・参加・配置・着手・再送・閲覧の処理順序。
- [プレイヤー操作の流れ](docs/USER_FLOW.md)：承認済みの操作と、将来のオンライン対局・再開。
- [実装計画](docs/IMPLEMENTATION_PLAN.md)：7段階の完了条件・検証と設計上の判断事項。

ルールの唯一の基準はGAME_RULES.md、必須の保護要件はSECURITY.mdです。技術候補は確定ルールを変更しません。矛盾は実装で解釈せず文書を修正し、未決定事項を暗黙に確定させません。

公開先の第一候補はGitHub Pages、バックエンドはSupabase、認証はメールMagic Linkです。対局中は敵種類をクライアントへ渡さず、終局後のみサーバーが認可した両参加者に全情報を公開します。手番・合法手・戦闘・終局はサーバーが判定します。

通信は `client_move_id` による再送冪等化、単調増加する `state_version`、作成時固定の `ruleset_version` を正式方針とします。
