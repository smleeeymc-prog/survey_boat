#!/usr/bin/env python3
"""
build_scene_glb.py — 블렌더에서 내보낸 GLB를 웹용 GLB로 굽는다.

    python3 tools/build_scene_glb.py assets/scene_baked.glb assets/Scene.glb
    node statistics/tools/sync-model.mjs          # 화면이 실제로 읽는 사본에 밀어 넣기

하는 일
  1. 웹에서 쓰지 않는 노드를 뺀다 (코드가 따로 만드는 병, 빈 노드, 스케치팹 잔해)
  2. 텍스처마다 UV가 실제로 덮는 영역만 잘라낸다 — 섬(island) 단위로
  3. 잘라낸 조각과 단색 재질의 색을 텍스처 한 장(아틀라스)에 모으고 UV를 다시 매핑한다
  4. 재질을 아틀라스 두 개(조명 받음 / 안 받음)와, 코드가 따로 다루는 것들로 정리한다

아틀라스에 넣지 않는 것 — 코드나 지도 화면이 재질을 따로 붙잡고 있어서다
  · 배 본체(Cabin, Funnel, Funnel_step, Ship_Body): 지도가 캐빈·선체에 배마다 다른
    인스턴스 색을 입힌다. 재질이 합쳐지면 그 색 채널이 죽는다.
  · 바위(Rock 아래): 지역을 고를 때마다 REGION_SAND 로 색이 바뀐다.

필요한 것: python3, numpy, pillow  (pip install numpy pillow)
"""
import argparse, io, json, math, os, struct, sys
from collections import defaultdict
import numpy as np
from PIL import Image

# ── 설정 ────────────────────────────────────────────────────────────────────
# 코드가 따로 만들거나 쓰지 않는 노드 (이름 = 블렌더 이름, 점 포함)
DROP_SUBTREES = {"Bottle.001", "Sketchfab_model", "Cube", "Bed_table"}
# 재질을 그대로 두는 노드 (자식까지). 위 머리말 참고.
KEEP_MATERIAL_UNDER = {"Ship", "Rock"}
# 조명을 받지 않는 재질(KHR_materials_unlit)은 따로 모은다 — 하나로 합치면 음영이 바뀐다.
GUTTER = 8            # 아틀라스 안 조각 사이 여백(px). 가장자리 픽셀을 이만큼 늘려 밉맵 번짐을 막는다.
SOLID_MAX_PX = 3.0    # UV 섬의 가로·세로가 둘 다 이 이하면 한 점으로 보고 단색 칸으로 만든다
SWATCH = 16           # 단색 칸의 크기(px). 멀리서 밉맵이 내려가도 이웃 칸 색이 덜 섞이게 넉넉히
NEAREST_UPSCALE = 4   # NEAREST로 보던 텍스처(도트 느낌)는 이만큼 키워 넣는다 — 아틀라스는 LINEAR라서
# 조각 해상도 줄이기 — 부드러운 그라데이션은 칸 수가 적어도 GPU가 선형 보간으로 똑같이 되살린다.
# 줄였다가 다시 늘린 결과가 원본과 이 오차 안에 들 때만 줄인다(0~255 단위). 가로·세로 따로 본다.
REDUCE_MAX_ERR = 6    # 한 픽셀이라도 이보다 크게 틀리면 안 줄인다
REDUCE_MEAN_ERR = 1.0 # 평균 오차 한도
REDUCE_FACTORS = (1, 2, 3, 4, 6, 8, 12, 16)

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


# ── GLB 읽기 ────────────────────────────────────────────────────────────────
def load_glb(path):
    d = open(path, 'rb').read()
    assert d[:4] == b'glTF', f"{path}: GLB가 아니다"
    off = 12; js = None; bin_ = b''
    while off < len(d):
        ln, ty = struct.unpack_from('<II', d, off); off += 8
        ch = d[off:off + ln]; off += ln
        if ty == 0x4E4F534A: js = json.loads(ch)
        elif ty == 0x004E4942: bin_ = ch
    return js, bin_

def read_accessor(g, b, i):
    a = g['accessors'][i]; bv = g['bufferViews'][a['bufferView']]
    dt = np.dtype(CT[a['componentType']]).newbyteorder('<'); n = NC[a['type']]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride')
    if stride and stride != dt.itemsize * n:
        arr = np.array([np.frombuffer(b, dtype=dt, count=n, offset=base + k * stride) for k in range(a['count'])])
    else:
        arr = np.frombuffer(b, dtype=dt, count=a['count'] * n, offset=base).reshape(a['count'], n).copy()
    return arr

