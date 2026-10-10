"""`uv run python -m smartly` — 체험 서버 실행(기본 127.0.0.1:8700)."""

import socket
import sys

import uvicorn

from . import config


def port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(1)
        return sock.connect_ex((host, port)) == 0


if __name__ == "__main__":
    # uvicorn 은 모델 모듈을 다 올린 뒤에야 bind 실패(WinError 10048)를 알리고, 메시지도 콘솔 인코딩에 따라 깨진다.
    if port_in_use(config.HOST, config.PORT):
        sys.exit(
            f"{config.HOST}:{config.PORT} 포트를 이미 다른 프로세스가 쓰고 있습니다.\n"
            "- smartly 가 이미 떠 있으면 그대로 쓰면 됩니다(웹 화면 상단의 장치 표시로 확인).\n"
            "- 아니면 그 프로세스를 끄세요. Windows: netstat -ano | findstr :8700 → taskkill /PID <번호> /F\n"
            "- 포트를 바꾸려면 SMARTLY_PORT — 단 웹 개발 프록시(apps/web/vite.config.ts)는 8700 을 본다."
        )
    uvicorn.run("smartly.server:app", host=config.HOST, port=config.PORT)
