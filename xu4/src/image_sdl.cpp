/*
 * $Id: image_sdl.cpp,v 1.13 2005/01/10 00:58:22 andrewtaylor Exp $
 */

#include "vc6.h" // Fixes things if you're using VC6, does nothing if otherwise

#include <SDL.h>

#include <memory>
#include "debug.h"
#include "image.h"

Image::Image() {
}

/**
 * Creates a new image.  Scale is stored to allow drawing using U4
 * (320x200) coordinates, regardless of the actual image scale.
 * Indexed is true for palette based images, or false for RGB images.
 *
 * Hinweis (WASM): Emscriptens SDL1 kennt keine indizierten Surfaces. ALLE
 * Surfaces werden als 32-Bit-RGBA-Software-Surface angelegt; für indizierte
 * Bilder merken wir Index-Puffer + Palette selbst und lösen nach RGBA auf.
 */
Image *Image::create(int w, int h, bool indexed, Image::Type type) {
    Image *im = new Image;

    im->w = w;
    im->h = h;
    im->indexed = indexed;
    im->colorKeyIndex = -1;
    im->indexedData = NULL;
    im->palette = NULL;
    im->ownSurface = true;
    im->locked = false;

    Uint32 rmask = 0x000000ff, gmask = 0x0000ff00, bmask = 0x00ff0000, amask = 0xff000000;
    im->surface = SDL_CreateRGBSurface(SDL_SWSURFACE, w, h, 32, rmask, gmask, bmask, amask);

    if (!im->surface) {
        delete im;
        return NULL;
    }

    if (indexed) {
        im->indexedData = new unsigned char[w * h]();
        im->palette = new RGBA[256]();
    }

    return im;
}

/**
 * Sorgt dafür, dass surface->pixels beschreib-/lesbar ist (gesperrt).
 */
void Image::lockPixels() const {
    if (ownSurface && !locked) {
        SDL_LockSurface(surface);
        locked = true;
    }
}

/**
 * Schiebt Pixeländerungen aus dem Puffer in den Canvas (Unlock) und gibt die
 * Sperre frei – nötig, weil Emscriptens SDL_BlitSurface aus dem Canvas liest
 * und gesperrte Surfaces nicht blitten darf.
 */
void Image::unlockPixels() const {
    if (ownSurface && locked) {
        SDL_UnlockSurface(surface);
        locked = false;
    }
}

/**
 * Schreibt den aufgelösten RGBA-Wert eines indizierten Pixels in den Puffer.
 */
void Image::resolvePixel(int x, int y) {
    unsigned char idx = indexedData[y * w + x];
    RGBA c = palette[idx];
    Uint8 a = (colorKeyIndex >= 0 && (int) idx == colorKeyIndex) ? 0 : 255;
    Uint32 pix = SDL_MapRGBA(surface->format,
                             static_cast<Uint8>(c.r), static_cast<Uint8>(c.g),
                             static_cast<Uint8>(c.b), a);
    *reinterpret_cast<Uint32 *>(static_cast<Uint8 *>(surface->pixels) + y * surface->pitch + x * 4) = pix;
}

/**
 * Löst den gesamten Index-Puffer anhand der aktuellen Palette nach RGBA auf.
 */
void Image::resolveIndexed() {
    if (!indexed) return;
    lockPixels();
    for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++)
            resolvePixel(x, y);
}

/**
 * Create a special purpose image the represents the whole screen.
 */
Image *Image::createScreenImage() {
    Image *screen = new Image();

    screen->surface = SDL_GetVideoSurface();
    ASSERT(screen->surface != NULL, "SDL_GetVideoSurface() returned a NULL screen surface!");
    screen->w = screen->surface->w;
    screen->h = screen->surface->h;
    screen->colorKeyIndex = -1;
    screen->indexed = false;
    screen->indexedData = NULL;
    screen->palette = NULL;
    /* Der Bildschirm wird über SDL_UpdateRect (screenRedrawScreen) aktualisiert,
       nicht von uns gesperrt. */
    screen->ownSurface = false;
    screen->locked = false;

    return screen;
}

