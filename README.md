# Podkop Plus

Форк [itdoginfo/podkop](https://github.com/itdoginfo/podkop) для OpenWrt с rule-based моделью маршрутизации, переработанным LuCI-интерфейсом, гибридной интеграцией `zapret`.

### Установка

```sh
sh <(wget -O - https://raw.githubusercontent.com/ushan0v/podkop-plus/main/install.sh)
```

### Улучшения и новые возможности

- Улучшенный LuCI-интерефейс секций.
- Переход на rule-based конфигурацию.
- Новое действие `zapret`, которое можно назначать на уровне отдельного правила.

### Интеграция Zapret

 `Zapret` встроен как действие конкретного правила. Под капотом используется [remittor/zapret-openwrt](https://github.com/remittor/zapret-openwrt/releases)

- `sing-box` выбирает и маршрутизирует трафик;
- `zapret` выполняет anti-DPI обработку трафика, который был выбран условием правила.

Для Zapret стратегии NFQWS намеренно запрещены:

- шаблоны и hostlist placeholders: `<HOSTLIST>`, `<HOSTLIST_NOAUTO>`;
- hostname/IP selectors внутри самой стратегии: `--hostlist*`, `--hostlist-auto*`, `--ipset*`;
- ручное управление очередью и fwmark: `--qnum`, `--dpi-desync-fwmark`;
- режимы, которые ломают lifecycle процесса: `--daemon`;
- режимы, которые не должны быть итоговой стратегией запуска: `--dry-run`, `--version`;
- внешние конфиги вида `@file` или `$file`, которые обходят встроенную валидацию и управление очередями.