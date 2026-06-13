/*
 * web_compat.cpp – Kompatibilitätsschicht für den Emscripten/WebAssembly-Build.
 *
 * Emscriptens SDL-1.2-Emulation stellt einige Funktionen nicht bereit, die xu4
 * nutzt. Hier werden sie über vorhandene Funktionen nachgebildet:
 *  - SDL_WaitEvent  -> SDL_PollEvent + emscripten_sleep (dank ASYNCIFY)
 *  - Mix_FadeInMusic -> Mix_PlayMusic (ohne Überblendung)
 *  - Maus-Cursor-Funktionen -> No-ops (der Browser zeigt seinen eigenen Cursor)
 */

#include <SDL.h>
#include <SDL_mixer.h>
#include <emscripten.h>

extern "C" {

int SDL_WaitEvent(SDL_Event *event) {
    for (;;) {
        SDL_PumpEvents();
        if (SDL_PollEvent(event))
            return 1;
        emscripten_sleep(5); /* gibt die Kontrolle an den Browser zurück */
    }
}

int Mix_FadeInMusic(Mix_Music *music, int loops, int ms) {
    (void) ms;
    return Mix_PlayMusic(music, loops);
}

SDL_Cursor *SDL_CreateCursor(const Uint8 *data, const Uint8 *mask,
                             int w, int h, int hot_x, int hot_y) {
    (void) data; (void) mask; (void) w; (void) h; (void) hot_x; (void) hot_y;
    return NULL;
}

SDL_Cursor *SDL_GetCursor(void) { return NULL; }
void SDL_SetCursor(SDL_Cursor *cursor) { (void) cursor; }
void SDL_FreeCursor(SDL_Cursor *cursor) { (void) cursor; }

}
