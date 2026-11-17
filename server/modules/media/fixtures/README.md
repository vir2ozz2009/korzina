`libheif-example.base64` — `examples/example.heic` из
https://github.com/strukturag/libheif (MIT, см. LICENSE), сохранён как base64
для импорта в Workers Vitest. Реальное фото HEIC 1280×854, 718114 байт.

Локальный Images в Miniflare распознаёт контейнер, но его libvips собран без
HEVC-декодера. Unit-тест проверяет передачу HEIC в декодер и обязательное
перекодирование результата; декодирование в Cloudflare и segment=foreground
проверяются отдельно на demo. Клиентский heic-to проверяется в Chromium.