def image_of(g, b, tex_index):
    """텍스처의 원본 이미지. PNG 폴백이 있으면 그것(무손실 원본)을, 없으면 webp를 쓴다."""
    t = g['textures'][tex_index]
    src = t.get('source')
    if src is None:
        src = t.get('extensions', {}).get('EXT_texture_webp', {}).get('source')
    im = g['images'][src]; bv = g['bufferViews'][im['bufferView']]
    o = bv.get('byteOffset', 0)
    img = Image.open(io.BytesIO(b[o:o + bv['byteLength']])).convert('RGBA')
    samp = g['samplers'][t['sampler']] if 'sampler' in t else {}
    nearest = samp.get('magFilter') == 9728
    return img, nearest


# ── 노드 정리 ───────────────────────────────────────────────────────────────
def prune_nodes(g):
    """DROP_SUBTREES와 메쉬 없는 빈 가지를 뺀 새 노드 목록과 인덱스 대응표."""
    parent = {}
    for i, n in enumerate(g['nodes']):
        for c in n.get('children', []): parent[c] = i
    def dropped(i):
        while i is not None:
            if g['nodes'][i].get('name') in DROP_SUBTREES: return True
            i = parent.get(i)
        return False
    has_mesh_below = {}
    def mesh_below(i):
        if i in has_mesh_below: return has_mesh_below[i]
        n = g['nodes'][i]
        r = 'mesh' in n or any(mesh_below(c) for c in n.get('children', []) if not dropped(c))
        has_mesh_below[i] = r; return r
    keep = [i for i in range(len(g['nodes'])) if not dropped(i) and mesh_below(i)]
    remap = {old: new for new, old in enumerate(keep)}
    nodes = []
    for old in keep:
        n = dict(g['nodes'][old])
        ch = [remap[c] for c in n.get('children', []) if c in remap]
        if ch: n['children'] = ch
        else: n.pop('children', None)
        nodes.append(n)
    roots = [remap[r] for r in g['scenes'][g.get('scene', 0)]['nodes'] if r in remap]
    dropped_names = [g['nodes'][i].get('name') for i in range(len(g['nodes'])) if i not in remap and
                     (g['nodes'][i].get('name') in DROP_SUBTREES or 'mesh' in g['nodes'][i])]
    return nodes, roots, remap, dropped_names

def names_under(g, roots_names):
    """주어진 이름의 노드와 그 자손이 쓰는 메쉬 인덱스 집합."""
    idx = {n.get('name'): i for i, n in enumerate(g['nodes'])}
    out = set()
    def walk(i):
        n = g['nodes'][i]
        if 'mesh' in n: out.add(n['mesh'])
        for c in n.get('children', []): walk(c)
    for nm in roots_names:
        if nm in idx: walk(idx[nm])
    return out


# ── UV 섬 ───────────────────────────────────────────────────────────────────
def uv_islands(tris):
    """삼각형 목록(정점 인덱스 3개씩)을 정점 공유로 이은 섬들. 각 섬 = 삼각형 번호 목록."""
    parent = {}
    def find(x):
        while parent.setdefault(x, x) != x:
            parent[x] = parent[parent[x]]; x = parent[x]
        return x
    for a, b_, c in tris:
        ra, rb, rc = find(a), find(b_), find(c)
        parent[rb] = ra; parent[find(rc)] = ra
    groups = defaultdict(list)
    for t, (a, _, _) in enumerate(tris): groups[find(a)].append(t)
    return list(groups.values())

def merge_rects(rects):
    """겹치는 사각형을 합친다. rect = [x0, y0, x1, y1] (x1·y1 미포함)."""
    rects = [list(r) for r in rects]
    changed = True
    while changed:
        changed = False
        out = []
        while rects:
            r = rects.pop()
            i = 0
            while i < len(rects):
                q = rects[i]
                if r[0] < q[2] and q[0] < r[2] and r[1] < q[3] and q[1] < r[3]:
                    r = [min(r[0], q[0]), min(r[1], q[1]), max(r[2], q[2]), max(r[3], q[3])]
                    rects.pop(i); changed = True
                else:
                    i += 1
            out.append(r)
        rects = out
    return rects


