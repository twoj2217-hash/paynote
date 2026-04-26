/**
 * 픽셀 캐릭터 & 카페 건물 Canvas 그리기 유틸
 * 핸드오버 문서(픽셀캐릭터_핸드오버.md) 기반 TypeScript 버전
 */

export interface CharacterColors {
	body: string;
	hair: string;
	skin: string;
	shoe: string;
}

// 사장님(내 가게) 기본 색상 — 브랜드 파란색 옷
export const OWNER_COLORS: CharacterColors = {
	body: '#2563eb',
	hair: '#1e3a5f',
	skin: '#ffe0bd',
	shoe: '#333',
};

// 캐릭터 높이 기준점
const BH = 28;

/**
 * 픽셀 캐릭터를 Canvas에 그린다 (idle 애니메이션 포함)
 * @param ctx  Canvas 2D 컨텍스트
 * @param x    캐릭터 중심 X
 * @param y    캐릭터 발밑 Y
 * @param colors 캐릭터 색상
 * @param label  머리 위 라벨 텍스트
 * @param scale  크기 배율 (기본 1.0)
 * @param t      애니메이션 시각 (Date.now())
 */
export function drawPixelCharacter(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	colors: CharacterColors,
	label: string,
	scale = 1.0,
	t = 0,
): void {
	const { body, hair, skin, shoe } = colors;
	const facing = 1;

	ctx.save();
	ctx.translate(x, y);
	ctx.scale(scale, scale);
	// 픽셀 느낌 유지 (확대 시 블러 완화)
	ctx.imageSmoothingEnabled = false;

	// ① 그림자
	ctx.beginPath();
	ctx.ellipse(0, 2, 14, 6, 0, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(0,0,0,0.12)';
	ctx.fill();

	// idle 애니메이션: 몸 전체 미세 흔들림
	const bodyLean = t > 0 ? Math.sin(t / 2000) * 0.8 : 0;
	ctx.translate(bodyLean, 0);

	// ② 다리
	ctx.fillStyle = shoe;
	ctx.fillRect(-6, -4, 5, 4);
	ctx.fillRect(1, -4, 5, 4);

	// ③ 몸통
	ctx.fillStyle = body;
	ctx.fillRect(-8, -BH + 6, 16, 18);

	// ④ 팔
	ctx.fillStyle = skin;
	ctx.fillRect(-11, -BH + 8, 3, 10);
	ctx.fillRect(8, -BH + 8, 3, 10);

	// ⑤ 머리 (idle: 미세 틸트)
	const headTilt = t > 0 ? Math.sin(t / 1500) * 1.5 : 0;
	ctx.save();
	ctx.translate(0, -BH + 2);
	ctx.rotate((headTilt * Math.PI) / 180);
	ctx.translate(0, BH - 2);

	ctx.fillStyle = skin;
	ctx.fillRect(-7, -BH - 4, 14, 12);

	// ⑥ 머리카락
	ctx.fillStyle = hair;
	ctx.fillRect(-8, -BH - 6, 16, 5);

	// ⑦ 눈 (idle: 가끔 깜박임)
	const blinkActive = t > 0 && Math.sin(t / 3000) > 0.93;
	if (blinkActive) {
		ctx.fillStyle = skin;
		ctx.fillRect(-5, -BH + 1, 10, 2);
	} else {
		const eyeShift = facing * 1;
		ctx.fillStyle = '#222';
		ctx.fillRect(-4 + eyeShift, -BH + 1, 2, 2);
		ctx.fillRect(2 + eyeShift, -BH + 1, 2, 2);
	}

	ctx.restore(); // 머리 틸트 복구

	ctx.restore(); // 전체 복구

	// ⑧ 라벨 (캐릭터 머리 위)
	if (label) {
		const labelY = y - (BH + 12) * scale;
		ctx.font = `bold ${Math.round(9 * scale)}px "Pretendard", "Segoe UI", sans-serif`;
		ctx.textAlign = 'center';
		ctx.fillStyle = 'rgba(0,0,0,0.45)';
		ctx.fillText(label, x + 0.5, labelY + 0.5);
		ctx.fillStyle = '#1e40af';
		ctx.fillText(label, x, labelY);
	}
}

/**
 * 미니 카페 건물 아이콘을 Canvas에 그린다 (다른 매장용)
 * @param ctx   Canvas 2D 컨텍스트
 * @param x     건물 중심 X
 * @param y     건물 바닥 Y
 * @param scale 크기 배율 (기본 1.0)
 * @param highlight hover 하이라이트 여부
 */
export function drawCafeBuilding(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	scale = 1.0,
	highlight = false,
): void {
	ctx.save();
	ctx.translate(x, y);
	ctx.scale(scale, scale);
	ctx.imageSmoothingEnabled = false;

	// 그림자
	ctx.beginPath();
	ctx.ellipse(0, 2, 10, 4, 0, 0, Math.PI * 2);
	ctx.fillStyle = 'rgba(0,0,0,0.08)';
	ctx.fill();

	const wallColor = highlight ? '#b0b8c4' : '#d1d5db';
	const roofColor = highlight ? '#7c8594' : '#9ca3af';
	const doorColor = highlight ? '#6b7280' : '#9ca3af';

	// 건물 몸체
	ctx.fillStyle = wallColor;
	ctx.fillRect(-8, -20, 16, 20);

	// 지붕 (삼각형)
	ctx.fillStyle = roofColor;
	ctx.beginPath();
	ctx.moveTo(-10, -20);
	ctx.lineTo(0, -28);
	ctx.lineTo(10, -20);
	ctx.closePath();
	ctx.fill();

	// 문
	ctx.fillStyle = doorColor;
	ctx.fillRect(-3, -10, 6, 10);

	// 창문
	ctx.fillStyle = highlight ? '#dbeafe' : '#e8ecf0';
	ctx.fillRect(-6, -17, 4, 4);
	ctx.fillRect(2, -17, 4, 4);

	// 간판 (작은 선)
	ctx.fillStyle = roofColor;
	ctx.fillRect(-6, -21, 12, 2);

	ctx.restore();
}

/**
 * 범례용 미니 캐릭터 (축소 버전)
 */
export function drawMiniCharacter(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	colors: CharacterColors,
): void {
	drawPixelCharacter(ctx, x, y, colors, '', 0.45, 0);
}

/**
 * 범례용 미니 건물 (축소 버전)
 */
export function drawMiniBuilding(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
): void {
	drawCafeBuilding(ctx, x, y, 0.5);
}

/** 캐릭터 히트 영역 — 머리 위 라벨 영역 포함 */
export function getCharacterHitBox(x: number, y: number, scale: number) {
	const w = 28 * scale;
	const h = 36 * scale;
	const labelH = 14 * scale;
	return {
		left: x - w / 2,
		top: y - h - labelH,
		right: x + w / 2,
		bottom: y + 6 * scale,
	};
}

export function getBuildingHitBox(x: number, y: number, scale: number) {
	const w = 20 * scale;
	const h = 30 * scale;
	return {
		left: x - w / 2,
		top: y - h,
		right: x + w / 2,
		bottom: y + 4 * scale,
	};
}

/** 점이 히트 박스 안에 있는지 판정 */
export function isInsideHitBox(
	px: number,
	py: number,
	box: { left: number; top: number; right: number; bottom: number },
): boolean {
	return px >= box.left && px <= box.right && py >= box.top && py <= box.bottom;
}
