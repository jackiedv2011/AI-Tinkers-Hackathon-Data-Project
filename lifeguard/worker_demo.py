"""Managed demo worker: grows by one MiB and emits repeat evidence every two seconds."""

import logging
import time

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("worker_demo")
chunks: list[bytes] = []

while True:
    chunks.append(b"x" * (1 << 20))
    log.info("Processing item %d... error: timeout retry retry retry", len(chunks))
    time.sleep(2)
