import { corgi, monk } from './apps.json';

/**
 * This build's iOS app, from apps.json (build/iosApp.mjs writes the same entry into the shell):
 * Holy Kicker for the monk, Corgi Commando for the corgi. Picked on the define itself so the build
 * folds it and ships the one entry only; neither app's bundle names the other.
 */
export const IOS_APP = __HK_THEME__ === 'corgi' ? corgi : monk;
