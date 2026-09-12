"""Windows system-tray integration."""

from __future__ import annotations

import threading
import webbrowser
from typing import Callable


def make_icon():
    from PIL import Image, ImageDraw

    image = Image.new("RGB", (64, 64), color=(10, 32, 52))
    draw = ImageDraw.Draw(image)
    draw.ellipse((10, 10, 54, 54), fill=(44, 168, 214))
    draw.rectangle((28, 18, 36, 46), fill="white")
    draw.rectangle((18, 28, 46, 36), fill="white")
    return image


def open_dashboard() -> None:
    webbrowser.open("http://127.0.0.1:8000/status")


def build_menu(get_status: Callable[[], str]):
    import pystray

    return pystray.Menu(
        pystray.MenuItem("Open Status", lambda _icon, _item: open_dashboard()),
        pystray.MenuItem(lambda _item: get_status(), None, enabled=False),
        pystray.MenuItem("Quit", lambda icon, _item: icon.stop()),
    )


def start_tray(get_status: Callable[[], str]):
    import pystray

    icon = pystray.Icon("lifeguard", make_icon(), "Lifeguard", build_menu(get_status))
    thread = threading.Thread(target=icon.run, daemon=True, name="lifeguard-tray")
    thread.start()
    return icon
