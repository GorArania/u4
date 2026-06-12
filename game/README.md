# Ordner für die Original-DOS-Dateien

Kopiere hier die Dateien der DOS-Version von **Ultima IV: Quest of the Avatar**
hinein (z. B. `ULTIMA.EXE`, `TITLE.EXE`, `WORLD.MAP`, `*.ULT`, `*.SAV`, …).
Unterordner sind erlaubt und werden mit übernommen.

Der Server packt den Inhalt dieses Ordners beim Spielstart automatisch in ein
js-dos-Bundle und legt den Spielstand des angemeldeten Benutzers darüber.

## Startbefehl

Der Server sucht automatisch nach einer Startdatei (u. a. `ULTIMA.EXE`,
`ULTIMA.COM`, `AVATAR.EXE`, `START.BAT`). Falls die Erkennung nicht passt,
lege hier eine Datei `autoexec.txt` an – ihre Zeilen werden 1:1 als
DOSBox-Autoexec verwendet, z. B.:

```
mount c .
c:
ULTIMA.EXE
```

Die Dateien `README.md`, `.gitkeep` und `autoexec.txt` werden nicht ins
Spiel-Bundle übernommen (`autoexec.txt` dient nur als Konfiguration).

## Rechtlicher Hinweis

Bitte nur Spieldateien verwenden, die du selbst rechtmäßig besitzt. Die
Spieldateien werden absichtlich nicht ins Git-Repository eingecheckt
(siehe `.gitignore`).
