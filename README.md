# military-chess-online
Military chess strategy game: CPU play first, online multiplayer planned

日本の軍人将棋を基礎とする、スマートフォン優先の不完全情報型戦略ゲームです。**初回公開は1人用の対CPU戦**を目標とします。オンライン2人対戦は将来拡張として設計を保持します。

## 現状

第1段階（開発環境と最小画面）・第2段階（純粋なゲームルール計算）は完了済みです。第3段階の対CPU戦初期実装として、かんたん／ふつうのCPU、合法な自動配置、手番処理、対CPU画面を追加しました。正式ルールv0.1は変更していません。

対CPU戦ではCPUの思考へ渡す情報からプレイヤーの未公開駒種類を除外します。プレイヤー側画面でも対局中のCPU駒種を伏せます。ブラウザ内には対局を処理する完全盤面があるため、これはオンライン対人戦の秘密保護や改ざん耐性の実証ではありません。従来の全駒表示画面は開発用として残します。

対CPU戦の進行状態はまだブラウザ再読込で失われます。第4段階で自動保存・ファイル書き出し・読み込みを実装します。Supabase、DB、認証、招待、サーバー処理、オンライン対戦、GitHub Pages公開、通知は未実装・未設定です。

## 開発と検証

Node.js 22.12以上とnpmを使用します。依存版はpackage-lock.jsonで固定します（確認環境：Node 24.19.0 / npm 12.0.2）。

```sh
npm ci
npx playwright install chromium
npm run dev
```

開発サーバーはlocalhost限定です。トップ画面の「CPUと対戦」から難易度を選び、自軍を配置・確定すると対局を開始します。駒と移動先を選び、確認後に実行します。開発用ローカル対局では引き続き全駒表示と少数駒の検証盤面を使用できます。

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
- `src/cpu/`：CPU専用の閲覧情報変換、難易度別の手選択、合法配置、共通ルールを使うCPU手番。思考関数は完全盤面を受け取りません。
- `src/ui/`：配置・盤面・着手確認・終局表示。正式ルールの再定義はしません。
- `src/dev/`：架空の初期配置・検証盤面、交換可能な一時保存アダプター。実利用者の秘密データは扱いません。
- `src/**/*.test.*` / `tests/`：Vitest・React Testing LibraryとPlaywright。225組の戦闘期待値はGAME_RULES.mdから読み取ります。

配置交換だけを用途別のLocalStorageキーに一時保存します。進行中盤面・READYは再読込で失われます。対CPU戦の先手は配置確定時に抽選し、開発用画面では明示指定できます。`client_move_id`・`state_version`によるオンライン通信制御は将来の対人戦拡張で扱います。

## 仕様の基準

- [ゲームルール](docs/GAME_RULES.md)：正規座標・論理地点・駒・勝敗表・終局・U1〜U5の決定記録・R1。
- [アーキテクチャ](docs/ARCHITECTURE.md)：対CPU戦の構成と、将来のオンライン対人戦設計。
- [セキュリティ](docs/SECURITY.md)：対CPU戦の公平性と将来のオンライン秘密保護。
- [保存データ設計](docs/DATA_MODEL.md)：次段階のローカル保存候補と将来のDB設計。
- [サーバー処理設計](docs/SERVER_LOGIC.md)：現在のCPU手番と将来のサーバー処理。
- [プレイヤー操作の流れ](docs/USER_FLOW.md)：承認済みの操作と、将来のオンライン対局・再開。
- [実装計画](docs/IMPLEMENTATION_PLAN.md)：7段階の完了条件・検証と設計上の判断事項。

ルールの唯一の基準はGAME_RULES.md、必須の保護要件はSECURITY.mdです。技術候補は確定ルールを変更しません。矛盾は実装で解釈せず文書を修正し、未決定事項を暗黙に確定させません。

初回公開先の第一候補はGitHub Pagesです。対CPU戦はブラウザ内で処理します。将来のオンライン対人戦ではSupabaseをバックエンド候補、メールMagic Linkをログイン第一方式とし、敵秘密情報をサーバー側で分離します。

オンライン対人戦拡張では `client_move_id` による再送冪等化、単調増加する `state_version`、作成時固定の `ruleset_version` を正式方針とします。
