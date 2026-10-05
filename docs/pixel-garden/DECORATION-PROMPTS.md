# Monthly Garden 特殊装饰素材

春季麻雀、秋季松鼠、夏季青蛙与柠檬汽水杯使用内置 imagegen 工具生成透明 PNG，参考现有原创月视图灌木的色彩和像素颗粒感；冬季彩灯雪松由项目作者直接提供透明 PNG。动物参考图只用于主题与气氛，新图不复制其像素排列。全部素材保持透明背景、深色不规则像素轮廓和有限自然色板，不含土壤或文字。

## Spring sparrow

Generation prompt: Create a single tiny Eurasian tree sparrow perched on a spring cherry blossom shrub, viewed from a gentle overhead three-quarter angle. Its chestnut crown, cream cheeks, dark eye, small beak, wings and feet must read clearly at 24–32 displayed pixels. Match the existing spring shrub atlas: cozy 1990s handheld farming-game pixel art, crisp square pixel clusters, restrained warm-brown, cream and dusty-pink palette, dark irregular contour and upper-left highlights. Use the supplied animal sample for broad inspiration only. True transparent background; no soil, ground tile, text or watermark.

The first generation also included flowers. Extraction edit prompt: Keep only the sparrow character, preserving its exact silhouette, chestnut crown, cream cheek, dark beak and eye, patterned wing, palette and pixel texture. Remove every flower, leaf, branch, shrub and shadow, replacing them with real transparency. Center the isolated bird with clear padding; add no other subjects or background.

## Summer frog

Generation prompt: Create one charming small tree frog perched on an unseen summer shrub, viewed from a gentle overhead three-quarter angle. Rounded emerald-green body, broad head, golden eyes, tiny feet and pale yellow-green belly must read at 24–32 displayed pixels. Match the isolated sparrow's cozy handheld farming-game pixel style: hard square pixel edges, dark irregular contour, limited palette and upper-left highlights. A single centered transparent character only; no plant, flower, leaf, lily pad, soil, water, shadow, text or watermark.

## Autumn squirrel

Generation prompt: Create one red squirrel perched on an unseen autumn shrub, viewed from a gentle overhead three-quarter angle. Rusty-orange fur, cream chest, vivid curled fluffy tail and tiny face and paws must read at 24–32 displayed pixels. Use the supplied squirrel sample only as broad animal and style inspiration, without copying its exact layout. Cozy handheld farming-game pixel art with crisp square clusters, dark brown irregular outline, warm orange and ochre palette and upper-left highlights. Center the squirrel on a genuinely transparent canvas; no plant, branch, soil, tile, shadow, text or watermark.

## Summer lemonade

Generation prompt: Create exactly one whimsical golden-yellow lemonade soda cup, with visible lemon slices and ice cubes, pale green rim, one angled striped straw and a small lemon wedge. Tilt the cup slightly diagonally, with its open elliptical rim slanting upward as if perched on an angled round shrub. It must read at 24–32 displayed pixels. Use the supplied lemonade image only as broad subject inspiration, without copying the two-cup composition. Cozy handheld farming-game pixel art, hard square clusters, muted brown contour, warm yellow and lime palette. A single centered transparent cup only; no second cup, plant, hand, soil, background, text or watermark.

## Winter illuminated shrub

`winter-lit-v2.png` is the transparent pixel-art shrub directly supplied by the project author. It replaces the previous imagegen cutout. The source file is 1254 × 1254 pixels with real alpha transparency; it has no background or number overlay.

The selection rule lives in `pixel-garden-core.js`: at least 15 contributions, then only the four highest-contribution days in a month receive decorations. Equal counts prefer earlier dates. Summer alternates frog and lemonade by the date's UTC day number; winter replaces the chosen shrub with this artwork.
