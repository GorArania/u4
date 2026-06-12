/*
 * $Id: imageloader_u5.h,v 1.1 2005/10/03 06:30:30 andrewtaylor Exp $
 */

#ifndef IMAGELOADER_U5_H
#define IMAGELOADER_U5_H

#include "imageloader.h"

/**
 * Loader for U5 images with LZW compression.  Similar to U4 LZW
 * images, but with a slightly different variation on the LZW
 * algorithm.
 */
class U5LzwImageLoader : public ImageLoader {
    static ImageLoader *instance;

public:
    virtual Image *load(U4FILE *file);
    
};

#endif /* IMAGELOADER_U5_H */
