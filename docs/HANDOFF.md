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

## LIR from the user's own PDF ("exactly as printed")
- Flights tab: "LIR faylı aç (PDF)". `src/web/lirfile.js` reads page 1 with pdf.js (vendor files copied to `dist/vendor` by build.mjs, cached best-effort by sw.js). Header via `itemsToText` + `parseHeader` (pdf.js item order is scattered, so items are sorted by y then x). The loading diagram (crop `PAGE` in layouts.js) is rendered to a JPEG at 2x.
- Position boxes are NOT taken from a template: `src/web/zones.js detectZones` finds them on the picture itself (long dark lines = walls, text ignored, flood-fill of enclosed white regions, band y 128..606 pt). Every LIR is used as printed (any aircraft, PGA double boxes, units across the centre line; a box split by a grid line gives two tap zones).
- `nameZones` (layouts.js) only NAMES the found boxes (AR, 11P ...) from known airframe grids (`NAMED_GRIDS`: B747-8F, B747-400F), picking the grid that fits >= 60 % of the boxes; bulk (51, 52, 554) is dropped; second box in the same cell gets ".2"; unknown aircraft -> Z1, Z2 ... Add a grid for a new aircraft type by listing its cells there.
- The JPEG is stored only on the phone (IndexedDB store `files`, key = flightId). Nothing is uploaded or committed. Event log keeps header data, `zones` (rects) and marks.
- `importLirPage` creates the flight (or `LIR_REVISED` with new zones for a newer edition of the same flight+date); `registerUld` marks a zone (optional ULD number; raster text cannot be read).
- Verified in real Chrome (Playwright) with the user's 747-8F and 747-400F PDFs: boxes sit on the printed cells, marks and picture survive reload.
- Open: remove a mistaken mark; ULD numbers are typed (no OCR); crop shows the diagram only; artifact preview has no pdf.js (vendor files exist only in dist/docs); a thin line not drawn on the PDF would merge two boxes.
