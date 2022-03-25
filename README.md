[![Matrix](https://img.shields.io/matrix/mx-puppet-vk:sunbutt.faith?logo=matrix&server_fqdn=gospel.sunbutt.faith)](https://matrix.to/#/#mx-puppet-vk:inex.rocks?via=inex.rocks&via=sunbutt.faith)

# mx-puppet-vk
This is a Matrix <-> VK bridge based on [mx-puppet-bridge](https://github.com/Sorunome/mx-puppet-bridge) and [VK-IO](https://github.com/negezor/vk-io).

Это мост между Matrix и Вконтакте, основанный на [mx-puppet-bridge](https://github.com/Sorunome/mx-puppet-bridge) и [VK-IO](https://github.com/negezor/vk-io).

[Документация на русском ниже.](#docs-in-russian)

It is in early development. Right now it logs message data when log level includes "info" level.

While there were no commits in a long time, this bridge still works. Pull requests are welcome.

Relay mode works too, but we don't recommend it.

## Installation
```bash
git pull https://github.com/innereq/mx-puppet-vk
npm install
npm run build
```
Next copy the `sample.config.yaml` to `config.yaml`, edit it and then run `npm run start -- -r` to generate a registration file.
Register that one with synapse and start the bridge with `npm run start`.

## Features and roadmap
- Matrix -> VK
    - [x] Text content
    - [x] Image content
    - [x] Audio/Video content
    - [x] Other files
    - [x] Replies
    - [x] Typing notifs - [see note](#Note-on-presence-from-matrix-side)
    - [ ] Presence - ~~not possible yet~~
    - [x] Read notifications
    - [x] Message edits
    - [x] Message redacts - works as edit, real redact unavailable without being admin in chat
    - [ ] Initiate rooms from the matrix side
- VK -> Matrix
    - [x] Text content
    - [x] Forwards
    - [x] Image content
    - [x] Audio content
    - [ ] Video content
    - [x] Stickers
    - [x] Other files
    - [ ] Presence - not effective to track
    - [x] Typing notifs
    - [x] User profiles
    - [ ] Read notifications - not effective to track
    - [x] Message edits
    - [ ] Message redacts - doesn't work
    - [ ] Autopopulate rooms with users
- Edge cases to work around
    - [ ] Access token revoked on VK side
    - [ ] Bot is kicked out on VK side
    - Probably more, send an issue!

## Usage

[Video demonstration by Coma Grayce](https://youtu.be/nBRBUA9beXs)

1. Get VK community token (Just open the "Manage community" tab, go to "API usage" tab and click "Create token"). Token must have community control and message permissions.
2. Activate Bots Long Poll API ("Manage community" → "API usage" → "Bots Long Poll API") and choose the latest API version. Make sure that under event types all message-realted events are turned on.
3. Activate an option to message your community. To allow group chats, activate it under bot capabilities.
4. On matrix, contact `@_vk_puppet_bot:your.domain` and type `link <vk token>`
5. Now, if someone contacts your community, you will be invited to the corresponding room on Matrix.

Plese note: when community is invited to the group chat as a bot, make sure it has message access. Only chat admins can change bot permissions.

Bridge doesn't handle being kicked from chat yet.

### Relay usage

See [mx-puppet-bridge docs](https://github.com/Sorunome/mx-puppet-bridge#relay-mode)

### Note on presence from Matrix side

For presence bridging from Matrix side (including typing) your Synapse server has to be on 1.22.0 or later.

Also, make sure your registration file contains this:

```
de.sorunome.msc2409.push_ephemeral: true
```

## Usage as User puppet, for bridge all personal messages and chats

_This is experimental and is not the main goal of this bridge._

1. Select the `CLIENT_ID` - it is ID of registered application, that allowed to access your messages. You can register your own application (and [require access for Messages API](https://vk.com/dev/messages_api) from VK owners), or reuse ID of already registered application. 
You can select some of popular applications for reuse the `CLIENT_ID` via [VKhost](https://vkhost.github.io/) service.

Example of URL to generate `access_token`:
```
https://oauth.vk.com/authorize?client_id=<CLIENT_ID>&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=friends,messages,offline,docs,photos,video&response_type=token&v=5.126
```
You must review grant access list and allow access for selected `CLIENT_ID`. After pressing "Allow" you browser will be redirected to other URL.

2. Get the generated `access_token` string from redirected URL via looking the `&access_token=` GET parameter, here is example of url:
```
https://oauth.vk.com/blank.html#access_token=df89482ba9a19e5a2dee85031612b021a08cd521115e1c7d2cd70710a50783105cfeae7386ab4f1003b54&expires_in=0&user_id=12345&email=vasya@example.com
```
where the access token is `df89482ba9a19e5a2dee85031612b021a08cd521115e1c7d2cd70710a50783105cfeae7386ab4f1003b54` (don't use it, it is only example).

3. On Matrix client, create private chat with `@_vk_puppet_bot:your.domain` user and type `link <access_token>` command.


### Implemented features using a user token instead of group bot:

- Matrix -> VK (AS A USER)
    - [x] Text content
    - [x] Image content
    - [x] Audio messages
    - [x] Other files
    - [x] Replies
    - [x] Typing notifs
    - [ ] Presence
    - [x] Read notifications
    - [x] Message edits
    - [x] Message redacts - in 24 hours
    - [ ] Initiate rooms from the matrix side
- VK (AS A USER) -> Matrix
    - [x] Auth as a user instead of group
    - [x] Text content
    - [x] Replies (as forwards)
    - [x] Forwards
    - [x] Image content
    - [ ] Audio content - unavailable via user tokens
    - [ ] Video content - unavailable via user tokens
    - [x] Stickers
    - [x] Other files
    - [ ] Presence
    - [x] Typing notifs
    - [x] User profiles
    - [ ] Read notifications
    - [x] Message edits
    - [ ] Message redacts
    - [ ] Autopopulate rooms with users

To avoid imposture, do **not** use relay mode with user tokens!

# Docs in Russian

Это мост между Matrix и Вконтакте, основанный на [mx-puppet-bridge](https://github.com/Sorunome/mx-puppet-bridge) и [VK-IO](https://github.com/negezor/vk-io).

Находится в ранней разработке. Содержание сообщений выводится в логи, если уровень логов включает в себя уровень "info".

Режим релея работает, но мы его не рекомендуем.

## Установка
```bash
git pull https://github.com/innereq/mx-puppet-vk
npm install
npm run build
```
Затем скопируйте `sample.config.yaml` в `config.yaml`, отредактируйте его, и затем запустите `npm run start -- -r` чтобы сгенерировать регистрационный файл.
Зарегистрируйте его на вашем сервере Synapse и запустите мост коммандой `npm run start`.

## Реализованные функции и план разработки
- Matrix -> Вконтакте
    - [x] Текстовые сообщения
    - [x] Изображения
    - [x] Аудио и видео
    - [x] Прочие файлы
    - [x] Ответы
    - [x] Индикатор печати - [смотрите примечание](#примечание-о-эфемерных-событиях)
    - [ ] Индикатор "в сети"
    - [x] Индикаторы прочтения
    - [x] Редактирование сообщений
    - [x] Удаление сообщений - работает как редактирование
    - [ ] Инициация чатов со стороны Matrix
- Вконтакте -> Matrix
    - [x] Текстовые сообщения
    - [x] Пересланные сообщения
    - [x] Изображения
    - [x] Аудио
    - [ ] Видео
    - [x] Стикеры
    - [x] Прочие файлы
    - [ ] Индикатор "в сети" - Не эффективно отслеживать
    - [x] Индикатор печати
    - [x] Имена и аватарки пользователей
    - [ ] Индикаторы прочтения - Не эффективно отслеживать
    - [x] Редактирование сообщений
    - [ ] Удаление сообщений - не работает
    - [ ] Автоматическое заполнение комнаты пользователями
- Крайние случаи, которые надо проработать
    - [ ] Токен доступа отозван со стороны Вконтакте
    - [ ] Бот выгнан из чата со стороны Вконтакте
    - Возможно больше, открывайте issue!

## Использование

[Видео демонстрация от Coma Grayce](https://youtu.be/nBRBUA9beXs)

1. Получите токен сообщества Вконтакте. Откройте раздел «Управление сообществом» («Управление страницей», если у Вас публичная страница), выберите вкладку «Работа с API» и нажмите «Создать ключ доступа». Не забудьте предоставить доступ к сообщениям и **управлению сообществом**.
2. Активируйте Long Poll API (откройте раздел «Управление сообществом», на вкладке «Работа с API» → «Long Poll API» выберите «Включён») и выберите самую актуальную версию API, так как по умолчанию выбрана устаревшая, с ней не работает. Убедитесь, что во вкладке типов событий выбраны все события в категории сообщений.
3. Во вкладке сообщений, активируйте сообщения сообщества. Чтобы позволить добавлять сообщества в групповые чаты, активируйте это во вкладке возможностей ботов.
4. В matrix, напишите боту `@_vk_puppet_bot:ваш.домен` и напишите `link <токен вк>`
5. Теперь, если кто-то напишет вашему сообществу, со стороны Matrix вас пригласят в соответствующую комнату.

Обратите внимание: когда сообщество приглашено в групповой чат как бот, убедитесь что у бота есть права на чтение сообщений. Только администраторы чата могут менять права ботов.

### Использование в качестве релея

Смотрите [документацию mx-puppet-bridge](https://github.com/Sorunome/mx-puppet-bridge#relay-mode) (на английском)

### Примечание о эфемерных событиях

Для пересылки эфемерных событий со стороны Matrix (включая индикаторы печати), ваш сервер Synapse должен быть версии 1.22.0 или выше.

Также, ваш файл регистрации должен включать в себя эту строку:

```
de.sorunome.msc2409.push_ephemeral: true
```

## Использование токена пользователя для доступа ко всем персональным сообщениям и чатам конкретного пользователя

_Этот режим является экспериментальным и не является основной целью данного моста._

1. Выберите `CLIENT_ID` - это идентификатор приложения, которому предоставлен доступ к сообщениям пользователя. Вы можете зарегистрировать своё личное приложение (и [запросить доступ к Messages API](https://vk.com/dev/messages_api) от админов ВК), или переиспользовать ID от уже зарегистрированного приложения.
Вы можете выбрать одно из популярных приложений для переиспользования `CLIENT_ID` через сервис [VKhost](https://vkhost.github.io/).

Пример URL для генерации `access_token`:
```
https://oauth.vk.com/authorize?client_id=<CLIENT_ID>&display=page&redirect_uri=https://oauth.vk.com/blank.html&scope=friends,messages,offline,docs,photos,video&response_type=token&v=5.126
```
Вы должны перепроверить список доступа дя выбранного `CLIENT_ID` и разрешиь доступ. После нажатия кнопки "Разрешить" ваш браузер переадресует вас на другой URL.

2. Скопируйте текст сгенерированного `access_token` с переадресованного URL через просмотр GET-параметра `&access_token=`, вот пример URL:
```
https://oauth.vk.com/blank.html#access_token=df89482ba9a19e5a2dee85031612b021a08cd521115e1c7d2cd70710a50783105cfeae7386ab4f1003b54&expires_in=0&user_id=12345&email=vasya@example.com
```
в котором access_token это `df89482ba9a19e5a2dee85031612b021a08cd521115e1c7d2cd70710a50783105cfeae7386ab4f1003b54` (не используйте данный токен, это только пример).

3. В Матрикс-клиенте создайте приватный чат с пользователем `@_vk_puppet_bot:your.domain` и отправьте команду `link <access_token>`, заменив "<access_token>" на сгенерированный токен доступа.

### Реализованные функции для режима персонального токена пользователя:

- Matrix -> Вконтакте (как пользователь)
    - [x] Текстовые сообщения
    - [x] Изображения
    - [x] Аудио сообщения
    - [x] Прочие файлы
    - [x] Ответы
    - [x] Индикатор печати
    - [ ] Индикатор "в сети"
    - [x] Индикаторы прочтения
    - [x] Редактирование сообщений
    - [x] Удаление сообщений - в течении 24 часов
    - [ ] Инициация чатов со стороны Matrix
- Вконтакте (как пользователь) -> Matrix
    - [x] Текстовые сообщения
    - [x] Пересланные сообщения
    - [x] Изображения
    - [ ] Аудио - недоступно через токен пользователя
    - [ ] Видео - недоступно через токен пользователя
    - [x] Стикеры
    - [x] Прочие файлы
    - [ ] Индикатор "в сети"
    - [x] Индикатор печати
    - [x] Имена и аватарки пользователей
    - [ ] Индикаторы прочтения
    - [x] Редактирование сообщений
    - [ ] Удаление сообщений
    - [ ] Автоматическое заполнение комнаты пользователями

Чтобы избежать самозванства, **не** используйте режим релея с токенами пользователя!