# ── 패킹 ────────────────────────────────────────────────────────────────────
def maxrects_pack(items, W, H):
    """MaxRects(짧은 변 기준 최적 맞춤). items: [(w, h, key)] → {key: (x, y)} 또는 못 넣으면 None."""
    free = [(0, 0, W, H)]
    pos = {}
    for w, h, key in sorted(items, key=lambda it: (-max(it[0], it[1]), -it[0] * it[1])):
        best = None
        for fx, fy, fw, fh in free:
            if w <= fw and h <= fh:
                score = (min(fw - w, fh - h), max(fw - w, fh - h))
                if best is None or score < best[0]: best = (score, fx, fy)
        if best is None: return None
        _, x, y = best
        pos[key] = (x, y)
        out = []
        for fx, fy, fw, fh in free:        # 놓은 칸과 겹치는 빈 칸을 쪼갠다
            if x >= fx + fw or x + w <= fx or y >= fy + fh or y + h <= fy:
                out.append((fx, fy, fw, fh)); continue
            if x > fx: out.append((fx, fy, x - fx, fh))
            if x + w < fx + fw: out.append((x + w, fy, fx + fw - x - w, fh))
            if y > fy: out.append((fx, fy, fw, y - fy))
            if y + h < fy + fh: out.append((fx, y + h, fw, fy + fh - y - h))
        free = [a for i, a in enumerate(out)   # 다른 빈 칸 안에 들어가는 빈 칸은 버린다
                if not any(j != i and b[0] <= a[0] and b[1] <= a[1] and a[0] + a[2] <= b[0] + b[2]
                           and a[1] + a[3] <= b[1] + b[3] and (b != a or j < i) for j, b in enumerate(out))]
    return pos

def reduce_patch(img):
    """오차 한도 안에서 가장 작게 줄인 조각과 (가로 배율, 세로 배율)."""
    a = np.asarray(img.convert('RGB')).astype(np.int16)
    w, h = img.size
    best = (w * h, img, 1.0, 1.0)
    for fx in REDUCE_FACTORS:
        for fy in REDUCE_FACTORS:
            nw, nh = max(2, math.ceil(w / fx)), max(2, math.ceil(h / fy))
            if nw * nh >= best[0] or (nw == w and nh == h): continue
            small = img.resize((nw, nh), Image.BOX)
            back = np.asarray(small.resize((w, h), Image.BILINEAR).convert('RGB')).astype(np.int16)
            d = np.abs(back - a)
            if d.max() <= REDUCE_MAX_ERR and d.mean() <= REDUCE_MEAN_ERR:
                best = (nw * nh, small, nw / w, nh / h)
    return best[1], best[2], best[3]

def pot(n):
    return 1 << max(0, math.ceil(math.log2(max(1, n))))

def dilate(img, rect, gutter):
    """rect 안쪽 가장자리 픽셀을 gutter 만큼 바깥으로 늘린다 (밉맵 번짐 방지)."""
    a = np.asarray(img).copy()
    x0, y0, x1, y1 = rect
    H, W = a.shape[:2]
    for k in range(1, gutter + 1):
        if y0 - k >= 0: a[y0 - k, x0:x1] = a[y0, x0:x1]
        if y1 - 1 + k < H: a[y1 - 1 + k, x0:x1] = a[y1 - 1, x0:x1]
    xa, xb = max(0, y0 - gutter), min(H, y1 + gutter)
    for k in range(1, gutter + 1):
        if x0 - k >= 0: a[xa:xb, x0 - k] = a[xa:xb, x0]
        if x1 - 1 + k < W: a[xa:xb, x1 - 1 + k] = a[xa:xb, x1 - 1]
    return Image.fromarray(a)


def srgb8(linear):
    c = max(0.0, min(1.0, float(linear)))
    c = c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return int(round(c * 255))


