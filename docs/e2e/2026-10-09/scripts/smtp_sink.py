#!/usr/bin/env python3
"""Minimal dependency-free SMTP sink for E2E mail capture.

Listens on 127.0.0.1:2525 and writes every accepted message to OUT_DIR as .eml.
"""
import os
import socket
import threading
import time
from datetime import datetime

OUT_DIR = os.environ.get("SMTP_SINK_DIR", "/tmp/resumate-e2e-mail")
HOST = os.environ.get("SMTP_SINK_HOST", "127.0.0.1")
PORT = int(os.environ.get("SMTP_SINK_PORT", "2525"))
os.makedirs(OUT_DIR, exist_ok=True)


def handle(conn: socket.socket) -> None:
    f = conn.makefile("rwb")
    def send(line: str) -> None:
        f.write((line + "\r\n").encode())
        f.flush()
    send("220 resumate-e2e-sink ESMTP")
    data_mode = False
    buf: list[bytes] = []
    envelope: dict[str, str] = {}
    while True:
        raw = f.readline()
        if not raw:
            break
        if data_mode:
            if raw.strip() == b".":
                data_mode = False
                stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
                with open(os.path.join(OUT_DIR, stamp + ".eml"), "wb") as fh:
                    fh.write(b"X-Envelope-To: " + envelope.get("rcpt", "").encode() + b"\n")
                    fh.write(b"".join(buf))
                buf = []
                send("250 OK queued")
                continue
            buf.append(raw)
            continue
        cmd = raw.decode("utf-8", "replace").strip()
        upper = cmd.upper()
        if upper.startswith("EHLO"):
            send("250-resumate-e2e-sink")
            send("250 8BITMIME")
        elif upper.startswith("HELO"):
            send("250 resumate-e2e-sink")
        elif upper.startswith("MAIL FROM"):
            envelope["from"] = cmd
            send("250 OK")
        elif upper.startswith("RCPT TO"):
            envelope["rcpt"] = cmd
            send("250 OK")
        elif upper.startswith("DATA"):
            data_mode = True
            send("354 End data with <CR><LF>.<CR><LF>")
        elif upper.startswith("RSET"):
            buf = []
            send("250 OK")
        elif upper.startswith("QUIT"):
            send("221 Bye")
            break
        else:
            send("250 OK")
    try:
        f.close()
    except Exception:
        pass
    conn.close()


def main() -> None:
    srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    srv.bind((HOST, PORT))
    srv.listen(50)
    print("smtp-sink listening on %s:%d -> %s" % (HOST, PORT, OUT_DIR), flush=True)
    while True:
        conn, _ = srv.accept()
        threading.Thread(target=handle, args=(conn,), daemon=True).start()


if __name__ == "__main__":
    main()