/**
 * Creates a duplicate of another image
 */
Image *Image::duplicate(Image *image) {
    bool alphaOn = image->isAlphaOn();
    Image *im = create(image->width(), image->height(), image->isIndexed(), SOFTWARE);

    if (image->isIndexed())
        im->setPaletteFromImage(image);

    /* Turn alpha off before blitting to non-screen surfaces */
    if (alphaOn)
        image->alphaOff();

    image->drawOn(im, 0, 0);

    if (alphaOn)
        image->alphaOn();

    return im;
}

/**
 * Frees the image.
 */
Image::~Image() {
    unlockPixels();
    SDL_FreeSurface(surface);
    delete [] indexedData;
    delete [] palette;
}

/**
 * Sets the palette
 */
void Image::setPalette(const RGBA *colors, unsigned n_colors) {
    ASSERT(indexed, "imageSetPalette called on non-indexed image");

    for (unsigned i = 0; i < n_colors && i < 256; i++)
        palette[i] = colors[i];

    resolveIndexed();
}

/**
 * Copies the palette from another image.
 */
void Image::setPaletteFromImage(const Image *src) {
    ASSERT(indexed && src->indexed, "imageSetPaletteFromImage called on non-indexed image");
    memcpy(palette, src->palette, sizeof(RGBA) * 256);
    resolveIndexed();
}

bool Image::getTransparentIndex(unsigned int &index) const {
    if (!indexed || colorKeyIndex < 0)
        return false;

    index = (unsigned int) colorKeyIndex;
    return true;
}

void Image::setTransparentIndex(unsigned int index) {

    SDL_SetAlpha(surface, SDL_SRCALPHA, SDL_ALPHA_OPAQUE);

    if (indexed) {
        colorKeyIndex = (int) index;
        resolveIndexed(); /* betroffene Pixel bekommen Alpha 0 */
    } else {
        int x, y;
        Uint8 t_r, t_g, t_b;

        SDL_GetRGB(index, surface->format, &t_r, &t_g, &t_b);

        for (y = 0; y < h; y++) {
            for (x = 0; x < w; x++) {
                unsigned int r, g, b, a;
                getPixel(x, y, r, g, b, a);
                if (r == t_r &&
                    g == t_g &&
                    b == t_b) {
                    putPixel(x, y, r, g, b, IM_TRANSPARENT);
                }
            }
        }
    }
}

bool Image::isAlphaOn() const {
    return (surface->flags & SDL_SRCALPHA) ? true : false;
}

void Image::alphaOn() {
    surface->flags |= SDL_SRCALPHA;
}

void Image::alphaOff() {
    surface->flags &= ~SDL_SRCALPHA;
}

/**
 * Sets the color of a single pixel.
 */
void Image::putPixel(int x, int y, int r, int g, int b, int a) {
    putPixelIndex(x, y, SDL_MapRGBA(surface->format, static_cast<Uint8>(r), static_cast<Uint8>(g), static_cast<Uint8>(b), static_cast<Uint8>(a)));
}

/**
 * Sets the palette index of a single pixel.  If the image is in
 * indexed mode, then the index is simply the palette entry number.
 * If the image is RGB, it is a packed RGB triplet.
 */
void Image::putPixelIndex(int x, int y, unsigned int index) {
    lockPixels();
    if (indexed) {
        indexedData[y * w + x] = static_cast<unsigned char>(index);
        resolvePixel(x, y);
    } else {
        *reinterpret_cast<Uint32 *>(static_cast<Uint8 *>(surface->pixels) + y * surface->pitch + x * 4) = index;
    }
}

/**
 * Fills a rectangle in the image with a given color.
 */
