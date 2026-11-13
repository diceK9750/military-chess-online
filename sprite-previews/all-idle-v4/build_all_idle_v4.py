#!/usr/bin/env python3
"""Build all-idle-v4 on the box from v3 frames plus identity-locked mid frames.
Never writes to all-idle-v1, all-idle-v2, all-idle-v3, nod-v2, or approval images.
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

V3 = Path("/workspace/military-chess-online/inspect/v3-full")
WORK = Path("/workspace/military-chess-online/inspect/v4-work")
OUT = Path("/workspace/military-chess-online/all-idle-v4")
WORK.mkdir(parents=True, exist_ok=True)
(WORK / "debug").mkdir(exist_ok=True)

xx, yy = np.meshgrid(np.arange(512), np.arange(512))

PIECES = [
    ("general", "大将", "承認画像を使い、静かにうなずく（nod-v2を維持）"),
    ("lieutenant-general", "中将", "右手と視線を同じ方向へ向けて合図（中間姿勢を通って戻る）"),
    ("major-general", "少将", "手を下向きにして前進を合図"),
    ("colonel", "大佐", "柄に手をかけ、抜刀の途中を経て軍刀を掲げる"),
    ("lieutenant-colonel", "中佐", "周囲を警戒し、部隊に方向を示す"),
    ("major", "少佐", "視線と同じ方向を指して合図"),
    ("captain", "大尉", "軍刀を構えて兵を率いる"),
    ("lieutenant", "中尉", "正面・左・正面・右の順に警戒（顔と帽子を固定）"),
    ("second-lieutenant", "少尉", "周囲を警戒して前方を見据える"),
    ("aircraft", "飛行機", "機体を保ち、プロペラを回す"),
    ("tank", "タンク", "車体を保ち、砲塔で前方を警戒する"),
    ("engineer", "工兵", "レンチを金具に近づけ、回して締める"),
    ("cavalry", "騎兵", "馬が首を動かし、騎手が構える"),
    ("spy", "スパイ", "身を低くして周囲を警戒する"),
    ("mine", "地雷", "その場に固定し、表面に光が走る"),
    ("flag", "軍旗", "旗竿は固定し、布が風にはためく"),
]

# File numbers used in playback (1-based). Extra frames: colonel/05 mid-draw, engineer/05 wrench-rot.
# lieutenant 02/03 are replaced with identity-locked turns.
ORDERS = {
    "lieutenant-general": [1, 2, 3, 2],
    "lieutenant": [1, 2, 1, 3],
    "colonel": [1, 2, 5, 4, 3, 4],
    "engineer": [1, 2, 3, 5, 3, 4],
}
DURATIONS = {
    "lieutenant-general": [900, 700, 1100, 700],
    "colonel": [900, 800, 550, 900, 1100, 800],
    "lieutenant": [1100, 1300, 1100, 1300],
    "engineer": [900, 800, 900, 800, 700, 1000],
    "default": [1100, 500, 1100, 500],
}
FRAME_COUNTS = {"colonel": 5, "engineer": 5}


def load(p: Path) -> Image.Image:
    return Image.open(p).convert("RGBA")


def arr(im: Image.Image) -> np.ndarray:
    return np.array(im)


def paste_a(base, spr, alpha):
    out = arr(base).astype(np.float32)
    src = arr(spr).astype(np.float32)
    a = np.clip(alpha.astype(np.float32), 0, 1)
    if a.ndim == 2:
        a = a[:, :, None]
    out = out * (1 - a) + src * a
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGBA")


def punch_alpha(im, mask):
    out = arr(im).copy()
    out[mask.astype(bool), 3] = 0
    return Image.fromarray(out, "RGBA")


def inpaint_body(base: Image.Image, orig: Image.Image, hole: np.ndarray) -> Image.Image:
    """Fill punched pixels that belonged to the body, not empty air."""
    ba = arr(base)
    oa = arr(orig)
    hole_u = (hole.astype(np.uint8) * 255) if hole.dtype != np.uint8 else hole
    if hole_u.max() <= 1:
        hole_u = (hole_u > 0).astype(np.uint8) * 255
    bgr = cv2.cvtColor(oa, cv2.COLOR_RGBA2BGR)
    filled = cv2.inpaint(bgr, hole_u, 5, cv2.INPAINT_TELEA)
    rgb = cv2.cvtColor(filled, cv2.COLOR_BGR2RGB)
    restore = (hole_u > 0) & (oa[:, :, 3] > 80)
    ba[restore, :3] = rgb[restore]
    ba[restore, 3] = 255
    return Image.fromarray(ba, "RGBA")


def defringe(frame: Image.Image) -> Image.Image:
    a = arr(frame)
    alpha = a[..., 3].astype(np.int16)
    rgb = a[..., :3].astype(np.float32)
    alpha = np.where(alpha < 14, 0, alpha)
    opaque = alpha >= 220
    if opaque.any():
        color = rgb.copy()
        present = opaque.copy()
        for _ in range(4):
            src = present.astype(np.float32)
            padded_p = np.pad(src, 1)
            padded_c = np.pad(color, ((1, 1), (1, 1), (0, 0)))
            neigh = (
                padded_p[:-2, :-2] + padded_p[:-2, 1:-1] + padded_p[:-2, 2:]
                + padded_p[1:-1, :-2] + padded_p[1:-1, 2:]
                + padded_p[2:, :-2] + padded_p[2:, 1:-1] + padded_p[2:, 2:]
            )
            sums = np.zeros_like(color)
            for ch in range(3):
                pc = padded_c[..., ch]
                sums[..., ch] = (
                    pc[:-2, :-2] * padded_p[:-2, :-2] + pc[:-2, 1:-1] * padded_p[:-2, 1:-1] + pc[:-2, 2:] * padded_p[:-2, 2:]
                    + pc[1:-1, :-2] * padded_p[1:-1, :-2] + pc[1:-1, 2:] * padded_p[1:-1, 2:]
                    + pc[2:, :-2] * padded_p[2:, :-2] + pc[2:, 1:-1] * padded_p[2:, 1:-1] + pc[2:, 2:] * padded_p[2:, 2:]
                )
            grow = (~present) & (neigh > 0) & (alpha > 0)
            if not grow.any():
                break
            color[grow] = sums[grow] / neigh[grow][:, None]
            present[grow] = True
        soft = (alpha > 0) & (alpha < 220)
        rgb[soft] = color[soft]
    a[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    a[..., 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return Image.fromarray(a, "RGBA")


def head_turn(frame: Image.Image, degrees: float) -> Image.Image:
    a = arr(frame)
    al = a[:, :, 3]
    m = ((al > 12) & (xx >= 208) & (xx <= 312) & (yy <= 105)).astype(np.uint8) * 255
    m[(yy > 98) & ((xx < 220) | (xx > 298))] = 0
    n, labels, stats, _ = cv2.connectedComponentsWithStats((m > 0).astype(np.uint8), 8)
    best = 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA]) if n > 1 else 1
    mask = (labels == best).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)
    mask_soft = cv2.GaussianBlur(mask, (5, 5), 0)
    pivot = (255, 98)
    M = cv2.getRotationMatrix2D(pivot, degrees, 1.0)
    M[0, 2] += degrees * 0.35
    rot = cv2.warpAffine(a, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    rot_m = cv2.warpAffine(mask_soft, M, (512, 512), flags=cv2.INTER_LINEAR)
    punch = mask.copy()
    punch[100:, :] = 0
    base = punch_alpha(frame, punch > 40)
    out = paste_a(base, Image.fromarray(rot, "RGBA"), rot_m.astype(np.float32) / 255.0)
    # Restore original shoulders / collar so rotation crumbs don't detach
    oa, na = arr(frame), arr(out)
    blend = np.clip((yy.astype(np.float32) - 100.0) / 8.0, 0, 1)[:, :, None]
    keep = (oa[:, :, 3:4] > 16) & (blend > 0)
    mixed = na.astype(np.float32) * (1 - blend) + oa.astype(np.float32) * blend
    na = np.where(keep, mixed, na)
    return defringe(Image.fromarray(np.clip(na, 0, 255).astype(np.uint8), "RGBA"))


def engineer_rotate(frame: Image.Image, degrees: float) -> Image.Image:
    a = arr(frame)
    poly = np.array([[268, 306], [268, 326], [300, 328], [326, 324], [328, 310], [300, 308]], np.int32)
    fill = np.zeros((512, 512), np.uint8)
    cv2.fillConvexPoly(fill, poly, 255)
    r, g, b, al = a[:, :, 0], a[:, :, 1], a[:, :, 2], a[:, :, 3]
    lum = r.astype(int) + g.astype(int) + b.astype(int)
    sat = np.max(a[:, :, :3], axis=2).astype(int) - np.min(a[:, :, :3], axis=2).astype(int)
    metal = (al > 40) & (lum > 210) & (sat < 80) & (xx >= 260) & (xx <= 336) & (yy >= 300) & (yy <= 336)
    dil = cv2.dilate(fill, np.ones((5, 5), np.uint8), iterations=1)
    fill = np.where(metal & (dil > 0), 255, fill).astype(np.uint8)
    fill = cv2.dilate(fill, np.ones((3, 3), np.uint8), iterations=1)
    pivot = (322, 318)
    M = cv2.getRotationMatrix2D(pivot, degrees, 1.0)
    rot = cv2.warpAffine(a, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    rot_m = cv2.warpAffine(fill, M, (512, 512), flags=cv2.INTER_LINEAR)
    base = punch_alpha(frame, fill > 40)
    base = inpaint_body(base, frame, fill > 40)
    out = paste_a(base, Image.fromarray(rot, "RGBA"), rot_m.astype(np.float32) / 255.0)
    return defringe(out)


def colonel_mid_draw(im02: Image.Image, lift_px: float = 30) -> Image.Image:
    a02 = arr(im02)
    r, g, b, al = a02[:, :, 0], a02[:, :, 1], a02[:, :, 2], a02[:, :, 3]
    p_hilt = np.array([322.0, 210.0])
    p_tip = np.array([350.0, 370.0])
    axis = p_tip - p_hilt
    axis = axis / np.linalg.norm(axis)
    shift = -axis * lift_px
    dx, dy = int(round(shift[0])), int(round(shift[1]))

    in_hand = (xx >= 292) & (xx <= 362) & (yy >= 148) & (yy <= 230)
    glove = in_hand & (al > 40) & (r > 180) & (g > 180) & (b > 165) & (np.abs(r.astype(int) - g.astype(int)) < 30)
    gold = in_hand & (al > 40) & (r > 120) & (g > 80) & (r > g + 15) & (g > b)
    in_hilt = (xx >= 304) & (xx <= 355) & (yy >= 175) & (yy <= 235)
    gold2 = in_hilt & (al > 40) & (r > 120) & (g > 80) & (r > g + 15)
    mask = (glove | gold | gold2).astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((3, 3), np.uint8), iterations=1)

    scab = np.zeros((512, 512), np.uint8)
    in_scab = (xx >= 318) & (xx <= 368) & (yy >= 200) & (yy <= 388)
    dark = in_scab & (al > 40) & (r < 80) & (g < 70) & (b < 70)
    gld = in_scab & (al > 40) & (r > 120) & (g > 80) & (r > g + 15)
    scab[dark | gld] = 255
    scab = cv2.dilate(scab, np.ones((2, 2), np.uint8), iterations=1)

    base = punch_alpha(im02, mask > 40)
    base = inpaint_body(base, im02, mask > 40)

    M = np.array([[1, 0, dx], [0, 1, dy]], np.float32)
    hand_spr = cv2.warpAffine(a02, M, (512, 512), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_CONSTANT, borderValue=(0, 0, 0, 0))
    hand_m = cv2.GaussianBlur(cv2.warpAffine(mask, M, (512, 512), flags=cv2.INTER_LINEAR), (3, 3), 0)
    mid = paste_a(base, Image.fromarray(hand_spr, "RGBA"), hand_m.astype(np.float32) / 255.0)

    new_hilt = p_hilt - axis * lift_px
    mouth = p_hilt + axis * 6
    length = float(np.linalg.norm(mouth - new_hilt) + 8)
    width = 6.5
    perp = np.array([-axis[1], axis[0]])
    relx = xx - new_hilt[0]
    rely = yy - new_hilt[1]
    along = relx * axis[0] + rely * axis[1]
    across = relx * perp[0] + rely * perp[1]
    blade_m = (along > 5) & (along < length - 2) & (np.abs(across) < width / 2 + 0.7)
    taper = np.clip((length - 2 - along) / 5.0, 0, 1) * np.clip((along - 5) / 4.0, 0, 1)
    edge = np.clip(1.0 - (np.abs(across) - (width / 2 - 1.0)) / 1.6, 0, 1)
    alpha_b = blade_m.astype(np.float32) * taper * edge
    color = np.zeros((512, 512, 4), np.float32)
    hi = (across < 0).astype(np.float32)[:, :, None]
    mean_c = np.array([186, 190, 200], np.float32)
    hi_c = np.array([228, 230, 236], np.float32)
    color[:, :, :3] = mean_c * (1 - 0.5 * hi) + hi_c * (0.5 * hi)
    color[:, :, 3] = 255
    mid = paste_a(mid, Image.fromarray(np.clip(color, 0, 255).astype(np.uint8), "RGBA"), alpha_b)
    mid = paste_a(mid, im02, cv2.GaussianBlur(scab, (3, 3), 0).astype(np.float32) / 255.0)
    return defringe(mid)


def make_gif(path: Path, frames_by_num: dict[int, Image.Image], order: list[int], durations: list[int]) -> None:
    result = []
    for index in order:
        frame = frames_by_num[index]
        indexed = frame.convert("RGB").quantize(colors=255)
        indexed.paste(255, mask=frame.getchannel("A").point(lambda a: 255 if a < 128 else 0))
        indexed.info["transparency"] = 255
        result.append(indexed)
    result[0].save(
        path, save_all=True, append_images=result[1:], duration=durations,
        loop=0, disposal=2, transparency=255, optimize=False,
    )


def font(size: int):
    for path in (
        Path("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"),
        Path("/usr/share/fonts/truetype/sand-box/google/BIZ UDPMincho/BIZUDPMincho-Regular.ttf"),
    ):
        if path.exists():
            try:
                return ImageFont.truetype(str(path), size)
            except OSError:
                continue
    return ImageFont.load_default()


def write_overview(out_path: Path) -> None:
    cell, pad, cap = 220, 16, 52
    cols, rows = 4, 4
    header = 88
    width = pad + cols * (cell + pad)
    height = header + rows * (cell + cap + pad) + pad
    img = Image.new("RGB", (width, height), (17, 30, 39))
    draw = ImageDraw.Draw(img)
    title_font, body_font, name_font = font(28), font(16), font(20)
    draw.text((pad, 16), "軍人将棋・全16駒種の待機アニメーション v4", font=title_font, fill=(248, 243, 229))
    draw.text((pad, 52), "停止コマの一覧。再生は preview.html を使います。v1〜v3 は未変更です。", font=body_font, fill=(226, 221, 207))
    for i, (pid, name, _desc) in enumerate(PIECES):
        r, c = divmod(i, 4)
        x = pad + c * (cell + pad)
        y = header + r * (cell + cap + pad)
        still = Image.open(OUT / "frames" / pid / "01.png").convert("RGBA")
        still.thumbnail((cell, cell), Image.Resampling.LANCZOS)
        tile = Image.new("RGBA", (cell, cell), (22, 43, 48, 255))
        tile.alpha_composite(still, ((cell - still.width) // 2, cell - still.height))
        img.paste(tile.convert("RGB"), (x, y))
        draw.rectangle((x, y + cell, x + cell, y + cell + cap), fill=(21, 40, 46))
        draw.text((x + 8, y + cell + 12), name, font=name_font, fill=(248, 243, 229))
    img.save(out_path, quality=92)


def write_preview() -> None:
    rows = ",\n".join(f" ['{pid}','{name}','{desc}']" for pid, name, desc in PIECES)
    durations = {pid: DURATIONS.get(pid, DURATIONS["default"]) for pid, *_ in PIECES if pid != "general"}
    counts = {pid: FRAME_COUNTS.get(pid, 4) for pid, *_ in PIECES if pid != "general"}
    html = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>軍人将棋・全16駒種の待機アニメーション比較 v4</title>
<style>
:root{{color-scheme:dark;font-family:system-ui,sans-serif}}*{{box-sizing:border-box}}
body{{margin:0;background:#111e27;color:#f8f3e5}}main{{max-width:1150px;margin:auto;padding:24px 16px 40px}}
h1{{font-size:clamp(1.3rem,5vw,2rem);margin:0 0 8px}}p{{line-height:1.65}}.intro{{color:#e2ddcf}}
.controls{{display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:12px 0 18px}}
button{{min-height:44px;padding:8px 16px;border-radius:8px;border:1px solid #e4c777;background:#f1d17d;color:#172e34;font-weight:700;cursor:pointer}}
.grid{{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}}
figure{{margin:0;border:1px solid #776b4c;border-radius:12px;background:linear-gradient(#263a3b,#152b32);overflow:hidden}}
figure img{{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:contain}}figcaption{{padding:8px 10px 12px}}
figcaption strong{{display:block;text-align:center}}figcaption span{{display:block;color:#d5cfbc;font-size:.78rem;line-height:1.5;margin-top:4px}}
.note{{color:#d5d4c7;font-size:.9rem}}@media(max-width:700px){{.grid{{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}}figcaption{{padding:6px 8px 10px}}}}
</style>
</head>
<body><main>
<h1>軍人将棋・全16駒種の待機アニメーション v4</h1>
<p class="intro">v3を土台に、既存コマの顔と制服を固定したまま中間動作を足した試作です。大将のうなずきは承認画像のままです。 <a href="../all-idle-v3/preview.html">v3を見る</a>　<a href="../all-idle-v2/preview.html">v2を見る</a>　<a href="../all-idle-v1/preview.html">v1を見る</a></p>
<div class="controls"><button id="toggle" type="button">一時停止</button><span id="status" role="status">読み込み中</span></div>
<div class="grid" id="gallery"></div>
<p class="note">大佐は抜刀途中のコマを追加し、中尉は同じ顔のまま左右を向き、工兵はレンチを回すコマを追加しています。抜刀から掲刀への腕の上げ、中尉の首の付け根、工兵の工具と手の隙間には、まだ不自然さが残ります。ゲーム本体には組み込んでいません。</p>
</main>
<script>
const pieces=[
{rows}
];
const durationsMap={json.dumps(durations, ensure_ascii=False)};
const orders={json.dumps(ORDERS, ensure_ascii=False)};
const frameCounts={json.dumps(counts, ensure_ascii=False)};
const grid=document.querySelector('#gallery'),button=document.querySelector('#toggle'),status=document.querySelector('#status');
const generalStill='frames/general/01.png',generalGif='gifs/general.gif';
const imgs=new Map();
for(const [id,name,description] of pieces){{
 const figure=document.createElement('figure'),img=document.createElement('img'),caption=document.createElement('figcaption'),strong=document.createElement('strong'),span=document.createElement('span');
 img.src=id==='general'?generalStill:`frames/${{id}}/01.png`;img.alt=`${{name}}の待機アニメーション`;strong.textContent=name;span.textContent=description;caption.append(strong,span);figure.append(img,caption);grid.append(figure);imgs.set(id,img);
}}
let playing=!matchMedia('(prefers-reduced-motion: reduce)').matches,loaded=false,last=0,elapsed={{}};
for(const [id] of pieces) if(id!=='general') elapsed[id]=0;
function indexAt(id,time){{const durations=durationsMap[id];const period=durations.reduce((a,b)=>a+b,0);let x=time%period;for(let i=0;i<durations.length;i++){{if(x<durations[i])return i+1;x-=durations[i]}}return 1}}
let lastFrame={{}};
function show(){{
 for(const [id] of pieces){{
  if(id==='general') continue;
  const frame=indexAt(id,elapsed[id]);
  if(frame!==lastFrame[id]){{
    const selected=(orders[id]||[1,2,3,4])[frame-1];
    imgs.get(id).src=`frames/${{id}}/${{String(selected).padStart(2,'0')}}.png`;
    lastFrame[id]=frame;
  }}
 }}
}}
function state(){{button.textContent=playing?'一時停止':'再生';status.textContent=loaded?(playing?'再生中':'停止中'):'読み込み中'}}
button.addEventListener('click',()=>{{playing=!playing;last=0;imgs.get('general').src=playing?generalGif:generalStill;state()}});
async function prepare(){{
 const sources=pieces.flatMap(([id])=>id==='general'?[generalStill]:Array.from({{length:frameCounts[id]||4}},(_,i)=>`frames/${{id}}/${{String(i+1).padStart(2,'0')}}.png`));
 try{{await Promise.all(sources.map(src=>new Promise((resolve,reject)=>{{const img=new Image();img.onload=resolve;img.onerror=reject;img.src=src}})));loaded=true;show();if(playing)imgs.get('general').src=generalGif;state();requestAnimationFrame(tick)}}
 catch{{status.textContent='画像を読み込めませんでした';button.disabled=true}}
}}
function tick(now){{if(playing&&last){{const dt=Math.min(now-last,100);for(const [id] of pieces) if(id!=='general') elapsed[id]+=dt;show()}}last=now;requestAnimationFrame(tick)}}
state();prepare();
</script>
</html>
"""
    (OUT / "preview.html").write_text(html, encoding="utf-8")