# ── 굽기 ────────────────────────────────────────────────────────────────────
def build(src, max_width=4096):
    g, b = load_glb(src)
    nodes, roots, node_remap, dropped = prune_nodes(g)
    kept_meshes = sorted({n['mesh'] for n in nodes if 'mesh' in n})
    keep_mat_meshes = names_under(g, KEEP_MATERIAL_UNDER)
    rock_meshes = names_under(g, {"Rock"})
    mesh_owner = {n['mesh']: n.get('name') for n in g['nodes'] if 'mesh' in n}

    # 1) 프리미티브 분류 — 아틀라스(조명/무조명) 또는 재질 유지
    prims = []          # dict: mesh, pi, kind('atlas'|'keep'), unlit, source('tex'|'ao'|'color'), ...
    for mi in kept_meshes:
        for pi, p in enumerate(g['meshes'][mi]['primitives']):
            mat_i = p.get('material')
            mat = g['materials'][mat_i] if mat_i is not None else {}
            pbr = mat.get('pbrMetallicRoughness', {})
            rec = dict(mesh=mi, pi=pi, owner=mesh_owner.get(mi), mat=mat_i, mat_name=mat.get('name'))
            if mi in keep_mat_meshes:
                rec['kind'] = 'keep'
            else:
                rec['kind'] = 'atlas'
                rec['unlit'] = 'KHR_materials_unlit' in mat.get('extensions', {})
                factor = pbr.get('baseColorFactor', [1, 1, 1, 1])
                rec['factor'] = factor
                if 'baseColorTexture' in pbr:
                    rec['source'] = 'tex'; rec['tex'] = pbr['baseColorTexture']['index']
                elif 'occlusionTexture' in mat:
                    rec['source'] = 'ao'; rec['tex'] = mat['occlusionTexture']['index']
                    rec['note'] = '재질에 AO만 있음(색 없음, 금속 기본값) → AO를 색에 구운 비금속 흰색'
                else:
                    rec['source'] = 'color'
                    if mat_i is None: rec['note'] = '재질 없음(glTF 기본 = 흰 금속) → 비금속 흰색'
                    # 금속(metallic 기본값 1)인데 색이 없으면 흰색 금속 → 환경맵이 없는 이 씬에선
                    # 거의 검게 나온다. 아틀라스는 비금속이므로 밝은 회색으로 금속 느낌만 남긴다.
                    if 'baseColorFactor' not in pbr and pbr.get('metallicFactor', 1) >= 0.5 and mat:
                        rec['factor'] = [0.62, 0.63, 0.65, 1]
                        rec['note'] = '재질 금속(색 없음, 이 씬에선 검게 나옴) → 비금속 밝은 회색'
            prims.append(rec)

    # 2) 텍스처 조각 — 텍스처별로 섬을 찾고, 겹치는 섬의 사각형을 합친다
    tex_cache = {}
    def tex(ti):
        if ti not in tex_cache: tex_cache[ti] = image_of(g, b, ti)
        return tex_cache[ti]

    patches = {}        # key -> dict(img, rect(src px), scale)
    swatches = {}       # (r,g,b) -> key
    island_plan = []    # (rec, vertex_indices, kind, key)
    for rec in prims:
        if rec['kind'] != 'atlas': continue
        p = g['meshes'][rec['mesh']]['primitives'][rec['pi']]
        idx = read_accessor(g, b, p['indices']).ravel() if 'indices' in p else \
              np.arange(g['accessors'][p['attributes']['POSITION']]['count'])
        tris = idx.reshape(-1, 3)
        rec['idx'] = idx
        if rec['source'] == 'color':
            f = rec['factor']
            col = (srgb8(f[0]), srgb8(f[1]), srgb8(f[2]))
            key = swatches.setdefault(col, f"sw{len(swatches)}")
            island_plan.append((rec, np.unique(idx), 'solid', key))
            continue
        img, nearest = tex(rec['tex'])
        W, H = img.size
        uv = read_accessor(g, b, p['attributes']['TEXCOORD_0']).astype(np.float64)
        rec['uv'] = uv
        islands = uv_islands([tuple(t) for t in tris])
        rects = []; per_island = []
        for tri_ids in islands:
            vs = np.unique(tris[tri_ids].ravel())
            px = uv[vs] * [W, H]
            x0, y0 = px.min(0); x1, y1 = px.max(0)
            if (x1 - x0) <= SOLID_MAX_PX and (y1 - y0) <= SOLID_MAX_PX:
                cx, cy = int(np.clip(px[:, 0].mean(), 0, W - 1)), int(np.clip(px[:, 1].mean(), 0, H - 1))
                rgba = img.getpixel((cx, cy))
                if rec['source'] == 'ao': rgba = (rgba[0], rgba[0], rgba[0], 255)
                col = tuple(rgba[:3])
                key = swatches.setdefault(col, f"sw{len(swatches)}")
                island_plan.append((rec, vs, 'solid', key))
                continue
            r = [max(0, int(math.floor(x0)) - 1), max(0, int(math.floor(y0)) - 1),
                 min(W, int(math.ceil(x1)) + 1), min(H, int(math.ceil(y1)) + 1)]
            rects.append(r); per_island.append((vs, r))
        merged = merge_rects(rects)
        for mr in merged:
            key = f"t{rec['tex']}_{mr[0]}_{mr[1]}_{mr[2]}_{mr[3]}_{rec['source']}"
            if key not in patches:
                crop = img.crop(tuple(mr))
                if rec['source'] == 'ao':
                    a = np.asarray(crop)[:, :, 0]
                    crop = Image.fromarray(np.dstack([a, a, a, np.full_like(a, 255)]))
                f = rec['factor']
                if any(abs(c - 1) > 1e-4 for c in f[:3]):
                    arr = np.asarray(crop).astype(np.float32)
                    for c in range(3): arr[:, :, c] *= f[c]
                    crop = Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))
                if nearest:
                    s = NEAREST_UPSCALE; sx = sy = s
                    crop = crop.resize((crop.width * s, crop.height * s), Image.NEAREST)
                else:
                    crop, sx, sy = reduce_patch(crop)
                patches[key] = dict(img=crop, rect=mr, sx=sx, sy=sy, W=W, H=H, tex=rec['tex'], owners=set())
            patches[key]['owners'].add(rec['owner'])
        for vs, r in per_island:
            key = next(f"t{rec['tex']}_{m[0]}_{m[1]}_{m[2]}_{m[3]}_{rec['source']}" for m in merged
                       if m[0] <= r[0] and m[1] <= r[1] and m[2] >= r[2] and m[3] >= r[3])
            island_plan.append((rec, vs, 'patch', key))

    # 3) 한 장에 싣기 — 가장 작은 2의 거듭제곱 넓이를 고른다
    items = [(pt['img'].width + 2 * GUTTER, pt['img'].height + 2 * GUTTER, k) for k, pt in patches.items()]
    items += [(SWATCH + 2 * GUTTER, SWATCH + 2 * GUTTER, k) for k in swatches.values()]
    best = None
    sizes = sorted(((w, h) for w in (2 ** k for k in range(6, 14)) for h in (2 ** k for k in range(6, 14))
                    if w <= max_width and h <= max_width and h <= w * 2 and w <= h * 2),
                   key=lambda wh: (wh[0] * wh[1], abs(wh[0] - wh[1])))
    for AW, AH in sizes:
        pos = maxrects_pack(items, AW, AH)
        if pos is not None: best = (AW, AH, pos); break
    if best is None: sys.exit("아틀라스에 다 안 들어간다 — max_width를 키울 것")
    AW, AH, pos = best
    atlas = Image.new('RGBA', (AW, AH), (0, 0, 0, 255))
    placed = {}
    for k, pt in patches.items():
        x, y = pos[k]; x += GUTTER; y += GUTTER
        atlas.paste(pt['img'], (x, y))
        atlas = dilate(atlas, (x, y, x + pt['img'].width, y + pt['img'].height), GUTTER)
        placed[k] = (x, y)
    for col, k in swatches.items():
        x, y = pos[k]; x += GUTTER; y += GUTTER
        atlas.paste(Image.new('RGBA', (SWATCH, SWATCH), col + (255,)), (x, y))
        atlas = dilate(atlas, (x, y, x + SWATCH, y + SWATCH), GUTTER)
        placed[k] = (x, y)

    # 4) UV 다시 매핑
    new_uv = {}         # (mesh, pi) -> float32 array
    for rec, vs, kind, key in island_plan:
        mk = (rec['mesh'], rec['pi'])
        if mk not in new_uv:
            n = g['accessors'][g['meshes'][rec['mesh']]['primitives'][rec['pi']]['attributes']['POSITION']]['count']
            new_uv[mk] = np.zeros((n, 2), np.float64)
        x, y = placed[key]
        if kind == 'solid':
            new_uv[mk][vs] = [(x + SWATCH / 2) / AW, (y + SWATCH / 2) / AH]
        else:
            pt = patches[key]; r = pt['rect']
            uvp = rec['uv'][vs] * [pt['W'], pt['H']]
            new_uv[mk][vs, 0] = (x + (uvp[:, 0] - r[0]) * pt['sx']) / AW
            new_uv[mk][vs, 1] = (y + (uvp[:, 1] - r[1]) * pt['sy']) / AH

    return dict(g=g, b=b, nodes=nodes, roots=roots, dropped=dropped, prims=prims, patches=patches,
                swatches=swatches, atlas=atlas, AW=AW, AH=AH, new_uv=new_uv, rock_meshes=rock_meshes,
                tex_cache=tex_cache, kept_meshes=kept_meshes, island_plan=island_plan, placed=placed, src=src)


