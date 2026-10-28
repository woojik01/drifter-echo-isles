# Drifter: Echo Isles

섬을 탐험하고 자원을 모아 장비를 만들며 캠프를 성장시키는 HTML5 게임입니다. 이 저장소는 개발용 게임의 **v1.5.5** 소스를 기준으로 합니다.

## 게임 실행

Node.js를 설치하지 않아도 Python으로 게임을 실행할 수 있습니다. 저장소 루트에서 다음 명령을 실행한 뒤 브라우저에서 `http://localhost:8000/`을 여세요.

```sh
python -m http.server 8000
```

게임 파일은 `game-assets/`에 있습니다. `index.html`은 이 디렉터리의 게임으로 이동합니다. 싱글플레이에는 별도의 게임 서버가 필요하지 않습니다.

## 파일 구성

- `game-assets/`: HTML, CSS, 게임 및 멀티플레이 클라이언트 소스
- `worker/index.template.js`, `scripts/`: 게임 파일을 포함하는 Worker 빌드 도구
- `qa/`: 게임과 Worker의 기존 회귀 테스트
- `server/`, `render.yaml`: 이전 Colyseus 서버 소스와 배포 설정
- `supabase/migrations/`: 이전 Supabase 멀티플레이 구현의 기록
- `docs/`: 버전별 변경 사항과 이전 테스트 기록

## 멀티플레이

현재 클라이언트의 공개 게이트웨이 주소는 `game-assets/coop-config.js`에 설정되어 있습니다. 멀티플레이에는 해당 게이트웨이와 게임 서버가 별도로 필요합니다. 이 저장소의 `server/`는 이전 서버 소스이며 현재 게이트웨이 구현은 포함하지 않습니다. `docs/`의 서버 주소와 배포 안내는 당시의 기록이므로 현재 구성과 다를 수 있습니다.

## Worker 빌드와 테스트

Node.js 22 이상에서 저장소 루트에서 실행합니다.

```sh
bash scripts/build.sh
node scripts/validate-artifact.mjs
node qa/check.cjs
```

빌드 결과는 `dist/server/index.js`에 생성됩니다. 선택적으로 `.openai/hosting.json`을 직접 설정하면 빌드 결과에도 복사됩니다. 생성 파일과 로컬 설정은 Git에 포함하지 않습니다.

`server/`의 이전 서버 테스트는 해당 디렉터리에서 `npm ci`, `npm run build`, `npm test`로 실행할 수 있습니다.