def write_readme(records: dict) -> None:
    text = """# 全16駒種・待機アニメーション比較 v4

`preview.html` で16種類を再生・停止できます。前版へのリンクがあります。OSの動作低減設定では停止状態で開きます。
`gifs/` は個別確認用、`frames/` は透過PNG連番です。**all-idle-v1、all-idle-v2、all-idle-v3、承認画像、過去試作は変更していません。**

## この版で行ったこと

- v3の位置合わせ済みコマを土台に、既存コマの顔・帽子・軍服を動かさず、足りない中間動作を合成して足しました。
- 新規生成画像は動きの参考だけに使い、再生ループには入れていません（顔と制服のちらつきを避けるため）。
- 大佐：柄に手をかけた姿勢から、刃が鞘から出始める中間コマ（`05.png`）を追加し、掲刀の前に通します。再生順は 01→02→05→04→03→04 です。
- 中尉：01の顔と帽子を固定したまま、左右を向くコマ（02・03）を作り直しました。再生順は 01→02→01→03 です。
- 工兵：レンチを金具に付けた姿勢から、レンチを回すコマ（`05.png`）を追加しました。再生順は 01→02→03→05→03→04 です。
- 大将は v3 と同じく `general-meiji-nod-v2` のうなずきをそのままコピーしています。
- 他の12種は v3 のコマとタイミングを維持しています。ゲーム本体への組み込み、コミット、公開はしていません。

## 使用した基準画像

- 大将：v3 経由で `sprite-previews/general-meiji-nod-v2/`（承認画像 `modern-era-generals-approval-v1.png`）
- 中将・少将・中佐・少佐・大尉・少尉・飛行機・タンク・騎兵・スパイ・地雷・軍旗：v3 の `frames/` をコピー
- 大佐・中尉・工兵：v3 の `frames/` に、上記の合成中間コマを追加または差し替え

## まだ残っている問題

- 大佐：刃が出始めるところから腕を上げて掲げるまでの中間は、まだ一段とんで見えます。鞘口の周辺に、合成の汚れが残る場合があります。
- 中尉：同じ顔で左右を向きますが、首の付け根や帽檐にわずかな切れや段差が残ります。完全な横顔ではなく、やや斜めの警戒です。
- 工兵：レンチの回転は表現できていますが、工具と手の隙間や、回転角の自然さにはまだ余地があります。
- 全体：4〜6コマのため動作の段差は残ります。飛行機・タンクなどの造形差、ごく薄い縁のにじみも残ります。
- 15種の静止デザインと各アニメの最終承認はありません。

## 検証

Chrome相当での表示確認結果は `qa-pc.png` と `qa-375.png` を参照してください。実スマートフォン・Safari・公開環境は未確認です。
検出・再生の記録は `alignment.json` にあります。`build_all_idle_v4.py` はこの試作の再生成手順です。
"""
    (OUT / "README.md").write_text(text, encoding="utf-8")


