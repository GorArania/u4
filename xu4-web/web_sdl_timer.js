/*
 * web_sdl_timer.js – Ersetzt SDL_AddTimer/SDL_RemoveTimer aus Emscriptens
 * SDL-1.2-Emulation.
 *
 * Emscriptens Original feuert den Timer-Callback nur EINMAL (safeSetTimeout).
 * SDL_AddTimer ist aber ein PERIODISCHER Timer: Der Callback liefert das
 * nächste Intervall zurück (0 = beenden). xu4 treibt damit seine
 * zeitgesteuerten Animationen (Intro, Spielwelt) – ohne Wiederholung bleiben
 * sie nach einem Tick stehen. Diese Fassung plant sich anhand des
 * Rückgabewerts immer wieder neu ein.
 */
addToLibrary({
  $u4Timers: {},
  $u4TimerSeq: [1],

  SDL_AddTimer__proxy: 'sync',
  SDL_AddTimer__deps: ['$safeSetTimeout', '$u4Timers', '$u4TimerSeq'],
  SDL_AddTimer: function (interval, callback, param) {
    var id = u4TimerSeq[0]++;
    var rec = { handle: 0, active: true };
    u4Timers[id] = rec;
    function tick() {
      if (!rec.active) return;
      var next = {{{ makeDynCall('iip', 'callback') }}}(interval, param);
      if (rec.active && next > 0) {
        interval = next;
        rec.handle = safeSetTimeout(tick, next);
      } else {
        rec.active = false;
      }
    }
    rec.handle = safeSetTimeout(tick, interval);
    return id;
  },

  SDL_RemoveTimer__proxy: 'sync',
  SDL_RemoveTimer__deps: ['$u4Timers'],
  SDL_RemoveTimer: function (id) {
    var rec = u4Timers[id];
    if (rec) {
      rec.active = false;
      clearTimeout(rec.handle);
      delete u4Timers[id];
    }
    return true;
  },
});
