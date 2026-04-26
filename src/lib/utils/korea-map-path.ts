/**
 * 한국 지도 실루엣 SVG path (한반도·제주가 구분되도록 단순화)
 * viewBox: 0 0 360 500
 */

export const KOREA_MAINLAND_PATH = `
M 185 34
L 208 32
L 226 40
L 242 55
L 252 75
L 258 98
L 262 122
L 260 145
L 266 168
L 268 192
L 262 218
L 254 245
L 240 272
L 218 295
L 192 312
L 165 322
L 138 324
L 112 318
L 92 302
L 80 278
L 74 248
L 78 218
L 72 185
L 68 150
L 74 115
L 92 78
L 128 48
L 160 36
L 185 34
Z
`;

export const JEJU_PATH = `
M 82 404
C 95 394, 120 390, 142 394
C 164 398, 178 410, 176 426
C 174 442, 152 454, 128 454
C 104 454, 82 442, 78 422
C 76 410, 78 406, 82 404
Z
`;

// 본토 내부에 점이 모이도록 여백
export const MAP_BOUNDS = {
	viewBoxW: 360,
	viewBoxH: 500,
	innerX: 92,
	innerY: 52,
	innerW: 168,
	innerH: 268,
} as const;
