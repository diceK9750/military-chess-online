import { anchors, hq } from '../game/board';
import { PIECES } from '../game/pieces';
import { RuleError, type EndReason, type GameState, type Piece, type Player } from '../game/types';

export type StoryKind = 'opening' | 'contact' | 'breakthrough' | 'pressure' | 'loss' | 'decisive' | 'summary';
export interface ChronicleScene { readonly title: string; readonly text: string; readonly move: string; readonly kinds: readonly StoryKind[] }
export interface ChronicleChapter { readonly index: number; readonly title: string }
/** 2x still finishes the longest replay move (510ms) and battle effect (800ms). */
export const chronicleDelay = (scene: ChronicleScene, speed: number, hasMove: boolean, battle: boolean) =>
  Math.max(1000 / speed, scene.kinds.some(kind => kind !== 'opening') ? 2500 / speed : 0, hasMove ? 600 : 0, battle ? 900 : 0);
const side = (owner: Player) => owner === 1 ? '自軍' : 'CPU';
const reasons: Record<EndReason, string> = { HQ_CAPTURE: '司令部占領', CAPTURERS_ELIMINATED: '片側の占領可能駒全滅', BOTH_CAPTURERS_ELIMINATED: '双方の占領可能駒全滅', NO_LEGAL_MOVES_BOTH: '双方合法手なし', FIFTY_NONCOMBAT_MOVES: '非戦闘50手' };
const important = new Set(['general', 'lieutenantGeneral', 'majorGeneral', 'colonel', 'lieutenantColonel', 'major', 'aircraft', 'tank', 'flag']);
const name = (piece: Piece | undefined) => piece ? PIECES[piece.type].label : '駒';

/** Call only with frames reconstructed by chronicleFrames. No IDs or engine objects enter commentary. */
export function chronicleStory(frames: readonly GameState[]): { readonly scenes: readonly ChronicleScene[]; readonly chapters: readonly ChronicleChapter[] } {
  const final = frames.at(-1);
  if (!final?.result) throw new RuleError('REPLAY_NOT_FINISHED');
  const scenes: ChronicleScene[] = [{ title: '開戦 — 二つの本陣', text: `${side(final.firstPlayer)}が先手。双方23枚の布陣から、突破口と本陣をめぐる戦いが始まります。終局後の記録として全駒を公開しています。`, move: '初期配置', kinds: ['opening'] }];
  let contact = false, breakthrough = false, pressure = false, loss = false;
  const chapters: ChronicleChapter[] = [{ index: 0, title: '開戦' }];
  for (let index = 1; index < frames.length; index++) {
    const frame = frames[index], previous = frames[index - 1];
    const event = [...frame.events].reverse().find(e => e.kind === 'MOVE');
    if (!event || event.kind !== 'MOVE') throw new RuleError('REPLAY_MISMATCH');
    const { actor, move, battle } = event;
    const mover = previous.pieces.find(p => p.position === move.from);
    const defender = previous.pieces.find(p => p.position === move.to);
    const moveText = `${side(actor)} ${name(mover)} ${move.from} → ${move.to}${move.lane ? `（${move.lane}列）` : ''}`;
    const text: string[] = [], kinds: StoryKind[] = [];
    let title = index <= 6 ? '序盤 — 布陣を動かす' : '戦線を進める';
    if (index <= 6) kinds.push('opening');
    text.push(battle ? `${moveText}。${name(defender)}との戦闘は${battle === 'ATTACKER' ? '攻撃側勝利' : battle === 'DEFENDER' ? '防御側勝利' : '相打ち'}。` : `${moveText}。戦闘を伴わない移動です。`);
    if (battle && !contact) { contact = true; title = '初接触 — 最初の戦闘'; kinds.push('contact'); chapters.push({ index, title: '初接触' }); }
    const destination = anchors(move.to)[0].y, origin = anchors(move.from)[0].y;
    const inEnemy = (row: number) => actor === 1 ? row >= 5 : row <= 4;
    const survives = battle !== 'DEFENDER' && battle !== 'MUTUAL';
    if (survives && inEnemy(destination) && !inEnemy(origin)) {
      title = '突破 — 敵陣へ進入'; kinds.push('breakthrough');
      text.push(`${side(actor)}が${mover?.type === 'aircraft' ? '飛行機で境界を越え' : '突破口を越え'}、敵陣に足場を築きました。`);
      if (!breakthrough) { breakthrough = true; chapters.push({ index, title: '初の突破' }); }
    }
    const nearHQ = Math.min(...anchors(move.to).flatMap(a => anchors(hq(actor === 1 ? 2 : 1)).map(b => Math.abs(a.x - b.x) + Math.abs(a.y - b.y)))) <= 1;
    if (survives && nearHQ) {
      title = '本陣圧迫 — 司令部の目前'; kinds.push('pressure'); text.push(`${side(actor)}の${name(mover)}が敵司令部付近へ到達。占領資格と守備駒が重要な局面です。`);
      if (!pressure) { pressure = true; chapters.push({ index, title: '本陣圧迫' }); }
    }
    const removed = battle ? previous.pieces.filter(p => p.position && !frame.pieces.some(q => q.id === p.id && q.position)) : [];
    const notable = removed.filter(p => important.has(p.type));
    if (notable.length) {
      kinds.push('loss'); title = '重要駒の撃破'; text.push(`除去された重要駒：${notable.map(p => `${side(p.owner)}の${name(p)}`).join('、')}。`);
      if (!loss) { loss = true; chapters.push({ index, title: '重要駒撃破' }); }
    }
    if (frame.events.slice(previous.events.length).some(e => e.kind === 'AUTO_PASS')) text.push('合法手のない側は自動PASSで手番を移しました。');
    if (frame.result) {
      const result = frame.result, label = result.winner === 1 ? '自軍の勝利' : result.winner === 2 ? 'CPUの勝利' : '引き分け';
      title = result.winner === null ? '終局 — 戦いの総括' : '決定打 — 戦いの総括';
      kinds.push(...(result.winner === null ? [] : ['decisive' as const]), 'summary');
      text.push(`${reasons[result.reason]}により${label}。全${frame.moveCount}手、戦闘${frame.events.filter(e => e.kind === 'MOVE' && e.battle).length}回の対局でした。`);
      chapters.push({ index, title: result.winner === null ? '終局・総括' : '決定打・総括' });
    }
    scenes.push({ title, text: text.join(' '), move: moveText, kinds });
  }
  return { scenes, chapters };
}
