# Handoff

Состояние: Stage 0 готов. 27 тестов ядра + 18 шагов UI smoke проходят.

Сделано: рейсы, LIR (демо), тележки (4 и 20 ft), привязка ULD, «передана на high loader», место сцепки (необязательно), поиск, начало/конец загрузки с исправлением и причиной, отмена последнего действия, журнал, PWA (manifest + service worker).

Не сделано (Stage 1+): импорт LIR/OCR, разнарядка из WhatsApp, отчёты, роли, синхронизация/backend, события на перроне.

Вопросы без ответа: смысл «008», «C3U», «WINGE» в строках разнарядки.

Хостинг: статическая папка `dist/` (GitHub Pages и т.п.), нужен HTTPS для установки на телефон.

## Схема LIR (экран «LIR»)

Экран рисует лист как бумажный LIR (один в один), поворот и зум как в PDF-просмотрщике.

- Сетка ячеек фиксирована для типа самолёта: `src/core/layouts.js` (`LAYOUT_B747_8F`), координаты в «единицах листа» (1 ед. = 1 px картинки LIR, 1170×470). Сняты с настоящего PDF по пикселям; наложение на оригинал совпало на 100%.
- ULD стоят в своей ячейке, если у позиции нет `box`. Двойной PGA (ER/FR) и ULD по центру (CL, DL, ML) задаются `box` + `covers` в данных рейса (`positions[]` события LIR_LOADED), не в шаблоне: от рейса к рейсу они разные.
- Чтобы добавить тип самолёта: добавить шаблон в `layouts.js` (список ячеек с x, y, w, h). Остальное (экран, тесты формы) менять не нужно. B747-400F (позиции A1, A2, B1…, нижняя палуба 11P–25P, 31P–33P, 41P, 42P, 45R) ещё не заведён.
- Старые схемы (`rows`, `decks`) приводятся к тому же виду через `sheetOf`. Демо-данные старой версии при запуске заменяются новыми автоматически (только если все рейсы демо).
- Поворот: по умолчанию лист поворачивается так, чтобы заполнить экран (портрет → 90°); «Çevir» переключает; поворот телефона возвращает автоматику. Зум 1…6×, щипок двумя пальцами.

## LIR from the user's own PDF ("PDF as is")
- Flights tab: "LIR faylı aç (PDF)". `src/web/lirfile.js` reads page 1 with pdf.js (vendor files copied to `dist/vendor` by build.mjs, cached best-effort by sw.js), header via `itemsToText` + `parseHeader` (pdf.js item order is scattered, so items are sorted by y then x), renders the sheet area to a JPEG (2x) and checks the picture against known layouts with `gridMatch` (>= 0.8 of sampled border pixels must be dark, else `PAGE_LAYOUT`).
- The JPEG is stored only on the phone (IndexedDB store `files`, key = flightId). Nothing is uploaded or committed. Event log keeps only header data and marks.
- `importLirPage` creates the flight (or `LIR_REVISED` for a newer edition of the same flight+date); `registerUld` marks a position (optional ULD number, raster text cannot be read). Tap zones come from `pageRect(layout, cell)`.
- Only B747-8F grid is known. 747-400F LIRs are refused with a message until a template (cells + `page` mapping) is added to `layouts.js` and appended to `KNOWN_LAYOUTS` in app.js.
- Verified in real Chrome (Playwright) with the user's sample PDFs: zones sit on the PDF cell borders; marks and picture survive reload.
- Open: remove a mistaken mark; PGA / centre-line units are ambiguous per cell (user taps either cell); crop shows the loading diagram only; artifact preview has no pdf.js (vendor files exist only in dist/docs).