# ── 쓰기 ────────────────────────────────────────────────────────────────────
class Bin:
    """BIN 청크를 쌓으면서 bufferView·accessor를 만든다."""
    def __init__(self):
        self.buf = bytearray(); self.views = []; self.accessors = []

    def view(self, data, target=None):
        while len(self.buf) % 4: self.buf.append(0)
        v = dict(buffer=0, byteOffset=len(self.buf), byteLength=len(data))
        if target: v['target'] = target
        self.buf += data; self.views.append(v)
        return len(self.views) - 1

    def accessor(self, arr, target=None, minmax=False):
        arr = np.ascontiguousarray(arr)
        ct = {np.dtype(np.float32): 5126, np.dtype(np.uint16): 5123, np.dtype(np.uint32): 5125}[arr.dtype]
        kind = 'SCALAR' if arr.ndim == 1 else {2: 'VEC2', 3: 'VEC3', 4: 'VEC4'}[arr.shape[1]]
        a = dict(bufferView=self.view(arr.astype(arr.dtype.newbyteorder('<')).tobytes(), target),
                 componentType=ct, count=int(arr.shape[0]), type=kind)
        if minmax:
            a['min'] = [float(x) for x in np.atleast_1d(arr.min(0))]
            a['max'] = [float(x) for x in np.atleast_1d(arr.max(0))]
        self.accessors.append(a)
        return len(self.accessors) - 1


