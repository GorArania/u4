/*
 * $Id: scale.h,v 1.6 2005/08/22 05:53:38 andrewtaylor Exp $
 */

#ifndef SCALE_H
#define SCALE_H

#include <string>

#include "settings.h"

class Image;

typedef Image *(*Scaler)(Image *src, int scale, int n);

Scaler scalerGet(const std::string &filter);
int scaler3x(const std::string &filter);

#endif /* SCALE_H */
