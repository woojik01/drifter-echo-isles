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
- `server/`: 게이트웨이와 Colyseus 게임 서버 소스 및 통합 테스트
- `render.yaml`, `render.scale.yaml`: 단일 서버와 이전 멀티노드 배포 예시
- `supabase/migrations/`: 이전 Supabase 멀티플레이 구현의 기록
- `docs/`: 버전별 변경 사항과 이전 테스트 기록

## 멀티플레이

클라이언트의 게이트웨이 주소는 `game-assets/coop-config.js`에 설정되어 있습니다. `server/`에는 게이트웨이와 게임 노드 구현이 함께 들어 있으며, 실행 역할은 `DRIFTER_SERVICE_ROLE` 환경변수로 구분합니다. 기존 운영 서비스를 이 저장소에서 계속 배포하려면 각 서비스의 Git 저장소와 브랜치 연결을 별도로 변경해야 합니다. 자세한 환경변수와 테스트 명령은 [멀티플레이 서버 안내](docs/MULTIPLAYER.md)를 참고하세요. 과거 릴리스 문서는 당시의 기록입니다.

## Worker 빌드와 테스트

Node.js 22 이상에서 저장소 루트에서 실행합니다.

```sh
bash scripts/build.sh
node scripts/validate-artifact.mjs
node qa/check.cjs
```

빌드 결과는 `dist/server/index.js`에 생성됩니다. 선택적으로 `.openai/hosting.json`을 직접 설정하면 빌드 결과에도 복사됩니다. 생성 파일과 로컬 설정은 Git에 포함하지 않습니다.

서버 빌드와 통합 테스트는 `server/`에서 `npm ci`, `npm run build`, `npm test`로 실행할 수 있습니다.
