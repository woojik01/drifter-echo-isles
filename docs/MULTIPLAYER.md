# 멀티플레이 서버

`server/`는 게이트웨이와 게임 노드를 같은 코드로 실행하는 Colyseus 서버입니다. 이 코드는 기존 서버 프로젝트의 멀티노드 브랜치 스냅샷을 포함합니다. 게임 클라이언트는 `game-assets/coop-config.js`에 지정된 게이트웨이에 연결합니다.

## 빌드와 테스트

Node.js 22 이상에서 실행합니다.

```sh
cd server
npm ci
npm run build
npm test
```

테스트에는 로컬 게이트웨이·게임 노드, WebSocket 연결, 방 생성과 참가, 게임 동기화 검사가 포함됩니다.

## 서비스 역할

같은 서버 코드를 역할별로 실행합니다.

- `DRIFTER_SERVICE_ROLE=gateway`: `DRIFTER_INTERNAL_SECRET`, 라우팅 저장소의 `REDIS_URL` 및 각 노드의 `DRIFTER_WORKER_1_INTERNAL_HOST`, `DRIFTER_WORKER_2_INTERNAL_HOST` 등을 설정합니다. `DRIFTER_ALLOW_IN_MEMORY_ROUTING_STORE=1`은 메모리 라우팅 저장소를 사용하는 설정입니다.
- `DRIFTER_SERVICE_ROLE=worker`: 게이트웨이와 같은 `DRIFTER_INTERNAL_SECRET`, 노드별 `DRIFTER_WORKER_INDEX`와 `DRIFTER_PUBLIC_ADDRESS`를 설정합니다. `RENDER_EXTERNAL_HOSTNAME` 또는 `RENDER_EXTERNAL_URL`이 있으면 공개 주소로 사용할 수 있습니다. 방 종료 콜백을 쓰려면 `DRIFTER_GATEWAY_INTERNAL_HOST`를 설정합니다.
- `DRIFTER_SERVICE_ROLE=single`: 기본 단일 서버 모드입니다.

공통 설정으로 `PORT`, `DRIFTER_MAX_PLAYERS`, `DRIFTER_ALLOWED_ORIGINS`를 사용할 수 있습니다. 인증 비밀값과 연결 문자열은 환경변수로 관리하고 저장소에 추가하지 않습니다.

기존 운영 서비스를 이 저장소로 연결할 때는 서비스별 역할, 환경변수, 빌드·시작 명령과 서버 주소를 유지하세요. `render.scale.yaml`은 과거 유료 멀티노드 Blueprint 예시이며 기존 운영 서비스의 현재 설정과 동일하다고 보장하지 않습니다.

## 브라우저 출처와 연결 상태

`DRIFTER_ALLOWED_ORIGINS`는 URL 경로와 끝의 슬래시를 제외한 브라우저 출처를 쉼표로 구분해 받습니다. 배포 예시는 GitHub Pages와 운영·개발 게임 사이트를 허용합니다. 서버 기본값에는 저장소의 Python 미리보기 명령에 맞춰 `http://localhost:8000`, `http://127.0.0.1:8000`도 포함됩니다. 새 배포 플랫폼은 브라우저가 보내는 출처를 확인한 뒤 추가하세요.

파티 연결 화면은 접속 서버와 게임 서버 준비 단계를 구분합니다. 게이트웨이가 게임 서버를 확인하는 동안 준비된 워커 수와 경과 시간을 표시하며, 특정 워커에 다시 연결할 때는 별도 상태를 보여줍니다.

## Render 헬스 체크

게이트웨이와 각 게임 워커의 `healthCheckPath`는 `/health`로 설정합니다. 게이트웨이의 `/health`는 라우팅 저장소도 확인합니다. 플레이어 연결용 `/api/ready`는 워커가 준비되는 중에 대기 상태를 반환할 수 있으므로 Render 헬스 체크 경로로 사용하지 않습니다. Blueprint 파일은 배포 예시이며, 별도로 설정한 운영 서비스는 Render에서 직접 갱신해야 합니다.
