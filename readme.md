# CrawlingUsingTor

## Установка

### Установите Tor
```
sudo apt-get install tor
```

### Настройка Tor
в файле /etc/tor/torrc:
```
ControlPort 9051
CookieAuthentication 1
```
предоставить доступ:
```
chmod +r /run/tor/control.authcookie
```

### Установите Privoxy
```
sudo apt-get install privoxy
```

### Настройка Privoxy
/etc/privoxy/config:
```
forward-socks5 / 127.0.0.1:9050 .
```

### Запустите Privoxy
```
sudo service privoxy start
```

### Установите виртуальное окружение и зависимости
```
pip install -r requirements.txt
```

### Установите nodeJS (LINUX)
```
sudo apt install npm
npm install -g n 18
```
если установилась версия < 18, то необходимо 
```
sudo n 18
node -v
```
### Установите NodeJS Зависимости
```
npm ci
```

## Запуск

```
cd PuppeteerUsingTor
node main.js <название_ресураса>
```

## Ошибки

#### Ошибка error while loading shared libraries: libgbm.so.1
следует установить следующее:
```
sudo apt-get install libgbm1
```