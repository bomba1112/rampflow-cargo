# Перенос на Flutter

Переносится только `src/core`. UI пишется заново.

## Соответствие

| JS (`src/core`) | Dart |
|---|---|
| `model.js` (`T`, `ULD_STATUS`, `LOCATION`) | `enum` + `sealed class Event` |
| `applyEvent`, `buildState` | чистая функция `State apply(State, Event)`, `fold` по списку |
| `commands.js` | функции `CommandResult cmd(State, Params, Ctx)` с `sealed class CommandResult {Ok, Error, Confirm}` |
| `selectors.js` | функции/классы `View`, без побочных эффектов |
| `store.js` | `class EventStore` + `Stream` для подписки |
| `storage.js` (интерфейс `loadAll/append/clear`) | абстрактный `EventStorage`, реализация на Drift или Isar |
| `strings.ru.js` | `intl` / ARB-файлы |

## Порядок

1. Перенести `model.js` и `commands.js`.
2. Перенести `tests/core.test.mjs` как `test/core_test.dart` (24 теста). Пока они не зелёные, UI не начинать.
3. `selectors.js`, затем `store`.
4. Экраны: Рейсы, LIR, Тележки, Поиск, Загрузка (макеты есть в `src/ui/app.js` и `dist`).

## Что учесть

- ID событий: `uuid`. Время: UTC в миллисекундах, показ в Asia/Baku.
- Номер группы это `String`. Никогда `int`.
- `schemaVersion` в событии нужен для миграций. Не удалять.
