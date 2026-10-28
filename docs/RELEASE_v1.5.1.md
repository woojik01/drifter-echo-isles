# Drifter: Echo Isles v1.5.1

## 변경 사항

- 뗏목 제작은 나무 12개와 돌 4개가 모두 있을 때만 활성화합니다. 자원 변경 후 제작 UI와 항해 HUD 상태를 바로 갱신합니다.
- 시작 시 주변 5×5 구역만 지도에 표시하고, 동쪽 해안에서 불어오는 바람을 첫 방향 단서로 사용합니다. 나머지 지도는 계속 미탐험 상태로 남습니다.
- 튜토리얼이 키보드 이동과 터치 조이스틱 드래그를 구분해 안내하며, 두 입력 모두 첫 이동 단계를 완료합니다. 첫 채집은 기존 저장 형식을 유지하면서 진행 상태에 저장됩니다.
- 초반 제작법을 먼저 보여 주고, 고급 장비·지역 제작·어둠 장비를 접을 수 있는 잠금 섹션으로 정리했습니다. 잠금과 제작 조건은 유지됩니다.
- 첫 채집 전 가까운 나무와 바위에 은은한 픽셀 윤곽/화살표를 표시하고, 자원을 획득하면 안내를 종료합니다.

## 확인

- `node --check game-assets/game.js` 및 `node --check game-assets/expedition.js`
- `node qa/v151-regression.cjs`
- `node qa/camp-polish.cjs`, `node qa/camp-network.cjs`, `node qa/input-fixes.cjs`
- `node qa/check.cjs`, `node qa/platform.cjs`, `node qa/import.cjs`
- `bash scripts/build.sh`, `node scripts/validate-artifact.mjs`, `node qa/worker.cjs`

실제 브라우저 배포 확인은 Sites 배포 완료 후 별도로 기록합니다.
