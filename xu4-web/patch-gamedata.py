#!/usr/bin/env python3
"""
Wendet die bekannten Datenkorrekturen auf das vorbereitete Datenverzeichnis an
(dist/data, erzeugt von prepare-data.sh). Die Originaldateien unter ../game
bleiben unberuehrt.

Jede Korrektur pruefe den Ist-Wert, bevor sie schreibt, und ist damit
mehrfach ausfuehrbar (idempotent).
"""
import os, sys

DATA = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dist', 'data')

def patch_byte(relpath, offset, expect, value, why):
    p = os.path.join(DATA, relpath)
    if not os.path.exists(p):
        print('  FEHLT  %s -- uebersprungen' % relpath); return False
    b = bytearray(open(p, 'rb').read())
    if b[offset] == value:
        print('  ok     %s[%d] ist schon %d (%s)' % (relpath, offset, value, why)); return True
    if b[offset] != expect:
        print('  WARNUNG %s[%d] ist %d, erwartet %d -- nicht geaendert'
              % (relpath, offset, b[offset], expect)); return False
    b[offset] = value
    open(p, 'wb').write(bytes(b))
    print('  patcht %s[%d]: %d -> %d (%s)' % (relpath, offset, expect, value, why))
    return True

print('Datenkorrekturen fuer %s' % DATA)

# ---------------------------------------------------------------------------
# ZURZEIT KEINE DATENKORREKTUR NOETIG.
#
# Historie: Hawkwind antwortete nicht ("Funny, no response!"), weil
# person.cpp canConverse() ein dialogue != NULL verlangte, Hawkwind aber
# conv_idx = 0 in LCB_1.ULT hat -- sein Gespraech steht fest im Code und kommt
# nicht aus einer TLK-Datei. Solange die Engine nicht neu gebaut werden konnte,
# wurde in u4.data conv_idx[29] (Hawkwind = NPC-Slot 30, Tabelle ab ULT-Offset
# 1248) von 0 auf 1 gesetzt:
#
#     patch_byte('ultima4/LCB_1.ULT', 1248 + 29, 0, 1, 'Hawkwind')
#
# Das ist seit dem Neubau vom 2026-09-11 ueberholt: person.cpp canConverse()
# laesst NPC_HAWKWIND und NPC_LORD_BRITISH jetzt direkt zu. Der Byte-Patch war
# ausserdem nicht nebenwirkungsfrei -- conv_idx = 1 haengt Hawkwind den Dialog
# des ersten TLK-Eintrags an und ueberschreibt damit in maploader.cpp seinen
# Namen (people[j]->name = dialogues[i]->getName()).
#
# Neue Korrekturen hier eintragen, Muster:
#     patch_byte('ultima4/DATEI.ULT', offset, alt, neu, 'Begruendung')
# ---------------------------------------------------------------------------

print('Fertig.')
