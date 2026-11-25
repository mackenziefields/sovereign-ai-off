/* sovereign. — public settings for the optional "Build with AI" feature.
   Nothing secret belongs in this file: it is published with the app.
   aiUrl: the address of your Cloudflare Worker, e.g. 'https://sovereign-ai.your-name.workers.dev'
          Leave it '' and each person can paste the address into the AI settings box inside the app instead.
   The access code is NEVER stored here. People type it in once and it stays in their own browser. */
(function (S) {
  'use strict';
  S.config = {
    aiUrl: '',
  };
})(window.Sovereign = window.Sovereign || {});
