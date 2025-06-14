# Friday Lunch Protocol Bot

Slack bot to manage weekly Friday lunch polls, pick orderers, and post results automatically.

## Local Development

1. Copy `app/env.sample` to `app/.env` (파일 이름 유지) 후 Slack 토큰 등 실제 값을 채웁니다.
   - `LUNCH_CHANNEL_ID` – 실제 투표 메시지를 올릴 채널
   - `LUNCH_MEMBER_CHANNEL_ID` – 투표 대상 인원을 계산할 기준 채널(옵션, 미설정 시 LUNCH_CHANNEL_ID 사용)
2. Build and start services:

```bash
docker-compose up -d --build
```

서비스가 기동되면 호스트 `http://localhost:4224` 로 슬랙 이벤트(nginx) 엔드포인트가 열립니다. 내부 `app`, `redis`, `db` 컨테이너는 호스트로 포트를 노출하지 않습니다.

3. Check logs:

```bash
docker-compose logs -f app
```

> The bot schedules jobs according to `TZ` variable (default Asia/Seoul). For testing, adjust schedule in `lunch-bot.js` or override env.

## Deployment

Use the provided `docker-compose.yml` on a server and configure reverse proxy/SSL as needed.
