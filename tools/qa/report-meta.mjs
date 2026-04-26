// QA 리포트 헤더에 기록할 Git 메타데이터를 안전하게 수집하는 스크립트
import { execSync } from 'node:child_process';

// Git 명령 실패 시에도 QA 흐름이 멈추지 않도록 fallback 값을 반환
const safe = (cmd, fallback = 'unknown') => {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || fallback;
  } catch {
    return fallback;
  }
};

// QA 리포트 추적성 확보용 기본 메타데이터
const payload = {
  date: new Date().toISOString(),
  branch: safe('git branch --show-current', 'unknown'),
  commit: safe('git rev-parse --short HEAD', 'unknown')
};

// 다른 자동화에서 재사용 가능하도록 JSON으로 출력
process.stdout.write(JSON.stringify(payload, null, 2));
