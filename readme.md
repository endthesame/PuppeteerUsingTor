# Puppeteer Crawling Using Tor

## Установка

```bash
pip install -r requirements.txt # Install python libraries
sudo apt install npm # npm install
sudo n 18 # nodeJS 18 install
npm ci # Install JS libraries
```

## Установка и настройка Tor и прочего  (если необходимо)
```bash
sudo apt-get install tor # Install tor
sudo apt-get install privoxy # Install privoxy
```

### Настройка Tor
Добавить в файл `/etc/tor/torrc`:
```
ControlPort 9051
CookieAuthentication 1
```
предоставить доступ:
```
sudo chmod +r /run/tor/control.authcookie
```
### Настройка Privoxy
Добавить в файл `/etc/privoxy/config`:
```
forward-socks5 / 127.0.0.1:9050 .
```
### Запустите Privoxy
```
sudo service privoxy start
```

## Запуск
```
node main.js
```

### Опции для запуска через консоль

При запуске `main.js`, вы можете использовать следующие опции:

| Опция                         | Описание                                                      | Значение по умолчанию                     |
|-------------------------------|---------------------------------------------------------------|-------------------------------------------|
| `-c, --coll_name <string>`     | Название коллекции                                            | `'default_host_name'`                     |
| `-o, --output <path>`          | Путь к папке для сохранения результатов                       | `output`                                  |
| `-e, --task <path>`            | Путь к файлу задачи для парсинга                              | `tasks/sample_task.js`                    |
| `-l, --links <path>`           | Путь к файлу со ссылками                                      | `your_links_file.txt`                     |
| `-d, --download_pdf`           | Укажите эту опцию, если хотите загружать PDF-файлы            | `-`                                       |
| `-oa, --open_access`           | Укажите эту опцию, если нужно проверять доступность перед загрузкой | `-`                                       |
| `-t, --use_tor`                | Укажите эту опцию, если нужно использовать Tor для парсинга   | `-`                                       |
| `-ss, --upload_ssh`            | Укажите эту опцию, если нужно загружать исходные данные через SSH | `-`                                       |
| `-e, --HELP`                   | Показать дополнительную информацию о доступных опциях         | `-`                                       |

### Пример использования

```bash
node main.js -c my_collection -o /path/to/output -d -t
```