def encode_webp(img, quality, lossless):
    out = io.BytesIO()
    rgb = img.convert('RGB')      # 알파는 전부 255라 버린다
    if lossless: rgb.save(out, 'WEBP', lossless=True, quality=100, method=6)
    else: rgb.save(out, 'WEBP', quality=quality, method=6)
    return out.getvalue()


def write_glb(r, dst, quality=92, lossless=False, roughness=0.85):
    g, b = r['g'], r['b']
    B = Bin()

    # 재질 — 유지할 것은 내용이 같으면 하나로 합친다 (바위 10개가 같은 재질을 10벌 들고 있었다)
    out_mats = []; mat_key_to_new = {}; old_to_new = {}; notes = []
    for rec in r['prims']:
        if rec['kind'] != 'keep': continue
        mi = rec['mat']
        if mi is None or mi in old_to_new: continue
        m = g['materials'][mi]
        pbr = m.get('pbrMetallicRoughness', {})
        assert 'baseColorTexture' not in pbr and 'occlusionTexture' not in m and 'normalTexture' not in m, \
            f"재질 유지 대상 {m.get('name')}에 텍스처가 있다 — 이 스크립트는 그 경우를 다루지 않는다"
        m = json.loads(json.dumps(m))
        # metallicFactor가 빠지면 glTF 기본값 1(완전 금속)이 된다. 환경맵이 없는 이 씬에선
        # 금속이 확산광을 못 받아 거의 검게 나온다(블렌더 미리보기는 HDRI가 있어서 멀쩡해 보인다).
        # 금속 텍스처가 없는 재질은 비금속으로 되돌린다 — 아틀라스 쪽도 전부 비금속이다.
        pbr = m.setdefault('pbrMetallicRoughness', {})
        if 'metallicFactor' not in pbr and 'metallicRoughnessTexture' not in pbr:
            pbr['metallicFactor'] = 0
            notes.append((rec['owner'], f"재질 {m.get('name')}: metallic 누락(기본값 1=금속) → 0"))
        key = json.dumps({k: v for k, v in m.items() if k != 'name'}, sort_keys=True)
        if key not in mat_key_to_new:
            mat_key_to_new[key] = len(out_mats); out_mats.append(m)
        old_to_new[mi] = mat_key_to_new[key]
    # 바위만 쓰는 재질은 이름을 Rock으로 (블렌더 이름 Cabin_MAT.00x는 캐빈과 헷갈린다)
    users = defaultdict(set)
    for rec in r['prims']:
        if rec['kind'] == 'keep' and rec['mat'] is not None: users[old_to_new[rec['mat']]].add(rec['mesh'])
    for ni, ms in users.items():
        if ms <= r['rock_meshes']: out_mats[ni]['name'] = 'Rock'

    atlas_mat = {}
    def atlas_material(unlit):
        if unlit not in atlas_mat:
            m = dict(name='Atlas_Unlit' if unlit else 'Atlas_Lit', doubleSided=True,
                     pbrMetallicRoughness=dict(baseColorTexture=dict(index=0), metallicFactor=0,
                                               roughnessFactor=roughness))
            if unlit: m['extensions'] = {'KHR_materials_unlit': {}}
            atlas_mat[unlit] = len(out_mats); out_mats.append(m)
        return atlas_mat[unlit]

    # 메쉬 — 같은 재질로 가는 프리미티브는 하나로 합친다 (three.js에선 프리미티브 = 드로우콜)
    by_mesh = defaultdict(list)
    for rec in r['prims']: by_mesh[rec['mesh']].append(rec)
    out_meshes = []; mesh_remap = {}
    for mi in r['kept_meshes']:
        groups = defaultdict(list)
        for rec in by_mesh[mi]:
            mk = old_to_new.get(rec['mat']) if rec['kind'] == 'keep' else atlas_material(rec['unlit'])
            groups[mk].append(rec)
        prims = []
        for mk, recs in groups.items():
            pos, nor, uvs, idx = [], [], [], []; base = 0; has_uv = True
            for rec in recs:
                p = g['meshes'][mi]['primitives'][rec['pi']]
                P = read_accessor(g, b, p['attributes']['POSITION']).astype(np.float32)
                N = read_accessor(g, b, p['attributes']['NORMAL']).astype(np.float32) if 'NORMAL' in p['attributes'] else None
                if rec['kind'] == 'atlas': U = r['new_uv'][(mi, rec['pi'])].astype(np.float32)
                elif 'TEXCOORD_0' in p['attributes']: U = read_accessor(g, b, p['attributes']['TEXCOORD_0']).astype(np.float32)
                else: U = None
                I = read_accessor(g, b, p['indices']).ravel().astype(np.int64) if 'indices' in p else np.arange(len(P))
                pos.append(P); nor.append(N); uvs.append(U); idx.append(I + base); base += len(P)
                has_uv = has_uv and U is not None
            P = np.concatenate(pos); I = np.concatenate(idx)
            attrs = dict(POSITION=B.accessor(P, 34962, minmax=True))
            if all(n is not None for n in nor): attrs['NORMAL'] = B.accessor(np.concatenate(nor), 34962)
            if has_uv: attrs['TEXCOORD_0'] = B.accessor(np.concatenate(uvs), 34962)
            it = np.uint16 if len(P) < 65536 else np.uint32
            prim = dict(attributes=attrs, indices=B.accessor(I.astype(it), 34963))
            if mk is not None: prim['material'] = mk
            prims.append(prim)
        mesh_remap[mi] = len(out_meshes)
        out_meshes.append(dict(name=g['meshes'][mi].get('name', f'mesh{mi}'), primitives=prims))

    nodes = []
    for n in r['nodes']:
        n = dict(n)
        if 'mesh' in n: n['mesh'] = mesh_remap[n['mesh']]
        nodes.append(n)

    webp = encode_webp(r['atlas'], quality, lossless)
    img_view = B.view(webp)
    used = ['EXT_texture_webp'] + (['KHR_materials_unlit'] if True in atlas_mat else [])
    gj = dict(
        asset=dict(version='2.0', generator='survey_boat tools/build_scene_glb.py'),
        extensionsUsed=used, extensionsRequired=['EXT_texture_webp'],
        scene=0, scenes=[dict(name='Scene', nodes=r['roots'])],
        nodes=nodes, meshes=out_meshes, materials=out_mats,
        samplers=[dict(magFilter=9729, minFilter=9987, wrapS=33071, wrapT=33071)],
        images=[dict(name='Atlas', mimeType='image/webp', bufferView=img_view)],
        textures=[dict(sampler=0, extensions=dict(EXT_texture_webp=dict(source=0)))],
        accessors=B.accessors, bufferViews=B.views, buffers=[dict(byteLength=0)],
    )
    while len(B.buf) % 4: B.buf.append(0)
    gj['buffers'][0]['byteLength'] = len(B.buf)
    js = json.dumps(gj, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    js += b' ' * (-len(js) % 4)
    total = 12 + 8 + len(js) + 8 + len(B.buf)
    with open(dst, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(B.buf), 0x004E4942)); f.write(bytes(B.buf))
    return dict(bytes=total, webp=len(webp), materials=len(out_mats), notes=notes,
                prims=sum(len(m['primitives']) for m in out_meshes), meshes=len(out_meshes), nodes=len(nodes))


