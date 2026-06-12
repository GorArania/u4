/*
 * $Id: pngconv.h,v 1.3 2003/10/10 17:44:52 andrewtaylor Exp $
 */

#ifndef PNGCONV_H
#define PNGCONV_H

int writePngFromEga(unsigned char *data, int height, int width, int bits, const char *fname);
int readEgaFromPng(unsigned char **data, int *height, int *width, int *bits, const char *fname);

#endif
