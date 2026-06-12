/*
 * $Id: u4_sdl.h,v 1.5 2004/05/15 20:36:24 dougday Exp $
 */

#ifndef U4_SDL_H
#define U4_SDL_H

#ifdef __cplusplus
extern "C" {
#endif

int u4_SDL_InitSubSystem(Uint32 flags);
void u4_SDL_QuitSubSystem(Uint32 flags);

#ifdef __cplusplus
}
#endif

#endif
