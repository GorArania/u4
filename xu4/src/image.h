/*
 * $Id: image.h,v 1.23 2005/09/14 04:34:20 andrewtaylor Exp $
 */

#ifndef IMAGE_H
#define IMAGE_H

#include <string>
#include "types.h"
#include "u4file.h"

using std::string;

struct RGBA {
    unsigned int r, g, b, a;
};
bool operator==(const RGBA &lhs, const RGBA &rhs);

class Image;

struct SubImage {
    string name;
    string srcImageName;
    int x, y, width, height;
};

#define IM_OPAQUE 255
#define IM_TRANSPARENT 0

/**
 * A simple image object that can be drawn and read/written to at the
 * pixel level.
 * @todo
 *  <ul>
 *      <li>drawing methods should be pushed to Drawable subclass</li>
 *  </ul>
 */
class Image {
public:
    enum Type {
        HARDWARE,
        SOFTWARE
    };

    static Image *create(int w, int h, bool indexed, Type type);
    static Image *createScreenImage();
    static Image *duplicate(Image *image);
    ~Image();

    /* palette handling */
    void setPalette(const RGBA *colors, unsigned n_colors);
    void setPaletteFromImage(const Image *src);
    bool getTransparentIndex(unsigned int &index) const;
    void setTransparentIndex(unsigned int index);

    /* alpha handling */
    bool isAlphaOn() const;
    void alphaOn();
    void alphaOff();

    /* writing to image */
    void putPixel(int x, int y, int r, int g, int b, int a);
    void putPixelIndex(int x, int y, unsigned int index);
    void fillRect(int x, int y, int w, int h, int r, int g, int b);

    /* reading from image */
    void getPixel(int x, int y, unsigned int &r, unsigned int &g, unsigned int &b, unsigned int &a) const;
    void getPixelIndex(int x, int y, unsigned int &index) const;

    /* image drawing methods */
    void draw(int x, int y) const;
    void drawSubRect(int x, int y, int rx, int ry, int rw, int rh) const;
    void drawSubRectInverted(int x, int y, int rx, int ry, int rw, int rh) const;

    /* image drawing methods for drawing onto another image instead of the screen */
    void drawOn(Image *d, int x, int y) const;
    void drawSubRectOn(Image *d, int x, int y, int rx, int ry, int rw, int rh) const;
    void drawSubRectInvertedOn(Image *d, int x, int y, int rx, int ry, int rw, int rh) const;

    int width() const { return w; }
    int height() const { return h; }
    bool isIndexed() const { return indexed; }

private:
    int w, h;
    bool indexed;
    // Emscriptens SDL1 hat kein colorkey-Feld im PixelFormat; daher selbst
    // merken (-1 = keiner gesetzt).
    int colorKeyIndex;
    // Emscripten/WASM: SDL1 kann keine indizierten (Paletten-)Surfaces. Daher
    // werden ALLE Surfaces als 32-Bit-RGBA gehalten. Für "indizierte" Bilder
    // merken wir Index-Puffer + Palette selbst und lösen beim Schreiben bzw.
    // beim Setzen der Palette nach RGBA auf (Transparenz über Alpha=0).
    unsigned char *indexedData;  // w*h Indexwerte (nur wenn indexed)
    RGBA *palette;               // 256 Paletteneinträge (nur wenn indexed)
    void resolvePixel(int x, int y);
    void resolveIndexed();
    // Emscripten-SDL1 synchronisiert den Pixelpuffer (surface->pixels) nur beim
    // Unlock mit dem Canvas, aus dem SDL_BlitSurface liest – und verlangt, dass
    // Surfaces beim Blitten NICHT gesperrt sind. Daher: vor Pixel-Zugriffen
    // sperren (lockPixels), vor Blits entsperren (unlockPixels, flusht Puffer
    // -> Canvas). Nur für eigene Surfaces; der Bildschirm wird separat per
    // SDL_UpdateRect aktualisiert.
    bool ownSurface;       // true für selbst erzeugte (sperrbare) Surfaces
    mutable bool locked;   // ob wir gerade die Sperre halten
    void lockPixels() const;    // sicherstellen, dass Puffer beschreibbar ist
    void unlockPixels() const;  // Puffer -> Canvas flushen, entsperren

    Image();                    /* use create method to construct images */

    // disallow assignments, copy contruction
    Image(const Image&);
    const Image &operator=(const Image&);

#ifndef _SDL_video_h
    struct SDL_Surface { int dummy; };
#endif

    SDL_Surface *surface;
};

#endif /* IMAGE_H */