void Image::fillRect(int x, int y, int w, int h, int r, int g, int b) {
    /* SDL_FillRect zeichnet in Emscripten direkt in den Canvas; daher vorher
       entsperren, damit ein späteres lockPixels den Canvas zurücklädt. */
    unlockPixels();
    SDL_Rect dest;
    Uint32 pixel = SDL_MapRGB(surface->format, static_cast<Uint8>(r), static_cast<Uint8>(g), static_cast<Uint8>(b));
    dest.x = x;
    dest.y = y;
    dest.w = w;
    dest.h = h;
    SDL_FillRect(surface, &dest, pixel);
}

/**
 * Gets the color of a single pixel.
 */
void Image::getPixel(int x, int y, unsigned int &r, unsigned int &g, unsigned int &b, unsigned int &a) const {
    if (indexed) {
        unsigned char idx = indexedData[y * w + x];
        RGBA c = palette[idx];
        r = c.r; g = c.g; b = c.b;
        a = (colorKeyIndex >= 0 && (int) idx == colorKeyIndex) ? IM_TRANSPARENT : IM_OPAQUE;
        return;
    }

    unsigned int index;
    Uint8 r1, g1, b1, a1;
    getPixelIndex(x, y, index);
    SDL_GetRGBA(index, surface->format, &r1, &g1, &b1, &a1);
    r = r1;
    g = g1;
    b = b1;
    a = a1;
}

/**
 * Gets the palette index of a single pixel.
 */
void Image::getPixelIndex(int x, int y, unsigned int &index) const {
    if (indexed) {
        index = indexedData[y * w + x];
        return;
    }
    lockPixels();
    index = *reinterpret_cast<Uint32 *>(static_cast<Uint8 *>(surface->pixels) + y * surface->pitch + x * 4);
}

/**
 * Draws the entire image onto the screen at the given offset.
 */
void Image::draw(int x, int y) const {
    drawOn(NULL, x, y);
}

void Image::drawSubRect(int x, int y, int rx, int ry, int rw, int rh) const {
    drawSubRectOn(NULL, x, y, rx, ry, rw, rh);
}

void Image::drawSubRectInverted(int x, int y, int rx, int ry, int rw, int rh) const {
    drawSubRectInvertedOn(NULL, x, y, rx, ry, rw, rh);
}

/**
 * Draws the image onto another image (or the screen if d == NULL).
 * Quelle und Ziel müssen vor dem Blit entsperrt sein (Canvas aktuell).
 */
void Image::drawOn(Image *d, int x, int y) const {
    SDL_Rect r;
    SDL_Surface *destSurface;

    unlockPixels();
    if (d == NULL)
        destSurface = SDL_GetVideoSurface();
    else {
        d->unlockPixels();
        destSurface = d->surface;
    }

    r.x = x;
    r.y = y;
    r.w = w;
    r.h = h;
    SDL_BlitSurface(surface, NULL, destSurface, &r);
}

void Image::drawSubRectOn(Image *d, int x, int y, int rx, int ry, int rw, int rh) const {
    SDL_Rect src, dest;
    SDL_Surface *destSurface;

    unlockPixels();
    if (d == NULL)
        destSurface = SDL_GetVideoSurface();
    else {
        d->unlockPixels();
        destSurface = d->surface;
    }

    src.x = rx;
    src.y = ry;
    src.w = rw;
    src.h = rh;

    dest.x = x;
    dest.y = y;
    /* dest w & h unused */

    SDL_BlitSurface(surface, &src, destSurface, &dest);
}

void Image::drawSubRectInvertedOn(Image *d, int x, int y, int rx, int ry, int rw, int rh) const {
    int i;
    SDL_Rect src, dest;
    SDL_Surface *destSurface;

    unlockPixels();
    if (d == NULL)
        destSurface = SDL_GetVideoSurface();
    else {
        d->unlockPixels();
        destSurface = d->surface;
    }

    for (i = 0; i < rh; i++) {
        src.x = rx;
        src.y = ry + i;
        src.w = rw;
        src.h = 1;

        dest.x = x;
        dest.y = y + rh - i - 1;
        /* dest w & h unused */

        SDL_BlitSurface(surface, &src, destSurface, &dest);
    }
}
