/*
 * $Id: dungeonview.h,v 1.3 2005/09/20 04:41:30 andrewtaylor Exp $
 */

#ifndef DUNGEONVIEW_H
#define DUNGEONVIEW_H

#include "direction.h"
#include "tileview.h"

/**
 * @todo
 * <ul>
 *      <li>move the rest of the dungeon drawing logic here from screen_sdl</li>
 * </ul>
 */
class DungeonView : public TileView {
public:
    DungeonView(int x, int y, int columns, int rows);
    DungeonView(int x, int y, int columns, int rows, const string &tileset);

    void drawInDungeon(Tile *tile, int distance, Direction orientation, bool large);
};

#endif /* DUNGEONVIEW_H */
