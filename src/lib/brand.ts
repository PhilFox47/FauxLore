/**
 * Brand assets, kept in one place so swapping the logo is a single edit rather
 * than hunting down every <img> that happens to render it.
 *
 * The favicon is declared separately in index.html, since it has to be present
 * before the app bundle loads.
 */

/** Full wordmark: icon plus "FAUXLORE". Used in the sidebar, mobile header and login. */
export const BRAND_LOGO_URL = 'https://i.imgur.com/cXqiWx6.png';

/**
 * The wordmark in its two shapes, for anything that composes the logo into
 * artwork rather than dropping it into a row of UI.
 *
 * Stacked (1800x724) reads "Faux" over "Lore" and suits a tall canvas; wide
 * (2172x724) sets it on one line and suits a landscape one. Picking by canvas
 * shape matters more than it sounds: the wide mark at 40% of a 1080px-wide
 * phone wallpaper is unreadable.
 */
export const BRAND_LOGO_STACKED_URL = BRAND_LOGO_URL;
export const BRAND_LOGO_WIDE_URL = 'https://i.imgur.com/Bobjsqt.png';

/** Square icon on its own, for tight spaces and the favicon. */
export const BRAND_ICON_URL = 'https://i.imgur.com/0MMNszX.png';