def contact_compare():
    """v3 vs v4 sheets for the three focus pieces."""
    def row(images):
        sheet = Image.new("RGB", (len(images) * 256, 256), (16, 16, 20))
        for i, im in enumerate(images):
            im = im.convert("RGBA")
            tile = Image.new("RGBA", (256, 256), (16, 16, 20, 255))
            s = im.resize((256, 256), Image.Resampling.LANCZOS)
            tile.alpha_composite(s)
            sheet.paste(tile.convert("RGB"), (i * 256, 0))
        return sheet

    def labeled(top, bottom, labels, path):
        w = max(top.width, bottom.width)
        img = Image.new("RGB", (w, 256 * 2 + 48), (17, 30, 39))
        draw = ImageDraw.Draw(img)
        f = font(18)
        draw.text((8, 6), labels[0], font=f, fill=(248, 243, 229))
        draw.text((8, 256 + 30), labels[1], font=f, fill=(248, 243, 229))
        img.paste(top, (0, 24))
        img.paste(bottom, (0, 256 + 48))
        img.save(path, quality=92)

    v3c = [load(V3 / "frames" / "colonel" / f"{i:02d}.png") for i in (1, 2, 3, 4)]
    v4c = [load(OUT / "frames" / "colonel" / f"{i:02d}.png") for i in (1, 2, 5, 4, 3)]
    labeled(row(v3c), row(v4c), ("v3 大佐 01-02-03-04", "v4 大佐 01-02-05(抜刀途中)-04-03"), WORK / "compare-colonel.jpg")

    v3l = [load(V3 / "frames" / "lieutenant" / f"{i:02d}.png") for i in (1, 2, 4, 3)]
    v4l = [load(OUT / "frames" / "lieutenant" / f"{i:02d}.png") for i in (1, 2, 1, 3)]
    labeled(row(v3l), row(v4l), ("v3 中尉 正面・左・正面・右（再生順）", "v4 中尉 同じ顔で左右を向く"), WORK / "compare-lieutenant.jpg")

    v3e = [load(V3 / "frames" / "engineer" / f"{i:02d}.png") for i in (1, 2, 3, 4)]
    v4e = [load(OUT / "frames" / "engineer" / f"{i:02d}.png") for i in (1, 2, 3, 5, 4)]
    labeled(row(v3e), row(v4e), ("v3 工兵 01-04", "v4 工兵 01-02-03-05(回転)-04"), WORK / "compare-engineer.jpg")


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    (OUT / "frames").mkdir()
    (OUT / "gifs").mkdir()

    # Copy all v3 frames first.
    for src_dir in (V3 / "frames").iterdir():
        if src_dir.is_dir():
            shutil.copytree(src_dir, OUT / "frames" / src_dir.name)
    shutil.copy2(V3 / "gifs" / "general.gif", OUT / "gifs" / "general.gif")

    # Build mid frames from the copied v3 bases.
    lt01 = load(OUT / "frames" / "lieutenant" / "01.png")
    head_turn(lt01, 20).save(OUT / "frames" / "lieutenant" / "02.png")
    head_turn(lt01, -20).save(OUT / "frames" / "lieutenant" / "03.png")

    en03 = load(OUT / "frames" / "engineer" / "03.png")
    engineer_rotate(en03, -40).save(OUT / "frames" / "engineer" / "05.png")

    c02 = load(OUT / "frames" / "colonel" / "02.png")
    colonel_mid_draw(c02, 30).save(OUT / "frames" / "colonel" / "05.png")

    # Also store workshop copies
    for name in ("lieutenant/02.png", "lieutenant/03.png", "engineer/05.png", "colonel/05.png"):
        shutil.copy2(OUT / "frames" / name, WORK / Path(name).name)

    records = {}
    for pid, name, desc in PIECES:
        directory = OUT / "frames" / pid
        files = sorted(p for p in directory.glob("*.png"))
        frames = {int(p.stem): load(p) for p in files}
        if pid != "general":
            order = ORDERS.get(pid, [1, 2, 3, 4])
            durations = DURATIONS.get(pid, DURATIONS["default"])
            make_gif(OUT / "gifs" / f"{pid}.gif", frames, order, durations)
            records[pid] = {
                "source": f"all-idle-v3/frames/{pid}/",
                "order": order,
                "durations_ms": durations,
                "frame_count": len(files),
                "description": desc,
            }
        else:
            records[pid] = {
                "source": "all-idle-v3/frames/general/ (nod-v2, unchanged)",
                "gif_source": "all-idle-v3/gifs/general.gif",
                "order": None,
                "description": desc,
            }

    records["method"] = {
        "colonel": "Lifted v3 02 glove+hilt along the scabbard axis and filled the gap with a short blade. Playback inserts 05 before the existing raised poses.",
        "lieutenant": "Rotated the head and hat of v3 01 around the neck, then restored the original shoulders. Replaced 02 and 03.",
        "engineer": "Rotated the wrench of v3 03 around the jaw on the shovel fitting, inpainted the vacated handle area. Added 05.",
        "generated_images": "Used only as pose reference; not inserted into the loop.",
    }
    (OUT / "alignment.json").write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    write_preview()
    write_overview(OUT / "overview.png")
    write_readme(records)
    shutil.copy2(Path(__file__), OUT / "build_all_idle_v4.py")
    contact_compare()
    print("done", OUT)
    for pid in ("colonel", "lieutenant", "engineer"):
        print(pid, sorted(p.name for p in (OUT / "frames" / pid).glob("*.png")))


if __name__ == "__main__":
    main()