# ── 리포트 ──────────────────────────────────────────────────────────────────
def report(r, st, out_dir):
    from PIL import ImageDraw
    os.makedirs(out_dir, exist_ok=True)
    r['atlas'].convert('RGB').save(os.path.join(out_dir, 'atlas.png'))
    # 어느 조각이 누구 것인지 테두리와 이름을 그린 판
    ov = r['atlas'].convert('RGB').copy(); d = ImageDraw.Draw(ov)
    owners = defaultdict(set)
    for rec, _vs, _kind, key in r['island_plan']: owners[key].add(rec['owner'])
    for k, (x, y) in r['placed'].items():
        w, h = (r['patches'][k]['img'].size if k in r['patches'] else (SWATCH, SWATCH))
        d.rectangle([x - 1, y - 1, x + w, y + h], outline=(255, 0, 255))
        if k in r['patches']: d.text((x + 2, y + 2), ','.join(sorted(owners[k])), fill=(255, 0, 255))
    ov.save(os.path.join(out_dir, 'atlas_labeled.png'))

    g = r['g']
    L = []
    L.append(f"원본: {r['src']}  ({os.path.getsize(r['src']) / 1024:.0f} KB)")
    L.append(f"결과: {st['bytes'] / 1024:.0f} KB  (아틀라스 WebP {st['webp'] / 1024:.0f} KB, {r['AW']}x{r['AH']})")
    L.append(f"노드 {len(g['nodes'])} → {st['nodes']}   메쉬 {len(g['meshes'])} → {st['meshes']}   "
             f"재질 {len(g['materials'])} → {st['materials']}   "
             f"프리미티브 {sum(len(m['primitives']) for m in g['meshes'])} → {st['prims']}")
    L.append(f"뺀 노드: {', '.join(n for n in r['dropped'] if n)}")
    L.append("")
    L.append("텍스처별 — 원본 크기 / UV가 실제로 덮는 영역만 잘라 옮긴 넓이")
    by_tex = defaultdict(list)
    for k, pt in r['patches'].items(): by_tex[pt['tex']].append(pt)
    for ti, img in sorted(r['tex_cache'].items()):
        im, nearest = img
        pts = by_tex.get(ti, [])
        area = sum((pt['rect'][2] - pt['rect'][0]) * (pt['rect'][3] - pt['rect'][1]) for pt in pts)
        who = sorted({o for pt in pts for o in pt['owners']}) or ['(단색으로만 씀)']
        L.append(f"  tex{ti} {im.width}x{im.height}{' NEAREST' if nearest else ''}  → 조각 {len(pts)}개, "
                 f"{area} px² ({100 * area / (im.width * im.height):.1f}%)  [{', '.join(who)}]")
    L.append(f"단색 칸: {len(r['swatches'])}개 ({SWATCH}px)")
    notes = sorted({(p['owner'], p['note']) for p in r['prims'] if p.get('note')} | set(st['notes']))
    for o, n in notes: L.append(f"  참고: {o} — {n}")
    txt = '\n'.join(L)
    open(os.path.join(out_dir, 'report.txt'), 'w').write(txt + '\n')
    return txt


def main():
    ap = argparse.ArgumentParser(description='블렌더 GLB → 아틀라스 한 장짜리 웹용 GLB')
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--report', help='아틀라스 미리보기(atlas.png, atlas_labeled.png)와 요약(report.txt)을 쓸 폴더')
    ap.add_argument('--quality', type=int, default=92, help='WebP 손실 압축 품질 (기본 92)')
    ap.add_argument('--lossless', action='store_true', help='WebP 무손실로 넣기')
    ap.add_argument('--max-width', type=int, default=4096)
    a = ap.parse_args()
    r = build(a.src, max_width=a.max_width)
    st = write_glb(r, a.dst, quality=a.quality, lossless=a.lossless)
    if a.report: print(report(r, st, a.report))
    else: print(f"{a.dst}: {st['bytes'] / 1024:.0f} KB, 아틀라스 {r['AW']}x{r['AH']}")


if __name__ == '__main__':
    main()
