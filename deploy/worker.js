/**
 * Static host entry: the app is a client-rendered Vite build, so the Worker just
 * hands every request to the asset binding (which applies the SPA fallback).
 */
export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request);
  },
};
