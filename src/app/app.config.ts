import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';

/** No router: KiDraw is one screen. The CLI's empty `provideRouter([])` cost
 *  64 kB of the first download for nothing (2026-09-25). */
export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true })]
};
